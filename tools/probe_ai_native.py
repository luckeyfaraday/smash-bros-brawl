#!/usr/bin/env python3
"""Produce a read-only, reproducible map of vanilla Brawl's AI interpreter.

The text address translation is anchored to both aiStat arrival functions from
ProjectMCodes. Self-relocations locate the real command/function jump tables;
unresolved external calls are annotated, never treated as resolved addresses.
Requires capstone (the workspace's .tools/ppc-disasm installation also works).
"""
import argparse
import hashlib
import json
import struct
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / '.tools/ppc-disasm'))
from capstone import Cs, CS_ARCH_PPC, CS_MODE_32, CS_MODE_BIG_ENDIAN

# These function addresses are research leads, validated against code below.
X_ADDRESS = 0x80916884
Y_ADDRESS = 0x809168C8


def probe(path, output):
    blob = path.read_bytes()
    module_id = struct.unpack_from('>I', blob)[0]
    count, table = struct.unpack_from('>II', blob, 0xC)
    sections = [struct.unpack_from('>II', blob, table + i * 8) for i in range(count)]
    text_offset, text_size = sections[1]
    text_offset &= ~3
    candidates = []
    # Arrival X reads x/vx/ax; the next function has the same body for y/vy/ay.
    for off in range(text_offset, text_offset + text_size - 0x88, 4):
        if blob[off:off + 8] != bytes.fromhex('3ca000003c800000'):
            continue
        if (blob[off + 12:off + 16] == bytes.fromhex('c0030080') and
                blob[off + 32:off + 36] == bytes.fromhex('c003005c') and
                blob[off + 0x44:off + 0x4C] == bytes.fromhex('3ca000003c800000') and
                blob[off + 0x50:off + 0x54] == bytes.fromhex('c0030084') and
                blob[off + 0x64:off + 0x68] == bytes.fromhex('c0030060')):
            candidates.append(off)
    if len(candidates) != 1:
        raise ValueError(f'Expected one pair of aiStat arrival functions; found {len(candidates)}')
    x_offset = candidates[0]
    translation = X_ADDRESS - x_offset
    assert translation + x_offset + 0x44 == Y_ADDRESS
    relocations = {}
    imports, size = struct.unpack_from('>II', blob, 0x28)
    for off in range(imports, imports + size, 8):
        target_module, cursor = struct.unpack_from('>II', blob, off)
        section, position = 0, 0
        while True:
            delta, kind, target_section, addend = struct.unpack_from('>HBBI', blob, cursor)
            cursor += 8
            if kind == 203:
                break
            if kind == 202:
                section, position = target_section, 0
                continue
            position += delta
            if kind == 201:
                continue
            file_offset = (sections[section][0] & ~3) + position
            relocations[file_offset] = dict(kind=kind, module=target_module, section=target_section, addend=addend)

    def dispatch(address, length):
        relocation = relocations[address - translation]
        assert relocation['module'] == module_id and relocation['kind'] == 4
        start = (sections[relocation['section']][0] & ~3) + relocation['addend']
        result = {}
        for index in range(length):
            target = relocations[start + index * 4]
            assert target['kind'] == 1 and target['module'] == module_id
            off = (sections[target['section']][0] & ~3) + target['addend']
            result[hex(index)] = dict(fileOffset=off, address=hex(translation + off))
        return dict(fileOffset=start, handlers=result)

    report = dict(source=dict(file=path.name, sha256=hashlib.sha256(blob).hexdigest(), moduleId=module_id),
                  text=dict(fileOffset=text_offset, size=text_size, assumedAddress=hex(translation + text_offset)),
                  anchors=[dict(name='calcArrivePosX', address=hex(X_ADDRESS), fileOffset=x_offset),
                           dict(name='calcArrivePosY', address=hex(Y_ADDRESS), fileOffset=x_offset + 0x44)],
                  commands=dispatch(0x8091745E, 51), functions=dispatch(0x8091E11A, 47),
                  limitation='Static inspection. Address translation is inferred from two matched research anchors, not a captured runtime load.')
    output.mkdir(parents=True, exist_ok=True)
    (output / 'native-map.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    decoder = Cs(CS_ARCH_PPC, CS_MODE_32 | CS_MODE_BIG_ENDIAN)
    ranges = [('interpreter', 0x809171F4, 0x80918554), ('lookup', 0x8091DEDC, 0x8091DFC4),
              ('value', 0x8091DFC4, 0x8091E458), ('condition-skip', 0x8091E458, 0x8091E4CC),
              ('requirements', 0x8091E4CC, 0x8091ED64)]
    for name, lo, hi in ranges:
        lines = [f'# {path.name} sha256 {report["source"]["sha256"]}',
                 '# Inferred virtual address / original bytes / PPC instruction / relocation, if any.']
        for address in range(lo, hi, 4):
            off = address - translation
            raw = blob[off:off + 4]
            word = int.from_bytes(raw, 'big')
            ins = list(decoder.disasm(raw, address)) if word >> 26 not in (4, 56, 57, 60, 61) else []
            description = f'{ins[0].mnemonic} {ins[0].op_str}' if ins else f'.word 0x{word:08x} # undecoded/paired-single'
            relocation = relocations.get(off) or relocations.get(off + 2)
            lines.append(f'{address:08x} {raw.hex()}: {description}' + (f' # relocation {relocation}' if relocation else ''))
        (output / f'{name}-ppc.txt').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    print(f'Matched aiStat X/Y functions; decoded {len(report["commands"]["handlers"])} command and {len(report["functions"]["handlers"])} function handlers.')
    return report


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--module', type=Path, default=ROOT / 'extract/module/sora_melee.rel')
    parser.add_argument('--out', type=Path, default=ROOT / 'artifacts/ai-source')
    args = parser.parse_args()
    probe(args.module, args.out)
