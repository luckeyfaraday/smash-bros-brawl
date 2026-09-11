# Deploying to Cloudflare Pages

Build on a machine with prepared assets, then upload `dist` through
[Cloudflare Pages Direct Upload](https://developers.cloudflare.com/pages/get-started/direct-upload/).

## Prepare the output

```sh
npm ci
npm run build
npm run preview
```

Check that the preview loads a match. The build replaces large motion exports
in `dist` with small manifests and groups of whole clips, each at most 20 MiB.
Content hashes identify the chunk filenames. Original exports in `public/assets/`
remain intact for development and offline tests.

The packaging step checks all output against Pages' 25 MiB per-file and
Wrangler's 20,000-file limits. Always use `npm run build` for deployment;
`npm run build:client` only checks compilation and does not package animations.

## Create and deploy

Replace `your-project-name` with an available name:

```sh
npx wrangler login
npx wrangler pages project create your-project-name --production-branch main
npx wrangler pages deploy dist --project-name your-project-name --branch main
```

Create the project once; later updates only need the build and deploy commands.
Cloudflare reports the resulting `pages.dev` URL. No live demo is currently
configured by this repository.

## Git integration

Connecting this repository directly to Pages cannot produce a playable build:
`public/assets/` is excluded from Git. GitHub CI checks source without uploading
game assets or publishing a site. A remote build needs its own asset provisioning
before `npm run build`.

Keep Cloudflare credentials in local authentication storage or deployment secrets.
The code's licensing does not grant rights to distribute game material; see
[third-party notices](../THIRD_PARTY_NOTICES.md).
