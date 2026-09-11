# Original Brawl performance investigation

No faster configuration has been adopted. Short comparisons of the saved Mario/Zelda
Training scene showed no useful JIT gain. CPU sampling points to interpreter
execution and block lookup as the next optimization target. The hardware renderer
still has the [unresolved mip errors](texture-mip-validation.md).

## Compared runs

These sequential, passive runs used the same core, disc, `summit-training.sav`,
canvas-size patch, headed Chrome 152.0.7977.77 and Ryzen 7 4800H/AMD GCN-5 machine.
There were no scripted or unplanned keyboard inputs; gamepad polling was disabled.
Screenshots show both fighters and the stage. System load and clock/thermal
variation were not controlled. This is an exploratory set, not a repeated benchmark
or frame-accuracy comparison.

Speed below is the delta in core ticks divided by the Wii tick frequency and
observed wall time, excluding the first ten wall seconds. It does not use the
misleading speed spike immediately after restoring the core's clock.

| Configuration | Observed speed | Directory under `artifacts/reference/` |
| --- | ---: | --- |
| Cached interpreter, internal profiler on | 13.26% | `summit-cached-profile` |
| Guarded JIT, internal profiler on | 13.07% | `summit-jit-guarded` |
| Mixed JIT, internal profiler on | 13.13% | `summit-jit-mixed` |
| Producer graphics state cache, profiler on | 11.19% | `summit-state-cache` |
| Dual CPU/GPU core threads, profiler on | 10.81% | `summit-dual-profile` |
| Cached interpreter, internal profiler off | 13.99% | `summit-cached-unprofiled` |
| Guarded JIT, internal profiler off | 13.92% | `summit-jit-unprofiled` |

Exact intervals and identities are in `jit-comparison.json`,
`state-cache-comparison.json`, `dual-comparison.json`, and
`jit-unprofiled-comparison.json`. Earlier reports used rounded wall timestamps;
later samples include fractional monotonic seconds. Samples are about five seconds
apart, so interval endpoints and game progress differ. These observations are not
a general ranking of configurations.

JIT activation was real: the final guarded run reported 940 compiled blocks and
5,656,809 executions. Mixed mode reported 933 compiled blocks and 4,991,561
executions. State caching suppressed many bind-group records, but reducing command
count did not produce a faster observed run. Dual mode rendered the saved match
but showed no speed advantage here.

The source disables block redispatch with `ppcprof=1`. This changes execution, so
the guarded/cached pair was repeated with `ppcprof=0`. Both repetitions retained
normal metrics. All single-core runs retained 38 observed GPU mip errors; dual
mode counted 42. Zero page errors does not mean a healthy renderer.

## CPU sampling

The probe's new `--cpu-profile` option captures its page and existing workers using
Chrome's [Target](https://chromedevtools.github.io/devtools-protocol/tot/Target/)
and [Profiler](https://chromedevtools.github.io/devtools-protocol/tot/Profiler/)
domains at 10 ms intervals. Profiles are saved as `.cpuprofile` files for DevTools,
with summaries in the report. Sampling can alter timing; the throughput comparator
rejects these runs.

```powershell
npm run reference:probe -- --headed --cpu-profile --seconds 20 --url 'http://127.0.0.1:5181/?video=wgpu&wasmjit=0&ppcprof=0&metrics=0' --load-state artifacts/reference/summit-single/summit-training.sav
```

`summit-cpu-sample/` captured all 18 available targets: 17 workers and the page.
The disc/render-command worker was idle for much of the interval. One core worker,
`cpu-13.cpuprofile`, showed the active interpreter stack. Its most sampled leaves
were Wasm functions 4984, 4973, 4929, 4955 and 4974. Disassembly and comparison with
the available C++ suggest the cached-interpreter dispatch/execution path,
integer/float handlers and associated memory operations. Source names are inferred;
the binary has no symbol map.

Many other workers stayed in function 1026, whose disassembly includes
`memory.atomic.wait32`. Those samples include blocked time and must not be summed
as active CPU usage. Raw profiles preserve the call stacks and timings.

Seven selected functions are disassembled in `summit-cpu-sample/hot-functions.json`,
tied to the core hash. Reproduce the read-only analysis with:

```powershell
npm install --prefix .tools/wasm-analysis --ignore-scripts --no-audit --no-fund --save-exact wabt@1.0.39
node tools/disassemble_reference_functions.mjs --indices 1026,4984,4973,4929,4955,4974,500 --output artifacts/reference/hot-functions-new.json
```

This small local analysis package does not change the emulator binary or install
the full compiler toolchain.

## Comparing further experiments

```powershell
node tools/compare_reference_runs.mjs --output artifacts/reference/comparison-new.json --vary wasmjit,jitwarmup artifacts/reference/summit-cached-unprofiled/report.json artifacts/reference/summit-jit-unprofiled/report.json
```

The comparator requires matching core, disc, worker, checkpoint, browser, hardware
and undeclared settings. It rejects failures, active/unplanned input, CPU sampling,
clock resets and insufficient intervals, and records input report hashes. It does
not certify scene equivalence or statistical significance. The probe also records
explicit JIT state and compiled/executed block counts. All 44 Node tests passed.

Next are targeted interpreter/block-lookup work, candidate core builds with source
identity preserved, and repeated Brawl scene/input comparisons. The full build
still needs Emscripten and adequate disk space; that also holds up the already
tested mip-count correction. No configuration tested here solves the game's
performance or broader fidelity requirements.
