# Build 024: dodges and ledge actions

Mario, Link, Kirby and Pikachu now have forward/back rolls, spot dodges,
air dodges, ledge attacks and ledge rolls in the browser game. The roster
and Final Destination scope are unchanged.

K plus horizontal input selects a roll relative to the fighter's facing;
K plus down selects a spot dodge. A fresh K press in the air selects an
air dodge. Holding shield cannot repeatedly dodge. Jump and shield-grab
keep priority. On a ledge, J attacks and K rolls; jump, climb and drop
remain available. P2 uses comma, arrows and slash. Standard gamepads
use triggers, the stick and X. CPU opponents use these same inputs.

## Original assets and script data

The existing `Fit*_data.json` dumps supply eight additional scripts per
fighter: `EscapeN/F/B/Air`, `CliffAttackQuick/Slow`, and
`CliffEscapeQuick/Slow`. Their original CHR0 clips are exported from
MotionEtc. Counts are Mario 125, Link 123, Kirby 157 and Pikachu 126.
Raw probes are `artifacts/build024-defense-source.txt` and
`artifacts/build024-defense-assets.txt`.

All frame values below are the source script's integer age used by the
browser VM. A window includes its start and excludes its end.

| Action | Protection | Actionable age |
|---|---|---|
| Spot dodge, Mario / Link / Kirby | 1–20 | 25 |
| Spot dodge, Pikachu | 1–20 | 23 (clip end) |
| Rolls, Mario | 3–19 | 32 |
| Rolls, Link | 3–19 | 37 |
| Rolls, Kirby | 3–20 | 31 |
| Rolls, Pikachu | 3–19 | 32 (clip end) |
| Air dodge, all four | 3–29 | 50 (clip end), unless landing or catching a ledge |

Link's spot clip has 23 samples; it holds its final pose until the source
interrupt at 25. Roll root translation is removed from descendant poses
and transferred to fighter position once, including the first sample.
Forward rolls apply the source facing reversal on completion. Roll travel
stops at the platform edge and bypasses fighter body separation.

Ledge clips retain their root in the pose. The controller transfers it
into fighter position only when the move completes or a hit interrupts
it. Selection uses the existing 100% threshold, latched at action start.
Generic ledge invincibility is cleared so source body-collision events
control protection throughout the action. The camera follows the animated
horizontal position during attacks/rolls and eases out of ledge framing
over the final twelve frames, avoiding a jump when the root transfers.

| Fighter | Quick attack hit ages / damage | Slow attack hit ages / damage | Roll protection ends: quick / slow |
|---|---|---|---|
| Mario | 23–26 / 6% or 8% | 39–44 / 10% | 30 / 54 |
| Link | 26–29 / 8% | 50–54 / 10% | 25 / 63 |
| Kirby | 19–23 / 6% | 42–52 / 6% | 32 / 50 |
| Pikachu | 21–24 / 8% | 54–59 / 10% | 24 / 60 |

Quick attack protection ends at 20 / 25 / 18 / 20, respectively; slow
attack protection ends at 44 / 54 / 47 / 59. Ledge attacks use the original
bone-bound hitboxes, damage and knockback operands. Ledge rolls have no
attack hitbox.

## Reconstructed common behavior

The VM accepts only the observed `0E00` air/ground operand 0 and stores
its raw value. The source tool descriptions do not establish a complete
kinetic-mode mapping. It never forces a fighter to the floor. The browser
uses this age-29 event to restore full air steering; before it, steering
acceleration is scaled to 0.35. Existing momentum and gravity continue.
Landing ends the air dodge with ten frames of reconstructed landing lag.
Repeated air dodges are allowed after recovery without requiring a landing.

The primary type reference is
[brawllib_rs EventAst](https://docs.rs/brawllib_rs/latest/brawllib_rs/script_ast/enum.EventAst.html),
which retains `SetAirGround(i32)` and describes facing reversal at animation
end. The [PSA event definitions](https://github.com/Sammi-Husky/Project-Smash-Attacks/blob/master/PSA/Data/Events.txt)
provide the air/ground event's generic description. These references do
not prove the browser's common movement or landing parameters.

Edge clamping, input thresholds, common transition rules, CPU choices and
air kinetics need refinement against the original game. Wall/ceiling
techs, knockdown options and perfect shielding remain unfinished.

## Verification

- All 32 source defense scripts and their protection windows execute without VM errors.
- 224/224 Node checks pass; 9/9 parser checks pass. New integration coverage
  includes both roll directions/facings, crossing either player, edge stops,
  vulnerable startup/recovery, repeated air dodges, landing recovery,
  input priorities and all quick/slow ledge actions on both edges.
- 180 prior jab/aerial states remain unchanged after removing only the new
  defense snapshot fields. Recording schema is `brawl-lab-024`.
- The complete browser suite passed 61/61 scenarios. The final camera-only
  adjustment is additionally checked against the actual browser renderer:
  the largest horizontal camera step during ledge-roll completion is 3.724
  for Mario, 2.387 for Link, 1.780 for Kirby and 2.192 for Pikachu.
- Nine final keyboard captures in `public/progress/defense-capture.json`
  reproduce their complete browser snapshots in Node. No simulation state
  was changed to stage these captures.
- `visual-progress.html` displays all nine captures at desktop and phone
  widths, with no horizontal overflow. The production build passes.

The local Vite process once served an older renderer despite the file update.
It was restarted after confirming the stale response; the camera measurements
and final captures above use the current served module. Final battle/control
checks after the restart passed 7/7 scenarios, including all four fighters,
P2, gamepad controls and replay (`artifacts/build024-final-browser.log`).

Artifacts: `artifacts/build024-{node,parser,browser,build,camera,capture,
capture-replay,progress-capture}.log`, `artifacts/build024-camera-checks.json`,
and `artifacts/build024-progress-{desktop,phone}.png`.
