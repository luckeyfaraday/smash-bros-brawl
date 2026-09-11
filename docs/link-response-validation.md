# Build 025: Link's shield, down-air rebound and crouching

The main browser game now lets all four fighters crouch with S (P2: Down;
gamepad: down on the stick). Link's standing and settled crouching poses
protect against incoming projectiles at the physical shield. His downward
aerial sword attack rebounds on a fighter or ordinary shield, with subsequent
contact using a weaker profile. The scope remains Mario, Link, Kirby,
Pikachu and Final Destination.

## Original data retained

`tools/MarioExporter.cs` exports Squat, SquatWait, SquatRv and SquatWaitItem
from each fighter's original MotionEtc data. `tools/build_data.py` retains the
corresponding scripts and Wait1. Motion counts are Mario 129, Link 127,
Kirby 161 and Pikachu 130. Item crouching uses the original held-item pose.
Startup and rise use their own clips; attacks, movement, jumps and dodges
can interrupt the crouch through ordinary controls.

In `fitdump/FitLink_data.json`, Wait1 and SquatWait set flag `0x12000041`.
The physical shield is therefore enabled only in the corresponding grounded,
settled, empty-handed states. It does not grant immunity while attacking,
walking, jumping, dodging or carrying a bomb. The capsule follows TateM (bone
71), the bone weighting all 337 vertices of polygon26 in the original Link
DAE. The mesh's approximate local bounds are X [-2.070, 3.473], Y [-3.771,
3.043], Z [-1.667, 0.713]. The fitted capsule is an approximation of coverage,
not an extracted original shield collision volume.

AttackAirLw keeps its original 90-frame animation and script. Landing lag is
enabled at age 9. At age 13 the script enables `0x12000040` and the 22% clean
hit; age 14 changes the hit to 18%. Age 64 clears hitboxes, that flag and the
landing-lag flag; the interrupt is at age 79. A landing during the active
landing window still uses LandingAirLw and its original 50-frame lag.

## Reconstructed responses and limits

The passive shield intercepts swept fireballs, arrows, damaging Gale
Boomerangs, Thunder Jolts and Final Cutter waves when their path intersects
its animated capsule from the front. Low paths can pass beneath the standing
shield; crouching lowers its coverage. Shots from behind, melee attacks,
explosions, Thunder and wind do not receive this passive protection.
A blocked shot produces a short gold flash, costs no ordinary shield health,
and applies no fighter damage or guard stun. Boomerangs use their existing
struck/return behavior. Normal K shielding remains separate.

The rebound adds 2.5 upward velocity and cancels fast fall without consuming
or restoring jumps. Hitlag freezes the rebound timer. After six unfrozen
frames, the move can contact again for 8%; another contact can rebound again.
Stone armor can absorb the damage while still rebounding Link.
The original script clock, active window and landing rules continue, and
strong 22/18% profiles cannot reappear during the same rebound. Landing,
being hit, grabbing a ledge or resetting clears the rebound.

The lift, rehit delay, 8% follow-up, shared hit response and shield impact
feedback are reconstructed behavior. They are not proven original native
parameter mappings. Late-hit recovery extension, native collision tuning,
full hit effects and audio still need work. Source script age and motion
fidelity do not establish original-engine equivalence.

## Verification

`tests/link-response.test.ts` covers all four crouch states and interrupts in
both player slots; source-enabled shield states; swept arrows at both facings
and heights; rear/low bypass; rebound on hit and guard; hitlag, weaker repeat
contacts, landing, interruption, reset and deterministic snapshots.

`public/progress/link-response-capture.json` records ten real keyboard routes
from index.html. Captures include standing and crouching fireball blocks, an
arrow block, down-air impact, upward rebound, an 8% follow-up, and all four crouching poses.
No simulation-state mutation is used for these captures. Replaying their
inputs in Node exactly matches the saved browser snapshots. Nine selected images are
shown in visual-progress.html. Existing Mario jab and neutral-aerial fixture
migrations verified all 90 prior states in each tape unchanged apart from the
new Link response snapshot field.


Final validation for this build:

- Full Node suite: 231/231 passed; after the additional Stone-contact case,
  the affected combat suites passed 31/31, including all eight Link-response cases.
- Full existing browser suite: 61/61 passed. After the final guidance and
  progress-page changes, five focused browser cases passed, including the
  three new Link cases, progress-page navigation and desktop/phone layout.
- Parser checks: 9/9 passed. TypeScript and the production build passed.
- All ten keyboard captures match their replayed browser snapshots in Node.
  Nine progress-page images load on desktop and phone without horizontal overflow.

Logs are artifacts/build025-node-final.log, build025-final-combat.log,
build025-browser.log, build025-final-browser.log, build025-parser.log,
build025-capture-replay-final.log, build025-progress-capture.log and
build025-build.log. Vite reports the existing large-bundle warning (about
820 kB minified); performance optimization remains future work.
