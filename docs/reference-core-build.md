# Building the local browser core

The original reference snapshot remains immutable. Candidate cores have a separate
build directory, artifact hashes, browser URL and test evidence. A candidate is
not a reproduction of the original Windows binary: the available locked source
series differs from that binary's recorded source series.

## Prepare in Ubuntu WSL

These commands use an isolated `/home/alanq/brawl-core-build` directory. Toolchain
installation does not change shell startup files or the existing Rust default.
The workspace and adjacent wasm-dolphin checkout are read as source inputs.

```powershell
wsl -d Ubuntu --exec bash /mnt/c/Games/smash-bros-brawl/tools/bootstrap_reference_build.sh /home/alanq/brawl-core-build
wsl -d Ubuntu --exec python3 /mnt/c/Games/smash-bros-brawl/tools/prepare_reference_build.py --workspace /mnt/c/Games/smash-bros-brawl --support /mnt/c/Games/wii-browser/wasm-dolphin --output /home/alanq/brawl-core-build
wsl -d Ubuntu --exec python3 /mnt/c/Games/smash-bros-brawl/tools/build_reference_core.py --build-root /home/alanq/brawl-core-build --workspace /mnt/c/Games/smash-bros-brawl --jobs 4
```

The first script installs Emscripten 5.0.7 from the pinned emsdk revision,
Rust nightly 2026-05-15 with rust-src, CMake 4.3.2 and Ninja 1.13.1. The Emscripten
and Rust compiler commits match the reference lock; Linux executable hashes,
Node 22.16.0 and Ninja differ from its Windows toolchain. The build records the
actual executable hashes and versions rather than claiming a Windows lock match.
See the [official Emscripten installation instructions](https://emscripten.org/docs/getting_started/downloads.html).

Source preparation checks the runtime snapshot inputs and the Naga source/lock
hashes, then fetches the locked upstream commit and dependencies. The build driver
uses the upstream provenance verifier to apply all 54 patches and verify the
resulting root, submodule and external repository trees. It then applies the local
texture mip patch and checks its three source files against the isolated tests.

Naga and Rust's standard library are compiled with the shared-memory Wasm features
needed by Dolphin's pthread module. Dolphin uses the reference production compile
options, with build paths changed for Linux. `build-evidence.json` records the
inputs, configuration and tools; the candidate's build metadata is written only
after compilation succeeds.

## Test a candidate

Copy the completed `candidate` directory into a new local directory under
`.tools/`, retaining its build JSON alongside the JavaScript and WASM. Use that
same directory for the server and probe:

```powershell
npm run reference:serve -- 5182 --candidate .tools/core-candidate-mips --patch tools/reference-patches/hardware-surface-mips.json
npm run reference:probe -- --headed --seconds 30 --candidate .tools/core-candidate-mips --url 'http://127.0.0.1:5182/?video=wgpu' --output artifacts/reference/candidate-fresh-boot
npm run reference:probe -- --headed --seconds 45 --candidate .tools/core-candidate-mips --allow-state-migration --load-state artifacts/reference/summit-single/summit-training.sav --url 'http://127.0.0.1:5182/?video=wgpu' --output artifacts/reference/candidate-training
```

The server verifies both artifacts against the completed build metadata and keeps
the verified bytes in memory. It exposes exactly three candidate files beneath
`/build/core-candidates/<wasm-sha256>/`. The default core still selects the original
snapshot. The server prints the explicit candidate URL, and the probe supplies
the corresponding `coreid` automatically and verifies served JavaScript and WASM.

Old checkpoints require `--allow-state-migration` with a candidate. This is an
explicit compatibility experiment: byte and disc checks remain mandatory, and
reports retain both source and target core identities. A successful after-load
callback does not establish compatible gameplay or rendering. Check the subsequent
screenshots, clock progression and renderer diagnostics. Newly saved checkpoints
receive the actual candidate core identity.

The combined worker patch retains the 640×480 surface correction and allocates
the mip count sent by the new C++ producer. It is not sufficient with the old core,
which does not send the required mip count. Broader rendering fidelity and
playable performance still require original-game validation.
