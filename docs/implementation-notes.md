# Implementation notes

These build-by-build notes preserve the project's development history. Older
entries describe the state at that checkpoint. For current setup and validation
commands, start with the [README](../README.md) and [getting started](getting-started.md).

A browser-native reconstruction built from the extracted USA Rev 1 Brawl data.
The working scope is **Mario, Link, Kirby, Pikachu, and one stage: Final Destination**.
**Build 029 rebuilds the menus in Brawl's visual style**, using the original metallic
logo, character nameplates, stage thumbnail and Ready to Fight artwork. Silver
menu bars, red P1 and gray CPU / blue P2 cards, selection coins, pause and results
screens replace the earlier dark landing page. See [Brawl UI validation](brawl-ui-validation.md).

The game opens on a title screen. Press a button to start, pick each fighter,
choose **VS CPU** or **2 Players**, set stocks and time, and press **Ready to Fight**.
Matches fill the browser window with a timer, damage and remaining stocks. Escape
opens the pause menu; results offer a rematch or a new matchup. The menus include
original fighter portraits, control help, gamepad navigation and saved preferences.
Phone players have touch controls. See [game UI validation](game-ui-validation.md).

The internal training/recording tools are now at `/lab.html`. They are separate
from the player-facing game and remain available for engine regression checks.

**Build 027 starts reverse-engineering the original CPU AI.** Choose **CPU battle**
and **Mario** as P2 / CPU to use the new opponent. Mario executes extracted Brawl
AI scripts for approach, grounded attack setup, shielding and up-special recovery,
with original attack-table ranges and attack-slot candidates. Native mode selection,
attack ranking and the interface to the browser physics remain reconstructed.
Link, Kirby and Pikachu retain the existing beginner CPU. Training keeps a passive
dummy. See [CPU AI validation and source map](cpu-ai-validation.md).

**Build 026 adds tumbling, knockdowns, get-ups and floor techs for all four fighters.**
Tap **K** just before floor impact while tumbling; hold **A / D** as you land to
tech roll. After a missed tech settles, **J** uses a get-up attack, **A / D** rolls,
and **W / Space / K** stands up. P2 uses comma, slash and arrows/Enter; gamepads
use a trigger, X and the stick. The training dummy gets up automatically; the CPU
can attempt techs and choose get-up actions. Common timing and posture selection
remain reconstructed. See [knockdown validation](knockdown-validation.md)
and the [Build 026 checkpoint](checkpoint-build026.md).

Build 025 adds **Link's passive Hylian Shield, down-air rebound, and crouching
for all four fighters**. Stand still facing an incoming shot to use Link's
physical shield; hold **S** to cover lower shots. Jump, then **S + J** for his
downward sword attack. Contact lifts Link, with weaker subsequent hits during
the same move. P2 crouches with **Down** and attacks with **slash**; gamepads
use down on the stick and X. Shield coverage, rebound kinetics and the 8%
follow-up response are reconstructed. See [Link response validation](link-response-validation.md)
and [visual progress](../visual-progress.html).

Rolls, spot dodges, air dodges, ledge attacks and ledge rolls remain available
for all four fighters. Hold **K** and tap **A/D** to roll or **S** to spot dodge;
tap **K** in the air. On a ledge, **J** attacks and **K** rolls onto the stage.
See [defense validation](defense-validation.md).

Build 023 added all four **down specials** on **G** (P2: **backslash**; gamepad: **D-pad down**).
Mario charges F.L.U.D.D. with G, sprays with another G and stores charge with K.
Link pulls bombs; direction + J throws, L throws harder and F drops. Any fighter
can pick up a fallen bomb with J. Kirby transforms into Stone and changes back
with another G after settling. Pikachu calls Thunder for the falling bolt and
self-contact burst. Original models, motion and attack scripts are retained;
common charge, fuse, armor and travel rules remain reconstructed. See
[down-special validation](down-special-validation.md) and
[visual progress](../visual-progress.html) for source details and gameplay captures.

All four **side specials** are on **O** (P2: **[**; gamepad:
**D-pad left/right**). Mario's Cape turns opponents around and reflects incoming
shots. Link's Gale Boomerang hits going out and pulls opponents with returning
wind. Kirby's Hammer has one heavy ground swing and two separate aerial swings.
Pikachu holds O to charge Skull Bash, then releases to launch sideways. Original
models, animations and hit scripts are used, with reconstructed common movement
and charge rules. See [side-special-validation.md](side-special-validation.md)
for source details and limits.

All four fighters now **grab, pummel and throw**. Press **F** to grab through a
shield, **J** to pummel, then tap **W/A/S/D** for up, back/forward or down throw.
Forward/back follow your facing. Shield + J also grabs; run + F selects dash
grab; reverse direction + F while running selects pivot grab. P2 uses **]**,
slash and arrows. Gamepads use left bumper, X and the stick. Captured players
can tap buttons or change directions to struggle free; holding a button does not
keep adding escape progress. Link uses his original Clawshot model; Kirby keeps
his jumping throw arcs. See [grab-validation.md](grab-validation.md) for
source damage, timings and reconstructed limits.

Kirby now **inhales and spits**: hold **U** to capture a nearby opponent, then
walk, turn or hop and tap **U or J** to spit them forward as a star for 10%.
Captured players can tap buttons or change directions to struggle free. Holding
one button does not repeatedly add escape progress. This works in training and
local matches, for either player. To **copy** instead, tap **S / Down** while
holding an opponent. Swallowing deals 6% and grants Mario's fireball, Link's
bow or Pikachu's Thunder Jolt, with the original hat and Kirby's own animation.
After the swallow animation, use **U** for the copied move. **K + U** discards
the copy while free to act; a KO or reset also clears it. I still uses Final
Cutter. P2 uses Down to copy and comma + apostrophe to discard; gamepads use
Down and trigger + right bumper. Random copy loss on damage remains unfinished.
Pikachu’s **Thunder Jolt**, Mario’s **fireball** and Link’s **bow** use **U** (P2: apostrophe, gamepad: right bumper). Pikachu sends a 9% ball diagonally downward; it becomes a hopping spark on stage contact, dealing 6% to grounded opponents or 5% to airborne opponents. The spark follows the sides and underside. Mario throws a bouncing 5% fireball. Link draws while held and fires on release; quick arrows deal 5%, full-draw arrows 12% with more speed and range. Both work in the air, continue across landing, and interact with shields and the stage. A full bow stays held until release. Projectile kinetics and charge interpolation remain reconstructed.

Follow implemented features and remaining work in [visual-progress.html](../visual-progress.html).
Mario can walk, run, short hop, double jump, fast fall, and use his three-hit jab
against a second Mario (3% + 2% + 4% when all three hits connect). J without a
direction in the air uses Mario's neutral aerial: 10% early or 5% late. Mario can
now grab both stage edges, hang, climb, jump and drop using his original animations.
K holds a shield; L uses his forward smash (14%/17% before charge). Hold through the wind-up to charge, then release.
Link has his original model, 115 animation clips, movement attributes, three-hit
sword combo (4% + 3% + 5%), neutral aerial (10% early / 6% late), and two-part
forward smash. Tap L again during the first slash to queue the second; holding L
does not automatically chain. Shields and ledges work for all four fighters.
Kirby adds five air jumps with their original velocity table and animations. His
HUD dots show the jumps left. Two jabs (2% + 3%) lead into rapid punches while
holding J; release to finish the current cycle. He also has neutral aerial
(12% → 10% → 8% → 6%) and a lunging forward smash (15% early / 13% late).
Pikachu has his original model and movement, a repeating headbutt (hold J, 2% per
hit), spinning neutral aerial (12% early / 6% late), and an electric forward smash
(20% → 17% → 14%) with a separate wind-up. Its visible electric burst is approximated.
All four fighters now have **three chargeable smashes**: L forward, W + L up and S + L down. Hold through the original wind-up, then release; sixty charge frames trigger automatic release. Current reconstructed scaling reaches 1.4× damage. Mario and Kirby also have angled forward variants on diagonal input. Link’s three upward slashes and Pikachu’s repeated electric down smash have independent hit groups.

All four fighters now have up specials on **I** (gamepad **B**). Mario’s Super Jump
Punch follows its original rising path with repeated coin hits and a finisher.
Link uses an uncharged ground spin or a rising aerial spin. After aerial recovery,
steer to a ledge or land before attacking again. Pikachu’s Quick Attack aims with
W/A/S/D or the analogue stick. Change direction during the window after burst one
for a second burst (3% then 2%); the same direction ends after one burst.
Kirby’s Final Cutter follows the original rising and falling animation path. Press I,
then steer with A/D. The blade has an 8% rising hit and a 2% descending hit. Landing
creates the original wave model with a 5% opening / 6% travelling hit; the wave can
be shielded. A ledge catch restores normal ledge actions.
All four fighters have forward, up and down tilts and their own dash attack.
Hold **A/D + J**, **W + J** or **S + J** for a tilt. Hold **Shift + A/D** to run,
then press **J** for a dash attack. Mario slides, Link slashes, Kirby spins through
separate hits, and Pikachu lunges headfirst. Diagonals angle the forward kick for
Mario, Kirby and Pikachu; Pikachu's high / straight / low kick deals 10% / 9% / 8%.
J alone still starts a jab. **How to play** shows the controls.
All five aerials now work for each fighter. Jump, then use **direction + J**:
forward or behind your current facing selects forward/back aerial; **W + J** is
up aerial and **S + J** is down aerial. Drifting in the air does not turn the
fighter. Forward/back aerial directions follow your current facing.
Mario's spinning down aerial, Kirby's triple forward kick and drill, Link's two
forward slashes and back kicks, and Pikachu's aerial rushes retain their separate
hit phases. Some down/back aerials have another hit on landing. Link's downward
sword bounce remains unfinished.
All four fighters now collide with Final Destination's sides and underside as
well as its floor. Jumps stop against the underside, and fast movement cannot
skip through the platform. Use the optional Stage boundaries view to see contact
geometry; it is off during normal play.
The original fighter models, textures, sampled CHR0 animations and Final Destination
platform are used. This is an
early gameplay reimplementation, not an executable port or a complete Brawl engine.

## Play modes

Open **Start Game**. Select the **P1** or **CPU / P2** panel, then choose its fighter.
Each player can select any of the four fighters. Mirror matches use an original
alternate costume for P2. Choose **VS CPU** or **2 Players** and set 1, 3 or 5 stocks
with a 1, 3 or 5 minute limit. **Ready to Fight** begins the match.
Battle starts after a three-second countdown. A KO costs one stock; the fighter
returns above the stage with brief invincibility. At the time limit, more stocks
wins, then lower damage; an exact tie is a draw. Simultaneous final-stock KOs also
draw. Mario uses original AI bytecode with reconstructed native decisions. The
other three CPUs use the deterministic beginner routine. Exact original-engine
AI equivalence has not been established.

In Two players, P1 uses A/D, Space, J, K, L, U and I. P2 uses the arrow keys to move,
Enter to jump, `/` to attack, `.` to smash, `,` to shield, `;` for up special, apostrophe for neutral special and right Shift to run.
With one standard gamepad connected in Two players, it controls P2 while P1 uses
the keyboard. With two gamepads, they control P1 and P2 respectively.
Touch devices show directional controls plus jump, attack, shield, smash, neutral
special and recovery buttons. Keyboard/gamepad controls support the full move set.
The title screen and pause menu both offer **How to play**. Menus accept keyboard
focus/activation and standard gamepad navigation. **Esc / P** or gamepad **Start**
pauses a match. Returning to selection or title ends the current match; rematch and
restart create a fresh countdown with the same choices.

## Controls

| Action | Keyboard | Standard gamepad |
| --- | --- | --- |
| Walk | A/D or left/right | Left stick |
| Run | Shift + move | Full stick tilt |
| Jump / air jump | Space | A / bottom face button |
| Short hop | Release jump during startup | Release jump during startup |
| Fast fall | Tap S/down while descending | Down stick while descending |
| Jab / next hit | Tap J again during each punch | Tap X / left face button again |
| Forward / up / down tilt | A/D + J / W + J / S + J | Direction + X |
| Angled forward kick (Mario, Kirby, Pikachu) | A/D + W/S + J | Diagonal stick + X |
| Dash attack | Run with Shift + A/D, then J | Run with full stick, then X |
| Neutral aerial | J while airborne | X / left face button while airborne |
| Forward / back aerial | In air: facing direction / opposite direction + J | In air: forward / back stick + X |
| Up / down aerial | In air: W + J / S + J | In air: up / down stick + X |
| Up special (all four fighters) | I | B / right face button |
| Side special (all four fighters) | O; P2 uses [; hold and release to charge Skull Bash | D-pad left / right |
| Aim Quick Attack | W/A/S/D (P2: arrows) | Left stick, any direction |
| Ledge climb | Tap toward the stage while hanging | Tap stick toward stage |
| Ledge jump / drop | Space / S or away | A / down or away |
| Shield / air dodge | Hold K on ground / tap K in air | Either trigger |
| Roll / spot dodge | K + A/D / K + S | Trigger + horizontal / down stick |
| Ledge attack / roll | J / K | X / trigger |
| Grab / dash grab / pivot grab | F; run + F; reverse direction + F while running | Left bumper; run + left bumper; reverse stick + left bumper |
| Pummel / throw while holding | Tap J / tap W/A/S/D | Tap X / tap stick direction |
| Down special | G; Mario taps again to spray, K stores; Kirby taps again to revert | D-pad down |
| Bomb pickup / throw / drop | J picks up; direction + J throws; L throws harder; F drops | X picks up/throws with stick direction; Y throws harder; left bumper drops |
| Neutral special · all four fighters | U; hold and release for the bow, hold to inhale as Kirby | Right bumper |
| Kirby spit / struggle when captured | Tap U or J to spit; tap buttons or change directions to escape | Tap right bumper or X to spit; tap buttons or change stick direction to escape |
| Kirby swallow and copy / discard copy | S / Down while holding an opponent; K + U discards a copy while free to act | Down to copy; trigger + right bumper to discard |
| Chargeable smash / Link second slash | L forward, W + L up, S + L down; hold to charge, release to strike. Tap L again during Link’s first slash for the follow-up | Direction + Y / top face button; hold to charge |
| Pause / resume | Esc / P or Pause button | Start |

Pause clears accumulated time. Changing tabs, losing focus or disconnecting a
gamepad pauses a match and clears held controls. Use **Keep Fighting** to resume.

For Mario and Link, tap attack once for the first hit, again during that hit to
queue the second, and again during the second to queue the finisher. Kirby has two
jabs followed by rapid punches; hold J after connecting or tap again to enter them.
Pikachu repeats his single headbutt while J is held, or with a queued tap; release to recover.
A queued press survives hitlag and
is consumed by one follow-up. Mario’s held attack follows connected punches at the
later auto-jab flag. Release attack before starting a new chain. Held whiff
repetition and the exact common-engine input buffer are not implemented.
Jump first, then press attack with a direction to select the aerial. J alone uses
neutral aerial. A/D steer during the move;
tap down after starting to descend to fast fall. Additional attack/jump presses
do not cancel or restart an aerial. Inputs during jump startup are not buffered
into an aerial. A repeated hitbox phase can hit again after a source clear; a
damage change within the same phase does not grant another hit.

While descending near an edge, release away/down to grab it. Wait for the catch
animation to finish, then tap toward the stage to climb, Space to jump, J to
attack, K to roll, or S/away to drop. Attack and roll use slower animations at 100%+. A ledge jump or drop restores the air jumps: five for Kirby, one for the others. Holding a direction through
the catch does not automatically choose a ledge action.

## Internal training and replay tools

Open `/lab.html` for the development harness. Its original training, recording,
frame step, collision views and move timelines remain available. These tools do
not appear in the main game. The browser engine tests use this separate route.

The timeline changes with each move. Green underlines mark jab follow-up windows
or aerial auto-cancel windows. Landing during an aerial's landing-lag window uses
the fighter's corresponding aerial landing recovery; landing outside it uses
normal landing lag. Mario's forward aerial has 26 ticks, while Link's down aerial
has 50. Landing-hit scripts start separately from the aerial hitboxes. The landing
animation and recovery count are shown while actions are locked.

Record resets the selected mode and captures inputs per simulation step, including
both local players. CPU actions replay deterministically from the recorded P1 inputs. Stop recording,
then Replay to compare the final simulation hash. Export downloads the inputs,
both fighter source hashes, selections, play-mode settings and expected final hash as JSON. In-app replay uses the current recording;
importing an exported recording is not implemented. Determinism is tested within the
same build/runtime, not across different JS engines or future versions.

The saved combo and aerial regression recordings check every simulation frame in `npm test`.
To inspect it, or a recording exported from this build, write a full state trace:

```powershell
npm run trace:replay -- tests/fixtures/mario-jab-combo.json artifacts/jab-trace.json
npm run trace:replay -- tests/fixtures/mario-neutral-aerial.json artifacts/aerial-trace.json
```

Use a new output filename on each run. The tool checks the simulation version,
fighter source hash, final state hash, and any per-frame hashes included in the
recording. It exits with an error on mismatch. These are browser regression
recordings, not Dolphin captures; see [jab validation](jab-validation.md)
and [neutral aerial validation](aerial-validation.md).

## What is original and what is provisional

| Part | Current behavior |
| --- | --- |
| Model and textures | Original Mario, Link, Kirby and Pikachu models, plus one alternate costume each, converted using BrawlLib |
| Animation | Mario: 125 clips / 63 bones. Link: 123 clips / 80 bones. Kirby: 157 clips / 61 bones. Pikachu: 126 clips / 48 bones. Integer CHR0 samples |
| Walk/run root motion | Removed from the animation; the simulation supplies movement |
| Materials | COLLADA diffuse materials; Wii TEV shading and layered eye materials are approximated |
| Model visibility | Explicit Mario face/cap groups, Link equipment/normal eyes, Kirby normal/inflated body and Pikachu normal eyes/alternate cap; generic visibility scripts are not implemented |
| Attributes | Each fighter uses its own PAC’s movement, weight, jump and landing values |
| Inhale, spit and copy | Original clips, capture spheres, inflated body, 10% spit and star assets; 6% swallow and copies of Mario, Link and Pikachu with original hats, Kirby animations and article data. Carry, escape, star kinetics, copy release/discard and common transitions reconstructed |
| Up special | Mario / Link source scripts and animations; Pikachu source action hit branches and startup/end clips; Kirby source arc, slash phases and landing-wave scripts/model; kinetic, steering, helpless fall and landing rules remain partly reconstructed |
| Down special / bombs | Original F.L.U.D.D., bomb, Stone and Thunder assets/scripts; charge storage, transferable bombs, Stone defense and falling Thunder/self-burst work. Common parameters remain reconstructed. See [validation](down-special-validation.md) |
| Side special | Original Cape, Gale Boomerang, Hammer and Skull Bash motion and attack scripts, plus native weapon models. Reflection, return wind, two aerial Hammer swings and chargeable Skull Bash work; common movement, charge, attachment and effects are partly reconstructed. See [validation](side-special-validation.md) |
| Jab | Each fighter's raw scripts, original animations and hitboxes; Mario/Link combos, Kirby rapid punches and Pikachu headbutt repeat |
| Tilts and dash attacks | Original scripts, hitboxes, animations and root travel; input selection and transitions reconstructed. Kirby's up-tilt foot intangibility and separate dash hits work. Down-tilt tripping is unfinished. See [validation](directional-attacks-validation.md) |
| Combo | Source script flags open follow-ups; input latching, repetition and transition ordering are provisional |
| Neutral aerial | Each fighter's AttackAirN script supplies its early/late phases; values are listed above |
| Directional aerials | Four additional air attacks per fighter, using original motion, scripts and repeated hit phases; input selection reconstructed |
| Aerial landing | RA-Bit[30] selects aerial recovery; each original LandingAir animation scales to its extracted duration; landing scripts create separate hits where present; engine update order/rate needs comparison |
| Shield | Original guard/damage/release and dizzy animations, shield health/drain/regeneration, shieldstun, break and jump out of shield; common rules are provisional |
| Forward / up / down smashes | Original scripts and wind-up, hold and release motion for all four; charged hits, Mario/Kirby forward angles and Link's second slash. Charge cap/scaling and common transitions remain reconstructed |
| Ledge recovery | Original catch/hang, quick/slow climb and two-phase jump clips; animation root motion transfers into simulation position; common-state thresholds/timing remain provisional |
| Collision | Animated hit spheres against each fighter's decoded hurtbox capsules, including depth |
| Movement rules | Reimplemented state machine; exact input buffering, animation rate and engine update ordering need comparison |
| Damage response | Provisional knockback, hitlag and hitstun; original launch/tumble clips, knockdowns, face-up/down get-ups and three floor techs; common timing not verified against Dolphin |
| Stage | Original Final Destination platform and textures; all 17 character boundaries and blast bounds from STGFINAL.PAC; original floor translated from y=0.64 to y=0 |
| Stage contact | Swept animated fighter diamonds against finite floor, wall and ceiling segments; source body bones/minimum dimensions, provisional floor anchor and slide response |
| Stage rendering | Diffuse materials with approximate glass and luminous layers; exported shadow placeholder hidden; static original nebula texture |

Link’s sword combo and aerial also execute their raw scripts, using his own
bones for hitboxes and hurtboxes. Both slash animations transfer root movement
into physical position. The second slash’s common input transition remains
provisional. A fixed degree-vector table keeps launch directions identical in
Chromium and the Node replay runner, avoiding their differing sine rounding.

Kirby’s multijump table supplies five air-jump velocities and corresponding clips.
His rapid-jab pulse body is original; repetition and release run through a
provisional common-state loop, with the raw loop envelope retained in the payload.
His eye and mouth textures clamp to their edges as specified by the export.

Pikachu's single-jab repeat uses the source auto-jab flag with provisional common
timing. His smash plays the original separate wind-up before its active script.
The electric effect is a browser approximation that follows the active volumes
and freezes with simulation time; the original effect system is not implemented.

The three floor, six wall and eight underside segments resolve stage contact.
Each fighter uses its own environment collision bone list. Exact airborne body
bottom locking, contact ordering, wall/ceiling techs and original launch physics
remain unfinished. Floor knockdowns, get-ups and techs are playable. There is no
full audio/effect system, general item roster or online play. Battle mode has
provisional grounded pushboxes; floor recovery rolls can cross an opponent and
stop at the stage edge. Training keeps a stationary dummy that reacts to hits and
gets up automatically. CPU decisions, shield rules and knockback need refinement. Finite moveset loops are supported; unbounded loops and general conditionals remain
unsupported. Unknown gameplay commands stop the VM. Mario’s recovery preserves
its original script and omits the exact undecoded event 0900(2) from its browser
copy. See [recovery validation](recovery-validation.md) for this limitation,
source timing, provisional physics and actual keyboard recovery routes.

## Next milestones

1. Measure launch trajectories, hitstun, floor tech timing and posture selection
   against controlled original-engine sequences; retain provenance for each rule.
2. Refine stage contact/body locking, wall and ceiling techs, and remaining
   hit-response and ledge behavior within the four-fighter scope.
3. Improve combat feedback, audio/effects, CPU decisions and browser performance.
   Keep `visual-progress.html` aligned with actual playable features.

The initial scope excludes more stages, a larger roster, story mode and online play.
The separate emulator experiment is paused and is not part of the browser game.
Its earlier notes remain in [reference validation](reference-validation.md)
and [core build notes](reference-core-build.md).

## Files and references

- `src/simulation.ts`: shared combat resolution, stocks, match lifecycle and replay snapshots.
- `src/fighter.ts`: movement, attacks, shields, ledges and floor recovery for either fighter.
- [Knockdown validation](knockdown-validation.md): source motion, get-up attacks, floor techs, controls, evidence and common-rule limits.
- `src/cpu.ts`: deterministic opponent input decisions.
- `src/roster.ts`: playable fighter identities and asset types.
- [Kirby validation](kirby-validation.md): five air jumps, rapid punches, bone mapping and three-fighter matches.
- [Ranged validation](ranged-validation.md): Mario’s fireball, Link’s bow, independent projectile movement, original weapon animations and reconstruction limits.
- [Thunder Jolt validation](thunder-jolt-validation.md): Pikachu’s original ball/spark assets, target-specific damage and reconstructed surface travel.
- [Inhale validation](inhale-validation.md): Kirby's capture, carrying, escape, original spit event/star, actual keyboard routes and reconstruction limits.
- [Copy validation](copy-validation.md): Kirby's three hats and copied neutral specials, swallow/discard controls, original asset/script mapping and reconstruction limits.
- [Smash validation](smash-validation.md): charge phases, all twelve smashes, source hit groups, captures and reconstruction limits.
- [Pikachu validation](pikachu-validation.md): fourth fighter, headbutt repeat, smash wind-up, electric burst and local matches.
- [Final Cutter validation](final-cutter-validation.md): original rising path, descending blade, landing wave, recovery routes and reconstruction limits.
- [Quick Attack validation](quick-attack-validation.md): directional bursts, original hit branches, stage-clipped attack paths, controls and reconstruction limits.
- [Recovery validation](recovery-validation.md): Mario and Link up specials, source motion and scripts, provisional kinetics and complete browser routes.
- [Stage contact validation](stage-contact-validation.md): solid sides/underside, original fighter body bones, swept contact and a complete recovery route.
- [Link validation](link-validation.md): the second fighter, selection, slash follow-up and mixed matches.
- [Directional attack validation](directional-attacks-validation.md): tilts, dash movement, source timing, Kirby foot intangibility, controls and captures.
- [Directional aerial validation](directional-aerials-validation.md): forward/back/up/down aerials, repeated hits, separate landing hits and controls.
- `src/script.ts`: restricted raw-command VM for the four fighters' enabled attacks.
- `src/moves.ts`: enabled attacks, jab sequence and timelines generated by executing the VM.
- `tools/trace_replay.ts`: exported-input validation and frame-by-frame state traces.
- `src/pose.ts`: shared animation samples and collision math.
- `src/render.ts`: Three.js rendering and bone-pose application.
- `src/stage.ts`: source-derived Final Destination floor and blast bounds.
- `visual-progress.html`: visible milestones, scope and unfinished work.
- `tools/StageExporter.cs`: platform, texture, collision and stage-position export.
- [Battle validation](battle-validation.md): match rules, defense, forward smash and limitations.
- [Defense validation](defense-validation.md): original dodge/ledge motion and scripts, controls and common-rule limits.
- [Ledge validation](ledge-validation.md): original animations, controls and provisional common-state rules.
- [Stage validation](stage-validation.md): current map behavior and rendering limits.
- `tools/fitdump.py`: PAC/moveset extraction.
- `tools/MarioExporter.cs`: BrawlLib model/texture/animation conversion.
- [BrawlCrate](https://github.com/soopercool101/BrawlCrate), particularly
  [FighterDefinition.cs](https://github.com/soopercool101/BrawlCrate/blob/master/BrawlLib/SSBB/Types/FighterDefinition.cs)
  and [ActionEventNode.cs](https://github.com/soopercool101/BrawlCrate/blob/master/BrawlLib/SSBB/ResourceNodes/Moveset/Actions/ActionEventNode.cs).
- [Dolphin RVZ format](https://github.com/dolphin-emu/dolphin/blob/master/docs/WiaAndRvz.md), used by the existing disc reader.
- Existing `tools/ref/` event/attribute descriptions are from OpenSA3; some labels
  are incomplete or incorrect and should be checked against the binary and BrawlLib.

Generated game assets, disc images, extraction outputs, downloaded tooling and
dependencies are excluded by `.gitignore`. The browser build uses the local prepared
assets; it does not fetch game data from a third-party service.
Fonts are bundled locally under `public/fonts/` with their SIL Open Font License texts.
