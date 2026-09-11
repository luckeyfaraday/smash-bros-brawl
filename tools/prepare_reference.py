"""Prepare a local browser-emulation runtime and the supplied Brawl disc.

The runtime is a byte-for-byte snapshot of an existing wasm-dolphin checkout.
Neither its source checkout nor the source ZIP is modified.
"""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / '.tools/reference-runtime'
DISC = ROOT / '.tools/brawl-reference.rvz'


def digest(path):
    with path.open('rb') as source:
        return hashlib.file_digest(source, 'sha256').hexdigest()


def snapshot_runtime(source):
    if DEST.exists():
        manifest = json.loads((DEST / 'snapshot.json').read_text(encoding='utf8'))
        for name, expected in manifest['files'].items():
            if digest(DEST / name) != expected:
                raise ValueError(f'Runtime snapshot changed: {name}')
        print('Existing runtime snapshot verified', flush=True)
        return
    core = source / 'cores/dolphin/dolphin-core-upstream.wasm'
    build = json.loads((source / 'cores/dolphin/dolphin-core-upstream.build.json').read_text(encoding='utf8'))
    core_hash = digest(core)
    if build['coreId'] != 'sha256:' + core_hash:
        raise ValueError('Core bytes do not match the supplied build identity')
    paths = [source / name for name in ('index.html', 'icon.png', 'LICENSE', 'README.md')]
    for directory in ('src', 'cores/dolphin', 'provenance', 'core/upstream', 'patches'):
        paths.extend(p for p in (source / directory).rglob('*') if p.is_file())
    manifest = {'origin': str(source.resolve()), 'repository': 'https://github.com/dougchansan/wasm-dolphin',
                'coreId': build['coreId'], 'qualification': 'Unverified for Brawl; local evaluation snapshot', 'files': {}}
    for path in paths:
        name = path.relative_to(source).as_posix()
        target = DEST / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(path, target)
        manifest['files'][name] = digest(target)
    (DEST / 'snapshot.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf8')
    print(f"Copied {len(paths)} runtime/source files; core {build['coreId']}", flush=True)


def extract_disc(source):
    manifest_path = DISC.with_suffix('.json')
    if DISC.exists():
        manifest = json.loads(manifest_path.read_text(encoding='utf8'))
        if DISC.stat().st_size != manifest['size'] or digest(DISC) != manifest['sha256']:
            raise ValueError('Existing reference disc does not match its manifest')
        print('Existing reference disc verified', flush=True)
        return
    with zipfile.ZipFile(source) as archive:
        entries = [item for item in archive.infolist() if item.filename.lower().endswith('.rvz')]
        if len(entries) != 1:
            raise ValueError('Expected exactly one RVZ in the ZIP')
        entry = entries[0]
        if shutil.disk_usage(ROOT).free < entry.file_size + 1024**3:
            raise ValueError('Need space for the extracted disc plus 1 GiB')
        print(f'Unpacking {entry.file_size:,} bytes to {DISC.name}', flush=True)
        sha = hashlib.sha256()
        # Fixed destination: archive paths are never used as output paths.
        with archive.open(entry) as source_file, DISC.open('xb') as target:
            while chunk := source_file.read(8 * 1024**2):
                target.write(chunk)
                sha.update(chunk)
        from rvz_extract import RVZReader, WiiDisc
        rvz = RVZReader(DISC)
        try:
            disc = WiiDisc(rvz)
            identity = {'gameId': disc.game_id, 'revision': disc.rev}
            if disc.game_id != 'RSBE01' or disc.rev != 1:
                raise ValueError(f'Unexpected Brawl disc identity: {identity}')
        finally:
            rvz.f.close()
        manifest_path.write_text(json.dumps({'sourceZip': str(source.resolve()), 'entry': entry.filename,
            'size': entry.file_size, 'sha256': sha.hexdigest(), **identity}, indent=2) + '\n', encoding='utf8')
        print(f'Reference disc ready: {identity}, SHA-256 {sha.hexdigest()}', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--emulator', type=Path, required=True)
    parser.add_argument('--zip', type=Path, required=True)
    args = parser.parse_args()
    snapshot_runtime(args.emulator.resolve())
    extract_disc(args.zip.resolve())


if __name__ == '__main__':
    main()
