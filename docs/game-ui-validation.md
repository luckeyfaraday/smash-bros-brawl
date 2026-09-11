# Build 028 — game front end

The default page at http://127.0.0.1:5174/ now opens on the title screen.
The player flow is title → fighter selection / match rules → countdown → battle
→ results → rematch or selection. Escape/P, gamepad Start or the pause button
opens a menu with resume, restart, controls, selection and title actions.

## Player interface

- Four original portraits, independent P1 and CPU/P2 choices, mirror matches.
- CPU or local versus; 1/3/5 stocks and 1/3/5 minute limits.
- A full-window arena with timer, portraits, damage and stock pips.
- Winner/draw presentation, match duration and remaining stocks, fresh rematches.
- Keyboard and standard gamepad controls; gamepad menu navigation and button
  release gating when entering a match or resuming.
- Responsive phone menus and touch movement, jump, attack, shield, smash,
  neutral-special and recovery controls. Full moves remain on keyboard/gamepad.
- Control help, optional synthesized menu/countdown/hit/KO/result sounds,
  saved fighter/rule/sound preferences, visible load failures with retry.
- Focus loss, background tabs and controller disconnection pause the game.
  Gameplay input is suspended while paused or viewing help.

Menus do not advance a match. Fighter data and models load once in the background;
Ready to Fight becomes available after loading finishes. Each start/rematch
constructs a new `Simulation`. Browser inspection remains read-only through
`brawlGame.ready`, `brawlGame.screen` and `brawlGame.snapshot()`.

The prior dashboard is preserved as the internal `/lab.html` harness, using
`src/lab.ts` and `src/lab.css`. It has no link in the player menus. Existing engine
browser tests now explicitly open that route. Historical progress still links
back to the main game's title screen.

## Original artwork

`tools/export_ui.ps1` decodes the original character-select textures from
`extract/system/common5_en.pac`, SHA-256
`a29273f75e5938e34f1aadbdbafdf3a4ab4ee55b1d62611f78a39c2ea4151ade`.
It uses the prepared BrawlLib x86 installation and preserves the original
128×160 images, including their transparency.

| Fighter | Original texture |
| --- | --- |
| Mario | `MenSelchrFaceB.001` |
| Link | `MenSelchrFaceB.021` |
| Kirby | `MenSelchrFaceB.051` |
| Pikachu | `MenSelchrFaceB.071` |

Their nested path is `sc_selcharacter_en/char_bust_tex_lz77/Misc Data [index]/Textures(NW4R)`.
PNG outputs and the source manifest live under `public/assets/ui/`.
The stage tile renders the loaded stage model and its materials at startup.
All fonts and artwork load locally; no external image or audio service is used.

The regular asset preparation command now includes the menu PAC and portrait
export. To regenerate only the portraits on this prepared Windows workspace:

```powershell
C:/Windows/SysWOW64/WindowsPowerShell/v1.0/powershell.exe -NoProfile -File tools/export_ui.ps1
```

## Validation

- **256/256 Node tests pass**, including quick keyboard/touch tap handling,
  local P2 input ordering and clearing held/queued inputs on pause.
- **19/19 selected browser scenarios pass**: six new game-flow scenarios and
  thirteen existing CPU, battle, training and replay scenarios. This is a targeted
  regression run, not the entire browser suite.
- New browser checks cover saved selections/rules, all four portraits, a real
  one-stock CPU match through results/rematch, both keyboards, gamepad menus/P2,
  disconnect pause, help/focus behavior, touch movement and jumping, portrait and
  landscape phone layouts, and asset-load failure/retry presentation.
- TypeScript and the production build pass. The existing large-renderer-bundle
  advisory remains. The Python asset preparation script passes compilation.
- Desktop title, selection, match, pause and results captures and phone title,
  selection, portrait match and landscape match captures were visually inspected.

Logs: `artifacts/build028-unit.log`, `artifacts/build028-browser.log` and
`artifacts/build028-build.log`. Screenshots use `artifacts/build028-*.png`.

```powershell
npm test
npm run build
npx playwright test tests/browser/game-ui.spec.ts tests/browser/cpu-ai.spec.ts tests/browser/battle.spec.ts tests/browser/training.spec.ts
```

Simulation behavior and replay version remain `brawl-lab-027`: this build changes
the player interface, input handling and renderer lifecycle, not combat rules.
Existing reconstructed physics/AI limits are described in the earlier validation
notes. Synthesized cues do not reproduce Brawl's original music or sound effects.
