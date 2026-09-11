# Four down specials — Build 023

The playable entry point remains `index.html`: Mario, Link, Kirby and Pikachu on Final Destination. **G** selects down special; player two uses **backslash**, and a standard gamepad uses **D-pad down**. The down-special panel explains the current phase, stored water charge and a held bomb’s remaining fuse.

## Original assets and scripts

`tools/MarioExporter.cs` exports the original fighter down-special clips and light-item pickup/throw clips. The current motion totals are Mario 117, Link 115, Kirby 149 and Pikachu 118. `tools/build_data.py` includes each fighter’s own scripts, the corresponding article scripts and provenance for the bomb item PAC. Clean asset preparation includes `item/linkbomb/ItmLinkBombBrres.pac` and `ItmLinkBombParam.pac`.

| Move | Preserved source behavior | Browser reconstruction |
| --- | --- | --- |
| Mario’s F.L.U.D.D. | Eight ground/air fighter clips, original backpack and water meshes, pump animation and twelve article generation events separated by three ticks. Water uses its zero-damage, flinchless wind profile. The nozzle follows the animated pump mouth relative to its attachment. | Charge cap, storage/cancel transitions, pressure, aim, water flight and lifetime. Pump attachment uses Mario’s waist joint. The original water mask/specular textures replace Wii framebuffer refraction. |
| Link’s bombs | Bomb pull flag at age 16, original item model/textures and fuse animation. Each fighter uses its own `LightGet` and ten `LightThrow` scripts; pickup/release and backward facing reversal follow those events. The item’s `Born` action supplies a 5% explosion, angle 70, growth 90, base 40 and radius 12. | Fuse is currently 180 ticks; travel, bounce, contact detonation, capacity, pickup reach and stronger throw velocities are reconstructed. The source release offsets are used, while common item velocity variables remain undecoded. Blast effects are approximate. |
| Kirby’s Stone | Four ground/air transform and return clips, five original forms, source root travel and transformation flags. Fighter-enabled profiles deal 14% on ground and 18% while falling. The separate 3%/9% enemy-only profiles cannot hit fighters. Landing executes `DummySpecialLwToGround`. | Fall speed, cancellation/hold transitions, form cycling and 30-point cumulative armor are provisional. Armor blocks attacks but leaves grabs effective; exceeding remaining armor breaks the form through normal hit response. |
| Pikachu’s Thunder | Call at age 13, original bolt model and four textures, 10% bolt collision; self-contact selects the original 17% burst script. Its three-tick hit window and eight-tick invulnerability window remain source driven. | Cloud height, bolt travel, self-contact transition and air drift. The bolt’s original Y billboard flag keeps it facing the camera; the model stretches from the call position to the leading end and remains for the burst window. |

Bombs can be picked up by all four fighters, thrown with direction + J, thrown harder with L or dropped with F. The fuse continues while held and after ownership changes. Explosions can hit their owner and opponent once, and shields block the damage. Fighter attacks and damaging articles can detonate bombs. Cape can reflect source-reflectable water and Thunder; reflected Thunder does not trigger the original caller’s self-burst.

The bomb `Born` script also contains a screen-shake command and an undecoded effect command. They remain in `originalCommands`, while only the understood attack command executes. The item’s 174-frame animation is not treated as proof of its common fuse duration. Held-item visibility follows Cape’s source hide event and restores when the action ends.

## Evidence and checks

Source probes: `artifacts/build023-down-events.txt`, `build023-down-assets.txt`, `build023-extra-assets.txt`, `build023-article-source.json`, and `build023-bomb-hit-source.json`. Export logs are `build023-export-{fighter}.log`.

`tests/down-special.test.ts` exercises source events, charge storage, wind, reflection, all four fighters’ directional item release timings, pickup/fuse continuity, owner/opponent explosions, Stone root movement and forms, fighter category filtering, landing collision, armor and grabs, Thunder self-contact and interruption, both player slots and CPU input selection. `tests/browser/down-special.spec.ts` exercises the actual main-page keyboard and gamepad bindings and all four opponents’ item pickup/throws.

The existing 90-frame jab and 90-frame neutral-aerial fixtures were compared against saved Build 022 states before updating their hashes. Only the new down-special/input/item state fields were added; earlier gameplay states matched frame by frame. `.tools/migrate-down-fixtures.ts` is a guarded, one-time migration.

Nine gameplay images in `public/progress/down-*.png` were captured through keyboard input in the paused main page, without changing simulation state. Their input sequences and snapshots are in `public/progress/down-capture.json`. `.tools/verify-down-captures.ts` reproduced all nine states in Node, including the local match in which Kirby picks up Link’s bomb. `visual-progress.html` displays those images and lists the next defensive-movement milestone.

Final verification:

- Production build and TypeScript compile pass (`artifacts/build023-build.log`).
- 215/215 Node checks pass (`build023-node.log`); 9/9 parser checks pass (`build023-parser.log`).
- All 58 browser scenarios are covered. The full run passed 57 and failed one assertion that expected an older controls paragraph (`build023-browser.log`). The recovery inputs and phone layout in that scenario already passed. The assertion now checks the actual displayed I-key binding; that complete scenario passes on rerun (`build023-final-browser.log`). The app did not change between those runs.
- The three new browser scenarios cover down specials, every fighter’s pickup/throws, P2 backslash and gamepad D-pad down (`build023-down-browser.log`).
- All nine capture replays match (`build023-capture-replay.log`). The progress page loads all nine images without overflow at desktop width 1440 and phone width 390 (`build023-progress-capture.log`, `build023-progress-desktop.png`, `build023-progress-phone.png`).

The reconstruction remains unfinished: common movement, hit response, defensive actions, remaining ledge options, passive shield/bounce behavior, sound, effects and more capable CPU play still need work.
