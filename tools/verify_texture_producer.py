"""Compile the actual texture-creation methods in an isolated native C++ harness."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import shutil
import subprocess

ROOT = Path(__file__).resolve().parents[1]
PREFIX = 'Source/Core/VideoBackends/WebGPU/'


def sha(data):
    return hashlib.sha256(data).hexdigest()


def method(text, signature):
    if text.count(signature) != 1:
        raise ValueError(f'Ambiguous method: {signature}')
    start = text.index(signature)
    end = text.index('\n}\n', start) + 3
    return text[start:end]


def verify(source, output):
    manifest = json.loads((source / 'source-manifest.json').read_text())
    expected_files = {PREFIX + name for name in ('WebGPUCommandStream.cpp', 'WebGPUCommandStream.h', 'WebGPUTexture.cpp')}
    if set(manifest['result']) != expected_files:
        raise ValueError('Source manifest must contain exactly the three texture source files')
    if manifest['localPatchSha256'] != sha((ROOT / 'patches/dolphin/0001-texture-mip-count.patch').read_bytes()):
        raise ValueError('Source manifest does not identify the current producer patch')
    files = {}
    for name, expected in manifest['result'].items():
        data = (source / name).read_bytes()
        if sha(data) != expected:
            raise ValueError(f'Patched source hash mismatch: {name}')
        files[Path(name).name] = data.decode()
    header = files['WebGPUCommandStream.h']
    record_start = header.index('struct CmdRecord\n')
    record = header[record_start:header.index('\n};', record_start) + 3]
    declarations = re.findall(r'u32 PushCreateTexture\([^;]+;', header)
    if len(declarations) != 1:
        raise ValueError('Missing unique texture creation declaration')
    methods = [method(files['WebGPUCommandStream.cpp'], 'u32 WebGPUCommandStream::PushCreateTexture('),
               method(files['WebGPUTexture.cpp'], 'WebGPUTexture::WebGPUTexture('),
               method(files['WebGPUTexture.cpp'], 'u32 WebGPUTexture::EnsureBridgeId(')]
    output.mkdir(parents=True, exist_ok=False)
    for name, text in [('record.inc', record), ('declaration.inc', declarations[0]),
                       ('methods.inc', '\n'.join(methods))]:
        (output / name).write_text(text + '\n', encoding='utf-8', newline='\n')
    harness = ROOT / 'tests/texture-producer-harness.cpp'
    if shutil.which('g++'):
        command = ['g++']
        paths = [str(harness), str(output), str(output / 'producer')]
        run = [paths[2]]
    else:
        command = ['wsl', '-d', 'Ubuntu', '--exec', 'g++']
        paths = [subprocess.check_output(['wsl', '-d', 'Ubuntu', '--exec', 'wslpath', '-a', p.as_posix()],
                                        text=True).strip() for p in [harness, output, output / 'producer']]
        run = ['wsl', '-d', 'Ubuntu', '--exec', paths[2]]
    version = subprocess.check_output(command + ['--version'], text=True).splitlines()[0]
    subprocess.run(command + ['-std=c++20', '-O2', '-Wall', '-Wextra', '-Werror',
                              paths[0], '-I', paths[1], '-o', paths[2]], check=True)
    records = subprocess.check_output(run)
    cases = json.loads(records)
    (output / 'records.json').write_bytes(records)
    report = {'scope': 'Isolated native producer methods; not an Emscripten core build',
              'compiler': version, 'harnessSha256': sha(harness.read_bytes()),
              'source': manifest, 'cases': len(cases), 'recordsSha256': sha(records)}
    (output / 'report.json').write_text(json.dumps(report, indent=2) + '\n', encoding='utf-8')
    print(f'{len(cases)} C++ producer cases passed; records saved in {output}')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    verify(args.source.resolve(), args.output.resolve())
