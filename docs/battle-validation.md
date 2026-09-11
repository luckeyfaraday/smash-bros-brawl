# Mario mirror battles — browser build 006

The main app now offers Training, CPU battle and Two players. Battles use a
three-second countdown, three stocks, a three-minute time limit, KOs, respawns,
results and rematches. Timer results compare stocks, then damage; exact ties and
simultaneous final-stock KOs draw. Training keeps its stationary target.

Both active fighters use `FighterController`, including attacks, hitstun, shields
and ledges. Each has independent input history, attack VM and combo state.
Contacts are collected before either hit is applied so simultaneous attacks trade.
The CPU produces ordinary inputs and can approach, attack, shield, jump and recover
at a ledge. Its decisions are a deterministic beginner routine, not original AI.

## Assets and visible behavior

- Added original `AttackS4S`, `GuardOn`, `GuardOff`, `GuardDamage` and `FuraFura`
  animations, bringing Mario to 30 clips. The second fighter uses the original
  green `FitMario02` costume with the same skeleton/animation data.
- Forward smash runs the original script: 14%/17% hitboxes at times 9–11,
  interrupt at 42. This build supports the uncharged, straight version.
- Forward-smash root translation is exported separately and applied to physical
  position once. Render and collision poses are normalized to that position,
  preventing the model from lunging ahead of its collision origin.
- Shields have visible bubbles and health bars. Releasing shield has recovery;
  Space can jump out of shield. A break leaves Mario vulnerable in the original
  dizzy animation before restoring some shield health.
- KOs hide the fighter for 45 ticks, then return them on a visible platform above
  the stage. They wait 60 ticks and retain another 120 ticks of invincibility.
- P1/P2 markers, distinct costumes, stocks and the match timer identify the fight.
  Result buttons start a rematch or return to training.

## Provisional rules and remaining scope

Shield health (60), drain (0.15/tick), regeneration (0.09/tick), shieldstun/damage
formulas and 120-tick break recovery are browser reconstruction rules. Shield
radius uses the extracted size attribute and shrinks with remaining health.
Battle mode uses a simple 8-unit grounded separation rule; air crossings remain
possible. Damage response, transition timing and ledge rules remain provisional.

Recovery specials, grabs, the remaining attacks, shield tilt/dodges, stage walls
and underside contact, sound, and full effects are still missing. Link, Kirby,
Pikachu and fighter selection are not implemented. This is a playable Mario
battle milestone within the four-fighter, one-stage goal.

## Verification

- Unit checks cover both controllers, simultaneous hits, shield blocks and breaks,
  shield release/jump, original smash timing/root movement, separation, stocks,
  respawn protection, results, timeout ties and a complete deterministic CPU win.
- Browser flows exercise shield blocking against the CPU, a complete match,
  rematch, phone results, both local keyboard layouts, and forward smash.
- Downloaded local replay inputs, including P2 controls and mode settings, reproduce
  the browser's final hash outside the browser. In-app replay also matches.
- Existing jab/aerial fixtures were migrated only after every old state hash
  matched with new shield/input/match fields removed. Their original training
  behavior remains unchanged.
- The asset preparation command exports both costumes, all required Mario clips,
  Final Destination and the five attack scripts from the local source files.
- `public/progress/battle-capture.json` identifies actual browser captures used by
  the progress page; earlier Build 004/005 images remain marked as earlier work.

Validation run: 71 unit checks and 13 browser flows passed. Type checking and the
production build passed. The gamepad routing check uses the browser API with a
standard controller fixture; physical controller hardware was not exercised.
