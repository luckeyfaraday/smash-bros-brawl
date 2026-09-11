# Build 029 — Brawl menu presentation

The title, character select, pause, results and battle HUD now share the silver,
red and charcoal menu treatment. The title uses a centered layered logo and
the original press-button lettering. Selection places the four roster portraits
above large player cards, with rules above and a Ready to Fight banner below.
P1 is red; a computer opponent is gray; local P2 is blue.

The layout references Nintendo's original
[character select presentation](https://www.smashbros.com/wii/en_us/gamemode/various/various25.html)
and [menu presentation](https://www.smashbros.com/wii/en_us/gamemode/various/various18.html).
The browser layout adapts that visual language to the four supported fighters
and the one supported stage. Its CSS geometry and logo composition are
reconstructions, not the original game's menu scene renderer.

## Artwork and preparation

All artwork is extracted from the prepared local USA Rev 1 disc files.

| Source | Artwork |
| --- | --- |
| `menu/titleloop/title_en.brres` | Metal logo plate, title letter silhouettes, Brawl lettering, press-button text |
| `system/common5_en.pac` | Four portraits and character nameplates, Ready to Fight lettering, Final Destination thumbnail |

`tools/export_ui.ps1` preserves raw TEX0 PNGs and generates text coverage masks.
Character names and the title prompt use original intensity channels for their
silhouettes. The banner layers an intensity-derived gold fill with the original
texture's alpha outline. These browser materials avoid opaque black nameplates
and hollow or blurred lettering. Fighter nameplates are preloaded before the
game becomes ready, so changing a portrait also changes its name without waiting
for another download.

The output manifest at `public/assets/ui/source.json` records source SHA-256
hashes and exact texture names. The asset preparation pipeline now extracts the
title BRRES as well as the character-select PAC. Regenerate the UI with:

```powershell
C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe -NoProfile -File tools/export_ui.ps1
```

## Verification

Six browser scenarios pass: title and original artwork, selection and saved
rules, a real CPU match through results/rematch, two-player keyboard input,
gamepad menu navigation and disconnect pause, phone touch input and orientation,
and visible asset-failure recovery (several behaviors share a scenario).
TypeScript and the production build pass; the existing renderer bundle-size
advisory remains.

Screenshots were checked at 1440×900, 1440×1100, 1366×768, 1280×720,
1920×1080, 820×1180, 390×844 and 320×720. Menus fit ordinary desktop
viewports; short phones can scroll vertically. Touch controls remain reachable
in portrait and landscape. Reduced-motion preferences disable menu animation.

The title/selection, mobile and load-failure scenarios also pass after the final
nameplate preload and layout adjustments (`artifacts/build029-final-ui.log`).
Full flow and build logs are in `artifacts/build029-browser.log` and `artifacts/build029-build.log`.
Screenshots use `artifacts/build029-*.png`.

```powershell
npm run build
npx playwright test tests/browser/game-ui.spec.ts
```

Combat rules, AI and replay version remain at `brawl-lab-027`. The earlier
[Build 028 validation](game-ui-validation.md) records the gameplay front-end
and input integration. Menu audio remains synthesized cues.
