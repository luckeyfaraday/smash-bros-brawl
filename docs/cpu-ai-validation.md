# Build 027 — original CPU AI, first playable slice

Select **CPU battle** and **Mario** as P2 / CPU at http://127.0.0.1:5174/.
P1 can be any of the four fighters. The new Mario controller approaches, attacks,
chains jabs, grabs shields, guards incoming attacks, and recovers from both sides.
Link, Kirby and Pikachu CPU behavior remains the existing beginner controller.
Training is still passive and local multiplayer retains its normal controls.

This is a source-derived milestone, not full native AI equivalence. The browser
executes original AI bytecode; native mode selection and world queries are adapted
to the reconstructed simulation. No Dolphin per-frame comparison was performed.

## Original assets

The local disc was identified as **RSBE01, revision 1**. `tools/ai_dump.py` reads
the extracted PACs and produces all of these archives, including entry ordinals,
ARC type/index/group, nested archive paths, absolute file offsets and SHA-256s.
Group identity is essential: Mario's three AI entries all have type 1, index 0.

| Archive | Original location | Scripts | Instructions | ATKD entries |
| --- | --- | ---: | ---: | ---: |
| `ai_common` | `fighter/Fighter.pac` → type 1, index 1 | 34 | 2,894 | 0 |
| `ai_mario` | `fighter/mario/FitMarioMotionEtc.pac` → group archive 0 → MiscData 10 | 1 | 399 | 56 |
| `ai_link` | `fighter/link/FitLinkMotionEtc.pac` → same nesting | 3 | 721 | 51 |
| `ai_kirby` | `fighter/kirby/FitKirbyMotionEtc.pac` → same nesting | 3 | 569 | 61 |
| `ai_pikachu` | `fighter/pikachu/FitPikachuMotionEtc.pac` → same nesting | 5 | 853 | 52 |
| Total | | **46** | **5,436** | **220** |

All game data comes from the user's local extraction. No replacement or modded AI
PAC is downloaded. Exported files:

- `artifacts/ai-source/manifest.json`: full decoded data and provenance.
- `artifacts/ai-source/ai_*/archive.pac`: embedded archive, unchanged.
- `artifacts/ai-source/ai_*/entry-*-group-*-type-*-index-*.bin`: exact original payloads.
- `artifacts/ai-source/ai_*/scripts.txt`: readable instructions, raw operands and constants.
- `src/data/cpu-ai.json`: reproducible generated data used by the browser.

The exporter decodes AIPD definition blocks, attack-slot membership, routine-table
conditions/choices, and ATKD subaction/timing/range entries. Move names come from
the original fighter PAC name table. AIPD control bytes and unknown fields retain
their raw names and bytes; they have not been relabeled as probability weights.
Routine-table selection itself is not implemented yet.

## Native inspection

`tools/probe_ai_native.py` inspects `extract/module/sora_melee.rel`, module 27,
SHA-256 `56c5bb3e201db6a0a91e710d583f0cbe42b98094e7b86c4009abb5d927391b40`.
It independently finds the matching X/Y position-prediction function pair in the
original text section, then follows self-relocations to recover the **51-command**
and **47-function** dispatch tables. It saves `native-map.json` and annotated PPC
listings in `artifacts/ai-source/`.

The virtual addresses below use the text translation inferred from the two
matching research anchors; they are not a captured Dolphin load map. Every
handler also has a real file offset in `native-map.json`. Unresolved imported
calls are annotated, and undecoded paired-single words are not guessed.

| Native location | Evidence used |
| --- | --- |
| `0x80916884`, `0x809168C8` | Matching X/Y prediction bodies anchor the text mapping |
| `0x80917450` | Bytecode dispatcher and relocation-backed opcode table |
| `0x809174C4`, `0x80917548` | Return uses one Goto return slot; labels update frame resume pointers |
| `0x8091755C` | Seek changes resume pointer and sets the execution frame to -1 |
| `0x809174D0` | Jump resumes immediately and increments the execution frame |
| `0x8091762C` | All compound conditions are evaluated, including their random reads |
| `0x809176E0`, `0x80917734` | Relative and absolute stick commands add to the current frame's stick |
| `0x8091777C` | ClearStick clears one or both axes |
| `0x80917C10`, `0x80917E30` | SetFrame and SetTimeout write separate counters |
| `0x80918258` | Frame increment and timeout countdown |
| `0x8091DFC4` | Operand ranges select variables, world functions and constants |
| `0x8091E458` | Conditional skip treats Else + If as a single else-if level |

Research references were used as leads, then checked where described above:

- [ProjectMCodes AI definitions](https://github.com/Fracture17/ProjectMCodes/tree/52b99a7e7b55e31feb88154b5ffe7e63fb3a5410/Libraries/Brawl/AI)
  and [native update research](https://github.com/Fracture17/ProjectMCodes/blob/52b99a7e7b55e31feb88154b5ffe7e63fb3a5410/Codes/SuperTraining/dataAnalysis/_update_aiInput_decomp.cpp).
- [PPlusAI original command definitions](https://github.com/fudgepop01/PPlusAI/blob/005366966738b9112b456a6e6b52cbb75c85c2ab/Include/Commands.h),
  [functions](https://github.com/fudgepop01/PPlusAI/blob/005366966738b9112b456a6e6b52cbb75c85c2ab/Include/Functions.h),
  [requirements](https://github.com/fudgepop01/PPlusAI/blob/005366966738b9112b456a6e6b52cbb75c85c2ab/Include/Requirements.h),
  and [routine names](https://github.com/fudgepop01/PPlusAI/blob/005366966738b9112b456a6e6b52cbb75c85c2ab/Include/Routines.h).
- [AIScriptCLA](https://github.com/fudgepop01/AIScriptCLA/tree/289b499b06a05438b69dc3d03a76c86a618352b4):
  its BrawlLib AIPD/ATKD/AICE layouts were inspected locally using ILSpy 9.1.0.7988.

These projects also include modifications and tentative interpretations. Their
custom opcodes/patches are not installed or used as evidence of vanilla behavior.

## Browser execution

`src/ai-script.ts` is separate from the fighter PSA VM. It interprets source
instructions with 24 float variables, constant lookups, native-style labels,
Seek/Return/Jump/Goto, else-if conditions, arithmetic, stick accumulation, buttons,
and timeout counters. Unsupported commands/world queries stop with an error,
which reaches `Simulation.error` and pauses the browser; they are not silently
treated as successful instructions. Execution has a bounded instruction budget.

`src/cpu-mario.ts` supplies the browser world adapter and selects these routines:

| Routine | Source behavior |
| --- | --- |
| `0x0040` | Walk toward the opponent |
| `0x0060` | Dash approach |
| `0x1010` | Close attack setup and attack-slot selection |
| `0x1020` | Longer grounded attack setup |
| `0x1030` | Upward attack setup |
| `0x2040` | Aim and request recovery special |
| `0x3020` | Shield sequence |

Native `0x603x`/`0x604x` action requests become ordinary controller inputs. The
browser's fighter controller still owns button-edge recognition, attack timing,
hitboxes, damage, interruptions, jumps, shielding and recovery movement.

Remaining reconstructed behavior includes:

- High-level mode selection, threat anticipation and attack ranking. Original
  AIPD candidate membership and ATKD ranges are used, but the native selection
  probabilities and routine table evaluation are not reproduced.
- World predicates, shield remaining-time calculation, nearest-floor goals,
  ground/air actionability, attack-range adjustment and native input translation.
- A fixed level-value input of 100. This is not a claim to reproduce level 9.
- A private seeded RNG for deterministic replay, instead of Brawl's global RNG.
- Jump choice before the original recovery-special script, aerial choice,
  edge braking, jab follow-ups and grab decisions.
- Existing handling for captured/knocked-down/ledge states and special-move
  continuations. Those still use the earlier controller.
- Movement, hit response and several common-state rules in the browser engine.

The full archive is exported for further RE; the runtime slice above is the
validated subset. Loading a decoded script does not imply that all its native
world functions or helper routines have been implemented.

CPU VM registers, resume point, counters, pending action and both RNG state fields
are included in snapshots. A fresh match starts with a fresh controller. Respawn
clears in-progress CPU actions. Hitlag freezes script advancement. Simulation ID
is now `brawl-lab-027`; old CPU recordings must not be interpreted as this build.
The two training regression recordings retain their unchanged state hashes, with
only their compatible simulation-version metadata advanced.

Read-only browser inspection:

```javascript
brawlLab.snapshot().cpu    // current decision state and VM registers
brawlLab.cpuTrace()        // last 120 frames: script ID, byte offsets, call and inputs
```

The regular Record / Export / Replay controls and `tools/trace_replay.ts` also
work with CPU matches. Exported inputs replay in Node and Chromium, including CPU
decisions. These are browser simulation traces, not original-game measurements.

## Reproduce

From the workspace root, with the prepared local extraction:

```powershell
.venv/Scripts/python.exe tools/ai_dump.py --runtime src/data/cpu-ai.json
.venv/Scripts/python.exe tools/probe_ai_native.py
.venv/Scripts/python.exe -m unittest discover -s tests -p ai_source_test.py
npm test
npm run build
npx playwright test tests/browser/cpu-ai.spec.ts tests/browser/battle.spec.ts tests/browser/training.spec.ts tests/browser/knockdown.spec.ts
```

The PAC exporter uses Python's standard library and the existing moveset reader.
The optional native probe needs Capstone; it can use the existing workspace
installation under `.tools/ppc-disasm`. The optional npm aliases are `ai:export`,
`ai:probe`, and `test:ai-source` when `python` selects the intended interpreter.

## Validation

Source checks compare every exported archive/entry SHA and byte range against the
original files; regenerate all scripts, AIPD tables and attack entries; verify
duplicate ARC indices retain their group identity; and reject corrupted lengths
and offsets. Interpreter tests cover native control-flow details, error handling,
source execution, shielding, grabs, both recovery sides and deterministic replay.

- **253/253 Node tests pass**, including nine CPU archive/interpreter/behavior
  checks (`artifacts/build027-unit.log`).
- **3/3 original-source Python checks pass** against the prepared extraction.
- **17/17 selected browser scenarios pass**: CPU source execution, downloaded
  replay in Node and Chromium, fighter/mode switching, CPU/local battles,
  keyboard/gamepad knockdowns, training and desktop/phone layouts
  (`artifacts/build027-browser.log`). This is the targeted regression run, not a
  rerun of every browser scenario.
- TypeScript and the production build pass (`artifacts/build027-build.log`).
  Vite still reports its large-bundle advisory.
- Desktop and 390px phone captures were inspected:
  `artifacts/build027-cpu-battle.png` and `artifacts/build027-cpu-phone.png`.
- Additional simulation runs let Mario finish three-stock matches against each
  of the four idle fighters without an error, and checked pursuit near both
  stage edges. These checks demonstrate working browser behavior, not parity
  with original Brawl decisions.

## Next RE step

Capture original-game AI inputs and state for controlled Mario scenarios using
the identified native handlers, then compare the first divergent decision with
the browser trace. Resolve native AIPD routine selection, attack-slot control
bytes, world predicates and RNG before extending the fidelity claim or switching
the other three CPUs to this runner.
