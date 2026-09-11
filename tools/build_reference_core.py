"""Build the staged Dolphin mip candidate with its own source and toolchain evidence.

Run in Linux after bootstrap_reference_build.sh and prepare_reference_build.py.
This intentionally does not label the Linux tools as matching the Windows lock.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import subprocess


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write(path, value):
    path.write_text(json.dumps(value, indent=2) + '\n')


def capture(command, cwd, env):
    return subprocess.check_output([str(x) for x in command], cwd=cwd, env=env, text=True).strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--build-root', type=Path, required=True)
    parser.add_argument('--workspace', type=Path, required=True)
    parser.add_argument('--jobs', type=int, default=4)
    args = parser.parse_args()
    if not 1 <= args.jobs <= 16:
        raise ValueError('Build parallelism must be between 1 and 16')
    base = args.build_root.resolve()
    project = base / 'project'
    dolphin = project / 'vendor/dolphin'
    tc = base / 'toolchain'
    rust = tc / 'rustup/toolchains/nightly-2026-05-15-x86_64-unknown-linux-gnu/bin'
    emscripten = tc / 'emsdk/upstream/emscripten'
    node = tc / 'emsdk/node/22.16.0_64bit/bin/node'
    cmake = tc / 'cmake-4.3.2-linux-x86_64/bin/cmake'
    ninja = tc / 'ninja/ninja'
    env = {**os.environ, 'RUSTUP_HOME': str(tc / 'rustup'), 'CARGO_HOME': str(tc / 'cargo'),
           'RUSTC': str(rust / 'rustc'), 'CARGO': str(rust / 'cargo'),
           'EM_CONFIG': str(tc / 'emsdk/.emscripten'),
           'PATH': os.pathsep.join(map(str, [rust, emscripten, node.parent, cmake.parent,
                                            ninja.parent])) + os.pathsep + os.environ['PATH']}
    def run(command, cwd=project):
        subprocess.run([str(x) for x in command], cwd=cwd, env=env, check=True)

    staged = json.loads((base / 'staged-inputs.json').read_bytes())
    for name, expected in staged['inputs'].items():
        if sha(project / name) != expected:
            raise ValueError(f'Staged build input changed: {name}')
    evidence = {'scope': 'Linux candidate build from the available locked source plus local mip patch',
                'createdAt': datetime.now(timezone.utc).isoformat(), 'stagedInputs': staged,
                'driverSha256': sha(Path(__file__)), 'toolchain': {}}
    for name, binary in {'emcc': emscripten / 'emcc', 'clang': tc / 'emsdk/upstream/bin/clang',
                         'rustc': rust / 'rustc', 'cargo': rust / 'cargo', 'cmake': cmake,
                         'ninja': ninja, 'node': node}.items():
        evidence['toolchain'][name] = {'path': str(binary), 'sha256': sha(binary),
                                      'version': capture([binary, '--version'], project, env)}
    if '5.0.7' not in evidence['toolchain']['emcc']['version']:
        raise ValueError('Expected Emscripten 5.0.7')
    rust_version = capture([rust / 'rustc', '--version', '--verbose'], project, env)
    evidence['toolchain']['rustc']['verbose'] = rust_version
    if '7c3c88f42ad444f4688b865591d84660be4ece2f' not in rust_version:
        raise ValueError('The dated nightly differs from the pinned Rust commit')

    patch = project / 'local-patches/0001-texture-mip-count.patch'
    patched_marker = base / 'patched-source.json'
    if not patched_marker.exists():
        # The upstream verifier checks the full locked tree, submodules and all 54 patches.
        program = """import {applyPinnedPatches,verifyVendorSnapshotCheckout} from './tools/dolphin-provenance.mjs';
import {writeFileSync} from 'node:fs';
const applied=applyPinnedPatches();
const verified=verifyVendorSnapshotCheckout('vendor/dolphin');
writeFileSync('../locked-source-verification.json',JSON.stringify({applied,verified},null,2)+'\\n');"""
        run([node, '--input-type=module', '-e', program])
        run(['git', 'apply', '--check', patch], dolphin)
        run(['git', 'apply', patch], dolphin)
        texture = json.loads((args.workspace / '.tools/texture-source-mips-verified/source-manifest.json').read_bytes())
        for name, expected in texture['result'].items():
            if sha(dolphin / name) != expected:
                raise ValueError(f'Candidate texture source mismatch: {name}')
        source_lock = json.loads((project / 'provenance/dolphin-vendor-snapshot-v1.json').read_bytes())
        changed = {record['path']: sha(dolphin / record['path']) for record in source_lock['root']['records']
                   if record['status'] != 'D'}
        write(patched_marker, {'localPatchSha256': sha(patch), 'rootChangedFiles': changed,
                               'textureSource': texture})
    patched = json.loads(patched_marker.read_bytes())
    if patched['localPatchSha256'] != sha(patch):
        raise ValueError('Local source patch changed')
    for name, expected in patched['rootChangedFiles'].items():
        if sha(dolphin / name) != expected:
            raise ValueError(f'Candidate source changed since preparation: {name}')
    evidence['source'] = {'upstream': json.loads((project / 'provenance/dolphin-source.lock.json').read_bytes())['upstream'],
                          'patches': patched,
                          'lockedVerification': json.loads((base / 'locked-source-verification.json').read_bytes())}
    write(base / 'build-evidence.json', evidence)
    naga = project / 'tools/naga-spirv-wgsl'
    run([rust / 'cargo', 'build', '--locked', '--release', '--target', 'wasm32-unknown-emscripten'], naga)
    naga_lib = naga / 'target/wasm32-unknown-emscripten/release/libnaga_spirv_wgsl.a'
    evidence['nagaLibrarySha256'] = sha(naga_lib)
    baseline = json.loads((args.workspace / '.tools/reference-runtime/cores/dolphin/dolphin-core-upstream.build.json').read_bytes())
    build = base / 'build'
    output = base / 'candidate'
    output.mkdir(exist_ok=True)
    replace = {'CMAKE_MAKE_PROGRAM': ninja, 'DOLPHIN_WASM_NAGA_WGSL_LIB': naga_lib,
               'DOLPHIN_WASM_JIT_CACHE_PRE_JS': project / 'tools/jit-cache-prejs.js',
               'DOLPHIN_WASM_PROJECT_ROOT': project,
               'DOLPHIN_WASM_BRIDGE_SOURCE': project / 'core/upstream/dolphin_web_discio.cpp',
               'DOLPHIN_WASM_SHARED_SOURCE_DIR': project / 'core/upstream',
               'DOLPHIN_WASM_OUTPUT_DIR': output,
               'DOLPHIN_WASM_CORE_SOURCE': project / 'core/upstream/dolphin_web_core.cpp'}
    options = []
    seen = set()
    for option in baseline['configure']['cmakeArgs']:
        if not option.startswith('-D'):
            continue
        key = option[2:].split('=')[0]
        if key in seen:
            continue
        seen.add(key)
        options.append(f'-D{key}={replace[key]}' if key in replace else option)
    command = [emscripten / 'emcmake', cmake, '-S', dolphin, '-B', build, '-GNinja', *options]
    evidence['configureCommand'] = list(map(str, command))
    write(base / 'build-evidence.json', evidence)
    run(command)
    run([cmake, '--build', build, '--target', 'dolphin_web_core', '--parallel', args.jobs])
    evidence['completedAt'] = datetime.now(timezone.utc).isoformat()
    evidence['artifacts'] = {name: {'size': (output / name).stat().st_size, 'sha256': sha(output / name)}
                             for name in ['dolphin-core-upstream.js', 'dolphin-core-upstream.wasm']}
    evidence['coreId'] = 'sha256:' + sha(output / 'dolphin-core-upstream.wasm')
    write(base / 'build-evidence.json', evidence)
    write(output / 'dolphin-core-upstream.build.json', evidence)
    print(f'Candidate built: {evidence["coreId"]}', flush=True)


if __name__ == '__main__':
    main()
