# Build 021 — grabs, pummels and throws

The main `index.html` game now supports standing, dash and pivot grabs, a pummel
and four directional throws for Mario, Link, Kirby and Pikachu on Final Destination.
This continues the browser reconstruction. No emulator is involved in this build.

## Controls and behavior

- P1: F grabs; shield + J also grabs. Run + F selects dash grab; opposite
  direction + F while running selects pivot grab.
- While holding: tap J to pummel, or tap W/A/S/D to throw. Forward/back follow
  facing. A direction held before capture must be released and tapped again.
- P2: `]` grabs, slash pummels, arrows throw. Comma + slash also grabs.
- Standard gamepad: left bumper grabs; X pummels; stick direction throws.
- Grabs bypass shields, respect target masks and invincibility, and miss outside
  the active collision volumes. Simultaneous grabs release both fighters.
- Captured fighters can tap buttons or change direction to struggle free.
  Holding a button contributes once. Throwing commits the capture until release.
- Both slots and the CPU use the same input path. The CPU can grab a shielded
  opponent, pummel and choose a throw. Resets and KOs clear captures.

## Original asset and script evidence

`FitMario.pac`, `FitLink.pac`, `FitKirby.pac`, `FitPikachu.pac`: subactions
108–117 are Catch, CatchDash, CatchTurn, CatchWait, CatchAttack, CatchCut,
ThrowB, ThrowF, ThrowHi and ThrowLw. All are exported by `tools/build_data.py`.
The source command trees are retained in `originalCommands`. Only the external
`gameAnimCmd_CaptureCutCommon` callback is replaced by browser capture handling.

`060A` has eight operands for the ordinary action-61 capture volumes. `060D`
clears grabs. `060E` supplies throw damage/angle/knockback; `060F` applies it to
the captured fighter through ThrowN. The VM retains the original timers and
loops. The `0615` remain-grabbed profiles apply pummel/throw pre-hit damage
without ordinary launch or capture cancellation. Kirby's down throw contains
nine 1% loop hits with the source freeze-frame-disable flag, another 1% hit,
then the 2% release. Pikachu's forward throw
contains four 2% hits before its 2% release.

The field interpretation is cross-checked against the parser author's
[brawllib_rs script definitions](https://github.com/rukai/brawllib_rs/blob/master/src/script_ast/mod.rs).
The local extracted files are authoritative for this game's values.

| Fighter | Pummel | Forward | Back | Up | Down |
| --- | ---: | ---: | ---: | ---: | ---: |
| Mario | 3% | 9% | 12% | 8% | 6% |
| Link | 2% | 3% + 4% | 3% + 4% | 5% + 2% | 3% + 4% |
| Kirby | 1% | 8% | 8% | 10% | 10 × 1% + 2% |
| Pikachu | 2% | 4 × 2% + 2% | 9% | 5% + 5% | 5% + 5% |

Motion is sampled from each fighter's original MotionEtc PAC by BrawlLib.
Catch/throw root translation is transferred to simulation movement and removed
from the displayed skeleton so it is applied once. Kirby retains his forward,
back and up throw arcs, including the up throw's ending hop. The up throw's
scripted excursion above the top boundary does not KO either participant;
normal blast checks resume at release. Side/bottom blast bounds remain active.
Mario's back throw uses its source reversal to launch backward; the displayed
facing switches at the animation's end to avoid mirroring the carried pose.

The thrower's shared ThrownF/B/Hi/Lw sequence is sampled separately on every
victim model. Mixed matchups therefore use the appropriate throwing sequence.
The victim's HipN follows the thrower's animated ThrowN; the joint's orientation
is baked into the victim sequence around HipN, so the opponent rotates with the
hand during slams and spinning throws. There are now 94 Mario,
96 Link, 131 Kirby and 92 Pikachu clips, including the sampled victim sequences.

Link uses the original WpnLinkClawshot, WpnLinkClawshotHead and
WpnLinkClawshotHand geometry, textures and article animations. The chain and head
follow the same tip used by collision; the close-range volumes retain their
original bones. Long-range capture is grounded-only, as in the source mask.
The source article deployment, return and removal events control visibility.

## Reconstructed limits

Common grab buffering, catch transitions, per-body attachment correction,
escape duration/mash strength and tether travel are provisional. Current hold
duration is 90 + 1.7 × damage, capped at 360 ticks; fresh struggle inputs remove
8 additional ticks. Pull-in takes 6 ticks. Original per-body thrown-animation
correction is not implemented; shared motion is sampled on the available bones.
Held-target damage profiles choose the first hitbox in each source phase.
Throw launch uses the existing provisional weight/knockback/hitstun response.
Original hitlag distinctions and common throw invincibility need more work.
The Clawshot tip extends up to 44 units from the fighter with reconstructed
timing; chain deformation and hand attachment approximate common article physics.
Air Clawshot and tether recovery remain unfinished. Sound and original effects
are still missing. Other specials and remaining defensive actions remain in scope.

## Validation

- Native source timing, shield bypass, whiffs, both slots, invincibility,
  standing/dash/pivot selection, tether target masks, all 64 thrower/victim/direction
  combinations, repeated hits, struggle escape, interruption, KOs, scripted
  up-throw motion and CPU follow-ups have simulation coverage.
- Existing recorded combo and aerial states were saved before the changes.
  All 180 prior states compare equal after excluding only the new grab fields;
  the fixture hashes were migrated to `brawl-lab-021`.
- `public/progress/grab-capture.json` records the keyboard routes and snapshots
  for the actual gameplay images. `visual-progress.html` displays those images.
- Browser coverage includes all sixteen throws through keyboard input, P2
  shield capture and gamepad follow-up, reset, desktop/phone layout and per-frame
  browser/Node replay agreement.

Final results: **189/189 Node checks**, **9/9 parser checks**, TypeScript and
production build pass. The browser suite covered **52 scenarios**: its initial
run passed 51 and exposed an outdated expectation that the CPU would keep
striking a held shield. That scenario now verifies the intended grab counter;
normal shield blocking remains covered by local-match checks. The corrected
scenario and all three grab browser scenarios were rerun after the final
Kirby freeze-frame fix: **4/4 passed**. The remaining 48 scenarios passed in the
full run and their behavior was unaffected by that held-hit timing change.

All **22 keyboard captures** were refreshed after the final changes. All nine
progress-page images load, with no page/network errors or horizontal overflow
at 1440px and 390px. Production assets include the current captures, all victim
motion sequences and Link's three Clawshot models. The only build warning is
the existing bundle-size advisory.

Logs: `artifacts/build021-node.log`, `build021-parser.log`, `build021-browser.log`,
`build021-final-browser.log`, `build021-build.log`, `build021-capture.log` and
`build021-progress-capture.log`.
