# Pikachu Quick Attack · Build 012

Quick Attack is playable in the main `index.html` game. Select Pikachu and press
**I**, aim with **W/A/S/D**, then choose a different direction after the first
burst to travel again. Neutral startup aims upward. Keeping the same direction
or releasing the stick in the second window ends the move after one burst.
P2 uses **;** and the arrow keys; a standard gamepad uses **B** and its left stick.
The game shows the aiming window, direction and current burst, with an electric
trail following the actual movement. The CPU uses the same recovery inputs.

## Original data used

The local USA Rev 1 `FitPikachu.pac` and `FitPikachuMotionEtc.pac` supply the
scripts, hitboxes and motion samples. `tools/MarioExporter.cs` adds six clips,
bringing Pikachu to 35 clips and 48 bones:

| Clips | Frames in each clip |
| --- | --- |
| SpecialHiStart / SpecialAirHiStart | 15 |
| SpecialHiEnd / SpecialAirHiEnd | 51 |
| FallSpecial | 9 |
| LandingFallSpecial | 31 |

`tools/build_data.py` preserves original action `0x117` in the browser payload
and extracts its two distinct hitbox commands. Both attach to bone 32 (`NeckN`),
with radius 1.6, angle 0, knockback growth 40 and base knockback 8. The first
branch deals 3%; the second deals 2%. The original conditional action is retained
for inspection; the reconstruction's controller selects the appropriate branch.
This does not execute the entire original action or its kinetic callbacks.

The ground and aerial end scripts increment random-access integer `0x20000004`
at zero-based animation age 9. The script VM now executes this `1203` increment
for the supported integer bank. Other unsupported gameplay commands still stop
execution. The controller uses the counter as the second-direction decision
point; that interpretation of the event is reconstructed.

## Movement and collision choices

The initial reconstruction uses a speed of **4 units per tick**, **10 ticks per
burst**, a minimum **45-degree direction change**, and **24 ticks of special
landing recovery**. These are provisional rules, not decoded labels from the
original special-attribute block. Input vectors are normalized, so diagonal
keyboard input travels the same distance as cardinal input. Analogue stick
angles remain available. The direction is locked during each burst.

The final original startup pose is held during the burst. No dedicated dash
animation or original effect runtime is implemented. The electric flash and
trail are browser effects; enlarging the flash does not enlarge the hitbox.
The Pikachu player marker now follows `NeckN`, since this model has no `HeadN`.

Movement passes through the existing swept stage collision solver. Hit detection
also checks the actual, stage-clipped movement segment against the opponent's
current hurtbox capsules or shield. It can hit a capsule crossed between two
positions without reaching beyond a wall. This uses the target's current pose,
not a continuous reconstruction of both fighters' animation trajectories.
Each burst hits an opponent at most once. Hitlag freezes movement and effects.

A wall or ceiling stops the burst; a valid ledge catch restores ledge actions.
Landing starts special landing recovery. Once the aerial move ends, Pikachu
falls helplessly until landing, catching a ledge or being interrupted by a hit.
Attack, jump and special presses cannot cancel or create a third burst. Original
Quick Attack cancelling, precise kinetic transitions and ledge timing remain
unfinished. Shared knockback and shield responses remain provisional as before.

## Playable route and captures

`tests/fixtures/quick-attack-route.json` is a real keyboard route from the normal
Pikachu-versus-Mario training start. It is a browser regression route, not a
measurement from the original game. It runs off the right edge, bursts upward,
then turns left and returns to Final Destination:

| Simulation frame | Actual browser state |
| --- | --- |
| 93 | Offstage at x=117.1792, y=-31.311 |
| 118 | First burst finishes upward at y=8.689 |
| 132 | Second burst travels left, x=97.1792 |
| 202 | Grounded and ready at x=77.1792, y=0 |

`.tools/capture-quick-attack.mjs` takes captures through keyboard input and frame
advance, without mutating simulation state. `public/progress/quick-attack-capture.json`
records the browser state behind each image. `visual-progress.html` shows the
offstage start, upward burst, return, and first 3% hit. Its hero image shows the
second burst turning toward the stage. The scope remains four fighters and one
map; Kirby's Final Cutter is the next recovery special.

## Verification

The production build and **114 Node checks pass**. Quick Attack coverage includes
the original hit branches and counter timing, eight keyboard directions and
analogue angles, equal travel distance, second-direction selection, input locks,
hitlag, snapshot independence, swept contact, shields, underside collisions,
recovery from both sides, landing recovery and CPU input. The C# exporter also
compiled and regenerated all 35 required Pikachu clips successfully.

Recordings now include vertical input and use simulation ID `brawl-lab-012`.
Before migrating the two Mario baseline recordings, all **180 prior gameplay
states** were compared with Build 011 after removing only the newly introduced
vertical-input, Quick Attack and VM-integer snapshot fields. Existing gameplay
was unchanged. Old-version recordings are rejected rather than silently replayed
under different snapshot semantics.

All **27 browser scenarios pass**. The three Quick Attack flows cover the
complete offstage route, direction UI, keyboard and analogue gamepad input,
independent P2 control, desktop/phone layouts, exported Node replay and in-app
replay. The full suite also verifies the other fighters, battles, ledges and
the progress page. Logs are written to `artifacts/build012-unit.log`,
`artifacts/build012-build.log` and `artifacts/build012-browser.log`.
