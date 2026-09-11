# Mario jab validation

The jab chain implements Attack11 → Attack12 → Attack13. The script
timings and animations come from the local USA Rev 1 fighter PACs. The common
engine's input processing and hit response have **not been measured in Dolphin**.
No reference capture or Brawl save state was available during this change.

## Evidence from the local files

`tools/build_data.py` exports all three main scripts from `FitMario.pac`.
`tools/MarioExporter.cs` samples their original CHR0 clips from
`FitMarioMotionEtc.pac`. Source hashes are recorded in
`public/assets/mario/manifest.json` and the fighter data payload.

The following are raw script/animation times, starting at **0**. They are not
wall-clock frames: a hit freezes animation time while simulation ticks continue.

| Move | Active times | Damage | Follow-up flag | Held-input flag | AllowInterrupt | CHR0 samples |
| --- | --- | --- | --- | --- | --- | --- |
| Attack11 | 1–2 | 3% | 6 | 9 | 15 | 16 |
| Attack12 | 1–2 | 2% | 5 | 9 | 18 | 18 |
| Attack13 | 6–9 | 4% | — | — | 29 | 40 |

Attack13 command `0602` changes only hitbox 0's radius from 5 to 3.6 at time 8.
Its other two hitboxes stay at radius 2.5. All clear at time 10. Resizing does
not let an attack hit the same target a second time.

The raw boolean operands are `0x22000010` (RA-Bit[16]) and `0x22000016`
(RA-Bit[22]). The parser authors name these `EnableActionTransition` and
`EnableAutoJab` in [brawllib_rs's variable definitions](https://github.com/rukai/brawllib_rs/blob/master/src/script_ast/variable_ast.rs).
The hitbox resize operation also agrees with the
[brawllib_rs script runner](https://github.com/rukai/brawllib_rs/blob/master/src/script_runner.rs).
These references establish the decoded operations; they do not establish the
complete common-engine transition rules.

## Current transition rules

- A new press during Attack11 or Attack12 latches one follow-up. The press that
  starts a move is consumed and cannot also queue the following move.
- A latch survives hitlag, but neither the script clock nor the move transition
  advances during hitlag. Ending/canceling a jab discards its pending follow-up.
- Transition checks read flags from the previously completed script frame. A
  queued tap therefore advances on the next unfrozen tick after the follow-up
  flag is set. New moves begin at animation time 0 with fresh flags and hit state.
- Holding attack follows a connected punch after both the follow-up and auto-jab
  flags have been set. Holding through a miss does not repeat or chain the jab.
- The kick has no follow-up. Movement/jumping resume after interruption is allowed;
  the animation length is also an exit condition. Release and press attack to
  start a new sequence. Attack12 reaches its clip-end exit at time 18.

The latch lifetime, held-input behavior, transition priority and update ordering
are explicit prototype choices awaiting comparison. They should not be described
as frame-accurate Brawl behavior. Knockback, hitlag, hitstun and movement response
remain provisional as documented in the main README.

## Regression recording

`tests/fixtures/mario-jab-combo.json` starts at the default training state. It
walks right for ten simulation ticks, then presses attack on ticks 11, 14 and 24.
The recording lasts 90 ticks and includes a hash of every resulting state.
Its simulation identifier is now `brawl-lab-003`; adding neutral aerial preserved
all 90 existing jab state hashes, so only the identifier needed updating.
It is a browser baseline, not a recording of the original game.

The asserted contacts are:

| Simulation tick | Move | Added damage | Total damage |
| --- | --- | --- | --- |
| 12 | Attack11 | 3% | 3% |
| 23 | Attack12 | 2% | 5% |
| 37 | Attack13 | 4% | 9% |

`npm test` reports the first differing tick. The trace command writes each input,
fighter state, script state, hitbox radius and resulting hash for inspection:

```powershell
npm run trace:replay -- tests/fixtures/mario-jab-combo.json artifacts/jab-trace.json
```

Browser tests separately operate the actual keyboard controls, check the timeline
and 9% result, then verify a held-input recording both through the Replay button
and by executing its downloaded JSON in Node. Reset is checked during the kick.

## Next reference capture

Use the same USA Rev 1 disc in Dolphin, Mario against a stationary Mario, and
record the emulator version, controller setup and starting state alongside the
capture. Align tick zero to the first sampled attack input, and keep animation
time separate from video frames and hitlag.

Capture single jabs, three separate taps (including taps during hitlag), held
attack on contact, held attack on a miss, and inputs just before/after each
follow-up window. Record clip transitions, damage changes and freeze durations.
For movement and launch comparisons, measure displacement from a common starting
position; the browser currently uses a custom platform.

Retain the original movie/save state and measurements with their provenance.
Compare those measurements with the browser trace, then change the provisional
rules and deliberately update the browser regression fixture. Do not relabel
generated browser states as reference-game measurements.
