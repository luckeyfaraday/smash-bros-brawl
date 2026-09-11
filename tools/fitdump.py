#!/usr/bin/env python3
"""Brawl fighter data extractor.

Parses Fit<Character>.pac (ARC) -> fit dat (Sakurai archive) -> moveset:
attributes, subaction scripts with linear timing previews, hurtboxes,
ledgegrabs, special-locomotion data.

Formats ported from BrawlLib (brawltools) and OpenSA3 (dantarion).
Reference DBs: Attributes.txt / Events.txt from OpenSA3.
"""
import argparse
import hashlib
import math
import json
import os
import struct
import sys

U16 = struct.Struct(">H")
U32 = struct.Struct(">I")
S32 = struct.Struct(">i")
F32 = struct.Struct(">f")

REF_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ref")

# ---------------------------------------------------------------- reference db

def load_attributes_db():
    db = {}
    path = os.path.join(REF_DIR, "Attributes.txt")
    if not os.path.exists(path):
        return db
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if line.startswith(("0x", "*0x")):
            is_int = line.startswith("*")
            line = line.lstrip("*")
            off = int(line[:5], 16)
            name = line[6:].strip() if len(line) > 6 else f"0x{off:03X}"
            db[off] = {"name": name, "desc": lines[i + 1] if i + 1 < len(lines) else "",
                       "int": is_int}
            i += 4
        else:
            i += 1
    return db


def load_events_db():
    db = {}
    path = os.path.join(REF_DIR, "Events.txt")
    if not os.path.exists(path):
        return db
    lines = open(path, encoding="utf-8", errors="replace").read().splitlines()
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if len(line) == 4 and all(c in "0123456789abcdefABCDEF" for c in line):
            eid = line.upper()
            name = lines[i + 1].strip() if i + 1 < len(lines) else eid
            params = []
            fmt = ""
            j = i + 2
            while j < len(lines):
                l = lines[j].rstrip()
                if not l.strip():
                    j += 1
                    break
                if l.startswith("F:"):
                    fmt = l[2:]
                    j += 1
                    while j < len(lines) and lines[j].strip():
                        j += 1
                    break
                params.append(l.strip())
                j += 1
            db[eid] = {"name": name, "params": params, "fmt": fmt}
            i = j
        else:
            i += 1
    return db


ATTR_DB = load_attributes_db()
EVENT_DB = load_events_db()

# ------------------------------------------------------------------ ARC (.pac)

ARC_TYPES = {0: "None", 1: "MiscData", 2: "ModelData", 3: "TextureData",
             4: "AnimationData", 5: "SceneData", 7: "GroupedArchive", 8: "EffectData"}


class ArcEntry:
    __slots__ = ("etype", "index", "size", "group", "redirect", "data")


class ArcPac:
    def __init__(self, blob):
        if blob[:4] != b"ARC\x00":
            raise ValueError("not an ARC (pac)")
        version, num = struct.unpack_from(">2H", blob, 4)
        self.version = version
        self.entries = []
        off = 0x40
        for _ in range(num):
            e = ArcEntry()
            e.etype, e.index = struct.unpack_from(">hh", blob, off)
            (e.size,) = U32.unpack_from(blob, off + 4)
            e.group = blob[off + 8]
            e.redirect = struct.unpack_from(">h", blob, off + 10)[0]
            e.data = blob[off + 0x20: off + 0x20 + e.size]
            self.entries.append(e)
            nxt = off + 0x20 + e.size
            off = (nxt + 0x1F) & ~0x1F
        self.name = blob[0x10:0x40].split(b"\x00")[0].decode("ascii", "replace")

    def resolve(self, e, depth=0):
        if e.redirect != -1 and 0 <= e.redirect < len(self.entries) and depth < 8:
            return self.resolve(self.entries[e.redirect], depth + 1)
        return e.data


# --------------------------------------------------------- Sakurai archive (.dat)

class SakuraiDat:
    def __init__(self, blob):
        if len(blob) < 0x20:
            raise ValueError("dat too small")
        (self.file_size, self.data_chunk_size, self.offset_count,
         self.section_count, self.reference_count) = struct.unpack_from(">5I", blob, 0)
        if self.file_size != len(blob):
            raise ValueError(f"size mismatch: header {self.file_size} vs file {len(blob)}")
        self.blob = blob
        self.base = 0x20
        self.sections = []
        self.references = []
        sec = self.data_chunk_size + self.offset_count * 4
        string_base = sec + (self.section_count + self.reference_count) * 8
        for i in range(self.section_count):
            d_off, s_off = struct.unpack_from(">2I", blob, self.base + sec + i * 8)
            self.sections.append({"data_offset": d_off, "str_off": s_off,
                                  "name": self.read_str(string_base + s_off)})
        for i in range(self.reference_count):
            d_off, s_off = struct.unpack_from(">2I", blob, self.base + sec + self.section_count * 8 + i * 8)
            self.references.append({"data_offset": d_off, "str_off": s_off,
                                    "name": self.read_str(string_base + s_off)})
        # external offsets = chained lists starting at each reference's data offset
        self.external = set()
        self.external_names = {}
        for r in self.references:
            t = r["data_offset"]
            for _ in range(4096):
                if t in self.external or t <= 0 or t >= self.file_size:
                    break
                self.external.add(t)
                self.external_names[t] = r["name"]
                t = self.read_u32(t)
        self.section_by_name = {s["name"]: s for s in self.sections}

    def read_u32(self, off):
        return U32.unpack_from(self.blob, self.base + off)[0]

    def read_f32(self, off):
        return F32.unpack_from(self.blob, self.base + off)[0]

    def read_str(self, off):
        end = self.blob.find(b"\x00", self.base + off)
        return self.blob[self.base + off:end].decode("shift_jis", "replace")


# ------------------------------------------------------------------ commands

class CommandStream:
    def __init__(self, dat):
        self.dat = dat

    def parse_params(self, off, n):
        out = []
        for i in range(n):
            pos = self.dat.base + off + i * 8
            if pos < 0 or pos + 8 > len(self.dat.blob):
                out.append({"type": -1, "raw": 0, "value": 0})
                continue
            t, raw = struct.unpack_from(">2i", self.dat.blob, pos)
            if t == 1:
                val = raw / 60000.0
            elif t == 0:
                val = raw
            elif t == 3:
                val = bool(raw)
            else:
                val = raw  # 2=offset, 5=variable, 6=requirement
            out.append({"type": t, "raw": raw, "value": val})
        return out

    def parse_list(self, off, visited, external_names, depth=0, max_events=2000):
        """Disassemble with path-local recursion guards, preserving shared calls.

        This is not an interpreter: branches and loops remain raw commands.
        """
        visited = set(visited) | {off}
        events = []
        guard = set()
        while off > 0 and off < self.dat.file_size and len(events) < max_events:
            key = off
            if key in guard:
                events.append({"id": "LOOP", "name": "<loop guard>", "frame": None,
                               "offset": off, "params": [], "children": []})
                break
            guard.add(key)
            pos = self.dat.base + off
            if pos + 8 > len(self.dat.blob):
                break
            module, eid, nparams, unk, p_off = struct.unpack_from(
                ">4B I", self.dat.blob, pos)
            if module == 0 and eid == 0:
                break
            if nparams > 64:
                break
            name = EVENT_DB.get(f"{module:02X}{eid:02X}", {}).get(
                "name", f"{module:02X}{eid:02X}").replace(" ", "")
            ev = {"id": f"{module:02X}{eid:02X}", "name": name, "offset": off,
                  "opcode": f"{module:02X}{eid:02X}{nparams:02X}{unk:02X}",
                  "parameter_offset": p_off,
                  "params": self.parse_params(p_off, nparams) if nparams else []}
            events.append(ev)
            # follow subroutines
            if depth < 8:
                sub = None
                if ev["id"] in ("0007", "0009") and nparams >= 1:
                    sub = ev["params"][0]
                elif ev["id"] == "0D00" and nparams >= 2:
                    sub = ev["params"][1]
                if sub is not None and sub["type"] in (0, 2):
                    target = sub["raw"]
                    parameter_index = 1 if ev["id"] == "0D00" else 0
                    reference_site = p_off + parameter_index * 8 + 4
                    ev["target"] = target
                    if reference_site in self.dat.external_names:
                        ev["external"] = self.dat.external_names[reference_site]
                    elif target > 0 and target not in visited:
                        ev["children"] = self.parse_list(target, visited,
                                                         external_names, depth + 1,
                                                         max_events - len(events))
                    elif target in visited:
                        ev["recursive_reference"] = True
            if ev["id"] in ("0008", "0009"):
                break  # Return / unconditional goto ends this script.
            off += 8
        return events


def frame_annotate(events, start_frame=0):
    """Linear preview only; execute raw control flow for runtime timing."""
    _annotate_frame_flow(events, start_frame)
    return events


def _annotate_frame_flow(events, start_frame):
    frame = start_frame
    for ev in events:
        if ev["id"] == "0001" and ev["params"]:
            frame += ev["params"][0]["value"]
            ev["frame"] = frame
        elif ev["id"] == "0002" and ev["params"]:
            frame = max(frame, ev["params"][0]["value"])
            ev["frame"] = frame
        else:
            ev["frame"] = frame
        if ev.get("children"):
            child_end = _annotate_frame_flow(ev["children"], frame)
            if ev["id"] in ("0007", "0009"):
                frame = child_end
    return frame


def fmt_param(ev, i, p):
    meta = EVENT_DB.get(ev["id"], {})
    pname = meta.get("params", [""] * 99)[i] if i < len(meta.get("params", [])) else ""
    t = p["type"]
    if t == 1:
        v = f"{p['value']:g}"
    elif t == 2:
        v = f"0x{p['raw']:X}"
    elif t == 5:
        v = f"var:{p['raw'] & 0xFFFF}(m{p['raw'] >> 16})"
    elif t == 6:
        v = f"req:{p['raw']}"
    else:
        v = str(p["value"])
    return f"{pname}={v}" if pname else v


HITBOX_IDS = {"0600", "0601", "0602", "0603", "0604", "0605", "0606", "0607",
              "0608", "0609", "060A", "060B", "060C", "060D", "060E", "060F",
              "0610", "0611", "0612", "0613", "0614", "0615"}

# Authoritative Brawl 0600 (OffensiveCollision) layout, per Ikarus/dantarion:
# p0=(bone<<16)|id  p1=damage  p2=angle  p3=(weight_kb<<16)|kbg
# p4=(shield_dmg<<16)|bkb  p5=size  p6=Z  p7=Y  p8=X  p9=trip  p10=hitlag
# p11=sdi  p12=flags
def fmt_hitbox(ev):
    p = ev["params"]
    def scal(i):
        return p[i]["value"] if i < len(p) else 0
    def hi(i):
        return (p[i]["raw"] >> 16) & 0xFFFF if i < len(p) else 0
    def lo(i):
        return p[i]["raw"] & 0xFFFF if i < len(p) else 0
    return (f"id={lo(0)} bone={hi(0)} dmg={p[1]['value'] if len(p)>1 else '?'}% "
            f"angle={p[2]['value'] if len(p)>2 else '?'} "
            f"bkb={lo(4)} kbg={lo(3)}"
            + (f" wkb={hi(3)}" if hi(3) else "")
            + (f" shield={hi(4)}" if hi(4) else "")
            + f" size={scal(5):g} xyz=({scal(8):g},{scal(7):g},{scal(6):g}) "
            f"trip={scal(9):g} hitlag={scal(10):g} sdi={scal(11):g} "
            f"flags={p[12]['raw']:#010x}" if len(p) == 13 else str(
                [pp["value"] for pp in p]))


def iter_events(events):
    for ev in events:
        yield ev
        if ev.get("children"):
            yield from iter_events(ev["children"])


# ------------------------------------------------------------------- moveset

MH = ["subaction_flags", "model_visibility", "attribute_start", "sse_attr_start",
      "misc_offset", "common_action_flags", "action_flags", "unk7", "unk8",
      "actions_start", "actions2_start", "action_pre", "subaction_main",
      "subaction_gfx", "subaction_sfx", "subaction_other"] + [f"unk{i}" for i in
      range(16, 31)]


class Moveset:
    def __init__(self, dat: SakuraiDat):
        self.dat = dat
        sec = dat.section_by_name.get("data")
        if sec is None:
            raise ValueError('no "data" section (not a moveset dat?)')
        self.hdr = {}
        for i, name in enumerate(MH):
            self.hdr[name] = dat.read_u32(sec["data_offset"] + i * 4)
        self.stream = CommandStream(dat)
        ext_names = {r["data_offset"]: r["name"] for r in dat.references}
        self.ext_names = ext_names

    def attributes(self):
        h, dat = self.hdr, self.dat
        out = []
        for table, (lo, hi) in (("attributes", (h["attribute_start"], h["sse_attr_start"])),
                                ("sse_attributes", (h["sse_attr_start"], h["common_action_flags"]))):
            if not (0 <= lo < hi <= dat.file_size and hi - lo <= 0x10000):
                continue
            rel = 0
            for off in range(lo, hi, 4):
                name = ATTR_DB.get(rel, {}).get("name", f"0x{rel:03X}")
                is_int = ATTR_DB.get(rel, {}).get("int", False)
                raw = dat.read_u32(off)
                val = S32.unpack_from(dat.blob, dat.base + off)[0] if is_int else round(dat.read_f32(off), 6)
                out.append({"table": table, "offset": off, "name": name,
                            "value": val, "raw": raw, "is_int": is_int})
                rel += 4
        return out

    def subactions(self):
        h, dat = self.hdr, self.dat
        flags = []
        for off in range(h["subaction_flags"], h["subaction_main"], 8):
            in_trans, fl = struct.unpack_from(">2B", dat.blob, dat.base + off)
            (str_off,) = U32.unpack_from(dat.blob, dat.base + off + 4)
            name = dat.read_str(str_off) if 0 < str_off < dat.file_size else ""
            flags.append({"offset": off, "in_transition": in_trans, "flags": fl,
                          "name": name})
        n = len(flags)
        lists = {"main": [], "gfx": [], "sfx": [], "other": []}
        bounds = {"main": (h["subaction_main"], h["subaction_gfx"]),
                  "gfx": (h["subaction_gfx"], h["subaction_sfx"]),
                  "sfx": (h["subaction_sfx"], h["subaction_other"]),
                  "other": (h["subaction_other"], h["subaction_other"] + n * 4)}
        for key, (lo, hi) in bounds.items():
            for off in range(lo, hi, 4):
                lists[key].append(dat.read_u32(off))
        subs = []
        for i, f in enumerate(flags):
            entry = dict(f)
            entry["script_offsets"] = {}
            for key in lists:
                target = lists[key][i] if i < len(lists[key]) else 0
                entry["script_offsets"][key] = target
                evs = []
                if target > 0 and target < self.dat.file_size:
                    evs = frame_annotate(self.stream.parse_list(
                        target, set(), self.ext_names))
                entry[key] = evs
            subs.append(entry)
        return subs

    def actions(self):
        h = self.hdr
        out = []
        for label, lo, hi, base in (("actions", h["actions_start"], h["actions2_start"], 0x112),
                                    ("actions2", h["actions2_start"], h["action_pre"], 0x112)):
            i = 0
            for off in range(lo, hi, 4):
                target = self.dat.read_u32(off)
                evs = []
                if 0 < target < self.dat.file_size:
                    evs = frame_annotate(self.stream.parse_list(target, set(), self.ext_names))
                out.append({"table": label, "index": base + i, "offset": target, "events": evs})
                i += 1
        return out

    def misc(self):
        h, dat = self.hdr, self.dat
        out = {}
        if not (0 < h["misc_offset"] < dat.file_size):
            return out
        # FDefMiscSection (0x4c), BrawlLib/SSBB/Types/FighterDefinition.cs.
        fields = ["section1", "unk_off", "unk_count", "hurtbox_off", "hurtbox_count",
                  "ledge_off", "ledge_count", "unk2_off", "unk2_count", "boneref2",
                  "unk3", "unk4", "unk5", "multijump", "glide", "crawl", "ecb",
                  "tether", "unk12"]
        m = {f: dat.read_u32(h["misc_offset"] + i * 4) for i, f in enumerate(fields)}
        # Type-0 environment collision definitions: a list of pointers to
        # bone lists and minimum dimensions (brawllib_rs misc_section.rs).
        def checked(offset, size):
            if offset <= 0 or size < 0 or offset + size > dat.data_chunk_size:
                raise ValueError("environment collision table exceeds data section")
            return offset
        if m["ecb"]:
            header = checked(m["ecb"], 8)
            start, count = dat.read_u32(header), dat.read_u32(header + 4)
            if count > 16:
                raise ValueError("invalid environment collision count")
            if count:
                checked(start, count * 4)
            out["environment"] = []
            for i in range(count):
                pointer = checked(dat.read_u32(start + i * 4), 24)
                kind = dat.read_u32(pointer)
                if kind != 0:
                    raise ValueError(f"unsupported environment collision type {kind}")
                bone_off, bone_count = dat.read_u32(pointer + 4), dat.read_u32(pointer + 8)
                if not 0 < bone_count <= 64:
                    raise ValueError("invalid environment collision bone count")
                checked(bone_off, bone_count * 4)
                height, width, unknown = struct.unpack_from(">3f", dat.blob, dat.base + pointer + 12)
                if not all(math.isfinite(v) for v in (height, width, unknown)) or min(height, width) <= 0:
                    raise ValueError("invalid environment collision dimensions")
                out["environment"].append({"bones": [dat.read_u32(bone_off + j * 4) for j in range(bone_count)],
                                           "minHeight": height, "minWidth": width, "unknown": unknown})
        if m["hurtbox_count"] and 0 < m["hurtbox_off"] < dat.file_size:
            if m["hurtbox_off"] + m["hurtbox_count"] * 32 > dat.data_chunk_size:
                raise ValueError("hurtbox table exceeds data section")
            out["hurtboxes"] = []
            for i in range(m["hurtbox_count"]):
                o = dat.base + m["hurtbox_off"] + i * 32
                values = struct.unpack_from(">7f", dat.blob, o)
                flags = struct.unpack_from(">H", dat.blob, o + 28)[0]
                out["hurtboxes"].append({
                    "bone": flags >> 7, "offset": list(values[:3]),
                    "stretch": list(values[3:6]), "radius": values[6],
                    "enabled": bool(flags & 1), "zone": (flags >> 3) & 3,
                    "region": (flags >> 5) & 3, "flags": flags})
        if m["ledge_count"] and 0 < m["ledge_off"] < dat.file_size:
            out["ledgegrabs"] = []
            for i in range(m["ledge_count"]):
                o = m["ledge_off"] + i * 16
                x, y, w, hgt = struct.unpack_from(">4f", dat.blob, dat.base + o)
                out["ledgegrabs"].append({"x": x, "y": y, "width": w, "height": hgt})
        for key, fmt, names in (("crawl", "2f", ("forward_accel", "backward_accel")),
                                ("glide", "2f", ("turn_frames", "unk")),
                                ("tether", "if", ("hang_frames", "unk"))):
            off = m.get(key, 0)
            if 0 < off < dat.file_size:
                vals = struct.unpack_from(f">{fmt}", dat.blob, dat.base + off)
                out[key] = {n: v for n, v in zip(names, vals)}
        off = m.get("multijump", 0)
        if 0 < off < dat.file_size:
            vals = struct.unpack_from(">4f3i", dat.blob, dat.base + off)
            out["multijump"] = dict(zip(("unk1", "unk2", "unk3", "horizontal_boost",
                                         "hop_list", "unk_list", "turn_frames"), vals))
            jumps = next((a["value"] for a in self.attributes()
                          if a["table"] == "attributes" and a["name"] == "Jumps"), 1)
            count = int(jumps) - 1
            hop = vals[4]
            if not 0 < count <= 16:
                raise ValueError("invalid multijump count")
            # FDefMultiJump stores either a pointer to float velocities or one
            # float inline, distinguished by the high byte of the field.
            if hop & 0xff000000:
                velocities = [struct.unpack_from(">f", dat.blob, dat.base + off + 16)[0]] * count
            else:
                if hop <= 0 or hop + count * 4 > off:
                    raise ValueError("multijump velocities exceed their data table")
                velocities = list(struct.unpack_from(f">{count}f", dat.blob, dat.base + hop))
            if any(not math.isfinite(v) or v <= 0 for v in velocities):
                raise ValueError("invalid multijump velocity")
            out["multijump"]["hop_velocities"] = velocities
        return out


# ---------------------------------------------------------------------- report

def ev_lines(events, indent=1):
    pad = "  " * indent
    for ev in events:
        if ev.get("id") == "LOOP":
            yield f"{pad}<loop>"
            continue
        frame = f"f{ev.get('frame', 0):>3}"
        ext = f" [ext:{ev['external']}]" if ev.get("external") else ""
        if ev["id"] == "0600":
            body = fmt_hitbox(ev)
        else:
            body = f"{ev['name']}({', '.join(fmt_param(ev, i, p) for i, p in enumerate(ev['params']))})"
        yield f"{pad}{frame} {body}{ext}"
        if ev.get("children"):
            yield from ev_lines(ev["children"], indent + 1)


def report(pac_path, out_dir):
    blob = open(pac_path, "rb").read()
    pac = ArcPac(blob)
    print(f"{pac_path}: ARC v{pac.version:#x} '{pac.name}' - {len(pac.entries)} entries")
    dat_blob = None
    for e in pac.entries:
        d = pac.resolve(e)
        if len(d) >= 4:
            (sz,) = U32.unpack_from(d, 0)
            if sz == len(d):
                dat_blob = d
                print(f"  moveset dat: entry type={e.etype} index={e.index} ({len(d):,} bytes)")
                break
    if dat_blob is None:
        raise ValueError(f"no embedded moveset dat found in {pac_path}")
    dat = SakuraiDat(dat_blob)
    print(f"  sections: {[s['name'] for s in dat.sections]}  "
          f"refs: {[r['name'] for r in dat.references]}")
    mv = Moveset(dat)

    attrs = mv.attributes()
    subs = mv.subactions()
    acts = mv.actions()
    misc = mv.misc()

    os.makedirs(out_dir, exist_ok=True)
    stem = os.path.splitext(os.path.basename(pac_path))[0]

    # attributes
    with open(os.path.join(out_dir, f"{stem}_attributes.txt"), "w") as f:
        for a in attrs:
            f.write(f"0x{a['offset']:05X}  {a['name']:<40} {a['value']}\n")

    # full scripts
    with open(os.path.join(out_dir, f"{stem}_scripts.txt"), "w") as f:
        for s in subs:
            f.write(f"[{s['offset']:05X}] {s['name']} (inTrans={s['in_transition']} "
                    f"flags={s['flags']:#04x})\n")
            for key in ("main", "gfx", "sfx", "other"):
                if s[key]:
                    f.write(f"  -- {key} --\n")
                    f.write("\n".join(ev_lines(s[key], 2)) + "\n")
            f.write("\n")
        for a in acts:
            if a["events"]:
                f.write(f"[{a['table']} 0x{a['index']:03X}]\n")
                f.write("\n".join(ev_lines(a["events"], 1)) + "\n\n")

    # hitbox frame data
    with open(os.path.join(out_dir, f"{stem}_hitboxes.txt"), "w") as f:
        for s in subs:
            hits = [ev for ev in iter_events(s["main"]) if ev["id"] in HITBOX_IDS]
            if not hits:
                continue
            f.write(f"{s['name']}\n")
            for ev in hits:
                if ev["id"] == "0600":
                    f.write(f"  f{ev.get('frame', 0):>3} {fmt_hitbox(ev)}\n")
                else:
                    params = ", ".join(fmt_param(ev, i, p) for i, p in enumerate(ev["params"]))
                    f.write(f"  f{ev.get('frame', 0):>3} {ev['name']}({params})\n")
            f.write("\n")

    with open(os.path.join(out_dir, f"{stem}_data.json"), "w") as f:
        json.dump({"schema_version": 2,
                   "source": {"file": os.path.basename(pac_path),
                              "sha256": hashlib.sha256(blob).hexdigest()},
                   "timing": "linear_preview_only; execute commands for runtime timing",
                   "attributes": attrs, "subactions": subs, "actions": acts,
                   "references": dat.references, "misc": misc}, f, indent=1,
                  allow_nan=False)

    n_hits = sum(1 for s in subs for ev in iter_events(s["main"]) if ev["id"] == "0600")
    print(f"  attributes: {sum(1 for a in attrs if a['table']=='attributes')} "
          f"(+{sum(1 for a in attrs if a['table']=='sse_attributes')} SSE)")
    print(f"  subactions: {len(subs)}  offensive collisions: {n_hits}")
    print(f"  hurtboxes: {len(misc.get('hurtboxes', []))}  "
          f"ledgegrabs: {len(misc.get('ledgegrabs', []))}")
    print(f"  wrote {stem}_attributes/_scripts/_hitboxes/_data.json to {out_dir}")
    return mv


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("pac", nargs="+")
    ap.add_argument("--out", default="fitdump")
    args = ap.parse_args()
    for p in args.pac:
        report(p, args.out)


if __name__ == "__main__":
    main()
