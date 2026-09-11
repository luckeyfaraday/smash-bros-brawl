#!/usr/bin/env python3
"""Export Brawl AI archives from the user's extracted disc, without external tools.

ARC group IDs matter: entries with the same type/index hold different AI tables.
Instruction framing and AICE/ATKD layouts are documented in docs/cpu-ai-validation.md.
Unknown operands and parameter bytes are retained; exporting is not emulation.
"""
import argparse
import hashlib
import json
import math
import struct
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
COMMANDS = dict(enumerate([
    'Finish', 'SetVar', 'SetVec', 'Label', 'Return', 'Seek', 'If', 'IfNot',
    'Else', 'EndIf', 'Stick', 'Button', 'Add', 'Sub', 'Mul', 'Div',
    'AddVector', 'SubVector', 'MulVector', 'DivVector', 'Jump', 'Random',
    'Or', 'OrNot', 'And', 'AndNot', 'SetFrame', 'Call', 'Goto',
    'GetReturnGoal', 'Abs', 'AbsStick', 'WaitForGround', 'WaitForGroundCanAct',
    'SetTimeout', 'EdgeCheck', 'EstOPassTimeX', 'EstOPassTimeY', 'GetShieldRemain',
    'GetRndPointOnStage', 'EstOXCoord', 'EstOYCoord', 'AtkDiceRoll', 'Breakpoint',
    'Norm', 'Dot', 'EstOPosVecR', 'Cmd2F', 'Cmd30', 'GetNearestCliff', 'ClearStick']))


def sha(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def arc_entries(blob):
    require(len(blob) >= 64 and blob[:4] == b'ARC\0', 'Invalid ARC header')
    count = struct.unpack_from('>H', blob, 6)[0]
    off = 64
    entries = []
    for ordinal in range(count):
        require(off + 32 <= len(blob), 'Truncated ARC entry header')
        kind, index, size, group, _, redirect = struct.unpack_from('>hhIBBh', blob, off)
        start = off + 32
        require(start + size <= len(blob), 'Truncated ARC entry payload')
        require(redirect == -1 or 0 <= redirect < count, 'Invalid ARC redirect')
        entries.append(dict(ordinal=ordinal, type=kind, index=index, group=group,
                            redirect=redirect, offset=start, size=size,
                            data=blob[start:start + size]))
        off = (start + size + 31) & ~31
    return entries


def find_ai(blob, path=(), offset=0):
    if blob[:4] != b'ARC\0':
        return
    entries = arc_entries(blob)
    name = blob[16:64].split(b'\0', 1)[0].decode('ascii')
    if name.startswith('ai_'):
        yield name, blob, path, offset, entries
        return
    for entry in entries:
        # Physical entries only: aliases are already identified by redirect.
        if entry['redirect'] != -1:
            continue
        location = {k: entry[k] for k in ('ordinal', 'type', 'index', 'group', 'offset')}
        yield from find_ai(entry['data'], (*path, location), offset + entry['offset'])


def decode_scripts(blob):
    require(len(blob) >= 16 and blob[:4] == bytes(4), 'Invalid AI script header')
    count = struct.unpack_from('>I', blob, 4)[0]
    require(0 < count <= 4096 and 16 + count * 8 <= len(blob), 'Invalid AI script count')
    offsets = list(struct.unpack_from(f'>{count}I', blob, 16))
    strings = list(struct.unpack_from(f'>{count}I', blob, 16 + count * 4))
    require(len(set(offsets)) == count, 'Duplicate AI script offsets')
    require(all(16 + count * 8 <= x < len(blob) for x in offsets), 'Invalid script offset')
    require(all(x == 0 or 16 + count * 8 <= x < len(blob) for x in strings), 'Invalid string offset')
    boundaries = sorted(set(offsets + [x for x in strings if x] + [len(blob)]))
    result = {}
    for start in offsets:
        end = next(x for x in boundaries if x > start)
        require(start + 16 <= end, 'Truncated AI script')
        script_id, events, constants, flags = struct.unpack_from('>4I', blob, start)
        require(script_id not in result, 'Duplicate AI script ID')
        require(16 <= events <= constants <= end - start, 'Invalid AI script sections')
        require(events % 4 == constants % 4 == 0, 'Unaligned AI script section')
        instructions = []
        cursor = start + events
        while cursor < start + constants:
            require(cursor + 4 <= start + constants, 'Truncated AI instruction header')
            opcode, argc, length = struct.unpack_from('>BBH', blob, cursor)
            require(length == 4 + argc * 4 and cursor + length <= start + constants,
                    f'Invalid AI instruction length at {cursor:#x}')
            args = list(struct.unpack_from(f'>{argc}I', blob, cursor + 4))
            instructions.append(dict(offset=cursor - start, opcode=opcode, args=args))
            cursor += length
        values = [x[0] for x in struct.iter_unpack('>f', blob[start + constants:end - (end - start - constants) % 4])]
        require(all(math.isfinite(x) for x in values), 'Non-finite AI constant')
        result[script_id] = dict(id=script_id, offset=start, eventOffset=events,
                                constantOffset=constants, flags=flags,
                                constants=values, instructions=instructions)
    return result


def decode_attacks(blob, names):
    require(len(blob) >= 16 and blob[:4] == b'ATKD', 'Invalid ATKD header')
    count = struct.unpack_from('>I', blob, 4)[0]
    require(16 + count * 24 == len(blob), 'Invalid ATKD length')
    attacks = []
    for i in range(count):
        off = 16 + i * 24
        subaction, unknown, first, last, xmin, xmax, ymin, ymax = struct.unpack_from('>4H4f', blob, off)
        require(all(math.isfinite(x) for x in (xmin, xmax, ymin, ymax)), 'Non-finite ATKD range')
        attacks.append(dict(offset=off, subaction=subaction, name=names[subaction] if subaction < len(names) else None,
                            unknown=unknown, start=first, end=last, xmin=xmin, xmax=xmax, ymin=ymin, ymax=ymax))
    return attacks


def decode_parameters(blob):
    require(len(blob) >= 0x1E0 and blob[:4] == b'AIPD', 'Invalid AIPD header')
    definitions = []
    for off in (0x10, 0x70):
        far, middle = struct.unpack_from('>2f', blob, off)
        height, length = struct.unpack_from('>2f', blob, off + 0x10)
        require(all(math.isfinite(x) for x in (far, middle, height, length)), 'Invalid AIPD definition')
        definitions.append(dict(offset=off, farDistance=far, middleDistance=middle,
                                jumpHeight=height, jumpLength=length,
                                recoveryTimerBase=blob[off + 8], recoveryTimerRandom=blob[off + 9],
                                rawHex=blob[off:off + 0x60].hex()))
    offsets = struct.unpack_from('>28I', blob, 0x170)
    slots = []
    for index, offset in enumerate(offsets):
        entries = []
        if offset:
            require(0x1E0 <= offset < len(blob), 'Invalid AIPD attack slot offset')
            pos = offset
            while True:
                require(pos < len(blob), 'Unterminated AIPD attack slot')
                if blob[pos] == 0:
                    break
                require(pos + 3 <= len(blob), 'Truncated AIPD attack slot')
                # Control-byte meaning remains unverified; never relabel as weights.
                entries.append(dict(offset=pos, command=blob[pos], control1=blob[pos + 1], control2=blob[pos + 2]))
                pos += 3
        slots.append(dict(index=index, offset=offset, entries=entries))
    sections = [dict(mode=mode, first=blob[0x130 + i * 2], last=blob[0x131 + i * 2])
                for i, mode in enumerate(('recover', 'attack', 'defend'))]
    count = max(s['last'] for s in sections) + 1
    require(0x1E0 + count * 4 <= len(blob), 'Truncated AIPD routine offsets')
    routines = []
    for index in range(count):
        off = struct.unpack_from('>I', blob, 0x1E0 + index * 4)[0]
        require(0x1E0 + count * 4 <= off <= len(blob) - 4, 'Invalid AIPD routine offset')
        req1, req2, flags, entries = struct.unpack_from('>4B', blob, off)
        require(off + 4 + entries * 6 <= len(blob), 'Truncated AIPD routine choices')
        choices = []
        for j in range(entries):
            pos = off + 4 + j * 6
            controls = list(blob[pos:pos + 4])
            routine = struct.unpack_from('>H', blob, pos + 4)[0]
            choices.append(dict(offset=pos, routine=routine, controls=controls))
        routines.append(dict(index=index, offset=off, requirement1=req1, requirement2=req2,
                             flags=flags, choices=choices))
    return dict(header=list(struct.unpack_from('>4I', blob)), definitions=definitions,
                slots=slots, sections=sections, routines=routines, rawHex=blob.hex())


def subaction_names(path):
    # Read only the original name table, not a previously generated fitdump JSON.
    from fitdump import SakuraiDat, Moveset
    for entry in arc_entries(path.read_bytes()):
        b = entry['data']
        if len(b) >= 32 and int.from_bytes(b[:4], 'big') == len(b):
            dat = SakuraiDat(b)
            if 'data' not in dat.section_by_name:
                continue
            h = Moveset(dat).hdr
            return [dat.read_str(dat.read_u32(off + 4)) for off in range(h['subaction_flags'], h['subaction_main'], 8)]
    raise ValueError(f'No moveset found in {path}')


def export(extract, output, runtime=None):
    sources = [('common', extract / 'fighter/Fighter.pac', [])]
    for name in ('Mario', 'Link', 'Kirby', 'Pikachu'):
        fighter = extract / 'fighter' / name.lower()
        sources.append((name.lower(), fighter / f'Fit{name}MotionEtc.pac', subaction_names(fighter / f'Fit{name}.pac')))
    report = {'schemaVersion': 1, 'archives': {}}
    output.mkdir(parents=True, exist_ok=True)
    for fighter, path, names in sources:
        source = path.read_bytes()
        found = list(find_ai(source))
        require(len(found) == 1, f'Expected one AI archive in {path}')
        name, blob, arc_path, file_offset, entries = found[0]
        archive = dict(name=name, source=dict(file=path.relative_to(extract).as_posix(), sha256=sha(source),
                                             archiveOffset=file_offset, archiveSha256=sha(blob), path=arc_path),
                       entries=[], scripts={}, attacks=[])
        folder = output / name
        folder.mkdir(exist_ok=True)
        (folder / 'archive.pac').write_bytes(blob)
        listing = []
        for e in entries:
            raw = e['data']
            metadata = {k: v for k, v in e.items() if k != 'data'}
            metadata['sha256'] = sha(raw)
            filename = f"entry-{e['ordinal']}-group-{e['group']}-type-{e['type']}-index-{e['index']}.bin"
            metadata['file'] = filename
            archive['entries'].append(metadata)
            (folder / filename).write_bytes(raw)
            if raw[:4] == b'ATKD':
                archive['attacks'] = decode_attacks(raw, names)
                metadata['kind'] = 'ATKD'
            elif raw[:4] == b'AIPD':
                metadata['kind'] = 'AIPD'
                archive['parameters'] = decode_parameters(raw)
            elif e['group'] == 2 and raw[:4] == bytes(4):
                metadata['kind'] = 'scripts'
                archive['scripts'] = decode_scripts(raw)
                for s in archive['scripts'].values():
                    listing.append(f"\nScript {s['id']:#06x} @ entry+{s['offset']:#x}; constants {s['constants']}")
                    for ins in s['instructions']:
                        listing.append(f"  +{ins['offset']:04x} {COMMANDS.get(ins['opcode'], 'UNKNOWN_' + hex(ins['opcode']))} "
                                       + ' '.join(f'{a:#06x}' for a in ins['args']))
            else:
                metadata['kind'] = 'raw'
        require(archive['scripts'], f'No scripts in {name}')
        (folder / 'scripts.txt').write_text('\n'.join(listing) + '\n', encoding='utf-8')
        report['archives'][fighter] = archive
        print(f"{name}: {len(archive['scripts'])} scripts, {sum(len(s['instructions']) for s in archive['scripts'].values())} instructions, {len(archive['attacks'])} attack entries")
    (output / 'manifest.json').write_text(json.dumps(report, indent=2, allow_nan=False) + '\n', encoding='utf-8')
    if runtime:
        runtime.parent.mkdir(parents=True, exist_ok=True)
        runtime.write_text(json.dumps(report, separators=(',', ':'), allow_nan=False) + '\n', encoding='utf-8')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--extract', type=Path, default=ROOT / 'extract')
    parser.add_argument('--out', type=Path, default=ROOT / 'artifacts/ai-source')
    parser.add_argument('--runtime', type=Path)
    args = parser.parse_args()
    export(args.extract, args.out, args.runtime)
