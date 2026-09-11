# Stage sides and underside · Build 010

Final Destination now resolves contact against all 17 original character
boundaries: three floor segments, six wall segments and eight ceiling segments.
Fast launches sweep through the space between frames, so an endpoint beyond the
stage cannot bypass a boundary. Characters can slide along a surface, stop at a
corner and move away again. Ceiling contact stops upward velocity without
restoring an air jump or treating the character as grounded.

## Source data and body geometry

The original STGFINAL.PAC boundary coordinates remain unchanged apart from the
existing floor translation of -0.64. Their directed endpoints supply the outward
normals. Each of the four fighter PACs provides one type-0 environment collision
definition, minimum width/height of 4 and a bone list:

| Fighter | Source bone references |
| --- | --- |
| Mario | 39, 46, 24, 17, 12, 10, 40 |
| Link | 44, 56, 22, 16, 12, 6 |
| Kirby | 410, 440, 433, 457, 448 |
| Pikachu | 37, 38, 35, 14, 8, 5 |

The parser follows the list/pointer and type-0 layouts in
[brawllib_rs misc_section.rs](https://github.com/rukai/brawllib_rs/blob/master/src/sakurai/fighter_data/misc_section.rs).
It checks pointer ranges, list sizes, dimensions and unsupported types. Kirby's
existing +400 bone alias applies here as well. The animated body uses these bones
for its lateral and upper extents, with a four-point diamond for stage contact.

Minimum dimensions follow the provisional interpretation in
[brawllib_rs high_level_fighter.rs](https://github.com/rukai/brawllib_rs/blob/master/src/high_level_fighter.rs).
The browser keeps the lower contact point at the fighter's floor anchor. Exact
airborne bottom-lock timing, pose/update ordering and the original engine's
collision response remain unfinished. This is a native browser reconstruction
using original geometry, not a claim of complete Brawl stage physics.

## Contact and presentation

The solver expands each finite segment by the fighter diamond, then finds the
first crossing along the requested movement. This catches both fighter points
crossing a segment and stage corners entering an edge of the diamond. After a
contact, it checks the remaining slide against nearby boundaries again. Shared
vertices use both surface normals, avoiding a sideways launch at the underside's
center seam. Floor contact is restricted to downward approaches from above;
running across the three floor pieces stays level. Walking beyond the last floor
point begins falling normally. Ledge catch/climb/jump/drop keep their existing
separate animation rules.

An optional **Stage boundaries** checkbox in the main app shows the original
floor, walls and underside, plus the fighter bodies. It is off by default and
does not affect simulation or replay.

Recovery specials and wall techs are not enabled. The stage's materials,
background effects and the fighter body locking rules still need work.

## Verification

Checks cover each original segment individually, fast crossings of the full
stage, corner contact between body points, underside jumps for all four fighters,
spent jumps, floor seams, outward/sideways movement and ledge compatibility.
Parser checks cover all four native bone lists and reject malformed pointers or
unsupported definitions. The browser follows a keyboard route that takes Kirby
under the platform, blocks his jump, moves him outward and returns by the right
ledge. The exported route is replayed in Node as well as the browser.

Build 010 passed 97 simulation/tool checks, 9 Python parser checks, 20 browser
flows and the production build. The original Mario combo and aerial replay hashes
still match without rebaselining. All four packaged body definitions and the
three progress screenshots match the files in public/. Actual browser capture
states are recorded in public/progress/stage-contact-capture.json.
