# Recovery specials · Build 011

This documents Build 011. Pikachu's recovery was added in Build 012; see
[Quick Attack validation](quick-attack-validation.md) for its current behavior.

Mario and Link now have up specials in the main `index.html` game. Press **I**
for P1, **;** for P2, or **B** on a standard gamepad. Horizontal input sets the
initial facing and steers the aerial recovery. Link has a separate, uncharged
ground spin. Kirby and Pikachu's recovery specials remain unfinished.

## Source motion and scripts

The local USA Rev 1 `FitMario.pac`, `FitMarioMotionEtc.pac`, `FitLink.pac` and
`FitLinkMotionEtc.pac` supply the animations, hitboxes, timers and script flags.
The existing BrawlLib exporter now adds Mario's four recovery/falling clips
(34 clips total) and Link's five (36 total). Recovery translation is removed
from descendant bone matrices and exposed as a separate root track.

All ages below are zero-based animation ages, matching the browser timeline.

| Move | Source behavior in the browser |
| --- | --- |
| Mario SpecialHi / SpecialAirHi | 5% opening at 2–5; 1% hits at 6–12; 3% finisher at 13–14; clear at 15 |
| Mario rehit opportunities | Initial hit at 2, new collision groups at 7, 8, 9, 11 and 13; the first 1% replacement at 6 retains the opening group's hit history |
| Mario body state | Intangible at 2–5, normal again at 6 |
| Mario ledge flags | Front at 9, either side at 15 |
| Link ground | Eight-frame SpecialHiStart clip, then SpecialHi; 12%/9% hitboxes at 3, 9%/7% at 8, 7%/5% at 20, clear at 36 |
| Link aerial | 4% at 7–9; 2% at 15–17, 21–23 and 30–32; 4% at 46–50 |
| Link aerial ledge flags | Front at 18, either side at 33 |

Finite script loops use scoped counters and the existing shared script clock.
Clearing a collision group increments its epoch, allowing a new pulse to hit
again even when clear and spawn occur on the same tick. Invalid and unbounded
loops still stop execution. Snapshots include counters, collision epochs, body
state and ledge mode. Script timing also drives the visible move timeline.

The independently published extraction shows the same Mario intangibility and
rehit windows with one-based display frames. It identifies angle 365 as an
attacker-direction launch with half the attacker's momentum added:
[Rukai's Mario SpecialHi extraction](https://rukaidata.com/Brawl/Mario/subactions/SpecialHi.html).
The implementation handles 365 explicitly using actual stage-clipped velocity,
instead of interpreting it as an ordinary five-degree launch.

## Reconstruction choices and remaining limits

Mario's aerial root track rises 44.8318977 units and ends 20.7714138 units forward.
With neutral horizontal input, the simulation follows every sample once; the
rendered skeleton no longer carries a duplicate translation. Ground startup
clamps the very small negative foot offsets. Hitlag pauses both the move clock
and movement. The path passes through the same swept stage collision solver as
ordinary movement. A ceiling stops the rise and ends it in helpless fall.

Link's source spin has zero root translation. His current aerial launch is a
**provisional 2.5-unit vertical velocity**, followed by his source gravity of
0.089. The spin rises 33.866 units with this reconstruction. Mario can add up to
0.25 units of horizontal steering per tick; Link and helpless fall use 80% of
normal maximum air speed. These kinetic rules need original-engine comparison.
They are not extracted fighter-specific special attributes.

Finishing an aerial recovery enters `FallSpecial`, with its original looping
animation. Jump, attack, shield, smash and another special cannot cancel it.
Landing uses `LandingFallSpecial` with a provisional 30-frame recovery. A valid
ledge catch restores the normal ledge options; being hit interrupts recovery
into hitstun. Link's ground spin is uncharged. Special charging, precise kinetic
transitions and original-engine landing/ledge timing remain unfinished.

**Undecoded Mario event:** the source contains `0900(2)`, still an unknown event
in the referenced extraction. `tools/build_data.py` preserves the raw script in
`originalCommands` and omits only that exact event/operand from the browser copy,
including the resolved aerial goto. Other unknown events still fail closed.
The existing source movement flags are retained, but the recovery controller
owns the provisional state transitions. This is not a complete execution of the
original special's engine behavior.

The sword trail and coin particles approximate the original effects and use
simulation pose time, so pause, hitlag and replay freeze them consistently.
No original sound/effect runtime is implemented. Existing knockback magnitude,
hitstun, stage body locking and common ledge rules are still provisional.

## Playable evidence

`tests/fixtures/recovery-routes.json` records real keyboard routes from the normal
training start. No simulation state mutation is used by the browser routes:

- Mario runs off the right side for 103 frames, reaching x=116.88, y=-29.395.
  Press I while holding A, then keep holding A. He lands at frame 151, x=79.825.
- Link runs off for 107 frames, reaching x=111.5376, y=-29.617. I+A and 39 more
  frames of A lead to a ledge catch at frame 147. Release, then tap toward the
  stage to climb; the complete route ends grounded at frame 238.

`public/progress/recovery-capture.json` contains the actual browser states behind
six captures: Mario's punch hitting Link, ground spin, Mario recovering,
aerial spin, Link catching the ledge and Link back on stage. `visual-progress.html`
uses these captures and retains the four-fighter, one-stage scope.

The production build and 106 Node checks pass. The new
checks cover raw phases, loop errors, source-path transfer in both directions,
multiple hits and hitlag, input locks, landing, stage contact, ledge flags and
intangible contact with an overlapping-attack control case. Existing jab and
aerial baseline states are unchanged apart from the newly added input and VM
snapshot fields; all 180 prior states were compared before migrating their hashes.
The browser suite checks I, P2 semicolon, gamepad B, complete recovery routes,
Node/exported replay, in-app replay, effects and desktop/phone layouts.

All 24 browser scenarios have passing results across the full suite and focused
rerun. The first full run passed 23; its new Mario check incorrectly equated
elapsed ticks with animation age despite hitlag. That check now advances to the
actual move transition with a bounded deadline. All four recovery browser flows
then passed, including both Node and in-app replay. No gameplay change was
needed for that assertion. The final sword trail and controls were included in
the focused rerun. Logs: `artifacts/build011-browser.log` and
`artifacts/build011-recovery-browser.log`.
