# Third-party notices and attribution

This repository contains original project code alongside material from other
sources. A license for the original code has not yet been selected. Any future
original-code license must not be read as relicensing the items below.

## Super Smash Bros. Brawl material

Super Smash Bros., its characters, artwork and other game material belong to
their respective rights holders. This project is unaffiliated with Nintendo.

Disc images and the playable exports in `public/assets/` are excluded from Git.
Some game-derived material is tracked: extracted AI and stage data under
`src/data/`, gameplay captures under `public/progress/`, and source excerpts,
identifiers and hashes in research/validation documents. Those files are not
offered under an original-project-code license. Attribution here does not grant
permission to redistribute game material.

## Fonts

The bundled font families use the SIL Open Font License 1.1. Preserve their
copyright and license notices when distributing the fonts:

- [Barlow Condensed](public/fonts/barlowcondensed-OFL.txt), Barlow Project Authors.
- [DM Sans](public/fonts/dmsans-OFL.txt), DM Sans Project Authors.
- [IBM Plex Mono](public/fonts/ibmplexmono-OFL.txt), IBM Corp.

## Three.js and npm dependencies

[Three.js](https://github.com/mrdoob/three.js) is used under the MIT license. Its
notice is included in [public/licenses/three-MIT.txt](public/licenses/three-MIT.txt)
so it accompanies static builds. Other dependencies retain the licenses supplied
in their packages; `package-lock.json` records the resolved packages.

## Asset tooling and references

[BrawlCrate/BrawlLib](https://github.com/soopercool101/BrawlCrate) is an external
tool used by the Windows exporters. The preparation script downloads its pinned
v0.42h1 release; the DLL and installer are not tracked here. Consult its
[upstream license](https://github.com/soopercool101/BrawlCrate/blob/master/LICENSE).

The event and attribute descriptions in `tools/ref/` and the corresponding
`tools/Events.txt` and `tools/Attributes.txt` copies come from
[dantarion/OpenSA3](https://github.com/dantarion/opensa3), under GPLv3. All four
files match the upstream resources after normalizing CRLF line endings. The
[upstream license](third_party/opensa3/LICENSE.txt) and a
[pinned provenance record](third_party/opensa3/provenance.json) are included.
These files retain their GPLv3 terms. `tools/fitdump.py` also records BrawlLib
and OpenSA3 as sources for its format implementation; that provenance must be
considered when selecting terms for the parser and related tooling.

## Dolphin reference experiment

The optional reference tools and `patches/dolphin/` concern an external Dolphin
browser port. Original upstream source and patch context remain subject to
[Dolphin's license](https://github.com/dolphin-emu/dolphin/blob/master/COPYING).
These third-party portions are outside any license applied to original project
code. Downloaded runtimes and reference builds are excluded from Git.

If you identify missing or incorrect attribution, open an issue with the file
path and upstream source so the record can be corrected.
