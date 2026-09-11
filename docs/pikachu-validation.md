# Pikachu integration · Build 009

The fourth fighter is playable in the root browser app, alongside Mario, Link and
Kirby on Final Destination. Both player slots support Pikachu in training, CPU
battles and local matches. Mirror matches give P2 the original red cap costume.

## Original assets and movement

FitPikachu.pac, FitPikachu00.pac, FitPikachu01.pac and FitPikachuMotionEtc.pac were
extracted from the supplied USA Rev 1 disc. The preparation pipeline exports both
models, their textures, 29 motion clips, 48 animation bones and 13 hurtboxes.
The source hashes are included in public/assets/mario/manifest.json, the existing
shared preparation manifest. Final Smash eye meshes are hidden in both costumes;
the alternate cap remains visible. Pikachu uses direct model bone indexes.

Movement uses Pikachu's attributes: weight 79, gravity 0.087, run speed 1.765,
maximum horizontal air speed 0.9118, four ticks of jump startup, initial vertical
jump speed 2.48 and one air jump with a 1.0 multiplier. His original shield and
ledge poses run through the shared controller.

## Enabled attacks

- **Headbutt:** Attack11 has three 2% volumes at script times 1–2, clears at 3,
  sets the auto-jab flag at 5 and allows an interrupt at 21. Hold attack or queue
  another tap to restart this single jab after the flag. Release lets it finish.
  There is no borrowed three-hit combo or Kirby rapid-jab animation. Repetition
  is a provisional common-state interpretation of the native flag.
- **Neutral aerial:** AttackAirN uses 12% at times 2–4 and 6% at 5–24, clearing at
  25. The landing flag clears at 34; landing earlier uses the source 25-tick
  aerial landing recovery. The spinning pose is the original CHR0 animation.
- **Forward smash:** AttackS4Start supplies a separate 14-frame wind-up before
  AttackS4S. Its source hitboxes have 20% at times 1–3, 17% at 4–6 and 14% at
  7–8, clearing at 9. The original root movement is transferred into the fighter
  once. Only the uncharged straight version is enabled. The electric glow and
  bolts are a browser approximation around the active volumes; they freeze with
  hitlag/pause, disappear after the active frames and do not change collision.

The listed times are local source-script times. Whole-engine state transitions,
charging, common input buffering and hit response remain incomplete. Quick Attack,
Thunder Jolt, Thunder, Skull Bash, other normals, throws and grabs are not enabled.

## Verification

Simulation checks cover all enabled script paths and native bone references,
headbutt repeat/tap/release, smash wind-up and three damage phases, double-jump
limits, aerial landing recovery, both ledges, shields and deterministic complete
CPU rounds against each of the other three fighters. Browser checks exercise
fighter selection, original models, P2 attacks, double jumps, alternate costume,
match results/rematches, recorded browser/Node replay and phone layout.

Build 009 passed 89 simulation/tool checks, 7 Python parser checks, 19 browser
flows and the production build. The complete asset preparation pipeline also
passed, and the packaged Pikachu models, motion, data and screenshots match the
local exports. Capture states are recorded in public/progress/pikachu-capture.json.
