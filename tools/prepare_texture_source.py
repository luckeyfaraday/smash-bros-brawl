"""Reconstruct only the locked WebGPU texture sources; this is not a core build."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
RUNTIME = ROOT / '.tools/reference-runtime'
PREFIX = 'Source/Core/VideoBackends/WebGPU/'
FILES = [PREFIX + name for name in ('WebGPUCommandStream.cpp', 'WebGPUCommandStream.h', 'WebGPUTexture.cpp')]


def digest(data):
    return hashlib.sha256(data).hexdigest()


def prepare(output, local_patch=None):
    local_data = local_patch.read_bytes() if local_patch else None
    if local_data is not None:
        targets = [line[6:] for line in local_data.decode().splitlines() if line.startswith('+++ b/')]
        if not targets or any(name not in FILES for name in targets):
            raise ValueError('Local texture patch has unexpected targets')
    lock_bytes = (RUNTIME / 'provenance/dolphin-source.lock.json').read_bytes()
    lock = json.loads(lock_bytes)
    vendor = json.loads((RUNTIME / 'provenance/dolphin-vendor-snapshot-v1.json').read_bytes())
    patches = []
    for entry in lock['patches']:
        path = (RUNTIME / entry['path']).resolve()
        if not path.is_relative_to(RUNTIME.resolve()):
            raise ValueError('Patch path outside runtime')
        data = path.read_bytes().replace(b'\r\n', b'\n')
        if len(data) != entry['size'] or digest(data) != entry['sha256']:
            raise ValueError(f'Locked patch mismatch: {entry["path"]}')
        if entry['cwd'] == '.' and any(f'diff --git a/{name} '.encode() in data for name in FILES):
            patches.append((entry, data))

    output.mkdir(parents=True, exist_ok=False)
    include = [f'--include={name}' for name in FILES]
    for entry, data in patches:
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', '--whitespace=nowarn', *include, '-'],
                       input=data, cwd=output, check=True, capture_output=True)
    records = {item['path']: item for item in vendor['root']['records']}
    base = {}
    for name in FILES:
        data = (output / name).read_bytes()
        if digest(data) != records[name]['sha256'] or len(data) != records[name]['size']:
            raise ValueError(f'Reconstructed source differs from locked vendor record: {name}')
        base[name] = digest(data)

    patch_hash = None
    if local_data is not None:
        data = local_data
        # Check the whole patch, so an unexpected target fails instead of being skipped.
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', '--check', '-'], input=data, cwd=output, check=True, capture_output=True)
        subprocess.run(['git', '-c', 'core.autocrlf=false', 'apply', '-'], input=data, cwd=output, check=True, capture_output=True)
        patch_hash = digest(data)

    manifest = {'scope': 'Three locked source files only; not a compiled or complete Dolphin tree',
                'sourceLockSha256': digest(lock_bytes), 'patchSeriesSha256': lock['patchSeriesSha256'],
                'upstreamCommit': lock['upstream']['commit'], 'localPatchSha256': patch_hash,
                'base': base, 'result': {name: digest((output / name).read_bytes()) for name in FILES}}
    (output / 'source-manifest.json').write_text(json.dumps(manifest, indent=2) + '\n', encoding='utf-8')
    print(json.dumps(manifest, indent=2))


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True, help='New output directory')
    parser.add_argument('--patch', type=Path, help='Local producer patch to apply after reconstruction')
    args = parser.parse_args()
    try:
        prepare(args.output.resolve(), args.patch.resolve() if args.patch else None)
    except subprocess.CalledProcessError as error:
        raise SystemExit(error.stderr.decode(errors='replace')) from error
