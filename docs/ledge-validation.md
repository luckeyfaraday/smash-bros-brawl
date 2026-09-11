# Ledge recovery — browser build 005

Mario now catches both Final Destination edges, hangs, climbs, jumps and drops.
The main game displays available ledge controls in place of the attack timeline.
The progress page shows actual hanging and climbing captures alongside the earlier
combat milestone.

## Original data and current rules

The edges come from the original collision planes' left/right ledge flags.
Eight original CHR0 clips were added: `CliffCatch`, `CliffWait`,
`CliffClimbQuick/Slow`, and `CliffJumpQuick/Slow1/2`, bringing Mario to 25 clips.
Their root motion remains intact. Ledge poses use the edge as their origin;
finishing a climb transfers the animation's final translation into the fighter's
world position. Dropping transfers the hanging translation before returning to
the normal falling pose. Rendering and hurtboxes share those transforms.

The browser's common-state rules are **provisional**, not verified original-engine
timing: catch within 8 units horizontally and between 2 and 16 units below the
edge, only while descending and without away/down input or hitstun. Catch grants
30 ticks of invincibility; dropping/jumping clears it and prevents regrab for
30 ticks. Hanging times out after 600 ticks. This build uses the slow clips at
100% damage, locks transitions until the current clip finishes, and launches a
ledge jump with Mario's normal jump velocity and maximum horizontal air speed.
The extracted `Edge Jump` attribute labels are not assumed to establish the
original launch formula. One air jump remains after a ledge jump/drop.

During hanging, a fresh press toward the stage climbs; Space jumps; down or away
drops. Inputs held through the catch do not automatically choose an action.
The training dummy still does not act or recover by itself. Ledge attack/roll,
wall/underside collision, recovery specials and full match play remain unfinished.

## Verification

- Eight ledge simulation checks cover both edges, quick/slow clips, root-motion
  transfer, blocked catches, action startup locks, air-jump availability, regrab
  delay, hanging timeout and blast resets.
- Browser controls complete a run-off → catch → hang → climb sequence and replay
  it to the same final state. A second flow exercises ledge jump, air jump, drop
  and the phone layout.
- Existing jab/aerial recordings were migrated to `brawl-lab-005` only after every
  old frame hash matched with the three new, inactive ledge fields removed. Their
  movement, damage and attack states did not change. New hashes include all fields.
- Rendered hanging/climbing captures were inspected. The camera focuses toward
  the ledge so the foreground platform does not obscure Mario; it returns toward
  the combat framing near the end of climbs/jump startup.
- `public/progress/ledge-capture.json` identifies the captures: hanging at frame
  116 and climbing at frame 135. The earlier combat capture remains Build 004.
