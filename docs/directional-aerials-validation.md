# Directional aerials · Build 015

Mario, Link, Kirby and Pikachu now have forward, back, up and down aerials in the
main browser game, alongside their neutral aerials. These work in training, CPU
matches and local two-player matches on Final Destination. The progress page
shows nine captures from this milestone, including an airborne Link-versus-Mario
stock battle and Kirby's drill-to-landing sequence.

## Playing the moves

Jump before pressing J. With no direction, J selects neutral aerial. With a
horizontal direction it selects forward or back aerial relative to the fighter's
current facing; W + J selects up aerial, S + J down aerial. Vertical input wins
an equal diagonal. The selection deadzone is 0.3. Air drift does not turn the
fighter, and the control guide updates the forward/back keys when facing changes
on the ground. Gamepad uses stick + X; P2 uses arrows + slash after jumping with
Enter. Inputs during jump startup are not buffered into an aerial.

A move stays locked until its source interrupt flag or clip end. Drift and fast
fall remain available; a second attack or jump cannot restart or cancel it. The
CPU selects aerial directions from the target's position, using the same inputs.
Its choices and the input thresholds are browser reconstruction rules.

## Original assets and scripts

Each fighter gained eight clips: AttackAirF/B/Hi/Lw and LandingAirF/B/Hi/Lw, plus
the corresponding eight raw gameplay scripts. Current clip counts are Mario 48,
Link 48, Kirby 60 and Pikachu 49. The local fighter PAC and MotionEtc PAC provide
the scripts, CHR0 animations, landing attributes, hitboxes and animated hurtboxes.
The source PAC identities did not change.

The table uses zero-based animation ages, excluding hitlag. Multiple hitboxes in
one phase offer different coverage or strength; they do not add their damage.

| Fighter | Forward | Back | Up | Down |
| --- | --- | --- | --- | --- |
| Mario | 12% at 15; 13% at 16–18, angle 280; 10% at 19–20 | 12% at 5–7; 7% at 8–12 | 11% at 3–8 | Five 1% pulses at 4, 6, 8, 10, 12; 7% finisher at 24 |
| Link | 9% at 13–14; 12% at 25–26 | 4% at 5–8; 7% at 17–22 | 15% at 10–12; 13% at 13–39 | 22% at 13; 18% at 14–63 |
| Kirby | 4%, 3%, 5% at 9–10, 16–17, 24–25 | 12% at 5–7; 9% at 8–13 | 10% at 9–14 | Six 2% pulses at 17, 20, 23, 26, 29, 32; each lasts two ages |
| Pikachu | Four 2% pulses at 9, 13, 17, 21, each lasting three ages; 3% finisher at 25 | Seven 1% pulses at 3, 7, 11, 15, 19, 23, 27, each lasting two ages; 4% finisher at 31–36 | Up to 6% at 2–3; up to 5% at 4–7, with angle changes | 12% at 13–25 |

Link's up aerial uses command 0601 to reduce existing hitbox damage. The VM now
supports its validated two-value layout without changing the hitbox identity,
radius, bone or collision epoch. That damage update does not permit another hit.
Finite loops and shared timers already supported by the VM now drive the original
repeated aerial pulses. A cleared group can hit again when new hitboxes spawn.

Ordinary source hitboxes orient horizontal knockback from the attacker's position
toward the defender, so a backward hit can launch behind the fighter. The previous
browser response always used facing. The special profiles currently enabled keep
their facing/movement behavior. This follows the default ordinary-hitbox mapping
in the locally retained [brawllib_rs source](https://github.com/rukai/brawllib_rs/blob/main/src/high_level_fighter.rs).
Overall knockback magnitude, hitstun, grounded meteor response and update order
remain provisional.

## Landing behavior

The source landing-lag flag chooses between normal recovery and the corresponding
LandingAir clip. Each clip is displayed across its own extracted duration. The
existing normal and neutral-aerial paths retain their previous behavior.

| Fighter | Forward landing | Back landing | Up landing | Down landing |
| --- | --- | --- | --- | --- |
| Mario | 26 | 10 | 10 | 19 |
| Link | 10 | 10 | 30 | 50 |
| Kirby | 15 | 9 | 9 | 15 |
| Pikachu | 15 | 30 | 24 | 40 |

On landing in that window, the airborne VM is discarded and the source landing
script starts at age zero. Mario and Kirby down-air landings create 2% hits at
ages 0–2. Pikachu's back/down landings create 4% hits at ages 0–1. These are separate
collision groups, can be shielded, and hit only once. Landing hitlag freezes the
pose and recovery counter. Landing outside the flag window uses normal recovery
and creates none of these landing hits. The display identifies the parent aerial
while showing the actual landing recovery duration.

Script ages remain simulation ages while landing poses are scaled across the
extracted recovery duration. The common transition and animation-rate behavior
still needs original-engine comparison. Mario/Pikachu backward aerials retain
their source visual root offsets in the animated skeleton; air drift supplies the
physical movement. Both rendered bodies and hit/hurt volumes use the same pose.
Pikachu's forward/down aerials reuse the browser's approximate electric effect.
Native effects, sound and Link's downward-sword on-hit bounce remain unfinished.
Link's source variable flag is retained, without claiming the bounce is active.

## Playable evidence and checks

`tests/fixtures/aerial-hit-routes.json` contains actual input routes that connect
all sixteen new aerials. Fifteen start in normal training. Link's up aerial uses
local battle controls to jump Mario above the sword. No route modifies simulation
state. All sixteen run through the browser keyboard handler as well as Node.

Continuing the short-hop routes produces these observed sequences:

- Mario down: five 1% pulses and the 7% finisher, totaling 12%.
- Link back: 4% then 7%.
- Kirby forward: 4% + 3% + 5%; down: six 2% air hits and a 2% landing hit, totaling 14%.
- Pikachu forward: three 2% pulses connect; the remaining pulse and finisher miss
  that launched target. Back: seven 1% hits and a 4% finisher.

These are browser results under provisional hit response, not guaranteed combos
or measurements from the original game. Separate controlled cases check every
directional landing window, landing hits and shields, pose/recovery locks,
hitlag, backward launch direction and CPU selection.

`.tools/capture-aerials.mjs` creates fourteen captures using keyboard input and
frame advance. Eight show original airborne poses; six show actual contacts,
including the complete Kirby landing route. `public/progress/aerial-capture.json`
stores the routes and states behind them. `visual-progress.html` displays nine
selected captures and the remaining scope.

All 139 Node checks and nine parser checks pass. The three new browser scenarios
pass, including all sixteen moves, P2 keyboard/gamepad inputs and an exported
Kirby drill/landing recording replayed in both Node and the browser. All 180 saved
Mario jab and neutral-aerial states and hashes are unchanged from Build 014; only
the fixture simulation version advances to 015. All 36 scenarios in the full
browser run pass, and the production build passes. Two final browser checks of
page links, capture images and desktop/phone layouts pass after the progress-note
update, as does the final production build.
