# Knockdowns, get-ups and floor techs — Build 026

Mario, Link, Kirby and Pikachu now complete a launch → tumble → floor impact →
recovery sequence in the main browser game. This works in either player slot,
with keyboard or gamepad input, and in training and CPU battles.

## Controls

- While tumbling, tap **K** shortly before hitting the floor. Neutral direction
  techs in place; hold **A / D** at impact to tech roll in that direction.
- After a missed tech finishes bouncing, **J** uses a get-up attack, a fresh
  **A / D** input rolls, and **W / Space / K** stands up. Waiting triggers an
  automatic stand. Holding an input from before the wait does not repeat it.
- P2 uses **comma** for a tech, **slash** for a get-up attack, **Left / Right**
  for rolls and **Up / Enter / comma** to stand. In local play, a single gamepad
  controls P2: trigger to tech, stick to roll, X to attack, up/A/trigger to stand.
- The training dummy follows the same hit and floor states, then stands on its
  own. The beginner CPU can attempt techs and choose get-up attacks, rolls and
  standing through ordinary inputs, subject to the same timing restrictions.

The recovery panel identifies the affected player, explains the available
controls and reports the current protection window. The attack guide no longer
offers an ordinary jab while P1 is down.

## Original assets and scripts

The prepared exports supply 23 additional motion clips and scripts per fighter:
six damage/fall clips; face-up and face-down Bound, Wait, Damage, Stand, Attack,
Forward and Back clips; and Passive, PassiveStandF and PassiveStandB.
`tools/MarioExporter.cs` and `tools/build_data.py` now include these exports.

Before restoration, each existing move and animation, plus the other payload
fields, was compared against the prepared archive and verified unchanged.
The Build 025 source, assets and replay fixtures are preserved locally in
`.tools/checkpoint-build025-before-026/`. The original preparation archive remains
in `.tools/prepared-knockdowns/`.

| Fighter | Total fighter clips | Forward floor-tech travel | Backward floor-tech travel |
| --- | ---: | ---: | ---: |
| Mario | 152 | 36.99 | −37.00 |
| Link | 150 | 48.26 | −48.41 |
| Kirby | 184 | 34.99 | −35.00 |
| Pikachu | 153 | 35.99 | −32.41 |

Travel is in the source's stage units before facing and stage-edge clipping.
The exported TransN translation is removed from the skeleton and transferred
once into simulation position. Floor recovery follows the original horizontal
track; shared floor anchoring remains reconstructed.

The three floor-tech scripts make the body intangible at source age 0 and
restore normal collision at age 20 (`0605`). Passive has 27 exported frames;
the two rolling techs have 41. Both stand-up scripts restore collision at age
22 and have 30 frames. Other get-up protection windows remain fighter- and
posture-specific. The controller executes each script instead of assigning a
single blanket recovery invulnerability duration.

All eight get-up attacks retain their original 6% hitboxes, bone attachments,
timers and separate hit phases. They can hit or be shielded through the shared
combat path. The new scripts require no additional VM opcodes. Raw source probes
remain in `artifacts/build026-knockdown-source.json` and
`artifacts/build026-knockdown-clips.txt`.

## Reconstructed rules and limits

These are browser rules, not measured original-engine equivalents:

- The existing knockback calculation is unchanged. Knockback of 80 or more
  selects the new reaction. An airborne victim uses a directional DamageFly
  clip, remains in hitstun, then transitions to looping DamageFall. A strong
  grounded downward hit enters DownBound immediately. Lesser hits preserve the
  existing ordinary hitstun behavior.
- Launch-clip selection uses velocity direction. Face-up/down floor selection
  uses the animated hip's forward axis. Exact native clip/posture selection,
  tumble rotation, knockback decay, directional influence and hitstun cancellation
  require reference comparison.
- A fresh airborne shield press arms a 20-tick floor-tech window and a 40-tick
  lockout. Both timers freeze during hitlag; a press during hitlag can buffer
  the attempt. Holding or pressing again during lockout does not refresh it.
  Direction at floor contact selects the roll. These durations and update order
  are provisional and named in `src/knockdown.ts`.
- After hitstun, a fresh available jump or attack/special can leave tumble.
  Shield near the approaching floor is reserved for a tech; farther away it
  can cancel tumble into the existing air dodge. The near-floor test uses
  downward speed × 20 as its reach. Air steering uses 35% of current mobility.
  These common transitions need native validation.
- Floor impact and prone-damage recovery use their clip lengths before DownWait.
  A 180-tick wait triggers standing. A small grounded hit on a prone fighter
  uses DownDamage; relaunches, captures, KOs and resets clear obsolete recovery
  state. This is not a complete reconstruction of jab locks or forced get-ups.
- Get-up/tech rolls pass opponent pushboxes and stop just inside the stage edge.
  Surface wind can move a prone fighter off the floor, returning it to tumble.
  Original floor friction, bounce kinetics, body locking and pushbox rules remain
  approximate. Wall/ceiling techs, wall-tech jumps and tripping are not implemented.

Audio, original hit effects, stage-background animation and broader CPU/fidelity
work remain outside this milestone. No original-engine comparison is claimed.

## Evidence and verification

`tests/knockdown.test.ts` exercises all four fighters, both slots and facings,
both floor postures, all recovery choices, real get-up collision/shield contact,
source protection boundaries, input-window expiration, holding/mashing, hitlag,
stage edges, crossing opponents, relaunch/capture/KO/reset, air jumps, ledges,
training and CPU input. Snapshots include independent copies of phase and tech
timers, so recording hashes cover the new state.

`tests/fixtures/knockdown-routes.json` records eight routes starting from an
ordinary local match. Mario approaches and lands two charged up smashes; the
second causes a tumble in each target. No fighter positions, damage or state
are changed directly. Browser tests replay these routes through the main-page
keyboard bindings, cover all get-up choices and both players' floor techs,
exercise a gamepad, and replay a downloaded input recording in Node and Chromium.

The two existing 90-frame Mario replay fixtures were compared frame by frame
against Build 025. All prior state remained identical; only the new knockdown
snapshot fields were added when migrating hashes to `brawl-lab-026`.
The guarded migration is `.tools/migrate-knockdown-fixtures.ts`.

Nine screenshots in `public/progress/knockdown-*.png` come from actual paused
keyboard play. `public/progress/knockdown-capture.json` stores their complete
input routes and snapshots. `.tools/verify-knockdown-captures.ts` compares every
capture with a Node replay. The progress page displays these nine captures.

Final results: **244/244 Node checks**, **9/9 parser checks**, **68/68 browser
scenarios**, TypeScript and the production build pass. All nine keyboard captures
match Node replays. Desktop and phone progress pages load all nine images without
page/network errors or horizontal overflow. The existing large-bundle warning
remains. Log paths and next work are recorded in the
[Build 026 checkpoint](checkpoint-build026.md).
