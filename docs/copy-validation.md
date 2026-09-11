# Kirby's copied abilities — Build 020

Kirby now swallows and copies Mario, Link or Pikachu in the main browser game.
Hold **U** to inhale, then tap **S / Down** while the opponent is held. After
the swallow animation, **U** uses the copied neutral special. **K + U** while
free to act discards it and restores inhale. P2 uses apostrophe, Down and
comma + apostrophe. Gamepads use right bumper, Down and trigger + right bumper.
**U or J** still spits a captured opponent out instead of copying.

## Original data

The local USA Rev 1 disc supplies FitKirbyMario00.pac, FitKirbyLink00.pac and
FitKirbyPikachu00.pac. These contain Kirby's own copy animations, the original
copy hats and the weapon models. The ordinary fighter models remain Kirby's
normal and alternate costumes. `tools/prepare_assets.py` now includes all six
copy motion/data PACs in its asset list; their hashes are in the asset manifest.

- Main Kirby subaction 491, SpecialNDrink, is 31 frames. It defines the 6%
  swallow damage and sets flag 0x22000015 at source age 7. Model group 1 closes
  at age 12. The browser uses that flag once to grant the copy and release
  the target. There is no separate airborne Drink clip in this archive.
- Mario copy uses main Kirby subactions 571/572, with 49-frame ground/air
  clips. They generate article 13 at age 13 and permit interruption at 43.
- Link copy uses subactions 740–745, with 60-frame draw, 21-frame hold and
  30-frame release clips. Later duplicates 746–751 belong to Toon Link and
  are not selected. Articles 13/14 become visible at ages 3/4; the draw-ready
  flag arrives at 17. The release permits interruption at 24.
- Pikachu copy uses subactions 522/523 and 59-frame ground/air clips. A shared
  subroutine generates article 13 at age 18. This copied script does not use
  the ordinary Pikachu article-availability guard.
- The browser stores copied clips/scripts under CopyMario, CopyLink and
  CopyPikachu prefixes, leaving all original command operands intact. Kirby
  now has 99 exported fighter clips and 65 enabled scripts.

The copied projectile data comes from each FitKirby[Fighter].pac. Its data
header stores these article pointers at words 4 and 5. The Mario
fireball article is at offset 1444 (ID 1, Regular); it preserves 5% hits and
the original three radius/knockback phases. Link's arrow is the second article
(ID 3, Fly), with a 5% source hit. Pikachu's ball/spark articles are at offsets
2072 and 2204 (IDs 1/2, Regular), preserving 9% airborne ball damage and the
ground spark's 6% grounded / 5% airborne target hits.

The copied fireball, arrow and both jolt models/materials and motion exports
match their ordinary fighter counterparts after excluding COLLADA timestamps.
The renderer shares those assets. The bow geometry also matches, but Kirby's
weapon animation differs, so it uses the copied bow motion. These comparisons
are recorded in `artifacts/build020-copy-comparison.txt`.

The original hats are WpnKirbyMarioCap (2 bones), WpnKirbyLinkCap (6), and
WpnKirbyPikachuCap (12, including ears and tail). Their bind poses follow
Kirby's animated BodyN; the generic HeadItmN anchor places them too high.
Hat secondary physics and exact original attachment rules remain unfinished.

## Reconstructed behavior and limitations

The swallow deals 6% once, then releases the target behind Kirby with the
original CaptureCut pose: currently 12 units behind and 5 above, horizontal
speed 0.6, upward speed 0.8 and twenty ticks of invincibility. Kirby finishes
the 31-frame Drink animation before using the copy. This release and common
state timing are reconstructed. Input presses during normal jump startup are
not buffered into a copied special, matching the current ordinary controls.

Copies persist through ordinary attacks, jumps, recovery and interruption.
They clear on KO, reset or the explicit shield + neutral shortcut while free
to act. A plain Kirby target grants no copied neutral; interactions with an
already copied Kirby and random copy loss on damage are unfinished. CPU Kirby
chooses between spitting and copying, then uses the normal ranged controller.

Copied fireball/bow/jolt attacks use Kirby's animated hand or mouth as their
origin. Their common movement, projectile kinetics, charge interpolation,
ground/air transitions, layer shading and defensive limitations are shared
with the corresponding existing browser projectiles. Fully drawn arrows
reach 12%. Reflection, absorption, projectile clashes, full original effects,
sound, hat physics and precise common copy rules remain unfinished.

## Playable evidence

`public/progress/copy-capture.json` records thirteen actual keyboard captures
with full states and reproducible routes: swallow, all three hats, fireball
and jolt flight, copied bow draw/release, all three hits, discard and P2 copy.
The progress page uses nine of these images. The hit routes leave Mario at
11% (6 + 5), Link at 18% (6 + 12) and Pikachu at 12% (6 + 6).

Six simulation scenarios cover source timings, single swallow damage, the
closing animation, all three copied moves, air/landing continuity, retained
Final Cutter, discard, KO, mirror/P2 behavior and CPU use. Three browser
scenarios exercise all copies and discard, P2 with a gamepad, the displayed
HUD/panels, phone layout, and a copied airborne bow recording replayed in Node
at every observed frame and verified again in the browser.

The simulation ID is `brawl-lab-020`. All 180 pre-existing Mario fixture
states were unchanged before adding the two new copy fields and updating
version metadata. Logs and inspection output are in `artifacts/build020-*`.

Final validation: all 179 simulation/tool checks, 9 parser checks and all 49
browser scenarios pass. TypeScript checking and the production build pass.
All thirteen shared projectile texture PNGs also match their ordinary fighter
counterparts byte for byte. The desktop and 390px progress-page captures load
all nine displayed images without page errors, failed asset requests or
horizontal overflow.
