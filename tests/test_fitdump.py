"""Regression checks for actual parser failures, using the local Mario PAC."""
import json
from pathlib import Path
import struct
import sys
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "tools"))
import fitdump
from batch_fighters import is_main_pac


def moveset():
    pac = fitdump.ArcPac((ROOT / "extract/fighter/mario/FitMario.pac").read_bytes())
    return fitdump.Moveset(fitdump.SakuraiDat(pac.resolve(pac.entries[0])))


class ParserTests(unittest.TestCase):
    def test_environment_collision_bones_and_dimensions_for_the_four_fighters(self):
        expected = {'Mario': [39, 46, 24, 17, 12, 10, 40], 'Link': [44, 56, 22, 16, 12, 6],
                    'Kirby': [410, 440, 433, 457, 448], 'Pikachu': [37, 38, 35, 14, 8, 5]}
        for name, bones in expected.items():
            pac = fitdump.ArcPac((ROOT / f'extract/fighter/{name.lower()}/Fit{name}.pac').read_bytes())
            mv = fitdump.Moveset(fitdump.SakuraiDat(pac.resolve(pac.entries[0])))
            self.assertEqual(mv.misc()['environment'], [{'bones': bones, 'minHeight': 4., 'minWidth': 4., 'unknown': 0.}])

    def test_environment_collision_rejects_out_of_bounds_pointers_and_unknown_types(self):
        mv = moveset()
        header = mv.dat.read_u32(mv.hdr['misc_offset'] + 0x40)
        start = mv.dat.read_u32(header)
        pointer = mv.dat.read_u32(start)
        for offset, value, message in ((pointer + 4, mv.dat.data_chunk_size - 2, 'exceeds data section'),
                                       (pointer, 2, 'unsupported environment collision type')):
            damaged = bytearray(mv.dat.blob)
            struct.pack_into('>I', damaged, mv.dat.base + offset, value)
            with self.assertRaisesRegex(ValueError, message):
                fitdump.Moveset(fitdump.SakuraiDat(bytes(damaged))).misc()

    def test_kirby_multijump_velocities_come_from_the_pointer_table(self):
        pac = fitdump.ArcPac((ROOT / "extract/fighter/kirby/FitKirby.pac").read_bytes())
        mv = fitdump.Moveset(fitdump.SakuraiDat(pac.resolve(pac.entries[0])))
        values = mv.misc()["multijump"]["hop_velocities"]
        self.assertEqual(len(values), 5)
        for actual, expected in zip(values, [1.8, 1.686, 1.572, 1.444, 1.3]):
            self.assertAlmostEqual(actual, expected, places=6)
        header = mv.dat.read_u32(mv.hdr["misc_offset"] + 13 * 4)
        damaged = bytearray(mv.dat.blob)
        struct.pack_into('>I', damaged, mv.dat.base + header + 16, header - 4)
        with self.assertRaisesRegex(ValueError, 'multijump velocities exceed'):
            fitdump.Moveset(fitdump.SakuraiDat(bytes(damaged))).misc()

    def test_real_hurtbox_layout(self):
        mv = moveset()
        boxes = mv.misc()["hurtboxes"]
        self.assertEqual(len(boxes), 10)
        # Mario's torso is bone 21; the old parser decoded unrelated bone floats.
        self.assertEqual(boxes[0]["bone"], 21)
        self.assertEqual(boxes[0]["radius"], 2.5)
        self.assertTrue(all(b["enabled"] and b["radius"] > 0 for b in boxes))
        off = mv.dat.read_u32(mv.hdr["misc_offset"] + 3 * 4)
        raw = struct.unpack_from(">7fH", mv.dat.blob, mv.dat.base + off)
        self.assertEqual(boxes[0]["offset"], list(raw[:3]))
        self.assertEqual(boxes[0]["stretch"], list(raw[3:6]))
        self.assertEqual(boxes[0]["flags"], raw[7])

    def test_shared_scripts_are_present_for_every_move(self):
        subs = moveset().subactions()
        thrown = next(s for s in subs if s["name"] == "ThrownB")
        other = next(s for s in subs if s["name"] == "ThrownDxB")
        self.assertTrue(thrown["main"])
        self.assertEqual(thrown["script_offsets"]["main"], other["script_offsets"]["main"])
        self.assertEqual(thrown["main"], other["main"])

    def test_calls_inherit_clock_and_return_time(self):
        def timer(eid, value):
            return {"id": eid, "params": [{"value": value}]}
        events = [timer("0002", 5), {"id": "0007", "params": [], "children": [
                      {"id": "0007", "params": [], "children": [timer("0001", 2.5)]}]},
                  {"id": "0604", "params": []}, timer("0002", 1)]
        fitdump.frame_annotate(events)
        self.assertEqual(events[1]["children"][0]["children"][0]["frame"], 7.5)
        self.assertEqual(events[2]["frame"], 7.5)
        self.assertEqual(events[3]["frame"], 7.5)

    def test_external_calls_keep_symbolic_reference(self):
        mv = moveset()
        all_events = [e for s in mv.subactions() for stream in ("main", "gfx", "sfx", "other")
                      for e in fitdump.iter_events(s[stream])]
        external = [e for e in all_events if e.get("external")]
        self.assertTrue(external)
        self.assertTrue(any(e["external"].startswith("gameAnimCmd_") for e in external))
        self.assertTrue(all("children" not in e for e in external))

    def test_fighter_filter_accepts_kirby_and_rejects_motion_and_copy_pacs(self):
        self.assertTrue(is_main_pac("fighter/kirby/FitKirby.pac"))
        self.assertTrue(is_main_pac("fighter/mario/FitMario.pac"))
        self.assertFalse(is_main_pac("fighter/kirby/FitKirbyMario.pac"))
        self.assertFalse(is_main_pac("fighter/mario/FitMario00.pac"))
        self.assertFalse(is_main_pac("fighter/mario/FitMarioMotionEtc.pac"))

    def test_all_mario_output_is_finite_json(self):
        mv = moveset()
        json.dumps({"attributes": mv.attributes(), "subactions": mv.subactions(), "misc": mv.misc()}, allow_nan=False)


if __name__ == "__main__":
    unittest.main()
