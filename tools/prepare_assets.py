"""Prepare the browser's fighter/stage assets from existing PACs or a local RVZ/ZIP.

Run using the project .venv on Windows. BrawlLib is obtained from the pinned
BrawlCrate release; game data always comes from the supplied local files.
"""
import argparse
import hashlib
import json
from pathlib import Path
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parents[1]
TOOLS = ROOT / ".tools"
ASSETS = ("fighter/mario/FitMario.pac", "fighter/mario/FitMario00.pac", "fighter/mario/FitMarioMotionEtc.pac",
          "fighter/mario/FitMario02.pac", "stage/melee/STGFINAL.PAC",
          "fighter/link/FitLink.pac", "fighter/link/FitLink00.pac",
          "fighter/link/FitLink01.pac", "fighter/link/FitLinkMotionEtc.pac",
          "fighter/kirby/FitKirby.pac", "fighter/kirby/FitKirby00.pac",
          "fighter/kirby/FitKirby01.pac", "fighter/kirby/FitKirbyMotionEtc.pac",
          "fighter/kirby/FitKirbyMario.pac", "fighter/kirby/FitKirbyMario00.pac",
          "fighter/kirby/FitKirbyLink.pac", "fighter/kirby/FitKirbyLink00.pac",
          "fighter/kirby/FitKirbyPikachu.pac", "fighter/kirby/FitKirbyPikachu00.pac",
          "fighter/pikachu/FitPikachu.pac", "fighter/pikachu/FitPikachu00.pac",
          "fighter/pikachu/FitPikachu01.pac", "fighter/pikachu/FitPikachuMotionEtc.pac",
          "item/linkbomb/ItmLinkBombBrres.pac", "item/linkbomb/ItmLinkBombParam.pac", "system/common5_en.pac",
          "menu/titleloop/title_en.brres")
RELEASE = "https://github.com/soopercool101/BrawlCrate/releases/download/v0.42h1/BrawlCrate.v0.42h1.x86.exe"


def extract_disc(path):
    from rvz_extract import RVZReader, WiiDisc
    rvz = RVZReader(path)
    try:
        disc = WiiDisc(rvz)
        pidx = next(disc.partition_index_for(off) for off, kind in disc.part_offsets if kind == 0)
        root, _ = disc.parse_fst(pidx)
        files = dict(disc.iter_files(root))
        for path in ASSETS:
            node = files.get(path)
            if node is None:
                raise ValueError(f"Disc is missing {path}")
            dest = ROOT / "extract" / path
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(disc.read_file(pidx, node))
            print(f"Extracted {path}", flush=True)
        return {"game_id": disc.game_id, "revision": disc.rev}
    finally:
        rvz.f.close()


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    group = ap.add_mutually_exclusive_group()
    group.add_argument("--rvz", type=Path)
    group.add_argument("--zip", type=Path, help="ZIP containing a single RVZ; temporary disc is removed afterwards")
    args = ap.parse_args()
    if os.name != "nt":
        ap.error("The model exporter currently needs Windows and BrawlLib x86. Prepared browser assets run on any OS.")
    TOOLS.mkdir(exist_ok=True)
    disc_info = None
    if args.rvz:
        disc_info = extract_disc(args.rvz)
    elif args.zip:
        temporary = (TOOLS / "prepare-disc.tmp.rvz").resolve()
        if temporary.parent != TOOLS.resolve() or temporary.exists():
            ap.error("Temporary disc path already exists or is outside .tools")
        try:
            with zipfile.ZipFile(args.zip) as archive:
                images = [i for i in archive.infolist() if i.filename.lower().endswith(".rvz")]
                if len(images) != 1:
                    ap.error("ZIP must contain exactly one RVZ")
                if shutil.disk_usage(TOOLS).free < images[0].file_size + 512_000_000:
                    ap.error("Not enough free space to unpack the temporary RVZ")
                print("Unpacking temporary disc…", flush=True)
                with archive.open(images[0]) as src, temporary.open("xb") as dst:
                    shutil.copyfileobj(src, dst, 8 * 1024 * 1024)
            disc_info = extract_disc(temporary)
        finally:
            temporary.unlink(missing_ok=True)
    for path in ASSETS:
        if not (ROOT / "extract" / path).is_file():
            ap.error(f"Missing {path}. Supply --rvz or --zip.")
    lib = TOOLS / "brawlcrate/BrawlLib.dll"
    if not lib.exists():
        seven_zip = shutil.which("7z")
        if not seven_zip:
            ap.error("7-Zip is needed to unpack BrawlCrate. Install 7-Zip or put BrawlLib.dll in .tools/brawlcrate/.")
        installer = TOOLS / "BrawlCrate.exe"
        if not installer.exists():
            print("Downloading BrawlCrate v0.42h1…", flush=True)
            urllib.request.urlretrieve(RELEASE, installer)
        subprocess.run([seven_zip, "x", str(installer), "-o" + str(lib.parent), "-y", "-bso0", "-bsp0"], check=True)
    ps = Path(os.environ["WINDIR"]) / "SysWOW64/WindowsPowerShell/v1.0/powershell.exe"
    subprocess.run([str(ps), "-NoProfile", "-File", str(ROOT / "tools/export_mario.ps1")], check=True, cwd=ROOT)
    subprocess.run([str(ps), "-NoProfile", "-File", str(ROOT / "tools/export_mario.ps1"),
                    "-Model", str(ROOT / "extract/fighter/mario/FitMario02.pac"),
                    "-Out", str(ROOT / "public/assets/mario-opponent"), "-ModelOnly"], check=True, cwd=ROOT)
    subprocess.run([str(ps), "-NoProfile", "-File", str(ROOT / "tools/export_stage.ps1")], check=True, cwd=ROOT)
    subprocess.run([str(ps), "-NoProfile", "-File", str(ROOT / "tools/export_ui.ps1")], check=True, cwd=ROOT)
    for fighter in ("link", "kirby", "pikachu"):
        for costume, folder in (("00", fighter), ("01", fighter + "-opponent")):
            command = [str(ps), "-NoProfile", "-File", str(ROOT / "tools/export_mario.ps1"),
                       "-Model", str(ROOT / f"extract/fighter/{fighter}/Fit{fighter.title()}{costume}.pac"),
                       "-Motion", str(ROOT / f"extract/fighter/{fighter}/Fit{fighter.title()}MotionEtc.pac"),
                       "-Out", str(ROOT / f"public/assets/{folder}")]
            if costume != "00":
                command.append("-ModelOnly")
            subprocess.run(command, check=True, cwd=ROOT)
    subprocess.run([sys.executable, str(ROOT / "tools/build_data.py")], check=True, cwd=ROOT)
    manifest = {"exporter": "BrawlCrate v0.42h1", "brawlLibSha256": hashlib.sha256(lib.read_bytes()).hexdigest(),
                "sources": {p: hashlib.sha256((ROOT / "extract" / p).read_bytes()).hexdigest() for p in ASSETS},
                "disc": disc_info, "motion": "integer CHR0 samples; locomotion root translation removed"}
    (ROOT / "public/assets/mario/manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print("Mario, Link, Kirby, Pikachu and Final Destination assets ready. Run npm run dev.")


if __name__ == "__main__":
    main()
