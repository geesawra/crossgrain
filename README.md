# crossgrain

A personal photo gallery for [Grain](https://grain.social). Enter a handle or DID to see that account’s public photos. Photos keep their shape and stack into columns that fit your screen. Click a photo to open a lightbox with captions, camera settings, and a link to the Grain post.

crossgrain runs entirely in your browser. It uses [Lit](https://lit.dev/) Web Components, TypeScript, and Vite. It needs no backend, sign-in, API key, or database. Lit is the only runtime dependency.

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

The home page has the crossgrain name in bold italic Next, the handle input, and an Open button in the center. A short description says what it does: “A gallery viewer for your grain.social photos. Enter your Atmosphere handle or DID to open your gallery.” A small copyright notice for geesawra and a [GitHub link](https://github.com/geesawra/crossgrain) sit at the bottom. It does not load anyone’s photos until you choose an account. Both `did:plc` and `did:web` work. When you enter a handle, the app checks that it belongs to the account and changes the gallery URL to use its DID.

Type at least two characters to see up to five matching Bluesky accounts. Click a suggestion, or use the up and down arrows and Enter to open it. Escape closes the list. You can also enter a full handle or DID and press Open without choosing a suggestion. Accounts without a Bluesky profile still work through direct entry.

## Build and host

```sh
npm run build
npm run preview -- --port 4173
```

The build goes into `dist/`. JavaScript, CSS, HTML, Lit templates, and the build manifest are minified. Source maps are turned off. The build includes the code, font, and Lit licenses. Both local servers listen on `0.0.0.0`, so other devices on your network can reach them.

## GitHub Pages

In your repository’s **Settings → Pages**, choose **GitHub Actions** as the source. Push to `main` or run the Pages workflow manually. The workflow installs dependencies, runs all checks, and deploys `dist/`. Pull requests run the checks without deploying.

The workflow reads the site path from GitHub Pages. Account sites, custom domains, and project paths such as `https://you.github.io/crossgrain/` all use the right asset and gallery URLs.

GitHub Pages serves `404.html` for direct gallery links. That page redirects to the app, which restores the original gallery URL before showing any text. This also works when you refresh a gallery. The site includes `.nojekyll` so Pages serves the built files as they are.

To check a project-path build locally:

```sh
PAGES_BASE_PATH=/crossgrain/ npm run build
PAGES_BASE_PATH=/crossgrain/ npm run test:build
npm run preview -- --port 4173
```

Open `http://localhost:4173/crossgrain/`. Run `npm run build` again to return to a build at `/`.

## The gallery

Each portfolio starts with “{handle}’s photography.” If the account has a Bluesky profile, the handle is underlined and links to it. Its Bluesky avatar becomes the tab icon once the image is ready. If there is no avatar, or the image fails to load, the tab keeps the crossgrain icon. Returning home restores that icon too.

The portfolio heading uses the same 32px bold italic Next style and tight letter spacing as the home page name. A small “© {year}” sits beside it, with the year updated automatically. The copyright wraps below the title when space is tight. “Want your own?” sits on a separate line and returns to the home page. The credit appears when the portfolio opens, even as more galleries load below.

Each Grain gallery has one title and description above its photos. Gallery titles share the page heading’s bold italic Next styling and tight letter spacing, at a smaller 20px size. Photos stack into columns within each gallery, and the galleries stack into columns too. The page background and text follow your device’s light or dark setting.

Desktop galleries use a wider layout, up to `153.125rem` (2450px at the default 16px root size), with smaller side margins. The width limit and page padding use rem units so they follow your preferred root text size. Galleries stagger beside one another, and each gallery contains two staggered photo columns. A portfolio with just one gallery also keeps two photo columns within it. On narrow screens, photos switch to one column when needed.

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

crossgrain uses two fonts from the [Atkinson Hyperlegible family](https://www.brailleinstitute.org/freefont/). The links below point to the original font projects and the license files included with the site.

| Font                                                                                                                                                      | Used for                                                        | File size | License                                                                      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | --------: | ---------------------------------------------------------------------------- |
| [Atkinson Hyperlegible Next](https://github.com/googlefonts/atkinson-hyperlegible-next/tree/7925f50f649b3813257faf2f4c0b381011f434f1/fonts/webfonts)      | General text, captions, and labels; upright weights 200–800     |  48.19 KB | [SIL Open Font License 1.1](public/fonts/OFL.txt)                            |
| [Atkinson Hyperlegible Mono](https://github.com/googlefonts/atkinson-hyperlegible-next-mono/tree/154d50362016cc3e873eb21d242cd0772384c8f9/fonts/webfonts) | Camera settings, dates, and technical values; regular font file |  22.33 KB | [SIL Open Font License 1.1](public/fonts/atkinson-hyperlegible-mono/OFL.txt) |

In the lightbox, labels such as Camera and Lens use Next. Their values use Mono. Both page titles use Next at 32px, with a bold weight, italic styling, and tight letter spacing.

The site hosts both WOFF2 files and makes no requests to a separate font service. Next starts loading with the page. Mono loads only when you open a gallery, alongside the account data. Text waits until its font is ready, so there is no visible font change or layout jump. If a font fails or takes more than three seconds, that text uses a system font for the rest of the visit. It will not switch fonts later.

Both font files are unchanged. Each font’s original copyright notice (2020–2024) is included with its license.

## How data loads

The home page searches Bluesky’s public [`app.bsky.actor.searchActorsTypeahead` API](https://github.com/bluesky-social/atproto/blob/main/packages/bsky/lexicons/app/bsky/actor/searchActorsTypeahead.json) after a 250 ms pause in typing. It sends no credentials. Starting another search, leaving the field, or opening a gallery cancels pending work. Results stay in memory for five minutes, with a limit of 20 searches. An unavailable search leaves direct handle and DID entry working. Suggestions load account names and small avatars, without fetching their photos.

The browser finds the account’s data server from its DID document. It reads `social.grain.gallery` records in pages of three using `com.atproto.repo.listRecords`. Grain’s public `social.grain.unspecced.getGallery` API supplies the photos and camera details for those galleries. The app does not download the account’s entire photo or EXIF history.

The page shows a small centered spinner while the gallery code and first photos load. It fades out once the first photo group appears, or when loading ends with no photos or an error. It takes no space in the layout and never blocks clicks. The heading appears once the account is known, and each gallery fades in as its metadata arrives. One slow gallery does not hold up the others. Reduced-motion settings stop the spinner’s rotation and turn off the fades.

A separate request checks the same account’s `app.bsky.actor.profile/self` record on its data server. That one record supplies both the heading link and the avatar, which loads through Bluesky’s CDN. This optional lookup never delays the photos. A missing or unavailable profile leaves the heading plain and the crossgrain icon in place.

Photo links use `com.atproto.repo.getRecord` to fetch the named gallery record directly, followed by Grain’s gallery API. Both requests use the account from the URL. Full portfolios and directly opened galleries have separate five-minute caches.

The next page loads near the bottom of the gallery, or when you move past the last loaded photo in the lightbox. Failed requests keep the photos already shown and let you retry. The app skips duplicates and checks for repeated pages. It relies on Grain’s public API and the account’s data server being available. The data server must allow requests from other websites (CORS).

Only public, published galleries are shown. Drafts, unattached uploads, private galleries, and private group spaces are not included. Grain stores EXIF numbers at a scale of 1,000,000, including ISO; the app converts them for display.

Photo data stays in memory for five minutes so return visits are faster. Only the lightbox background choice is saved between visits, under `crossgrain.lightbox.background` in browser storage. Choices saved before the rename still work. There are no analytics, demo accounts, or suggested accounts.

## Code and size

The custom elements share CSS and use the normal page DOM. Lit handles templates and reactive updates for the app, account suggestions, gallery, groups, cards, and lightbox. Small native elements handle masonry layout and image loading. `crossgrain-app` handles the form and browser history. `actor-search` adds the accessible account list while keeping focus in the input. `photo-gallery` loads the data. `photo-lightbox` uses the browser’s modal dialog, with keyboard controls and focus restored on close.

Lit templates run directly in JavaScript and need no template compiler. Vite bundles and minifies the production build; TypeScript checks the source.

The home page loads only the code it needs. Account lookup code loads when the input first gets focus; direct gallery links skip it. Gallery code loads when you open a gallery, and lightbox code loads on the first photo click. New pages add photos without replacing the images already on screen. Leaving a gallery cancels its pending requests. Captions and account names are treated as plain text rather than HTML.

Current JavaScript sizes:

| JavaScript                      | Uncompressed |     gzip |   Brotli |
| ------------------------------- | -----------: | -------: | -------: |
| Home                            |     23.70 KB |  9.68 KB |  8.60 KB |
| Home with account lookup        |     28.76 KB | 11.82 KB | 10.43 KB |
| Gallery, before opening a photo |     49.81 KB | 19.01 KB | 16.93 KB |
| All features                    |     61.60 KB | 23.76 KB | 20.99 KB |

Fonts and CSS are separate from these figures. Actual download sizes depend on the host’s compression settings. Run `npm run size` to update the report. Gzip limits are 10 KB for the home page, 12 KB with account lookup, 19.25 KB for a direct gallery, and 24 KB for all features. The build fails if it exceeds a limit.

## Checks

```sh
npm run check
```

This runs ESLint, including Lit’s recommended rules; Stylelint; Prettier; tests; TypeScript; the production build; size limits; and production checks. Use `npm run format` to format the source, or `npm run lint` to run just the linters and format check. The GitHub Pages workflow also passes `actionlint`.

Tests cover account lookup and suggestions, typing delays, keyboard and click selection, progressive page loading, profile links, avatar icons and fallbacks, layout, image loading, lightbox controls, swipe and tap gestures, saved choices, font loading, Pages routes, shared photo links, and Back/Forward navigation. They also check failures, retries, caching, and cancelling requests. Happy DOM runs the checks without opening a browser.

The production checks run the built JavaScript with sample account data from the home page, a direct portfolio link, and a shared photo link. They check that account lookup loads only when needed, concurrent font and data loading, profile links, avatar icons, included licenses, the Pages redirect, lightbox behavior, and browser history.

## License

crossgrain’s code uses the [MIT License](LICENSE). [Lit](https://github.com/lit/lit) uses the [BSD 3-Clause License](public/licenses/lit-BSD-3-Clause.txt). The fonts keep their separate SIL Open Font License 1.1 licenses: [Next](public/fonts/OFL.txt) and [Mono](public/fonts/atkinson-hyperlegible-mono/OFL.txt).
