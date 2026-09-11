# Fireball and bow · Build 017

Mario's fireball and Link's bow are playable in the main browser game. **U**
uses the neutral special; hold and release U for the bow. P2 uses **apostrophe**
and a standard gamepad uses the **right bumper**. The existing I / gamepad B
recovery controls remain available. Kirby and Pikachu's neutral specials are
still unfinished.

## Original assets and scripts

The exporter adds Mario's `SpecialN` and `SpecialAirN` clips, each 49 samples,
and Link's six ground/air `SpecialNStart`, `Loop` and `End` clips. Link's fighter
clip lengths are 60, 21 and 30 samples. The working subsets now contain 60 Mario
clips and 62 Link clips, with 33 and 35 attack scripts respectively.

Mario's main script creates article 1 at zero-based age 13 and sets interruption
at age 43. The separate fireball article is extra-header entry 6, offset 123532,
header ID 1, subaction `Regular`. Its original collision phases are:

| Projectile age | Damage | Radius | Growth | Base knockback |
| --- | ---: | ---: | ---: | ---: |
| 0–4 | 5% | 2.4 | 25 | 30 |
| 5–29 | 5% | 2.2 | 20 | 22 |
| 30 onward | 5% | 2.0 | 15 | 11 |

All three phases use angle 361 and a 0.3 hitlag multiplier. The hitboxes use
the original `0615` profile `0x1cf7fc1`. The visible article uses the original
`WpnMarioFireball` model, seven joints, 100-frame looping CHR0 and `fire` / `noise`
textures. Four source joints have Standard billboarding. Camera-facing
orientation, additive layers and colour treatment are approximated in Three.js;
the original texture animation and layered shader are unfinished.

Link's Start script creates and initially hides bow and held-arrow articles.
It shows the bow at age 3 and the arrow at age 4, changes equipment visibility
groups at 4 and 5, and sets `RA-Bit[19]` at 17. The original action `0x112`
selects the draw/hold/release phases and sends the arrow article event during
release. The End script restores the equipment groups at age 21. The original
action is retained alongside the extracted subaction scripts for comparison;
the browser reconstructs its control flow.

The arrow is extra-header entry 15, offset 157552, header ID 3. Its `Fly`
subaction contains one 5% hitbox: radius 1.35, angle 361, growth 50, base 7,
hitlag multiplier 0.5 and profile `0xcfffc3`. Its original unmodified script and
nine-word extra parameter block are retained in the payload. Charge changes
the projectile's private hitbox, leaving the shared source data unchanged.

Link's visible bow uses `WpnLinkBow`, all thirteen joints, six weapon animation
clips and `al_BowA`. The weapon's Start/Loop/End lengths are 60/21/25; the shorter
weapon End holds its final pose while the fighter finishes his 30-frame End.
The held and flying arrows use `WpnLinkBowArrow`, four joints and `al_arrow`.
The exporter also saves the bind pose. Held weapons align their HaveN joint
with Link's original hand matrices. Sword/shield polygons switch between their
hand and back groups, restoring after release or interruption. Weapon attachment
details and the missing original arrow trails remain approximations.

## Reconstructed movement and transitions

These are the **current browser rules**, not verified original common parameters:

- A short bow press waits for the source age-17 readiness flag, then releases on
  the following tick. Holding continues the 60-frame draw and then loops the
  21-frame held pose. Forty-three charge ticks interpolate from a 5% / speed-3
  arrow to a 12% / speed-10 arrow. Full draw stays held until release.
- Mario releases one fireball at the source event. Fireballs move at 1.4 units
  per tick, start with downward velocity 0.25, use gravity 0.036, bounce upward
  at 0.75 and expire at 75 ticks. Those values occur in the retained parameter
  block, but their field mapping and exact update order are not verified.
- Arrows use gravity 0.053 and an 80-tick flight limit. On stage contact they
  stop, cease hitting after that contact tick and remain briefly before removal.
- The projectile origin is reconstructed from the firing hand plus a small
  forward offset. Projectiles use the fight plane and keep their launch direction
  independently of their owner's later movement, facing or hitlag.
- Grounded neutral specials stop walking; aerial variants permit steering at
  half maximum air speed. Landing or leaving the floor switches the variant
  without restarting its clock or generating another projectile. Neutral specials
  do not consume the recovery special. Getting hit clears a held bow and its
  equipment changes; an already launched projectile survives until its own end
  condition. Owner KOs and resets remove owned projectiles.

Projectile movement is swept against Final Destination's original floor, walls
and underside. Target collision uses the travelled segment and animated
hurtboxes or shields. Shots hit once and disappear. Contacts for both players
are gathered before resolution, allowing simultaneous projectiles to trade.
Projectile hits freeze the struck target and do not apply hitlag to the owner.
Common knockback, shield response, reflection, absorption and projectile clashes
still need work. Original sounds are not yet connected.

## Playable evidence

`public/progress/ranged-capture.json` records ten keyboard routes and their
complete captured states. They include ground and aerial fireballs, a floor
bounce, a 5% fireball hit, Link's full draw, arrow flight, quick/full 5%/12% hits,
an airborne draw and a short arrow stopped by the floor. `visual-progress.html`
uses these actual game captures and keeps each fighter marked in progress.

The ranged simulation scenarios cover source phases, draw visibility, one-shot
generation, full and short draws, continuous clocks across landing, retained
recovery access, lifetime, stage contact, shielding, owner interruption and KOs,
simultaneous player shots and CPU use. Browser scenarios cover keyboard input,
P2 and gamepad right bumper, the draw display, narrow layouts and an exported
charged-arrow recording reproduced independently in Node.

The simulation ID advances to `brawl-lab-017` for the new neutral-special input,
held-weapon state, article visibility and projectile snapshots. Before migrating
the two retained input fixtures, all 180 previous states were compared after
removing only the added fields; their prior state values were unchanged.

Final run results are recorded in `artifacts/build017-*.log` and the progress
page's validation note.
