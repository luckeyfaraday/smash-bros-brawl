# Deploying to Cloudflare Pages

The repository is configured for [Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/),
using the same local build-and-upload workflow as Claude of Duty. Build on a
machine with prepared game assets, then upload the static output in `dist`.
No server, database or runtime secrets are required.

[`wrangler.jsonc`](../wrangler.jsonc) sets the project name to `smash-bros-brawl`
and the output directory to `dist`. Wrangler is pinned in `package.json` and
installed by `npm ci`. Change the configuration's name before creating the
project if you want a different name.

The prepared project's address is `https://smash-bros-brawl.pages.dev/`.
It becomes available after the first deployment.

## Prepare the output

```sh
npm ci
npm run cloudflare:dev
```

Open `http://127.0.0.1:8788` and check that the preview loads a match. This command
builds first, then serves the result with the local Cloudflare Pages runtime.
For packaging without starting a server, use `npm run cloudflare:stage`.

The build replaces large motion exports
in `dist` with small manifests and groups of whole clips, each at most 20 MiB.
Content hashes identify the chunk filenames. Original exports in `public/assets/`
remain intact for development and offline tests.

The packaging step checks all output against Pages' 25 MiB per-file and
Wrangler's 20,000-file limits. Always use `npm run build` for deployment;
`npm run build:client` only checks compilation and does not package animations.

The output also includes Cloudflare's [`_headers` rules](https://developers.cloudflare.com/pages/configuration/headers/):
animation manifests revalidate and content-hashed animation chunks are cached
for a year. Other files keep Pages' default cache behavior. A top-level
`404.html` ensures missing files return a real 404, so the game can report an
asset-loading failure. Pages serves training at `/lab` and redirects `/lab.html`
there according to its [static route matching](https://developers.cloudflare.com/pages/configuration/serving-pages/).

To run the automated Pages checks, including loading a match and training:

```sh
npx playwright install chromium
npm run test:pages
```

The tests build the site and start their own local Pages server on port 4175.
They check animation manifests, chunk cache headers, missing-file responses
and the playable entry points. No Cloudflare login is needed for local checks.

## Create and deploy

Authenticate and create the project once (use the name in `wrangler.jsonc`):

```sh
npx wrangler login
npx wrangler pages project create smash-bros-brawl --production-branch main --force
```

Skip login when `npx wrangler whoami` already reports the intended account.
Skip project creation if it already exists in that account. In the pinned
Wrangler version, `--force` on initial creation keeps the new project on Pages
when running through an agent; otherwise the CLI may route creation to Workers.
Existing Pages projects use the normal deploy command below.

Creating a Direct Upload project selects that deployment method; Cloudflare does not support
switching the same project to Git integration later.

Publish the first build and every later update with:

```sh
npm run cloudflare:deploy
```

The deploy command rebuilds, validates the output and uploads it to the `main`
production branch. Cloudflare prints the deployment URL and assigned `pages.dev`
domain; the exact domain can include a suffix if the name is already taken.
Verify the game and `/lab` at that URL. A successful local build or GitHub push
does not publish the site.

## Git integration

Connecting this repository directly to Pages cannot produce a playable build:
`public/assets/` is excluded from Git. GitHub CI checks source without uploading
game assets or publishing a site. A remote build needs its own asset provisioning
before `npm run build`.

Keep Cloudflare credentials in local authentication storage or deployment secrets.
The code's licensing does not grant rights to distribute game material; see
[third-party notices](../THIRD_PARTY_NOTICES.md).
