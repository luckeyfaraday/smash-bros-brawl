# Kirby joins the browser roster — build 008

Mario, Link and Kirby can now be selected independently for training, CPU battles
and two local players on Final Destination. Kirby uses his original model,
textures, an alternate costume for mirrors, 61 bones, seven hurtboxes and 36
sampled animation clips. Pikachu remains the fourth planned fighter.

## Movement and presentation

Kirby's normal jump is followed by five air jumps. Their initial vertical speeds
come from the five floats referenced by FitKirby's multijump table: approximately
1.8, 1.686, 1.572, 1.444 and 1.3. Each uses its corresponding JumpAerialF clip;
FallAerial and the inflated body mesh provide the floating pose. Fresh presses
consume one jump, holding the button does not consume another, and landing or
ledge recovery restores the available air jumps. Five HUD dots show the remainder.
The general jump check also prevents an extra jump after a ground launch.

Kirby's jumps, weight, gravity and aerial landing recovery use his own PAC values.
The shared common-state transitions, floating body changes, animation rate and
input acceptance timing are still provisional. Copy abilities are not implemented.

The moveset's bone IDs start at 400. The pose adapter maps them to the model's
ordinary indexes for hitboxes and hurtboxes, following the documented
[bone mapping in brawllib_rs](https://github.com/rukai/brawllib_rs/blob/main/src/high_level_fighter.rs).
The exported eye and mouth materials specify clamped textures; the renderer
restores this setting because Three's COLLADA composer defaults to repeating.
This removes duplicated eyes on the lower part of the body. Materials still
approximate Wii shading; eye animation and other effects are unfinished.

## Combat

- The two jabs deal 2% and 3%, using the original extended hitbox commands and
  animation times. The implemented special-hitbox combination is facing-relative,
  shieldable, and has no automatic rehit; other combinations still fail closed.
  The additional fields follow the
  [BrawlCrate event definition](https://github.com/soopercool101/BrawlCrate/blob/v0.42h1/BrawlLib/SSBB/ResourceNodes/Moveset/MoveDefNode.cs).
- A queued third press, or holding through connected jabs, enters the original
  Attack100Start animation and rapid punches. A cycle has five pulses at 0, 4,
  8, 12 and 16; each lasts two ticks, with 1%/2% hitboxes. Each new pulse can hit
  again. Release exits through the cycle's continuation flag.
- Rapid-jab repetition is explicitly a reconstructed common-state rule. The
  payload preserves the entire original loop in originalCommands, while commands
  contains its pulse body. The controller repeats that body over the animation's
  20-tick cycle. Loop Rest and the still-undecoded Flow 03 are not silently treated
  as generic VM no-ops. Exact repetition/release timing needs engine comparison.
- Neutral aerial runs the original script with 12%, 10%, 8% and 6% phases at
  times 9, 11, 15 and 20, clearing at 34. The landing flag clears at 55.
- Forward smash uses the original lunging kick, with 15% hitboxes at times 7–11
  and 13% at 12–16. Root translation moves the physical fighter once, keeping
  the model and collision positions together. Charging and angles are unfinished.

The listed times are executed source-script times, not a claim that the full
original engine's startup, interrupt and movement ordering has been reproduced.
Kirby can also shield, break/recover a shield, catch ledges and play stock matches
through the shared controller. Specials, grabs, further attacks and full stage
wall/underside contact remain missing.

## Verification

Parser and simulation checks cover the multijump pointer table, all five jump
values/poses, jump limits after launches, bone aliases, jab/rapid transitions,
repeat contacts and release, smash/aerial phases, ledges and CPU matches against
Mario and Link. Browser checks exercise both player slots, HUD jump dots, mirror
rendering, recording/exported replay, rematch and phone layout. Current captures
are described in public/progress/kirby-capture.json. Build 008 passed 83 simulation/tool
checks, 7 Python parser checks, 17 browser flows and the production build.
