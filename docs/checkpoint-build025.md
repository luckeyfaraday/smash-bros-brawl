# Stopped at Build 025

The browser reconstruction is playable at http://127.0.0.1:5174/.
Visual progress is at http://127.0.0.1:5174/visual-progress.html.
The scope is Mario, Link, Kirby, Pikachu and Final Destination.

## Playable now

- Training, CPU stock battles and two-player local matches, with fighter
  selection, KOs, respawns, results and rematches.
- Original models and animations; movement, jumps, ground and aerial attacks,
  chargeable smashes, grabs, pummels, throws, shields, dodges and ledge options.
- All four specials for each fighter, including Kirby copying the other three
  fighters' neutral specials and Link's bombs and item throws.
- Latest additions: crouching for all four, Link's physical projectile shield,
  and down-air rebound with a weaker 8% follow-up.
- Updated index.html and nine gameplay images in visual-progress.html.

## Remaining

Knockdowns, get-up options and techs are not implemented. Hit response,
knockback, common movement, shield coverage and rebound tuning remain
reconstructed. Full audio/effects, background animation, stronger CPU play
and performance/presentation refinement are still needed.

## Paused preparation

The completed Build 026 export contains 23 additional original motion clips
and scripts per fighter for knockdowns, get-up actions, tumbling and floor
techs. No runtime knockdown implementation was made. Export outputs and
matching exporter source are preserved in .tools/prepared-knockdowns/.
The active exporters and public assets have been restored to Build 025;
all four public fighter asset folders match the verified dist assets exactly.
Start the next implementation by reviewing the archive README and wiring
these actions into hit response, landing, controls and rendering.

## Checkpoint evidence

Build 025 passed TypeScript and its production build. Its full existing
browser suite passed 61/61; final focused checks passed 5/5. The restored
checkpoint's three Link browser cases passed again. Detailed validation is
in docs/link-response-validation.md and artifacts/checkpoint-build025-browser.log.
The local Vite server remains available on port 5174. Implementation work
is stopped at this checkpoint.
