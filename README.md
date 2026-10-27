# crossgrain

A client-side gallery viewer for [grain.social](https://grain.social). Enter your Atmosphere handle or DID to browse your photos in a responsive masonry gallery, with captions, camera details, and a lightbox.

## Run locally

Requires Node.js 24 or newer.

```sh
npm ci
npm run dev
```

`npm run check` runs the linters, tests, and build checks. `npm run build` creates the minified site in `dist/`; `npm run preview` serves it locally.

## Deploy

For GitHub Pages, select **GitHub Actions** under **Settings → Pages**, then push to `main`. The included workflow builds and deploys the site.

## License and fonts

Code: [MIT](LICENSE). [Lit](https://lit.dev/) uses the [BSD 3-Clause License](public/licenses/lit-BSD-3-Clause.txt).

The self-hosted fonts use the SIL Open Font License 1.1:

- [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next) — [license](public/fonts/OFL.txt).
- [Atkinson Hyperlegible Mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono) — [license](public/fonts/atkinson-hyperlegible-mono/OFL.txt).
