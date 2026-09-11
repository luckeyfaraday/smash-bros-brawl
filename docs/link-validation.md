# Link and fighter selection — browser build 007

The main game now has independent P1 and P2/CPU selectors for Mario and Link.
Selections apply to training, CPU battles and two local players, persist through
rematches, and are included in recorded matches. Switching a fighter resets the
match and clears its recording. Selection is locked during recording/playback.

## Original data and implemented play

- Link uses FitLink00, the red FitLink01 alternate for mirrors, and 31 CHR0 clips
  from FitLinkMotionEtc. His skeleton has 80 bones and 11 decoded hurtboxes.
- Movement and damage response use each actor's own attributes. Link has weight
  104, gravity 0.089, seven-tick jump startup and nine-tick neutral-aerial landing
  recovery. Mario retains his own values.
- Link's raw Attack11/12/13 scripts give the sword combo 4%, 3% and 5% hits, active
  at script times 6–7, 5–6 and 5–9 respectively. Fresh J presses queue follow-ups.
- Neutral aerial uses 10% at times 6–7 and 6% at 8–26, with the original landing
  flag and animation. All airborne attack directions still choose this move.
- Forward smash uses the original first slash's 14%/15% hitboxes at times 5–7.
  Tap L again to queue AttackS4S2 through the original combo flag window. Its
  hitboxes deal 17%/19%/20% at times 11–13. Both attacks are uncharged.
- Each slash exports its root track separately; physical position receives the
  movement once and both rendering and hit detection use the normalized pose.
- Link uses his own shield, damage, dizzy and ledge clips in the shared match
  controller. The CPU can use the second slash and finish mixed-fighter matches.

The source script times above are what the browser executes; they are not claims
of verified Brawl engine startup timing or common-state ordering.

## Rendering and limitations

Both actors now bind their own model, bones, poses and hurtboxes. The renderer
caches models when changing selection, uses alternate costumes only for mirrors,
and keeps the original Final Destination integration. Link's hand-held sword and
shield, normal eyes and default bag are selected explicitly. Equipment visibility
transitions, passive shield blocking, and original material/shader behavior remain
unfinished. Special moves, items, sound, other attacks and complete stage contact
are still missing. Kirby and Pikachu remain planned integrations.

## Replay and verification

Exported recordings include both fighter selections and source hashes. The replay
runner loads their respective assets and rejects a mismatched source. A browser
check found a one-bit difference between Chromium and Node's sine calculation for
Link's 48-degree launch; a fixed table of integer-degree vectors now gives both
runtimes the same launch direction. Existing Mario regression hashes still pass.

Unit checks cover the raw Link scripts, distinct movement, the complete sword
combo, slash input windows, ledges, and a deterministic CPU stock win. Browser
checks exercise selection, both player slots, mixed-fighter recording/replay,
mirror rendering, rematch and desktop/phone layout. All 76 unit checks and all
15 browser flows passed, including the existing Mario regressions. Type checking,
the production build and the complete native asset preparation command passed.
Current captures are recorded in public/progress/link-capture.json.
