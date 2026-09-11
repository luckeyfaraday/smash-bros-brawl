# Build 026 — floor recovery

The browser reconstruction is playable at http://127.0.0.1:5174/.
Visual progress is at http://127.0.0.1:5174/visual-progress.html.
Scope remains Mario, Link, Kirby, Pikachu and Final Destination.

## Added

- Strong launches, tumbling, missed-tech floor impacts and prone waiting.
- Original face-up/down stand-ups, get-up attacks and forward/backward rolls.
- In-place and directional floor techs with fresh-input windows and lockout.
- Original script-controlled protection and attack windows, root-motion travel,
  stage-edge limits, interrupted-state cleanup and deterministic replay state.
- Both player slots, keyboard/gamepad controls, training-dummy automatic get-ups
  and CPU tech/get-up decisions through normal inputs.
- Contextual recovery guidance and nine new gameplay captures on the progress page.

All Build 025 models, existing animation clips and move scripts were verified
unchanged when restoring the 23 additional clips/scripts per fighter.
The earlier checkpoint is preserved in `.tools/checkpoint-build025-before-026/`.

## Validation

- 244/244 Node checks and 9/9 parser checks pass.
- TypeScript and the production build pass; the existing large-bundle advisory remains.
- The four new browser scenarios pass, covering all fighters and both slots,
  gamepad input, held-input expiration and downloaded replay in Node/Chromium.
- All nine gameplay captures reproduce exactly in Node from keyboard inputs.
- The progress page loads nine images without errors or overflow at 1440px and 390px.
- The complete browser regression suite passes: **68/68 scenarios**, including
  all four new floor-recovery cases, existing moves, CPU/local matches, replay,
  stage/ledge routes and desktop/phone layouts (`build026-browser.log`).

Logs: `artifacts/build026-node-final.log`, `build026-parser.log`,
`build026-build.log`, `build026-knockdown-browser.log`,
`build026-gamepad-browser.log`, `build026-browser.log`,
`build026-capture-replay.log`, `build026-progress-capture.log`.

## Next work

Compare common rules against original-engine frame sequences. Knockback, tumble
threshold, posture selection, tech input timing/lockout, post-hitstun cancellation,
prone damage, bounce/slide and CPU decisions remain reconstructed. No native-engine
equivalence is claimed. Wall/ceiling techs, wall-tech jumps and tripping remain
unimplemented. Full audio/effects, animated backgrounds and performance work remain.

Details and provenance are in [knockdown validation](knockdown-validation.md).
The old emulator experiment remains separate and paused.
