# Getting started

## Requirements

- Node.js 24 and npm, plus a browser with WebGL support.
- For asset export: Windows, Python 3.11+, 32-bit Windows PowerShell/.NET
  Framework, and 7-Zip available as `7z` on PATH.
- Your own local Super Smash Bros. Brawl USA Rev 1 game files, as an RVZ or a ZIP
  containing exactly one RVZ. Existing extracted PACs can also be reused.

The exporter requires Windows and x86 BrawlLib. Prepared browser assets can
be used on Windows, macOS and Linux.

## Install the source

```sh
git clone https://github.com/luckeyfaraday/smash-bros-brawl.git
cd smash-bros-brawl
npm ci
npm run check
```

The source checks need only repository files and npm dependencies. Their client
compilation checks imports and bundling; without game assets, the output cannot
run a match.

## Prepare game assets

Run from the repository root in PowerShell, replacing the example game path:

```powershell
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe tools/prepare_assets.py --rvz 'D:\Games\Brawl.rvz'
```

Alternatively, pass `--zip 'D:\Games\Brawl.zip'`. ZIP preparation requires space
for a temporary RVZ plus 512 MB; the source ZIP is preserved. To reuse a complete
`extract/` directory, omit both input options.

The script downloads the pinned BrawlCrate v0.42h1 tool release if its DLL is
missing. It reads game data from the supplied local files and exports all four
fighters, opponent costumes, articles, Final Destination and menu artwork into
`public/assets/`. It rebuilds fighter data and records source hashes in export
manifests. These exports and downloaded tools are excluded from Git.

To regenerate moveset dumps and fighter data from existing PACs:

```powershell
.\.venv\Scripts\python.exe tools/batch_fighters.py
.\.venv\Scripts\python.exe tools/build_data.py
```

The tracked `src/data/` files include extracted AI and stage information. See
[third-party notices](../THIRD_PARTY_NOTICES.md),
[AI provenance](cpu-ai-validation.md) and [stage provenance](stage-validation.md).

## Run

```sh
npm run dev
```

Open the URL printed by Vite. **Ready to Fight** becomes available after assets
finish loading. Use **How to play** for controls. The training room at
`/lab.html` provides frame stepping, timelines and replay export.

## Validation

Without game assets:

```sh
npm run check
```

With prepared assets:

```sh
npm test
npx playwright install chromium
npm run test:browser
npm run build
```

Original-disc parser and AI checks also require extracted PACs:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -p 'test_*.py' -v
.\.venv\Scripts\python.exe -m unittest discover -s tests -p ai_source_test.py
```

To check the built animation manifests and chunks in a browser:

```powershell
npm run build
$env:BRAWL_TEST_BUILD = '1'
npm run test:browser -- tests/browser/game-ui.spec.ts tests/browser/roster.spec.ts
Remove-Item Env:BRAWL_TEST_BUILD
```

On macOS/Linux, prefix the browser test command with `BRAWL_TEST_BUILD=1`.
Production browser checks use port 4174; development checks use 5174. Test
screenshots and other evidence go under the ignored `artifacts/` directory.

## Troubleshooting

| Symptom | Next step |
| --- | --- |
| Asset errors or disabled Fight button | Complete asset preparation and inspect the browser's failed network requests. A source clone alone cannot play. |
| BrawlLib or PowerShell error | Use the Windows x86 exporter; install 7-Zip or put the expected BrawlLib DLL in `.tools/brawlcrate/`. |
| Dependency installation fails | Check `node --version` against Node 24, then run `npm ci` from the root. |
| Playwright cannot launch Chromium | Run `npx playwright install chromium`; Linux may also need `npx playwright install-deps chromium`. |
| Browser test port occupied | Stop the process using the test port before a production browser check. |
| Incorrect rendering | Check hardware acceleration, WebGL support and browser console errors. |

The separate Dolphin reference experiment is paused and not required for this
game. Its historical instructions are in [reference validation](reference-validation.md).
