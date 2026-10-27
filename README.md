# Photoshow

A single-page photo portfolio for [Grain](https://grain.social). Give it a DID or handle and it arranges the account’s public photographs in a responsive masonry gallery, with captions, descriptions, dates, and available EXIF data. Clicking a photo opens a lightbox with its metadata and a link to the original Grain post.

Built with React, TypeScript, and Vite. All data is fetched in the visitor’s browser. There is no application backend, account system, API key, or database.

## Run locally

Requires Node.js 22.18 or newer.

```sh
npm install
npm run dev
```

Open the URL printed by Vite. The home page contains a handle/DID input and an Open button. It makes no account requests and shows no photographs. Open your own portfolio with the form or visit:

```text
http://localhost:5173/did:plc:your-account-did
```

Handles also work and are verified against the resolved DID document. Both `did:plc` and `did:web` are supported. The canonical, shareable gallery URL uses the DID.

## Production

```sh
npm run build
npm run preview -- --port 4173
```

The static output is in `dist/`. JavaScript is minified with Oxc, CSS with Lightning CSS, and HTML with html-minifier-terser. The app uses system fonts and source maps are disabled. Photos load through Bluesky’s CDN with thumbnail and high-density variants, preserving their original aspect ratios. If a CDN image fails, it falls back once to the original on the owner’s data server. Images outside the initial view are lazy loaded.

Deploy `dist/` to any static host. The host must serve `index.html` for gallery URLs, such as `/did:plc:…`, so direct links and refreshes work. The included `public/_redirects` configures this on Netlify and Cloudflare Pages; the root `vercel.json` configures Vercel. For nginx:

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

The production preview server already supports this fallback.

## Data and behavior

The browser resolves a DID through `plc.directory` or its `did:web` document and discovers its HTTPS Personal Data Server. It reads `social.grain.gallery` records in pages of three posts using `com.atproto.repo.listRecords`. For just those posts, Grain’s public `social.grain.unspecced.getGallery` API supplies the referenced photo metadata and EXIF. The browser does not scan the complete photo, attachment, or EXIF collections.

Metadata for the next page is fetched near the bottom of the loaded gallery, or when advancing beyond the last loaded photo in the lightbox. Failed requests retain the current photographs and cursor for retry; duplicate photos and repeated cursor cycles are detected. This depends on the public Grain API being available and having indexed the posts. There is no Photoshow backend.

Only published galleries are included. Unattached uploads, discarded drafts, private galleries, and authenticated group spaces are outside the scope of this public gallery.

EXIF numbers use Grain’s scale of 1,000,000, including ISO. Only capture dates are displayed; post timestamps are used internally for ordering. Hovering a capture date reveals its full local timestamp. Shared camera details appear as a small line in the caption. Missing values are omitted. Self-labelled sensitive photographs require a tap to reveal.

The gallery has no site navigation, profile header, branding, toolbar, or footer. Photos are grouped by their Grain gallery, with a single title and description above each group. Each group has a masonry photo layout, and the groups themselves occupy a second masonry layout. A thin separator and whitespace distinguish galleries. Photo captions contain only photo-specific text, capture dates, and camera details.

The background and text follow the OS light/dark preference. Each new page appears newest first; each masonry item goes into the shortest column, with photos retaining their original proportions. Identical card heights can naturally align. More galleries appear automatically as the visitor scrolls. Data is cached in memory for five minutes. Nothing is persisted, and there are no analytics or remote font requests.

Images reserve their aspect ratio and fade in only after loading and decoding, without shifting the layout. Reduced-motion preferences disable the transition. The lightbox fills nearly the whole viewport, supports arrow-key navigation and Escape, and lets viewers hide the metadata to give the image the full width. Metadata visibility stays as selected while navigating photos in the open lightbox.

The lightbox requests the original-resolution file from the owner’s data server. A small loading indicator stays visible until the image is fully decoded, then the image fades in. If the original fails, it tries the large CDN version once. The gallery continues to use CDN thumbnails.

Only the account explicitly requested in the URL or form is loaded. There are no demo, featured, or suggested accounts. As with any fully client-side site, the account’s data server must permit cross-origin browser requests. Connection failures and empty galleries have simple status messages.

## Verify

```sh
npm test
npm run build
```

The tests cover DID and handle verification, no requests without an explicit account, CDN URLs, photo/gallery/EXIF joins, EXIF conversion, metadata page boundaries, retries, deduplication, repeated cursor detection, and cancelled requests. They do not launch a browser.
