# Original Brawl in a browser: evaluation

This workspace now has a separate WebAssembly Dolphin reference runner. It boots
the supplied RSBE01 revision 1 disc, while the Three.js training room remains the
gameplay reimplementation. Browser emulation is being evaluated as a way to run
original behavior and obtain comparison evidence. It has not been qualified as
an accurate or complete Brawl port.

## Runtime identity

`tools/prepare_reference.py` snapshots an existing local
[wasm-dolphin](https://github.com/dougchansan/wasm-dolphin) checkout into
`.tools/reference-runtime/`. It verifies the compiled core against its build
metadata, preserves the available source, patches, provenance and GPL license,
and hashes each copied file. The original checkout and ZIP are preserved.

- Core: `sha256:3b2ed6fe35ff1939e24bbe033edba34b9585f4f7b1f457f1e683ed8ddbd005d0`.
- Disc: `RSBE01`, revision `1`, 5,952,572,784 bytes.
- Disc SHA-256: `0de7b7d3aad2fb678c86faa55f21afb705956ad8943545c72d6f11e4c7f5cd46`.
- The local build metadata describes a modified checkout. Capturing this runtime
  identifies the tested bytes; it does not establish a reproducible source build.

All runtime binaries, original game data, screenshots and states are local ignored
files. They are not bundled into the training-room production build.

## Run manually

Start `npm run reference:serve`, then open:

<http://127.0.0.1:5180/?core=upstream&video=software&fastsw=0&wasmjit=0&cpu=single&disable=meleeloop,meleecall,osinterrupt&speed=1&presenter=webgpu&metrics=1&pacing=tick>

Use **Open Disc** and select `.tools/brawl-reference.rvz`. The server sends the
cross-origin isolation headers required by the threaded core. It binds to loopback
and serves only the runtime directory. The disc is mounted in browser WORKERFS;
it is not served over HTTP or copied wholesale into the WASM heap.
After the first game screen appears, use the upload-state arrow and select
`artifacts/reference/summit-single/summit-training.sav` to reopen the captured
Training scene. This state is tied to the exact local core and disc listed above.
The configuration shown here is the one that rendered both fighters in the
gameplay test; it is currently far below playable speed.

| GameCube control | Keyboard |
| --- | --- |
| A / confirm | X |
| B / back | Z |
| Start | Enter |
| Left stick | WASD |
| X / Y | V / B |
| L / R / Z | Q / E / C |
| D-pad | Arrow keys |
| C-stick | IJKL |

These controls differ from the training-room controls. The runtime's ordinary
save button and downloaded Dolphin `.sav` states are different features; use the
download/upload state controls for full core checkpoints. Persistent Wii NAND
saves across browser restarts have not been established.

## Experimental hardware renderer

The hardware path now has a local canvas-size correction. Start a separate server:

```powershell
npm run reference:serve -- 5181 --patch tools/reference-patches/hardware-surface-size.json
```

Open <http://127.0.0.1:5181/?core=upstream&video=wgpu&wasmjit=0&cpu=single&disable=meleeloop,meleecall,osinterrupt&speed=1&presenter=webgpu&metrics=1&pacing=tick&nogamepad=1>,
mount the disc, and upload `summit-training.sav` after the first game screen.
This server is currently running locally. The software comparison server remains
on port 5180.

The pinned core reports a 640×480 backbuffer, but startup CPU presentation leaves
the transferred canvas at 320×240. The original worker clips the game's final
viewport `(0,56,640,368)` to `(0,56,320,184)`, producing a large top border and a
compressed image. The patch sizes the canvas to the core's surface immediately
before acquiring each backbuffer attachment. This restores centered letterboxing
and full output resolution. Initializing the size only at presenter creation was
insufficient because startup subsequently resized it again.

The patch is specific to this core's fixed surface dimensions. It does not establish
native-Dolphin rendering parity: the software presenter stretches the XFB, while
the hardware path applies the core's letterbox viewport. Texture/shading differences
remain, and the game still runs below playable speed.

The server applies the patch in memory after checking the exact worker SHA-256 and
requiring each replacement to match once. The snapshot files remain unchanged.
The tested patched worker hash is
`391a53e3bdf9b189a7d32917a935d88db1e0109c40997741ce96c4470aa325f5`.
Probe reports record the served worker hash and server patch specification hash.
For isolated experiments against the baseline server, the probe also supports
`--patch PATH.json`; it saves that specification and the resulting worker identity
with the evidence. Do not apply the same patch again to an already patched server.

```powershell
npm run reference:probe -- --headed --seconds 30 --url 'http://127.0.0.1:5181/?video=wgpu' --load-state artifacts/reference/summit-single/summit-training.sav
```

The probe now records canvas dimensions, frame cost/causal telemetry, and a final
renderer diagnostic report. GPU validation failures can appear as console logs
without a browser page error. Read `rendererHealth` and `rendererDiagnostics.errors`
alongside `errors`; a successful probe exit means evidence capture succeeded.

An outstanding defect is missing mip allocation: the worker creates textures with
one level, but the core uploads levels 1–5. The available C++ command producer's
`PushCreateTexture` carries layers but omits `TextureConfig.levels`, while
`PushUploadTexture` includes a mip index. Correcting that contract requires carrying
the configured mip count through creation and checking views, attachments and
sampling. The available source and binary are not yet a verified reproducible build;
that must be resolved before replacing the core. The surface patch does not change
texture allocation or suppress these errors.

The producer/consumer correction is now prepared and passes isolated native C++
and WebGPU tests, but has not been built into the running core. See
[texture mip validation](texture-mip-validation.md) for the patch, exact test scope,
reproduction commands and remaining build/integration work.

## Diagnostic probe

```powershell
npm run reference:probe -- --seconds 120 --press-start

# Restore a checkpoint captured by this probe and exact core.
npm run reference:probe -- --headed --seconds 120 --load-state artifacts/reference/summit-single/summit-training.sav
```

The default run is headless Chrome and is a boot/input diagnostic only. Add
`--headed` for a visible Chrome window. Renderer and performance comparisons need
headed runs, repeated trials, and matched scenes. The software renderer with
`fastsw=0` and `wasmjit=0` is the initial comparison configuration. This is still
a modified emulator, not an independently validated accuracy oracle.
The probe now defaults to the observed working single-core configuration with
the three named CPU helper categories disabled. Earlier reports retain their
explicit dual-core URLs so those observations can be reproduced.

`--output PATH` requires a new directory so earlier evidence cannot be overwritten.
Each run saves the full URL, core/disc identities, browser/CPU/GPU information,
console output, observed core progress, input events, and screenshots. The probe
rejects a metadata-only mount or demo fallback. A restore checks the state hash,
disc hash and core identity, waits for startup, and observes the core's after-load
callback before continuing. A callback alone does not establish correct rendering.
Scripted probes now default to `nogamepad=1` to exclude connected gamepads, record
detected controllers, and audit DOM key events against the active scripted action.
Unplanned key events are counted in the report. Earlier runs lack this input audit.

For guided menu navigation, pass `--control PATH`. The file contains a JSON array
and is reread between samples; append new actions with unique IDs while the probe
runs. `at` is wall-clock seconds after boot or restore, and `holdMs` is a wall-clock
hold duration. These inputs are not frame-exact replay data.

```json
[
  {"id":"confirm","kind":"press","keys":["KeyX"],"holdMs":1000,"at":15},
  {"id":"checkpoint","kind":"save","at":30},
  {"id":"done","kind":"stop","at":40}
]
```

Save actions produce `.sav` bytes plus a JSON identity record. Set the action ID to
a meaningful scene name after inspecting a screenshot. Do not use this mechanism
to infer exact jab timing or movement constants: the emulator advances on its own
thread, independently of the probe's sampling and keyboard events.

## Evidence so far

- `artifacts/reference/initial/`: passive boot reached the original wrist-strap
  screen with original-game XFB output. No demo fallback.
- `artifacts/reference/menu-input/`: the GameCube pad debug counters observed
  Start and A, and the screen advanced to the ESRB notice. The checkpoint named
  `strap-checkpoint` was actually captured at that notice.
- `artifacts/reference/after-strap/`: an early restore was rejected because the
  core was still Starting. The probe now waits for original-game video first.
- `artifacts/reference/after-strap-ready/`: the same checkpoint restored, the
  after-load generation advanced, and the ESRB notice rendered again. Further
  input created a game save and reached the main menu. `main-menu.sav` captures
  that menu.
- `artifacts/reference/training-menu/`: a headed Chrome run restored the main
  menu, navigated into Training, and moved the character cursor to Mario. Confirm
  and Start did not visibly reach stage selection during this run. The final
  `mario-selection.sav` preserves that state for comparison.
- `artifacts/reference/selection-interpreter/`: restoring that state with
  `ppc=interpreter`, then pressing A and Start, reached stage selection. The
  after-load callback and reported CPU name verified the restore and mode.
  `stage-select.sav` captures the resulting screen. This does not isolate the
  cause of the previous behavior: input timings differed and CPU settings change
  the relationship between wall time and emulated time.
- `artifacts/reference/stage-cached-basic/`: with `disable=meleeloop,meleecall,osinterrupt`,
  the stage-select checkpoint restored and Summit geometry rendered. Fighters and
  the HUD were absent in the observed scene. Stage selection occurred without a
  recorded confirm action, so this run is not a controlled input reference.
  `summit-loading.sav` preserves the incomplete scene.
- `artifacts/reference/summit-single/`: that checkpoint restored with `cpu=single`
  and the same disable flags, and both Mario and Zelda rendered in Training on
  Summit with their HUD percentages. Gamepad polling was disabled, no controllers
  were detected, and the keyboard audit recorded exactly the two scripted presses
  and releases, with no unplanned events. A later screenshot shows Mario airborne
  after the jump command. The attack command was delivered, but these samples do
  not establish attack timing or hit behavior. `summit-training.sav` captures the
  scene before those two commands.
- `artifacts/reference/training-roundtrip/`: a fresh headed browser restored
  `summit-training.sav` using the new probe defaults. Both fighters and the stage
  rendered again. Core identities matched, the after-load generation advanced,
  and no unplanned key events or page errors were recorded.
- `artifacts/reference/summit-hardware-single/`: switching only the renderer to
  hardware drew both fighters, but the output had a large top border and a mip
  upload validation error.
- `artifacts/reference/summit-hardware-diagnostics/`: logged the exact raw and
  clipped viewports and uploads into nonexistent mip levels. One unplanned Alt
  key event was recorded, so this is renderer diagnostics, not an input reference.
- `artifacts/reference/summit-hardware-surface/`: the initialization-only sizing
  experiment left the distortion unchanged. Its exact earlier patch is retained
  with the run, rather than inferred from the subsequently updated patch file.
- `artifacts/reference/summit-hardware-surface-pass/`: enforcing dimensions at
  backbuffer acquisition produced a sharper, centered, letterboxed Training scene.
- `artifacts/reference/summit-hardware-surface-served/`: a new headed browser
  reproduced that correction through the patched HTTP server. Every sample reported
  a 640×480 canvas; no unplanned keyboard events or page errors were observed.
  The GPU telemetry counted 38 errors, including missing mip levels. This remains
  an experimental renderer, not a fidelity or throughput qualification.
- `artifacts/reference/hardware-surface-fresh-boot/`: booted without a checkpoint
  and rendered the original wrist-strap screen with centered letterboxing. The
  canvas changed from 320×240 at startup to 640×480 by the next sample and stayed
  there. No GPU errors, page errors or unplanned inputs were observed in this
  short boot run; gameplay still exhibits the mip failures described above.

The first four runs used headless Chrome; the Training and interpreter runs used
headed Chrome 152.0.7977.77 on a Ryzen 7 4800H machine, about 16 GB RAM, with WebGPU
reporting AMD GCN-5. They establish boot, menu navigation and restore progress,
not playable speed, rendering parity with native Dolphin, or frame accuracy.
Cursor movement is visibly slow. The core's frame/speed counters alone do not
establish that the game presents or responds at 60 Hz. The first speed sample
after loading a state can also be enormous because the restored clock jumps;
it is not a throughput measurement.
The single-core scene is the first original-game gameplay rendering captured here.
Dual-core synchronization, CPU helper correctness, persistent saves, audio, and
performance remain open. Native Dolphin comparison and frame-exact game-state
capture are still required. The lab's existing regression recordings remain
browser-generated fixtures, not original Brawl reference captures.

## Checks completed

The server returned the required isolation headers and WASM MIME type, rejected
POST requests and paths outside its runtime root, and did not serve the disc.
The probe rejected invalid durations, unknown flags, non-local URLs, reused output
directories, and a deliberately mismatched served core. The mismatch was rejected
before Chrome launched. The training room's 34 simulation tests and production
build also passed after adding the reference tools.

After the hardware surface correction, all 39 Node tests passed, including five
new patch provenance/rejection tests. HTTP checks verified patched response bytes,
the patch identity header, HEAD length, isolation headers, rejected disc access and
POST requests, and unchanged baseline bytes on disk and on port 5180.

The initial CPU/JIT/cache comparisons are recorded in
[reference performance](reference-performance.md). They did not establish a faster
default. The new CPU profiles point to interpreter execution and block lookup for
further investigation. Match rendered scenes and game progress, repeat trials, and
test fresh boot before retaining any candidate improvement.
