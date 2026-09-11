#!/usr/bin/env python3
"""RVZ reader + Wii disc/FST extractor.

Port of the reading logic in Dolphin's Source/Core/DiscIO/WIABlob.cpp
(see docs/WiaAndRvz.md for the format spec). Wii partition data is
stored in RVZ decrypted and without hashes, so files can be extracted
without any AES handling.
"""
import argparse
import io
import os
import struct
import sys
import zstandard as zstd

BLOCK_TOTAL = 0x8000   # Wii block size on disc incl. hashes
BLOCK_DATA = 0x7C00    # data per block, hashes excluded
GROUP_DATA = 0x1F0000  # 64 blocks of data

U16 = struct.Struct(">H")
U32 = struct.Struct(">I")
U64 = struct.Struct(">Q")


class LFG:
    """Lagged Fibonacci generator used for Wii junk data (f=xor, j=32, k=521)."""

    K = 521
    J = 32
    SEED_WORDS = 17

    def __init__(self):
        self.buf = [0] * self.K
        self.pos_bytes = 0

    def set_seed(self, seed68):
        self.pos_bytes = 0
        self.buf[:17] = list(struct.unpack(">17I", seed68))
        for i in range(17, self.K):
            a, b, c = self.buf[i - 17], self.buf[i - 16], self.buf[i - 1]
            self.buf[i] = ((a << 23) & 0xFFFFFFFF) ^ (b >> 9) ^ c

    def forward(self):
        for i in range(self.J):
            self.buf[i] ^= self.buf[i + self.K - self.J]
        for i in range(self.J, self.K):
            self.buf[i] ^= self.buf[i - self.J]

    def skip(self, n):
        self.pos_bytes += n
        while self.pos_bytes >= self.K * 4:
            self.forward()
            self.pos_bytes -= self.K * 4

    def get_bytes(self, n):
        out = bytearray()
        if self.pos_bytes % 4:
            raise NotImplementedError("unaligned LFG read")
        while n > 0:
            if self.pos_bytes == self.K * 4:
                self.forward()
                self.pos_bytes = 0
            w = self.buf[self.pos_bytes // 4]
            out += bytes(((w >> 24) & 0xFF, (w >> 18) & 0xFF, (w >> 8) & 0xFF, w & 0xFF))
            self.pos_bytes += 4
            n -= 4
        return bytes(out[:n]) if n < 0 else bytes(out)


def zstd_decompress_all(data, expected):
    dctx = zstd.ZstdDecompressor()
    try:
        r = dctx.stream_reader(io.BytesIO(data), read_across_frames=True)
        out = r.read()
    except TypeError:
        try:
            out = dctx.decompress(data)
        except zstd.ZstdError:
            out = dctx.decompressobj().decompress(data)
    if len(out) < expected:
        raise ValueError(f"zstd output {len(out)} < expected {expected}")
    return out


class RVZReader:
    def __init__(self, path):
        self.f = open(path, "rb")
        self._parse()

    def _parse(self):
        f = self.f
        f.seek(0)
        h1 = f.read(0x48)
        if h1[:4] != b"RVZ\x01":
            raise ValueError("not an RVZ file")
        magic, version, version_compat, h2_size = struct.unpack_from(">4I", h1, 0)
        if version_compat < 0x00030000 and version != 0x01000000:
            raise ValueError(f"unsupported RVZ version {version:#x}")
        self.iso_size = U64.unpack_from(h1, 0x24)[0]
        h2_raw = f.read(h2_size)
        (self.disc_type, self.compression, self.compression_level,
         self.chunk_size) = struct.unpack_from(">4i", h2_raw, 0)
        self.disc_header = h2_raw[0x10:0x90]
        n_part, part_size = struct.unpack_from(">2I", h2_raw, 0x90)
        part_off = U64.unpack_from(h2_raw, 0x98)[0]
        n_raw = U32.unpack_from(h2_raw, 0xB4)[0]
        raw_off = U64.unpack_from(h2_raw, 0xB8)[0]
        raw_size = U32.unpack_from(h2_raw, 0xC0)[0]
        n_groups = U32.unpack_from(h2_raw, 0xC4)[0]
        group_off = U64.unpack_from(h2_raw, 0xC8)[0]
        group_size = U32.unpack_from(h2_raw, 0xD0)[0]

        if self.compression not in (0, 5):
            raise ValueError(f"unsupported compression {self.compression} (need none/zstd)")

        # partition entries: uncompressed, part_size bytes each
        self.partitions = []
        f.seek(part_off)
        part_blob = f.read(part_size * n_part)
        for i in range(n_part):
            e = part_blob[i * part_size:(i + 1) * part_size]
            key = e[:16]
            des = []
            for j in range(2):
                first_sec, n_sec, gidx, ngrp = struct.unpack_from(">4I", e, 16 + j * 16)
                des.append(dict(first_sector=first_sec, n_sectors=n_sec,
                                group_index=gidx, n_groups=ngrp))
            self.partitions.append(dict(key=key, data_entries=des))

        # raw data entries + group entries: compressed
        raw_tab = zstd_decompress_all(self._read_file(raw_off, raw_size), n_raw * 0x18)
        self.raw_entries = []
        for i in range(n_raw):
            off, size, gidx, ngrp = struct.unpack_from(">QQII", raw_tab, i * 0x18)
            self.raw_entries.append(dict(offset=off, size=size, group_index=gidx, n_groups=ngrp))

        grp_tab = zstd_decompress_all(self._read_file(group_off, group_size), n_groups * 0x0C)
        self.groups = []
        for i in range(n_groups):
            off4, dsize, packed = struct.unpack_from(">3I", grp_tab, i * 0x0C)
            self.groups.append(dict(offset=off4 << 2, size=dsize, packed=packed))

        self._cache = {}  # group index -> decompressed data-space chunk

    def _read_file(self, offset, size):
        self.f.seek(offset)
        return self.f.read(size)

    # ---- chunk pipeline ----

    def _skip_exceptions(self, data, n_lists, align):
        off = 0
        for i in range(n_lists):
            n = U16.unpack_from(data, off)[0]
            sz = 2 + n * 0x16
            if align and i == n_lists - 1:
                sz = (off + sz + 3) & ~3
                sz -= off
            off += sz
        return data[off:]

    def _unpack_rvz(self, packed, data_offset, out_size):
        out = bytearray()
        pos = 0
        while len(out) < out_size:
            (size,) = U32.unpack_from(packed, pos)
            pos += 4
            junk = bool(size & 0x80000000)
            size &= 0x7FFFFFFF
            if junk:
                lfg = LFG()
                lfg.set_seed(packed[pos:pos + 68])
                pos += 68
                lfg.skip(data_offset % 0x8000)
                out += lfg.get_bytes(min(size, out_size - len(out)))
            else:
                take = min(size, out_size - len(out))
                out += packed[pos:pos + take]
                pos += size
            data_offset += size
        return bytes(out)

    def _chunk_data(self, gidx, expected, n_lists, data_offset):
        """Decompressed data-space contents of group gidx (exceptions stripped,
        RVZ packing decoded)."""
        if gidx in self._cache:
            return self._cache[gidx]
        g = self.groups[gidx]
        dsize = g["size"] & 0x7FFFFFFF
        if dsize == 0:
            data = b"\x00" * expected
        else:
            compressed = (g["size"] & 0x80000000) != 0
            raw = self._read_file(g["offset"], dsize)
            if compressed:
                raw = zstd_decompress_all(raw, g["packed"] or expected)
            align = not compressed and n_lists > 0
            data = self._skip_exceptions(raw, n_lists, align) if n_lists else raw
            if g["packed"]:
                data = self._unpack_rvz(data, data_offset, expected)
        if len(data) < expected:
            data += b"\x00" * (expected - len(data))
        if len(self._cache) > 4:
            self._cache.clear()
        self._cache[gidx] = data
        return data

    # ---- public reads ----

    def read_raw(self, offset, size):
        out = bytearray()
        if offset < 0x80:
            take = min(0x80 - offset, size)
            out += self.disc_header[offset:offset + take]
            offset += take
            size -= take
        for e in self.raw_entries:
            if size <= 0:
                break
            off, sz = e["offset"], e["size"]
            if sz == 0 or offset >= off + sz:
                continue
            if offset < off:
                if off - offset >= size:
                    out += b"\x00" * size
                    size = 0
                    break
                out += b"\x00" * (off - offset)
                size -= off - offset
                offset = off
            base = off - (off % BLOCK_TOTAL)
            end = off + sz
            rel = offset - base
            while size > 0 and rel < end - base:
                gi = rel // self.chunk_size
                within = rel % self.chunk_size
                expect = min(self.chunk_size, end - base - gi * self.chunk_size)
                chunk = self._chunk_data(e["group_index"] + gi, expect, 0, gi * self.chunk_size)
                take = min(expect - within, size)
                out += chunk[within:within + take]
                rel += take
                size -= take
            offset = base + rel
        if size > 0:
            out += b"\x00" * size
        return bytes(out)

    def read_partition(self, pidx, offset, size):
        """Read decrypted partition data (hash-less data space)."""
        p = self.partitions[pidx]
        first_sec = p["data_entries"][0]["first_sector"]
        out = bytearray()
        for de in p["data_entries"]:
            if size <= 0:
                break
            d_off = (de["first_sector"] - first_sec) * BLOCK_DATA
            d_size = de["n_sectors"] * BLOCK_DATA
            if d_size == 0 or offset >= d_off + d_size:
                continue
            if offset < d_off:
                gap = min(d_off - offset, size)
                out += b"\x00" * gap
                offset += gap
                size -= gap
            chunk_d = self.chunk_size * BLOCK_DATA // BLOCK_TOTAL
            n_lists = max(1, chunk_d // GROUP_DATA)
            rel = offset - d_off
            while size > 0 and rel < d_size:
                gi = rel // chunk_d
                within = rel % chunk_d
                expect = min(chunk_d, d_size - gi * chunk_d)
                chunk = self._chunk_data(de["group_index"] + gi, expect, n_lists,
                                         gi * chunk_d)
                take = min(expect - within, size)
                out += chunk[within:within + take]
                rel += take
                size -= take
            offset = d_off + rel
        return bytes(out)

    def partition_data_offset(self, pidx):
        return self.partitions[pidx]["data_entries"][0]["first_sector"] * BLOCK_TOTAL


class FSTEntry:
    __slots__ = ("name", "is_dir", "parent", "index", "offset", "size", "children")

    def __init__(self, name, is_dir, parent, index, offset=0, size=0):
        self.name, self.is_dir, self.parent, self.index = name, is_dir, parent, index
        self.offset, self.size = offset, size
        self.children = []


class WiiDisc:
    def __init__(self, rvz: RVZReader):
        self.rvz = rvz
        hdr = rvz.disc_header
        self.game_id = hdr[:6].decode("ascii", "replace")
        self.rev = hdr[7]
        self.title = hdr[0x20:0x60].rstrip(b"\x00").decode("shift_jis", "replace")
        n, tab_off4 = struct.unpack_from(">2I", rvz.read_raw(0x40000, 8), 0)
        tab = rvz.read_raw(tab_off4 << 2, n * 8)
        self.part_offsets = []
        for i in range(n):
            off4, kind = struct.unpack_from(">2I", tab, i * 8)
            self.part_offsets.append((off4 << 2, kind))
        self._pidx = {}   # disc data offset -> partition index

    def partition_index_for(self, part_offset):
        data_off = part_offset + 0x20000
        if data_off in self._pidx:
            return self._pidx[data_off]
        for i, p in enumerate(self.rvz.partitions):
            if p["data_entries"][0]["n_sectors"] and \
               p["data_entries"][0]["first_sector"] * BLOCK_TOTAL == data_off:
                self._pidx[data_off] = i
                return i
        return None

    def part_header(self, pidx):
        # boot.bin: stored values are real offsets >> 2 (Wii convention)
        d = self.rvz.read_partition(pidx, 0x420, 0x10)
        dol, fst, fst_size, fst_max = (v << 2 for v in struct.unpack(">4I", d))
        return dict(dol=dol, fst=fst, fst_size=fst_size, fst_max=fst_max)

    def parse_fst(self, pidx):
        h = self.part_header(pidx)
        if not (0 < h["fst"] < 0x100000000 and 12 <= h["fst_size"] <= 0x8000000):
            return None, None
        fst = self.rvz.read_partition(pidx, h["fst"], h["fst_size"])

        def entry(i):
            b = fst[i * 12:(i + 1) * 12]
            return b[0], int.from_bytes(b[1:4], "big"), *struct.unpack_from(">2I", b, 4)

        flag0, _, _, n = entry(0)
        if flag0 != 1 or n < 1 or 12 * n > h["fst_size"]:
            return None, None
        strtab = fst[12 * n:]

        def name(off):
            end = strtab.index(b"\x00", off)
            return strtab[off:end].decode("shift_jis", "replace")

        def build_dir(i):
            fl, no, a, b = entry(i)
            node = FSTEntry(name(no), True, a, i)
            j = i + 1
            while j < b:
                fl2, no2, a2, b2 = entry(j)
                if fl2 & 1:
                    child = build_dir(j)
                    j = b2
                else:
                    child = FSTEntry(name(no2), False, a2, j, a2 << 2, b2)
                    j += 1
                node.children.append(child)
            return node

        root = build_dir(0)
        return root, h

    def iter_files(self, root, prefix=""):
        for c in root.children:
            path = f"{prefix}/{c.name}" if prefix else c.name
            if c.is_dir:
                yield from self.iter_files(c, path)
            else:
                yield path, c

    def read_file(self, pidx, node):
        return self.rvz.read_partition(pidx, node.offset, node.size)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("rvz")
    ap.add_argument("--info", action="store_true")
    ap.add_argument("--tree", action="store_true")
    ap.add_argument("--get", action="append", default=[], metavar="DISC_PATH")
    ap.add_argument("--dol", action="store_true", help="extract main.dol")
    ap.add_argument("--out", default=os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "extract"))
    args = ap.parse_args()

    rvz = RVZReader(args.rvz)
    disc = WiiDisc(rvz)

    if args.info or True:
        print(f"game: {disc.game_id} rev {disc.rev} - {disc.title!r}")
        print(f"iso size: {rvz.iso_size:#x}  chunk: {rvz.chunk_size:#x}  "
              f"compression: {rvz.compression}  groups: {len(rvz.groups)}")
        print(f"partitions on disc: {[(hex(o), k) for o, k in disc.part_offsets]}")
        print(f"rvz partition entries: {len(rvz.partitions)}  raw entries: {len(rvz.raw_entries)}")

    for off, kind in disc.part_offsets:
        pidx = disc.partition_index_for(off)
        if pidx is None:
            print(f"partition @ {off:#x} (kind {kind}): no RVZ data entry")
            continue
        h = disc.part_header(pidx)
        print(f"partition @ {off:#x} kind={kind}: dol={h['dol']:#x} fst={h['fst']:#x} "
              f"fst_size={h['fst_size']:#x}")

    # find the game partition: the one with a parseable FST containing many files
    game = None
    for off, kind in disc.part_offsets:
        pidx = disc.partition_index_for(off)
        if pidx is None:
            continue
        root, h = disc.parse_fst(pidx)
        if root is None:
            continue
        names = [c.name for c in root.children]
        print(f"fst root children @ {off:#x}: {len(root.children)} entries: {names[:12]}")
        if any(c.is_dir and c.name == "module" for c in root.children):
            game = (pidx, root, h)
    if not game:
        print("no game partition found", file=sys.stderr)
        return 1
    pidx, root, h = game
    print(f"game partition: index {pidx}")

    if args.tree:
        for path, node in disc.iter_files(root):
            print(f"{node.size:>12,}  {path}")

    if args.get:
        os.makedirs(args.out, exist_ok=True)
        index = {path: node for path, node in disc.iter_files(root)}
        wants = [w.rstrip("/") for w in args.get]
        matches = [p for p in index if any(p == w or p.startswith(w + "/") for w in wants)]
        for want in matches:
            node = index[want]
            data = disc.read_file(pidx, node)
            dest = os.path.join(args.out, want.replace("/", os.sep))
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "wb") as f:
                f.write(data)
        print(f"extracted {len(matches)} files to {args.out}")

    if args.dol:
        hdr = rvz.read_partition(pidx, disc.part_header(pidx)["dol"], 0x120)
        offs = [U32.unpack_from(hdr, i * 4)[0] for i in range(18)]
        sizes = [U32.unpack_from(hdr, 0x90 + i * 4)[0] for i in range(18)]
        dol_off = disc.part_header(pidx)["dol"]
        dol_size = max(o + s for o, s in zip(offs, sizes) if o)
        os.makedirs(args.out, exist_ok=True)
        dest = os.path.join(args.out, "main.dol")
        with open(dest, "wb") as f:
            f.write(rvz.read_partition(pidx, dol_off, dol_size))
        print(f"extracted main.dol ({dol_size:,} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
