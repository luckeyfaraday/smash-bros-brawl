#!/usr/bin/env bash
# Run inside Ubuntu WSL. All installed tools stay in the selected build directory.
set -euo pipefail
build_root="${1:?Usage: bootstrap_reference_build.sh NEW_BUILD_ROOT}"
mkdir -p "$build_root/toolchain"
cd "$build_root/toolchain"
if [[ ! -d emsdk/.git ]]; then
  git init emsdk
  git -C emsdk remote add origin https://github.com/emscripten-core/emsdk.git
  git -C emsdk fetch --depth 1 origin bafd64c26bdaf10bd829163d1575b50b759a72d8
  git -C emsdk checkout --detach FETCH_HEAD
fi
test "$(git -C emsdk rev-parse HEAD)" = bafd64c26bdaf10bd829163d1575b50b759a72d8
./emsdk/emsdk install 5.0.7
./emsdk/emsdk activate 5.0.7
EMSDK_QUIET=1 source ./emsdk/emsdk_env.sh
emcc --version

export RUSTUP_HOME="$build_root/toolchain/rustup"
export CARGO_HOME="$build_root/toolchain/cargo"
"$HOME/.cargo/bin/rustup" toolchain install nightly-2026-05-15 --profile minimal --component rust-src --no-self-update
"$RUSTUP_HOME/toolchains/nightly-2026-05-15-x86_64-unknown-linux-gnu/bin/rustc" --version --verbose

if [[ ! -x cmake-4.3.2-linux-x86_64/bin/cmake ]]; then
  curl --fail --location --retry 3 https://github.com/Kitware/CMake/releases/download/v4.3.2/cmake-4.3.2-linux-x86_64.tar.gz -o cmake.tar.gz
  curl --fail --location --retry 3 https://github.com/Kitware/CMake/releases/download/v4.3.2/cmake-4.3.2-SHA-256.txt -o cmake-SHA-256.txt
  python3 -c 'import hashlib,pathlib; p=pathlib.Path("cmake.tar.gz"); expected=next(x.split()[0] for x in pathlib.Path("cmake-SHA-256.txt").read_text().splitlines() if x.endswith("cmake-4.3.2-linux-x86_64.tar.gz")); assert hashlib.file_digest(p.open("rb"),"sha256").hexdigest()==expected'
  tar -xzf cmake.tar.gz
fi
if [[ ! -x ninja/ninja ]]; then
  curl --fail --location --retry 3 https://github.com/ninja-build/ninja/releases/download/v1.13.1/ninja-linux.zip -o ninja.zip
  python3 -c 'import zipfile,pathlib; d=pathlib.Path("ninja"); d.mkdir(exist_ok=True); z=zipfile.ZipFile("ninja.zip"); p=d/"ninja"; p.write_bytes(z.read("ninja")); p.chmod(0o755)'
fi
./cmake-4.3.2-linux-x86_64/bin/cmake --version
./ninja/ninja --version
