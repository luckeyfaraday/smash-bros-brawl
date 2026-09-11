# Contributing

Thank you for helping improve Brawl Browser Lab. Read the [roadmap](docs/roadmap.md)
and [code of conduct](CODE_OF_CONDUCT.md) first. The working scope is four fighters
and Final Destination; discuss substantial changes in an issue before building them.

## Development setup

Follow [getting started](docs/getting-started.md). Use Node.js 24 and `npm ci`.
A source-only change can be checked without local game exports:

```sh
npm run check
```

For combat, rendering, loading or input changes, prepare your own assets and run
the relevant simulation/browser tests. `npm test` runs all unit and simulation
tests; `npm run test:browser` runs the browser suite. Build/deployment changes
also need `npm run build` and production browser checks.

## Changes and evidence

- Keep pull requests focused, explain the user-visible behavior, and follow the
  surrounding code style. Avoid unrelated formatting changes.
- Reproduce bugs with concrete steps, fighter choices, controls and expected vs.
  actual behavior. Include the commit and browser/OS when relevant.
- Record which checks ran and what could not be verified. A green source CI run
  does not prove gameplay accuracy.
- For behavior inferred from game files, record source identifiers/hashes and
  distinguish extracted facts from reconstructed rules.
- Add regression coverage for meaningful behavior changes. Tests requiring game
  files belong in the asset-dependent suite. Add independent tests to
  `test:unit` when they need no exports.
- Update the appropriate documentation and preserve existing attribution.

Do not commit disc images, playable exports, credentials, downloaded tool binaries
or local test output. Existing ignore rules cover these files. Describe asset
problems using paths, hashes and reproduction steps rather than uploading game
files to issues or pull requests.

## Pull requests

Create a branch from `main`, use a descriptive commit title, and fill out the
pull request template. Include screenshots for interface changes and exact
validation commands. Maintainers may request changes or defer work outside the
current scope.

There is no required CLA or paid contribution process. By submitting original
code or documentation, you agree to distribute it under this project's
[MIT license](LICENSE). Changes to third-party material must preserve that
material's applicable terms, including GPLv3 for OpenSA3 references. Do not
contribute work whose terms you cannot pass on. See [asset rights](ASSET_NOTICE.md)
and [third-party notices](THIRD_PARTY_NOTICES.md) for the exclusions and attribution.

## Reporting problems

Use [GitHub issues](https://github.com/luckeyfaraday/smash-bros-brawl/issues/new/choose)
for bugs and proposals. Follow [SECURITY.md](SECURITY.md) for vulnerabilities;
keep exploit details and sensitive information out of public issues.
