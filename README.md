# Photoshow

A personal photo gallery for [Grain](https://grain.social). Enter a handle or DID to see that account’s public photos. Photos keep their shape and stack into columns that fit your screen. Click a photo to open a lightbox with captions, camera settings, and a link to the Grain post.

Photoshow runs entirely in your browser. It uses [Lit](https://lit.dev/) Web Components, TypeScript, and Vite. It needs no backend, sign-in, API key, or database. Lit is the only runtime dependency.

## Run locally

Use Node.js 24 or newer.

```sh
npm ci
npm run dev
```

Open the URL printed by Vite. Enter your handle or DID, or open a gallery directly:

```text
http://localhost:5173/did:plc:your-account-did
```

The home page shows only the input and an Open button. It does not load anyone’s photos until you choose an account. Both `did:plc` and `did:web` work. When you enter a handle, the app checks that it belongs to the account and changes the gallery URL to use its DID.

## Build and host

```sh
npm run build
npm run preview -- --port 4173
```

The build goes into `dist/`. JavaScript, CSS, HTML, Lit templates, and the build manifest are minified. Source maps are turned off. The build includes the code, font, and Lit licenses. Both local servers listen on `0.0.0.0`, so other devices on your network can reach them.

## GitHub Pages

In your repository’s **Settings → Pages**, choose **GitHub Actions** as the source. Push to `main` or run the Pages workflow manually. The workflow installs dependencies, runs all checks, and deploys `dist/`. Pull requests run the checks without deploying.

The workflow reads the site path from GitHub Pages. Account sites, custom domains, and project paths such as `https://you.github.io/photoshow/` all use the right asset and gallery URLs.

GitHub Pages serves `404.html` for direct gallery links. That page redirects to the app, which restores the original gallery URL before showing any text. This also works when you refresh a gallery. The site includes `.nojekyll` so Pages serves the built files as they are.

To check a project-path build locally:

```sh
PAGES_BASE_PATH=/photoshow/ npm run build
PAGES_BASE_PATH=/photoshow/ npm run test:build
npm run preview -- --port 4173
```

Open `http://localhost:4173/photoshow/`. Run `npm run build` again to return to a build at `/`.

## The gallery

Each portfolio starts with “{handle}’s photography.” Each Grain gallery has one title and description above its photos. Photos stack into columns within each gallery, and the galleries stack into columns too. The page background and text follow your device’s light or dark setting.

The capture date appears beside each gallery name. Galleries with photos from different days show a date range. Missing or invalid capture dates are left out. Photo captions show the photo’s own text and available camera settings (EXIF). Post dates help sort photos but are not shown. Photos marked as sensitive need a tap before they appear.

Photos load through Bluesky’s CDN, with larger versions for sharper screens. Images farther down the page load as you scroll. Each image keeps its space while loading and fades in once it is fully ready. If you prefer reduced motion, the fade is turned off. If a CDN image fails, the app tries the original file on the account’s data server.

## The lightbox

Click a photo to open it at full resolution. A loading indicator stays visible until the image is ready. If the original file fails, the app tries the large CDN version once.

Use the arrows or your keyboard’s left and right keys to move between photos. On a touch screen, swipe left or right across the image. Vertical movements and pinch-to-zoom stay with the browser. Press Escape, click outside the lightbox, or use the close button to leave. The details panel shows captions, camera settings, and a link to the Grain post.

Tap the image itself or use the details button to hide or show the details. Tapping the space around the photo does nothing. The pane slides and fades in or out; reduced-motion settings turn off the transition. That choice stays the same as you move between photos. Swiping does not toggle details. The image has space around it and a size limit, even when details are hidden. On mobile, the image and controls stay in place while the details scroll on their own. The details return to the top when you choose another photo. Exact capture timestamps stay in the lightbox.

Two swatches beside the arrows let you choose a gray (`#777`) or white (`#fff`) image background. The background changes smoothly, or instantly if you prefer reduced motion. The swatches work when details are hidden too. The choice is saved in your browser. If saving is blocked, you can still change it for the current visit.

The gray is close to L*50, the neutral middle gray recommended in [FADGI’s photo-viewing guidance, section 2.6.2](https://www.digitizationguidelines.gov/guidelines/FADGITechnicalGuidelinesforDigitizingCulturalHeritageMaterials_ThirdEdition_05092023.pdf#page=24). The white is plain, untinted white, also used in [Adobe Spectrum’s neutral palette](https://github.com/adobe/spectrum-design-data/blob/main/docs/markdown/tokens/color-palette.md). There is no single white value required for web lightboxes.

## Share a photo

Open a photo and copy the URL from your address bar. It includes the account’s DID, gallery key, and photo key:

```text
/{did}#gallery={gallery-key}&photo={photo-key}
```

The URL follows the selected photo as you use the arrows or swipe. Back closes the lightbox in one step; Forward opens it again. Escape, the close button, and a click outside the lightbox also return to the portfolio. Refreshing or opening a copied link opens the selected photo automatically. These links work under GitHub Pages project paths too.

A shared link loads only its named gallery first, so an older photo can open without paging through the account’s history. You can move through that gallery’s photos, then close the lightbox to browse the full portfolio. When you open a photo from the portfolio, navigation continues across its progressively loaded galleries. Missing photos or galleries show an error with Retry and View portfolio options.

## Fonts

Photoshow uses two fonts from the [Atkinson Hyperlegible family](https://www.brailleinstitute.org/freefont/). The links below point to the original font projects and the license files included with the site.

| Font                                                                                                                                                      | Used for                                                           | File size | License                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ | --------: | ---------------------------------------------------------------------------- |
| [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next/tree/7925f50f649b3813257faf2f4c0b381011f434f1/fonts/webfonts)      | General text, captions, and labels; upright weights 200–800        |  48.19 KB | [SIL Open Font License 1.1](public/fonts/OFL.txt)                            |
| [Atkinson Hyperlegible Mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono/tree/154d50362016cc3e873eb21d242cd0772384c8f9/fonts/webfonts) | Camera settings, dates, and other technical values; regular weight |  22.33 KB | [SIL Open Font License 1.1](public/fonts/atkinson-hyperlegible-mono/OFL.txt) |

In the lightbox, labels such as Camera and Lens use Next. Their values use Mono.

The site hosts both WOFF2 files and makes no requests to a separate font service. Next starts loading with the page. Mono loads only when you open a gallery, while the account data loads. Text waits until its font is ready, so there is no visible font change or layout jump. If a font fails or takes more than three seconds, that text uses a system font for the rest of the visit. It will not switch fonts later.

Both font files are unchanged. Each font’s original copyright notice (2020–2024) is included with its license.

## How data loads

The browser finds the account’s data server from its DID document. It reads `social.grain.gallery` records in pages of three using `com.atproto.repo.listRecords`. Grain’s public `social.grain.unspecced.getGallery` API supplies the photos and camera details for those galleries. The app does not download the account’s entire photo or EXIF history.

Photo links use `com.atproto.repo.getRecord` to fetch the named gallery record directly, followed by Grain’s gallery API. Both requests use the account from the URL. Full portfolios and directly opened galleries have separate five-minute caches.

The next page loads near the bottom of the gallery, or when you move past the last loaded photo in the lightbox. Failed requests keep the photos already shown and let you retry. The app skips duplicates and checks for repeated pages. It relies on Grain’s public API and the account’s data server being available. The data server must allow requests from other websites (CORS).

Only public, published galleries are shown. Drafts, unattached uploads, private galleries, and private group spaces are not included. Grain stores EXIF numbers at a scale of 1,000,000, including ISO; the app converts them for display.

Photo data stays in memory for five minutes so return visits are faster. Only the lightbox background choice is saved between visits, under `photoshow.lightbox.background` in browser storage. There are no analytics, demo accounts, or suggested accounts.

## Code and size

The custom elements share CSS and use the normal page DOM. Lit handles templates and reactive updates for the app, gallery, groups, cards, and lightbox. Small native elements handle masonry layout and image loading. `photo-show` handles the form and browser history. `photo-gallery` loads the data. `photo-lightbox` uses the browser’s modal dialog, with keyboard controls and focus restored on close.

Lit templates run directly in JavaScript and need no template compiler. Vite bundles and minifies the production build; TypeScript checks the source.

The home page loads only the code it needs. Gallery code loads when you open a gallery, and lightbox code loads on the first photo click. New pages add photos without replacing the images already on screen. Leaving a gallery cancels its pending requests. Captions are treated as plain text rather than HTML.

Current JavaScript sizes:

| JavaScript                      | Uncompressed |     gzip |   Brotli |
| ------------------------------- | -----------: | -------: | -------: |
| Home                            |     22.29 KB |  8.65 KB |  7.73 KB |
| Gallery, before opening a photo |     46.03 KB | 17.29 KB | 15.46 KB |
| Including the lightbox          |     52.68 KB | 19.87 KB | 17.66 KB |

Fonts and CSS are separate from these figures. Actual download sizes depend on the host’s compression settings. Run `npm run size` to update the report. The build fails if the gallery JavaScript exceeds 18 KB with gzip, or all JavaScript exceeds 20 KB with gzip.

## Checks

```sh
npm run check
```

This runs ESLint, including Lit’s recommended rules; Stylelint; Prettier; tests; TypeScript; the production build; size limits; and production checks. Use `npm run format` to format the source, or `npm run lint` to run just the linters and format check. The GitHub Pages workflow also passes `actionlint`.

Tests cover account lookup, page loading, layout, image loading, lightbox controls, swipe and tap gestures, saved choices, font loading, Pages routes, shared photo links, and Back/Forward navigation. They also check failures, retries, and cancelling requests. Happy DOM runs the checks without opening a browser.

The production checks run the built JavaScript with sample account data from the home page, a direct portfolio link, and a shared photo link. They check font readiness, deferred Mono loading, included licenses, the Pages redirect, lightbox behavior, and browser history.

## License

Photoshow’s code uses the [MIT License](LICENSE). [Lit](https://github.com/lit/lit) uses the [BSD 3-Clause License](public/licenses/lit-BSD-3-Clause.txt). The fonts keep their separate SIL Open Font License 1.1 licenses: [Next](public/fonts/OFL.txt) and [Mono](public/fonts/atkinson-hyperlegible-mono/OFL.txt).
