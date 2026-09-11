# Thunder Jolt — Build 018

Pikachu now uses U (P2: apostrophe; gamepad: right bumper) for his ground or
airborne neutral special. I / gamepad B still starts Quick Attack. The working
scope remains Mario, Link, Kirby, Pikachu and Final Destination.

## Original source data

- FitPikachuMotionEtc.pac supplies SpecialN and SpecialAirN, each 59 frames.
  Pikachu now has 58 exported fighter clips and 31 enabled attack scripts.
- Both fighter scripts call the same subroutine at source age 18. It checks
  requirement 28, Article Available(0), before generating article 0. The VM
  executes that exact guard using the owning simulation's article availability.
- FitPikachu.pac extra header 5 points to article 118124 (ID 1, Regular):
  the airborne ball has 9% damage, radius 3, angle 361, growth 30, base 60.
- Extra header 6 points to article 118256 (ID 2, Regular): the travelling spark
  has a ground-only 6% hit, radius 3.5, base 40, and an air-only 5% hit,
  radius 2, base 16. Both use angle 361, growth 20 and bone 3 (`tama`).
- Both phases use hitlag multiplier 0.3 and special profile 0x1cf7fc3. Ground
  and air target flags are bits 16 and 17 of hitbox parameter 12, retained and
  respected by collision resolution. Existing enabled attacks also respect
  those bits. The bit definitions are in the local brawllib_rs reference,
  `.tools/kirby-ref-script_ast_mod.rs`; requirement names are in the local
  BrawlLib `.tools/kirby-ref-MoveDefNode.cs` reference.
- WpnPikachuDengekidama supplies the four-bone air model, three textures and
  a looping 15-frame CHR0. WpnPikachuDengeki supplies the five-bone spark,
  original spark/tama textures and a 37-frame non-looping CHR0.
- The raw article parameter block at 87668 begins with integer 100, float
  -1.0122909545898438 (approximately -58 degrees), float 2, zero and integer 24.
  These words are retained; their original kinetic field mapping is unverified.

Exporters: `tools/MarioExporter.cs` and `tools/build_data.py`. The latter reads
the ground article's exported motion to preserve its bone-3 position track.
`tools/prepare_assets.py` already runs the model exporter before the data build.

## Reconstructed behavior and limitations

The shot starts at Pikachu's animated MouthN plus one forward unit. It travels
at speed 2, diagonally down at approximately 58 degrees. Stage contact replaces
the ball with the spark. The implementation repeats the original animation's
upper semicircle, samples 0–12 (about 22 units forward and 11 units high), while
its supporting point follows the original connected floor, walls and underside.
The hit follows the electric core, and the model aligns with the local surface.
The remaining original CHR0 frames are retained in the asset but are not used in
the repeated browser arc. This phase selection, repetition, travel and corner
handling are reconstructed, not verified original common code.

Lifetime is currently 100 ticks across both phases, with a two-shot capacity
per owner. Neutral-special ground/air transitions preserve the firing clock.
The controller waits for the 59-frame animation before accepting another action;
holding U does not repeat the move. Getting hit clears the throw but preserves
an already fired shot. Owner KOs and resets clear owned projectiles. The target
receives hitlag; the projectile's owner does not. Shields block the shot.

The layer materials use the original textures and vertex colors with approximate
additive shading. Perspective billboards use the browser camera orientation;
original PAT0/SRT0 animation and Wii material stages are not reproduced. Corner
contact ordering, exact projectile kinetics, reflections, absorption, clashes,
sound and full original hit response remain unfinished.

## Playable evidence

`public/progress/jolt-capture.json` records seven keyboard routes and full captured
states. The images include ground travel and a 6% hit, an airborne ball and 9%
hit, landing conversion, the stage edge and underside. `visual-progress.html`
uses these actual captures and continues to mark each fighter in progress.

Simulation scenarios cover the source guard, one-shot timing, target-specific
9/6/5% damage, both directions around the stage, lifetime, landing continuity,
retained recovery access, shielding, owner interruption/KOs, P2 and CPU use.
Browser scenarios exercise the actual controls, both shot phases, edge/underside
travel, P2, the displayed damage and an exported recording replayed in Node at
each observed keyboard step. The simulation ID advances to brawl-lab-018. All 180 prior Mario
fixture states were identical before updating their version labels.

Logs and captures: `artifacts/build018-*.log`, `artifacts/build018-jolt-*.txt`
and `public/progress/jolt-capture.json`.

Validation: 164 simulation/tool checks and 9 parser checks pass. The full browser
run passed 43 scenarios; one new replay scenario incorrectly expected per-frame
hashes in the downloaded recording. That test now captures the actual browser
hash after each keyboard step. Both Thunder Jolt scenarios pass in the focused
rerun, covering all 44 browser scenarios across those runs. No application
change was needed for that test correction.
