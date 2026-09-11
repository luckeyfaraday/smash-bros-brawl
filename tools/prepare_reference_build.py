"""Stage and fetch an isolated Linux candidate build, preserving the reference runtime."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def sha(data):
    return hashlib.sha256(data).hexdigest()


def run(args, cwd=None):
    subprocess.run([str(x) for x in args], cwd=cwd, check=True)


def stage(workspace, support, output):
    runtime = workspace / '.tools/reference-runtime'
    snapshot = json.loads((runtime / 'snapshot.json').read_bytes())
    tool_lock = json.loads((runtime / 'provenance/wasm-toolchain.lock.json').read_bytes())
    files = {}
    for name, expected in snapshot['files'].items():
        if name.startswith(('core/', 'patches/', 'provenance/')) or name == 'LICENSE':
            data = (runtime / name).read_bytes()
            if sha(data) != expected:
                raise ValueError(f'Reference snapshot changed: {name}')
            files[name] = data
    for record in tool_lock['naga']['sourceRecords']:
        data = (support / record['path']).read_bytes().replace(b'\r\n', b'\n')
        if sha(data) != record['sha256'] or len(data) != record['size']:
            raise ValueError(f'Unmatched Naga input: {record["path"]}')
        files[record['path']] = data
    cargo_lock = (support / 'tools/naga-spirv-wgsl/Cargo.lock').read_bytes().replace(b'\r\n', b'\n')
    if sha(cargo_lock) != tool_lock['naga']['cargoLockSha256']:
        raise ValueError('Naga Cargo.lock differs from the toolchain lock')
    files['tools/naga-spirv-wgsl/Cargo.lock'] = cargo_lock
    # Reuse the upstream verifier, recording its bytes as an additional build input.
    for name in ['tools/dolphin-provenance.mjs', 'tools/jit-cache-prejs.js']:
        files[name] = (support / name).read_bytes().replace(b'\r\n', b'\n')
    files['local-patches/0001-texture-mip-count.patch'] = (
        workspace / 'patches/dolphin/0001-texture-mip-count.patch').read_bytes().replace(b'\r\n', b'\n')
    project = output / 'project'
    project.mkdir(parents=True, exist_ok=True)
    for name, data in files.items():
        path = project / name
        if path.exists() and path.read_bytes() != data:
            raise ValueError(f'Refusing to overwrite changed staged input: {path}')
        path.parent.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            path.write_bytes(data)
    manifest = {'scope': 'New Linux candidate; does not reproduce the legacy Windows binary',
                'referenceCoreId': snapshot['coreId'],
                'inputs': {name: sha(data) for name, data in files.items()}}
    (output / 'staged-inputs.json').write_text(json.dumps(manifest, indent=2) + '\n')
    return project


def fetch(repository, commit, destination):
    if not destination.exists():
        destination.mkdir(parents=True)
        run(['git', 'init', '-q', destination])
        run(['git', 'remote', 'add', 'origin', repository], destination)
    origin = subprocess.check_output(['git', 'remote', 'get-url', 'origin'], cwd=destination, text=True).strip()
    if origin != repository:
        raise ValueError(f'Unexpected repository origin: {destination}')
    head = subprocess.run(['git', 'rev-parse', '--verify', 'HEAD'], cwd=destination,
                          text=True, capture_output=True)
    if head.returncode == 0:
        if head.stdout.strip() != commit:
            raise ValueError(f'Unexpected existing checkout: {destination}')
        return
    run(['git', 'fetch', '--depth', '1', 'origin', commit], destination)
    run(['git', '-c', 'core.autocrlf=false', 'checkout', '--detach', commit], destination)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--support', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    project = stage(args.workspace.resolve(), args.support.resolve(), args.output.resolve())
    lock = json.loads((project / 'provenance/dolphin-source.lock.json').read_bytes())
    dolphin = project / 'vendor/dolphin'
    fetch(lock['upstream']['repository'], lock['upstream']['commit'], dolphin)
    run(['git', 'submodule', 'update', '--init', '--recursive', '--depth', '1', '--jobs', '4'], dolphin)
    for name, entry in sorted(lock['externalRepositories'].items(), key=lambda x: len(x[0])):
        fetch(entry['repository'], entry['commit'], dolphin / name)
    print(f'Staged source inputs and fetched pinned repositories in {project}', flush=True)


if __name__ == '__main__':
    main()
