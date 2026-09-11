#!/usr/bin/env python3
"""Dump existing fighter PACs, optionally extracting them from an RVZ first."""
import argparse
import contextlib
import io
from pathlib import Path
import re
import sys
from fitdump import report

ROOT = Path(__file__).resolve().parents[1]
SUFFIXES = ("MotionEtc", "Motion", "Entry", "Final", "Spy", "Dark", "Result",
            "Fake", "Eff", "Etc", "Lh", "Lw", "Hi")


def is_main_pac(path):
    path = Path(path)
    return (re.fullmatch(r"Fit[A-Za-z]+[.]pac", path.name) is not None
            and not path.stem.endswith(SUFFIXES)
            and not (path.parent.name == "kirby" and path.name != "FitKirby.pac"))


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--rvz", type=Path, help="Optional image; otherwise use existing PACs")
    ap.add_argument("--extract", type=Path, default=ROOT / "extract")
    ap.add_argument("--out", type=Path, default=ROOT / "fitdump")
    ap.add_argument("--fighter", help="One fighter directory, e.g. mario")
    args = ap.parse_args()
    if args.rvz:
        from rvz_extract import RVZReader, WiiDisc
        rvz = RVZReader(args.rvz)
        try:
            disc = WiiDisc(rvz)
            pidx = next(disc.partition_index_for(off) for off, kind in disc.part_offsets if kind == 0)
            root, _ = disc.parse_fst(pidx)
            for path, node in disc.iter_files(root):
                parts = Path(path).parts
                if len(parts) != 3 or parts[0] != "fighter" or not is_main_pac(path):
                    continue
                if args.fighter and parts[1] != args.fighter:
                    continue
                dest = args.extract / path
                if not dest.exists():
                    dest.parent.mkdir(parents=True, exist_ok=True)
                    dest.write_bytes(disc.read_file(pidx, node))
        finally:
            rvz.f.close()
    pacs = sorted(p for p in (args.extract / "fighter").glob("*/*.pac")
                  if is_main_pac(p) and (not args.fighter or p.parent.name == args.fighter))
    if not pacs:
        ap.error("no matching fighter PACs found")
    failed = []
    for pac in pacs:
        try:
            with contextlib.redirect_stdout(io.StringIO()):
                report(str(pac), str(args.out))
        except (ValueError, OSError, LookupError) as error:
            failed.append(pac.name)
            print(f"FAIL {pac.name}: {error}", flush=True)
        else:
            print(f"OK {pac.name}", flush=True)
    print(f"Dumped {len(pacs) - len(failed)}/{len(pacs)} fighters", flush=True)
    return bool(failed)


if __name__ == "__main__":
    sys.exit(main())
