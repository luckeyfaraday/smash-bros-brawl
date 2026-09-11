# Directional tilts and dash attacks · Build 014

These attacks are playable in the main `index.html` game, in training, CPU matches
and local two-player matches. The scope remains Mario, Link, Kirby, Pikachu and
Final Destination. `visual-progress.html` shows nine gameplay captures: eight
from this milestone plus the previous Final Cutter wave.

## Controls and behavior

J without a direction starts a jab. A/D + J starts a forward tilt, W + J an up
tilt, and S + J a down tilt. Diagonal input angles the forward kick for Mario,
Kirby and Pikachu; Link uses his single forward-tilt variant. Horizontal input
wins an equal diagonal; stronger vertical analogue input selects up/down tilt.
The attack selection deadzone is 0.3. These input rules are reconstructed.

Run with Shift + A/D first, then press J for a dash attack. Pressing all three
from idle starts a forward tilt. The gamepad uses stick + X; full horizontal
stick runs. P2 uses arrows, slash and right Shift. Airborne J continues to select
neutral aerial; directional aerials are the next playable milestone.

Each ground attack locks its direction and actions until the original script's
interrupt flag or the end of its motion. Hitlag freezes both the pose and travel.
Walking off an edge during a moving attack clears the attack and restores normal
air movement. The CPU uses the new attacks and checks the dash path before using
it near the edge; its decisions remain a simple browser implementation.

## Source assets and timings

`tools/MarioExporter.cs` and `tools/build_data.py` export `AttackS3S`, `AttackHi3`,
`AttackLw3` and `AttackDash` for each fighter. Mario, Kirby and Pikachu also export
`AttackS3Hi` and `AttackS3Lw`: 16 base attacks plus six angled variants.
The original fighter PACs supply raw scripts and the MotionEtc PACs supply CHR0
motion. Current clip counts are Mario 40, Link 40, Kirby 52 and Pikachu 41.

The following are zero-based animation ages, excluding hitlag. Damage lists the
maximum overlapping hitbox damage at a phase, not the sum of its hitboxes.

| Fighter | Forward tilt | Up tilt | Down tilt | Dash attack |
| --- | --- | --- | --- | --- |
| Mario | 8%, ages 4–6 | 7%, 4–10 | 5/7%, 4–6 | 9% at 5–8, 7% at 9–24 |
| Link | 13%, 14–17 | 9%, 7–11 | 12%, 12–13 | 10/11/12%, 7–10 |
| Kirby | 7/8%, 4–7 | 7% at 3–4, 5% at 5–9 | 5/6%, 3–5 | Pulses at 11, 14, 18, 23, 29; finisher 34–36 |
| Pikachu | 9%, 4–9; high 10%, low 8% | 5/6/7%, 6–12 | 7%, 6–8 | 7%, 4–15 |

Kirby's dash pulses use the original shared subroutine and each clear permits
another contact. Pulses contain 2/3% hitboxes; the final phase deals 4%. The normal
training start currently connects four 2% pulses. The fifth pulse and finisher
are active but miss that launched target. A separate target-position case verifies
the finisher. This is not a guaranteed six-hit combo; common knockback still
needs refinement.

Kirby's up tilt sets bones 455 and 457 to intangible at age 3 and resets bone
collision at age 10. The VM handles these two command layouts and includes the
bone state in snapshots. Combat and optional hurtbox rendering both respect the
individual bones; other body hurtboxes stay active. Hitbox IDs are evaluated in
ascending order, including Link's dash script that inserts ID 3 before ID 0.

The exporter removes translation from descendant bone matrices and supplies a
separate root track. The controller transfers each horizontal root delta through
the stage solver once, mirrored by facing, and sweeps the attack through that
actual movement. No extra run velocity is added. The full dash tracks travel
about 28.33 / 32.01 / 39.99 / 33.89 units respectively. An interrupt may occur
before a clip ends: the controller preserves the position reached at that point,
including Mario's forward kick ending about two units ahead of its start.
These common movement and transition rules have not been matched to the original
engine. Source tripping chances remain in the raw commands; tripping response is
not implemented. Sounds and native attack effects also remain unfinished.

## Evidence

`.tools/capture-ground-attacks.mjs` selects each fighter, pauses and resets the
normal training game, then sends keyboard inputs and frame advances. It does not
modify simulation state. `public/progress/ground-capture.json` stores each input
route and captured state. The eight new arena images show Mario's angled kick
and slide, Link's forward tilt and running slash, Kirby's up tilt and spinning
dash, and Pikachu's tail sweep and dash. Desktop and phone captures include the
new control guide; collision and skeleton overlays are off.

The existing Mario jab and neutral-aerial fixtures were migrated to simulation
version 014 only after comparing all 180 states to saved Build 013 states with
the new empty bone-state field removed. Those gameplay states are unchanged.

131 Node checks pass, including directional inputs, source phases, mirrored root
travel, hitlag, action locks, stage exits, repeated hits, the finisher, selective
foot contact, shields, hitbox priority and CPU attack selection. New browser
coverage plays all 16 attacks through keyboard input, checks Pikachu's angles,
P2 keyboard and gamepad controls, and replays an exported ground-attack recording
both in the browser and in Node. All 33 browser scenarios pass across the full
run and a seven-scenario focused rerun. The full run's one failure expected the
previous milestone's recovery headline; its updated check verifies that recovery
instructions remain visible in the build note. Nine parser checks and the
production build also pass. Two final browser checks verify page links, loaded
capture images and desktop/phone layouts after the progress-note update; the
final production build passes too.
