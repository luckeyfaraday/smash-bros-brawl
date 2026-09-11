"""Optional original-disc checks: python -m unittest discover -s tests -p ai_source_test.py."""
import hashlib
import json
import struct
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'tools'))
from ai_dump import arc_entries, decode_scripts, decode_attacks, decode_parameters, find_ai, subaction_names


class AISourceTests(unittest.TestCase):
    def test_original_bytes_match_every_exported_archive_and_table(self):
        manifest = json.loads((ROOT / 'src/data/cpu-ai.json').read_text())
        totals = [0, 0, 0]
        for fighter, exported in manifest['archives'].items():
            path = ROOT / 'extract' / exported['source']['file']
            blob = path.read_bytes()
            self.assertEqual(hashlib.sha256(blob).hexdigest(), exported['source']['sha256'])
            name, archive, _, offset, entries = list(find_ai(blob))[0]
            self.assertEqual(name, exported['name'])
            self.assertEqual(offset, exported['source']['archiveOffset'])
            self.assertEqual(blob[offset:offset + len(archive)], archive)
            names = [] if fighter == 'common' else subaction_names(ROOT / 'extract/fighter' / fighter / f'Fit{fighter.title()}.pac')
            for entry, metadata in zip(entries, exported['entries'], strict=True):
                data = entry['data']
                self.assertEqual(data, blob[offset + metadata['offset']:offset + metadata['offset'] + metadata['size']])
                self.assertEqual(hashlib.sha256(data).hexdigest(), metadata['sha256'])
                self.assertEqual(entry['group'], metadata['group'])
                if metadata['kind'] == 'scripts':
                    decoded = decode_scripts(data)
                    self.assertEqual({str(k): v for k, v in decoded.items()}, exported['scripts'])
                    totals[0] += len(decoded)
                    totals[1] += sum(len(s['instructions']) for s in decoded.values())
                if metadata['kind'] == 'ATKD':
                    decoded = decode_attacks(data, names)
                    self.assertEqual(decoded, exported['attacks'])
                    totals[2] += len(decoded)
                if metadata['kind'] == 'AIPD':
                    self.assertEqual(decode_parameters(data), exported['parameters'])
        self.assertEqual(totals, [46, 5436, 220])

    def test_duplicate_arc_indices_keep_distinct_group_identity(self):
        blob = (ROOT / 'extract/fighter/mario/FitMarioMotionEtc.pac').read_bytes()
        entries = list(find_ai(blob))[0][-1]
        self.assertEqual([(e['type'], e['index'], e['group']) for e in entries], [(1, 0, 1), (1, 0, 2), (1, 0, 3)])

    def test_corrupted_lengths_and_offsets_fail_instead_of_partial_decoding(self):
        raw = (ROOT / 'extract/fighter/mario/FitMarioMotionEtc.pac').read_bytes()
        _, blob, _, _, entries = list(find_ai(raw))[0]
        with self.assertRaisesRegex(ValueError, 'Truncated ARC'):
            arc_entries(blob[:-40])
        script = bytearray(next(e['data'] for e in entries if e['group'] == 2))
        first = struct.unpack_from('>I', script, 16)[0]
        struct.pack_into('>H', script, first + 16 + 2, 0)
        with self.assertRaisesRegex(ValueError, 'instruction length'):
            decode_scripts(script)
        parameters = bytearray(next(e['data'] for e in entries if e['group'] == 1))
        struct.pack_into('>I', parameters, 0x170, len(parameters) + 1)
        with self.assertRaisesRegex(ValueError, 'slot offset'):
            decode_parameters(parameters)
        attacks = next(e['data'] for e in entries if e['group'] == 3)
        with self.assertRaisesRegex(ValueError, 'ATKD length'):
            decode_attacks(attacks[:-1], [])


if __name__ == '__main__':
    unittest.main()
