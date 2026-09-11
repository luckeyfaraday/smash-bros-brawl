# Kirby inhale and spit — Build 019

In the main browser game, hold **U** as Kirby to inhale. After capturing an
opponent, walk and turn with A / D or hop with Space; tap **U or J** to spit.
P2 uses apostrophe and `/`. Standard gamepads use right bumper to inhale or
spit, or the attack button to spit. Captured fighters can tap attack, jump,
shield, special or change directions to struggle free. Repeated held inputs
do not keep adding escape progress. The hold also expires on its own.

## Source assets and scripts

`FitKirby.pac` supplies native subactions 462, 463, 464, 466 and 471:
SpecialNStart, SpecialNLoop, SpecialNEnd, SpecialNSwallow and SpecialNSpit.
The corresponding airborne scripts jump to shared ground bodies. These names
also occur later for copied abilities. The exporter selects the first native
entry, preserving `originalCommands` alongside the executable command copy.

- Start is 20 frames, loop 19, end 20, swallow 25 and spit 31. Original ground
  and air clips are exported along with EatWait, EatWalkMiddle, EatJump1/2,
  EatLanding and EatTurn. Kirby now has 88 fighter clips and 54 enabled scripts.
- The start enables model group 1 at age 16, then capture at age 17: bone 400,
  radius 5.5, offset [0, 6, 4]. The loop has an air-only capture sphere at
  [0, 7.5, 11], radius 4, and a both-target sphere at [0, 7.5, 6], radius 4.5.
- Loop wind uses the original zero-damage special hitbox at [0, 7.5, 13],
  radius 7, profile 0xc04fffc3. Its raw profile word is signed in the source
  JSON; the VM compares it as unsigned. It attracts rather than damaging.
- Spit defines a 10% throw. At source age 7 it generates article 2 and applies
  throw event 0 at script bone 459 (ThrowN). It closes the model at age 22.
  Capture follows animated MouthN, script bone 412. Kirby's script bone
  offset is 400; the exported skeleton has 61 bones.
- WpnKirbyStarMissile supplies the six-bone star with ItmCommonWStarB0,
  StarGlow and StarGlow2 textures. No star CHR0 was found; the exported Bind
  pose is used. Its face lies in the YZ plane. The renderer turns it toward
  the camera and spins it around its local X axis with additive materials.
- All four fighters now have CapturePulledHi and CaptureCut. Total fighter
  clip counts are Mario 62, Link 64, Kirby 88 and Pikachu 60.

`tools/MarioExporter.cs` exports motion and models; `tools/build_data.py`
retains the source scripts. Source inspection outputs are in
`artifacts/build019-inhale-{assets,poses,native,source}.txt`.

## Browser reconstruction and remaining work

The wind pulls 0.45 units per tick. A successful capture shrinks the opponent
over ten ticks and attaches them to Kirby's animated mouth. The controller
keeps captured fighters out of ordinary movement and damage resolution,
including the passive training dummy. Nearby shields do not stop the grab;
the outer wind does not drag a shielding fighter. Solid stage boundaries
occlude capture. Simultaneous eligible Kirby captures cancel both attempts.

The hold lasts 120 ticks plus half the opponent's damage, capped at 220;
it drains once per tick after pulling in. A fresh struggle input removes
twelve additional ticks, at most once per simulation step. Carrying scales
walk speed to 0.45, air speed to 0.4 and a grounded jump to 0.7 of Kirby's
source attributes. Held movement selects original carry poses, with immediate
turns. Air/ground transitions preserve the active animation clock.

The native spit event adds 10% exactly once and changes the captured opponent
into a star, currently moving at speed 4 with 0.04 drag for up to 30 ticks.
Stage contact ends the star early. Its occupant then returns to the original
escape pose with twenty ticks of invincibility. Interruption of Kirby releases
a held opponent; a flying star continues independently after the spit animation.
KOs and reset remove capture state. CPU Kirby can inhale and spit; captured
CPUs attempt to escape.

These transition, struggle, kinetic and invincibility rules are reconstructed.
The raw star parameter block at offset 277320 is retained by inspection, but
its kinetic field mapping is unverified. The two-player scope means there is
no third fighter for a spit-star collision. Original item-capture event 0610
and the secondary 6% entity-collision hitbox are omitted from executable inhale
commands and retained in `originalCommands`; their full behavior is unfinished.
Copy abilities, swallowing to copy, original suction effects, original star
material animation, sound and exact common capture rules remain unfinished.

## Playable evidence

`public/progress/inhale-capture.json` contains eight real keyboard routes with
full states: inhale, pull-in, holding, turning, hopping, spit, P2 capture and
escape. `visual-progress.html` uses the resulting gameplay images.

Nine simulation scenarios cover native timing and target masks, pull/capture,
shield interactions, carried movement, one-time spit damage and star release,
fresh-input escape, airborne landing, interruption, KO, stage contact,
simultaneous captures, both slots and CPU use. Two browser scenarios use the
actual controls and check the displayed state and damage, local escape, phone
layout and an exported replay against Node at every observed frame. The replay
also verifies in the browser. The two prior Mario fixtures retain all 180
pre-existing state values; only new capture fields and version metadata change.
The simulation ID is `brawl-lab-019`.

Validation results are recorded in `artifacts/build019-*.log`.

Final validation: all 173 simulation/tool checks, 9 parser checks and all 46
browser scenarios pass. TypeScript checking and the production build pass.
Desktop and 390px progress-page captures load all nine displayed images with
no page errors, failed asset requests or horizontal overflow. A separate
four-target simulation probe also confirms capture, 10% spit and release for
Mario, Link, Kirby and Pikachu.
