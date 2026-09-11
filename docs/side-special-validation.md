# Build 022: four side specials

The main `index.html` now plays Mario's Cape, Link's Gale Boomerang, Kirby's
Hammer and Pikachu's Skull Bash. P1 uses **O**, P2 **[**, and standard gamepads
use **D-pad left/right**, which also selects facing. Pikachu holds the button
to charge and releases to launch. Existing neutral and recovery controls remain
U / right bumper and I / B. CPU opponents can select the new moves.

## Original inputs to the reconstruction

The extracted `FitMario`, `FitLink`, `FitKirby` and `FitPikachu` PAC scripts and
MotionEtc animations supply the source data. `tools/MarioExporter.cs` exports
the additional fighter clips plus Mario's `WpnMarioMantle`, Link's
`WpnLinkBoomerang` and Kirby's `WpnKirbyHammer` models, textures and CHR0 tracks.
`tools/build_data.py` retains the corresponding attack commands and extracts
Link's boomerang article from extra-header slot 11 (article identity 1).

Source observations are recorded in `artifacts/build022-special-source.json`,
`build022-side-events.txt`, `build022-side-assets.txt` and `build022-side-data.txt`.
The original side clips have zero TransN translation. Common movement is
therefore supplied by the browser controller. Exported fighter clip counts are
Mario 96, Link 100, Kirby 133 and Pikachu 101.

| Move | Source script behavior used |
| --- | --- |
| Cape | Reflector on at age 5, off at age 30 grounded / 33 airborne. Hitboxes at age 11–13, 8% ground / 6% air, Reverse effect. Original 36-frame clips and animated mantle. |
| Gale Boomerang | Generate article 2 at age 4, shoot at 26; 46-frame throw. Article Fly starts at 7%, changes to 5% at age 4, then wind at 28. Turn has a 9-unit wind volume with a six-frame repeat interval. Original 20-frame catch and spinning article. |
| Hammer | Ground sweetspot 23% / sourspot 18% at ages 23–24. Air first swing at 16–17, 17% / 13%; second at 33–34, 15% / 10%, with a lower launch angle. Article ends at 49. Ground clip 60 frames, air 50. |
| Skull Bash | Original start 14, hold 7, ready 17, burst 40, ground end 45 and air end 30-frame clips. Burst hit at age 4, source base damage 7%, radius 5.5, shrinking to 3 at age 12. Native ledge flags are retained. |

The VM decodes the exact reflector-on/off commands and side article shoot/end
events. Reverse is read from the source hitbox effect. Projectile reflectability
comes from the special hitbox flags. Fireballs, arrows, Jolts and boomerangs can
reflect; Final Cutter's enabled wave profile does not set the reflection bit.
Undecoded commands still stop execution. Link's exact `0C20(1,29)` event is
omitted only after operand validation, with the full original commands retained
in `originalCommands` for both ground and air throws.

## Reconstructed behavior and limits

Cape direct hits add damage, reverse facing and horizontal momentum, and apply
hitlag without the ordinary launch response. Its common reflection volume is
approximated by an 8.5-unit sphere, centered eight units forward and six up.
Reflection transfers ownership, reverses movement and multiplies damage by 1.5
and speed by 1.2. The multiplier survives later source hitbox and Jolt phase
changes. Grounded Jolts reverse their traversal direction. One aerial Cape lift
is available before landing or a ledge catch. Exact common parameters, the
temporary reversed-control effect and original cloth physics remain unfinished.

Boomerang speed, aim, outward duration, homing return, catch distance and wind
displacement are reconstructed. It hits once going out and remains in flight;
returning wind pulls without damage or hitstun and respects stage geometry.
Shields ignore wind. The return catches without interrupting an occupied Link.
Only one active boomerang is available per owner; reflected ownership transfers
that availability too. A blocked return or its lifetime can retire the article.
The curling wind is a procedural visual approximation.

Hammer uses source attack bones and both aerial hit groups. Landing preserves
the chosen air script and its clock; it does not insert the ground sweetspot.
Its HaveN joint attaches to Kirby's hand using the sampled bone matrices.
The same method attaches Mario's mantle and Link's held boomerang.

Skull Bash charges for up to 120 frames. Linear charge scaling currently gives
7–25% and 2.5–6 horizontal units per tick. It passes through the original ready
animation, sweeps the burst through fighters and stage geometry, and enters the
original ending clip. Its aerial launch lift, steering, charge interpolation and
common recovery transitions are provisional. Charge glow and motion trails are
approximated. These values are browser rules, not claims of exact original
parameter decoding. Shared knockback, hitlag and defensive behavior also remain
partly reconstructed.

## Verification

- `npm test`: 200 checks pass, including eleven side-special scenarios that
  exercise source frames, reflection/ownership for each enabled projectile,
  expired reflection, aerial lift limits, boomerang damage/return/catch/wind,
  shield protection, Hammer landing and both air hit groups, Skull Bash charge,
  launch collision, interruption and the second player slot.
- Python parser suite: nine checks pass.
- The two existing Mario golden recordings retain all 180 prior gameplay
  snapshots exactly after removing only the newly added side-state fields;
  fixture simulation IDs and hashes migrate to `brawl-lab-022`.
- All 55 browser scenarios are covered: the full run passed 54 and exposed one
  new assertion made before the boomerang reached its target. Correcting that
  observation time required no gameplay change. The final rerun passed all
  three side-special scenarios plus the progress links and desktop/phone layout
  scenarios (5/5). This includes every observed browser/Node frame for each of
  the four side-special recordings, projectile reflection, P2 keyboard and
  D-pad controls. See `artifacts/build022-browser.log` and
  `artifacts/build022-final-browser.log`.
- Final screenshots cover all four moves, both airborne Hammer swings, returning
  wind, Skull Bash charge and Cape reflection. All nine progress images load on
  desktop and at 390px without horizontal overflow or page/network errors.
- All nine capture snapshots also reproduce from their recorded keyboard steps
  in Node, including reflected ownership in the local two-player capture. JSON
  serialization is applied on both sides because capture files normalize signed
  zero. See `artifacts/build022-capture-replay.log`.
- TypeScript and the production build pass. The existing bundle-size advisory
  remains; original assets are still loaded together.

`visual-progress.html` presents actual keyboard-driven captures from the main
app. `.tools/capture-sides.mjs` records their input steps and simulation snapshots
in `public/progress/side-capture.json`; it does not mutate simulation state.

Down specials, remaining defensive actions, refined game feel, sound and
presentation remain part of the four-fighter / one-stage reconstruction goal.
