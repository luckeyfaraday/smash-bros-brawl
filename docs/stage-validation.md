# Final Destination — browser build 004

This records the stage's initial integration. Build 005 adds
[ledge recovery](ledge-validation.md); the wall/underside and material limitations
below still apply.

The playable root app uses the original `StgFinal00stage` platform from
`stage/melee/STGFINAL.PAC`, exported with the existing BrawlLib decoder.
Source SHA-256: `e1759221da19d3f4a9903fd1d8d51471e065c0a070838c5ba96a761734eff089`.

## Implemented

- Original platform geometry and textures, replacing the temporary training box.
- Source floor edges at x = ±86.876. The original y = 0.64 floor is translated to
  zero in both rendering and simulation.
- Blast bounds at x = ±240, y = −115.64 and y = 179.36 after that translation.
- Camera framing follows both fighters, including a fighter below the platform.
- `visual-progress.html` links to the game and shows an actual browser capture,
  the four-fighter working scope, and implemented/unfinished features.

## Remaining fidelity work

Only floor contact is resolved. The remaining 14 wall/underside segments are
exported but not used yet. Ledge catches/actions, recovery specials and stock
matches are not implemented; crossing a blast boundary resets the training fighter.

COLLADA loses the original layered material operations. Glass and luminous strips
use approximate Three.js blending. The `TShadow1` placeholder is a projected
fighter-shadow mask; its receiver is hidden instead of drawing that mask as floor
color. Training fighters keep their simple circular shadows. The background is
the original static `space01` nebula texture, not the original animated sky.

## Evidence

- `npm test`: 51 checks passed, including four new stage checks covering source
  metadata, floor edges, landing and all four blast boundaries. The existing
  jab/aerial per-frame replay hashes remain unchanged.
- `npm run test:browser`: seven flows passed, covering combat, replay, stage model
  loading, progress navigation, image loading/aspect ratio, and desktop/phone layouts.
- `npm run build`: passed; both HTML pages and the gameplay image are included.
- Manually inspected rendered screenshots of the stage, offstage falling, and
  desktop/phone progress pages. The offstage capture has Mario at x = 143.2,
  y = −65.235, still visible alongside the dummy on the platform.
- `public/progress/capture.json` records the hero image dimensions and gameplay
  state: frame 19, an early neutral aerial connecting for 10%.

These checks establish browser reconstruction behavior. They do not establish
frame accuracy against the original game.
