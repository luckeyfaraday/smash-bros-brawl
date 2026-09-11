# Kirby Final Cutter · Build 013

Final Cutter is playable in the main `index.html` game. Select Kirby, press **I**,
and steer with **A/D** after the blade is drawn. Kirby rises, strikes downward,
and creates a travelling wave on landing. P2 uses **;** and the arrows; a
standard gamepad uses **B** and the stick. A valid ledge catch restores the usual
ledge actions. All four scoped fighters now have their first recovery special.

## Original assets and scripts

The local USA Rev 1 `FitKirby.pac` and `FitKirbyMotionEtc.pac` supply the motion,
fighter hitboxes and detached wave. Kirby now has 46 clips and 61 bones. Both
ground and aerial variants contain the same four animation lengths:

| Phase | Clip suffix | Source frames |
| --- | --- | --- |
| Draw blade | SpecialHi / SpecialAirHi | 23 |
| Rising and falling arc | Hi2 | 36 |
| Continued descent | Hi3 | 6 |
| Landing and wave | Hi4 | 35 |

The original `TransN` track rises to **59.97416 units**. The exporter removes
this translation from descendant bone matrices and passes it separately to the
simulation. The controller carries the previous root sample across startup and
Hi2, so the phase boundary neither loses nor doubles its movement. Hitlag freezes
the track and animated pose. Fast root movement uses the existing stage solver
and a swept attack check against the opponent's current hurtbox capsules.

Source Hi2 gameplay uses zero-based animation ages:

- Ages 0–1: four 8% hitboxes, with angles 80/91/90/91 and fixed knockback 117/102.
- Age 2: clears the rising hitboxes and permits a later collision group to hit again.
- Age 18: creates the 2% descending blade on `RHaveN`, angle 275, radius 7.
- Age 26: reduces that radius to 6.

Hi4 executes `1000(1)`, generating the landing article. The VM now emits that
supported article request once; the simulation creates a wave independently of
Kirby's attack state. Other article IDs still fail closed.

Kirby's extra-header entry 43 points to the detached article at offset 270628.
Its header ID is 2 and its single subaction is `FinalCutterRegular`; the generation
event's argument is 1. The extractor checks these identities rather than
equating the two numbering schemes. Header fields follow BrawlCrate's
[Article structure](https://github.com/soopercool101/BrawlCrate/blob/master/BrawlLib/SSBB/Types/FighterDefinition.cs).
The original wave script has two special hitbox phases:

| Wave age | Damage | Angle | Radius | Knockback |
| --- | --- | --- | --- | --- |
| 0–1 | 5% | 70 | 5 | Fixed 120, growth 100 |
| 2 onward | 6% | 361 | 3.84 | Base 60, growth 30 |

The wave uses the original `WpnKirbyFinalcutter` model and both `zanzou_a` and
`zanzou_b` textures. The exporter now requires both textures; the first visual
check caught that they were stored separately from the model's resource group.

## Reconstructed behavior and limits

The source vertical arc is preserved. Common transitions, steering at 80% of
maximum air speed, freezing aerial startup, ledge permissions and continued
descent at 3.5 units per tick are reconstructed. Hi3 holds its last pose and
retains the descending hit until landing, a ledge catch or interruption.
Landing switches to the original 35-frame Hi4 animation and generates one wave.
Attack, jump and another special cannot cancel the sequence. A ceiling blocks
the remaining upward motion; missing the stage can lead to a KO.

Wave movement currently uses speed 6, lifetime 25 ticks and gravity 0.31 after
leaving the platform. These values also occur in the article's four-word extra
block, retained as `rawParameters`, but their kinetic field mapping and update
order have not been verified against the original engine. Treat the movement as
provisional. The projectile checks its travelled segment against the target's
current hurtbox capsules or shield, hits once and disappears. It keeps its own
direction if Kirby turns, moves independently of his landing animation, and
does not give him hitlag when it hits. Owner KOs remove owned waves.

The source wave profile is shieldable, reflectable and absorbable. Only shield
interaction is currently playable; reflection, absorption and projectile clashes
remain unfinished. Common damage response and shield rules are provisional.
The held blade is a browser mesh attached to the source hand bone; the original
blade effect, layered wave shader, texture animation and sound are unfinished.
The rendered wave uses additive materials and fades with simulation age.

## Playable evidence and verification

`tests/fixtures/cutter-route.json` records actual keyboard input, starting from
normal Kirby-versus-Mario training. It is a browser regression route, not an
original-game measurement. Running off the right edge for 109 frames reaches
x=114.532, y=-25.99. I+A followed by A reaches the ledge at frame 163. Release,
wait for the catch, then tap inward to climb: Kirby is back on stage at frame
252, x=83.87795312. Simulation coverage also mirrors the route to the other edge.

`.tools/capture-cutter.mjs` uses keyboard events and frame advance without changing
simulation state. `public/progress/cutter-capture.json` records the state behind
eight captures, including the 8% rise, downward hit, travelling wave, distant
wave hit, offstage start and complete return. `visual-progress.html` presents
these alongside the four-fighter roster and remaining work.

The C# exporter, production build, **123 Node checks** and **9 Python parser
checks** pass. Coverage includes source phases, root transfer, hitlag, landing
locks, sustained descent, underside collisions, both ledges, wave hits/shields,
wave direction and lifetime, and CPU recovery. The two saved Mario recordings
retain all **180 previous gameplay states**, compared before migrating hashes;
only Cutter/projectile/article snapshot fields were added. Recordings now use
simulation ID `brawl-lab-013`.

All **30 browser scenarios** have passing results across the full run and
focused rerun. The three new scenarios cover keyboard/P2/gamepad controls,
phone layout, complete recovery, exported Node replay and in-app replay. The
full run passed 29; an older Link check expected the capitalized text “Press I”
in the changing hero subtitle. It now checks the same instruction without
depending on capitalization, and its complete P2/gamepad flow passes. No gameplay
change was needed. Logs: `artifacts/build013-unit.log`,
`artifacts/build013-python.log`, `artifacts/build013-build.log` and
`artifacts/build013-browser.log` and `artifacts/build013-recovery-rerun.log`.
