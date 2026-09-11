# Charged directional smashes

Build `brawl-lab-016` adds up and down smashes and charging for Mario, Link,
Kirby and Pikachu in the browser-native game. The earlier forward smashes now
also play each fighter's separate source wind-up. Final Destination remains
the only stage. No runtime emulator is involved in these attacks.

## Playing

Press **L** for forward smash, **W + L** for up smash or **S + L** for down
smash while grounded. A short press finishes the wind-up and attacks without
charging. Keep holding through the wind-up to charge, then release to strike.
The selected direction and facing stay locked. Mario and Kirby have high and
low forward-smash variants on diagonal input; Link and Pikachu use straight
forward smash for a diagonal. P2 uses a direction plus **Period**. Gamepad uses
a direction plus **Y / top face button**.

The charge panel displays the selected attack, progress and damage multiplier.
A growing glow marks the held pose. Link can queue his second forward slash
with a fresh L press during the released first slash. Holding the button does
not queue that follow-up or automatically start another smash after recovery.

## Source material and reconstructed rules

`tools/MarioExporter.cs` exports the original Start, Hold and release CHR0
clips. `tools/build_data.py` extracts their raw attack scripts from the local
fighter PACs. These counts describe the exported subset, not complete movesets:

| Fighter | Motion clips | Attack scripts | Forward / up / down wind-up samples |
| --- | ---: | ---: | --- |
| Mario | 58 | 31 | 6 / 7 / 3 |
| Link | 56 | 29 | 10 / 6 / 5 |
| Kirby | 70 | 38 | 5 / 9 / 5 |
| Pikachu | 56 | 29 | 14 / 5 / 5 |

All exported smash Hold clips have 61 samples. The browser currently allows
60 hold ticks and scales damage linearly from 1× to 1.4×. **The charge cap,
damage scaling, transfer of charge to Link's second slash and common phase
transitions are reconstructed defaults. They are not verified original common
parameters.** The hold sample count alone does not establish those rules.
The glow is an approximation made with the existing renderer.

Horizontal motion comes from each source clip's forward root deltas, passes
through stage collision, and is removed from the skeletal pose to avoid double
movement. Mario's forward wind-up includes his backward step; the subsequent
release uses its own relative root track. Tiny source vertical/depth offsets
are not transferred into smash physics. Collision ordering, common hit
response and recovery transitions remain reconstructed.

Damage is scaled on a collision copy, leaving the VM's original hitbox values
unchanged. Late-hit replacements therefore do not compound the multiplier.
The scaled value also feeds shield loss, hitlag and knockback. Hitlag freezes
the fighter's charge and animation clock. Getting hit, a KO, a reset, or leaving
the platform clears the charge and active attack. Source head/foot intangibility
is applied only for the corresponding script window.

## Distinct source hit groups

Times below are zero-based ages within the **release** clip; they exclude the
separate wind-up, held charge and hitlag. Damage is before charge scaling.

| Fighter / attack | Source sequence |
| --- | --- |
| Mario up | 14% at ages 2–7; head intangible for that window |
| Mario down | Front 15% at 2–3; rear 12% at 11 |
| Link up | 4% at 4–9; 3% at 20–23; 8–10% at 35–39 |
| Link down | Front 14–17% at 4–6; rear 16–17% at 15–17 |
| Kirby up | 14–15% at 5, 12–14% at 6–7, 11–12% at 8–15 |
| Kirby down | 14% at 5–9, then 9–11% at 10–17; feet intangible at 0–9 |
| Pikachu up | 13–14% at 4–5, 11% at 6–7, 7% at 8–11 |
| Pikachu down | Six separate 2% pulses starting at 1, 4, 7, 10, 13, 16; 3% finisher at 19 |

Near a standing Mario, Link's three upward slashes connect for 4 + 3 + 10 = 17%
without charge, 20.4% at half charge, or 23.8% at full charge. Pikachu's down
smash connects all seven hits for 15%, 18% or 21% respectively. These are
observed browser-reconstruction routes; another target, position or movement
can miss some hits. Kirby's early-to-late damage changes do not permit a second
contact against the same target in the same hit group.

## Captures and checks

`public/progress/smash-capture.json` contains the keyboard inputs and complete
states for twelve captures: four charge poses and eight actual up/down hits.
`visual-progress.html` uses those game captures, describes controls and keeps
the remaining movesets and presentation marked incomplete.

`tests/smashes.test.ts` exercises all twelve wind-ups and charge paths, full
charge release, direction locking, actual scaled hits, repeated hit groups,
shield loss, hitlag, interruption, source intangibility, Link's follow-up and
CPU use of it. Browser scenarios cover all eight new directional attacks,
the charge display, P2 and gamepad controls, and an exported charged Pikachu
recording replayed independently in Node. Existing forward-smash expectations
were advanced by their added wind-up lengths. CPU match coverage now observes
its up/down choices; a separate bounded scenario still requires the second
forward slash.

The simulation ID advances to 016 because snapshots include charge state for
both players. Migration of the two retained jab/neutral-aerial fixtures first
compared all 180 old states after removing only the newly added `smash` fields;
all prior state fields were unchanged.

Final verification results are recorded in the Build 016 progress-page note
and `artifacts/build016-*.log`.
