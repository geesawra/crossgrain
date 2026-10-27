import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import { Window } from 'happy-dom';

const base = (process.env.PAGES_BASE_PATH || '/').replace(/\/?$/, '/');
const sharedPhoto = process.argv.includes('--photo');
const direct = process.argv.includes('--direct') || sharedPhoto;
const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const gallery = `at://${did}/social.grain.gallery/gallery1`;
const photo = `at://${did}/social.grain.photo/photo1`;
const fragment = sharedPhoto ? '#gallery=gallery1&photo=photo1' : '#portfolio';
const directPath = `${base}${did}?view=all${fragment}`;
const window = new Window({
  url: `http://localhost:4173${base}${direct ? `?__crossgrain_route=${encodeURIComponent(directPath)}` : ''}`,
  settings: {
    enableImageFileLoading: false,
    enableJavaScriptEvaluation: false,
    enableCSSFileLoading: false,
  },
});
for (const key of [
  'window',
  'document',
  'HTMLElement',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'MutationObserver',
  'customElements',
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    value: key === 'window' ? window : window[key],
  });
}
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};
globalThis.IntersectionObserver = class {
  observe() {}
  disconnect() {}
};
const fontFaces = [];
const addedFonts = [];
window.FontFace = class {
  constructor(family, source, descriptors) {
    this.family = family;
    this.source = source;
    this.descriptors = descriptors;
    this.loaded = new Promise((resolve) => {
      this.release = () => resolve(this);
    });
    fontFaces.push(this);
  }
  load() {
    return this.loaded;
  }
};
Object.defineProperty(window.document, 'fonts', {
  value: { add: (face) => addedFonts.push(face) },
});
const requests = [];
let releaseProfile;
const profileReady = new Promise((resolve) => {
  releaseProfile = resolve;
});
const avatar = `https://cdn.bsky.app/img/avatar_thumbnail/plain/${did}/bafkreiaaaaa@jpeg`;
const avatars = [];
window.Image = class {
  constructor() {
    const image = window.document.createElement('img');
    image.decode = () => Promise.resolve();
    avatars.push(image);
    return image;
  }
};
globalThis.fetch = async (input) => {
  const url = new URL(String(input));
  requests.push(url);
  if (url.pathname.endsWith('/app.bsky.actor.searchActorsTypeahead')) {
    assert.equal(url.origin, 'https://public.api.bsky.app');
    assert.equal(url.searchParams.get('q'), 'photographer');
    assert.equal(url.searchParams.get('limit'), '5');
    return Response.json({
      actors: [{ did, handle: 'photographer.example', displayName: 'Photographer' }],
    });
  }
  if (url.hostname === 'plc.directory')
    return Response.json({
      id: did,
      alsoKnownAs: ['at://photographer.example'],
      service: [
        {
          id: '#atproto_pds',
          type: 'AtprotoPersonalDataServer',
          serviceEndpoint: 'https://photos.example',
        },
      ],
    });
  const record = {
    uri: gallery,
    value: {
      title: 'A collection',
      description: 'A gallery caption',
      createdAt: '2026-10-01T00:00:00Z',
    },
  };
  if (url.hostname === 'photos.example' && url.pathname.endsWith('/com.atproto.repo.getRecord')) {
    if (url.searchParams.get('collection') === 'app.bsky.actor.profile') {
      await profileReady;
      return Response.json({
        uri: `at://${did}/app.bsky.actor.profile/self`,
        value: { $type: 'app.bsky.actor.profile', avatar: { ref: { $link: 'bafkreiaaaaa' } } },
      });
    }
    return Response.json(record);
  }
  if (url.hostname === 'photos.example')
    return Response.json({
      records: [record],
    });
  assert.equal(url.hostname, 'grain.social');
  return Response.json({
    gallery: {
      uri: gallery,
      items: [
        {
          uri: photo,
          alt: 'An individual photo caption',
          thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/bafkreiaaaaaaaaaaaaa@jpeg`,
          fullsize: `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/bafkreiaaaaaaaaaaaaa@jpeg`,
          aspectRatio: { width: 1200, height: 1800 },
          exif: {
            photo,
            make: 'FUJIFILM',
            model: 'X-T5',
            iSO: 400,
            dateTimeOriginal: '2026-09-30T18:15:00Z',
          },
        },
      ],
    },
  });
};
async function until(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('Built application did not finish rendering');
    await new Promise(setImmediate);
  }
}
try {
  window.document.head.innerHTML = `<link rel="icon" type="image/svg+xml" href="${base}favicon.svg">`;
  window.document.body.innerHTML = '<crossgrain-app></crossgrain-app>';
  const manifest = JSON.parse(readFileSync('dist/.vite/manifest.json', 'utf8'));
  await import(pathToFileURL(resolve('dist', manifest['index.html'].file)).href);
  if (direct) {
    assert.equal(
      window.location.pathname + window.location.search + window.location.hash,
      directPath,
    );
  }
  const app = window.document.querySelector('crossgrain-app');
  await until(() => app.querySelector('main'));
  assert.equal(window.customElements.get('actor-search'), undefined);
  assert.equal(app.hasAttribute('fonts-ready'), false);
  assert.equal(app.inert, true);
  assert.equal(addedFonts.length, 0);
  assert(!app.textContent.includes('Loading'));
  if (direct) {
    await until(() => fontFaces.length === 2 && requests.length === 4);
    assert.equal(app.querySelector('h1')?.textContent, 'photographer.example’s photography');
  } else assert.equal(requests.length, 0);
  const nextFont = fontFaces[0];
  assert.equal(nextFont.family, 'Atkinson Hyperlegible Next');
  assert.equal(nextFont.descriptors.weight, '200 800');
  const fontPath = Object.values(manifest).find(
    (asset) => asset.file.includes('atkinson-hyperlegible-next-') && asset.file.endsWith('.woff2'),
  ).file;
  const fontFile = readFileSync(resolve('dist', fontPath));
  assert.equal(fontFile.subarray(0, 4).toString(), 'wOF2');
  const html = readFileSync('dist/index.html', 'utf8');
  assert(html.includes('<title>crossgrain</title>'));
  assert(html.includes(`href="${base}${fontPath}" as="font"`));
  assert(nextFont.source.includes(fontPath));
  assert.equal(readFileSync('dist/LICENSE', 'utf8'), readFileSync('LICENSE', 'utf8'));
  for (const path of [
    'fonts/OFL.txt',
    'fonts/atkinson-hyperlegible-mono/OFL.txt',
    'licenses/lit-BSD-3-Clause.txt',
  ]) {
    assert.equal(readFileSync(`dist/${path}`, 'utf8'), readFileSync(`public/${path}`, 'utf8'));
  }
  assert.equal(readFileSync('dist/.nojekyll', 'utf8'), '');
  const notFound = readFileSync('dist/404.html', 'utf8');
  assert(notFound.includes('<title>crossgrain</title>'));
  let redirected = '';
  runInNewContext(notFound.match(/<script>([\s\S]*?)<\/script>/)[1], {
    location: {
      pathname: `${base}${did}`,
      search: '?view=all',
      hash: fragment,
      replace: (target) => {
        redirected = target;
      },
    },
  });
  assert.equal(redirected, `${base}?__crossgrain_route=${encodeURIComponent(directPath)}`);
  nextFont.release();
  await until(() => app.hasAttribute('fonts-ready'));
  assert.equal(app.inert, false);
  if (!direct) {
    await until(() => window.document.querySelector('form'));
    assert.equal(fontFaces.length, 1);
    assert.equal(requests.length, 0);
    const input = window.document.querySelector('input');
    input.focus();
    await until(() => input.hasAttribute('aria-controls'));
    input.value = 'photographer';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    await until(() => app.querySelector('[role="option"]'));
    assert.equal(requests.length, 1);
    assert.equal(fontFaces.length, 1);
    assert.equal(input.getAttribute('aria-expanded'), 'true');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', cancelable: true }));
    await until(() => input.hasAttribute('aria-activedescendant'));
    const enter = new KeyboardEvent('keydown', { key: 'Enter', cancelable: true });
    input.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    assert.equal(window.location.pathname, `${base}${did}`);
  }
  await until(() => fontFaces.length === 2 && requests.length === (direct ? 4 : 5));
  assert.equal(window.document.querySelector('photo-card'), null);
  assert(app.querySelector('.gallery-loading[role="status"][aria-hidden="false"]'));
  const monoFont = fontFaces[1];
  assert.equal(monoFont.family, 'Atkinson Hyperlegible Mono');
  assert.equal(monoFont.descriptors.weight, '400');
  const monoPath = Object.values(manifest).find(
    (asset) => asset.file.includes('atkinson-hyperlegible-mono-') && asset.file.endsWith('.woff2'),
  ).file;
  assert(monoFont.source.includes(monoPath));
  assert.equal(readFileSync(resolve('dist', monoPath)).subarray(0, 4).toString(), 'wOF2');
  monoFont.release();
  await until(() => window.document.querySelector('photo-card'));
  assert.equal(app.querySelector('.gallery-loading')?.getAttribute('aria-hidden'), 'true');
  assert.equal(app.querySelector('h1 a'), null, 'A slow optional profile must not delay photos');
  const icon = window.document.querySelector('link[rel="icon"]');
  assert.equal(icon.getAttribute('href'), `${base}favicon.svg`);
  releaseProfile();
  await until(() => app.querySelector('h1 a') && avatars.length === 1);
  assert.equal(app.querySelector('h1 a').href, `https://bsky.app/profile/${did}`);
  assert.equal(avatars[0].src, avatar);
  assert.equal(icon.getAttribute('href'), `${base}favicon.svg`);
  avatars[0].dispatchEvent(new Event('load'));
  await until(() => icon.href === avatar);
  assert.equal(icon.type, 'image/jpeg');
  assert.deepEqual(addedFonts, [nextFont, monoFont]);
  assert(window.document.querySelector('.photo-metadata').textContent.includes('FUJIFILM X-T5'));
  assert.equal(
    window.document.querySelector('h1')?.textContent,
    'photographer.example’s photography',
  );
  assert.equal(window.document.title, 'photographer.example’s photography — crossgrain');
  assert.equal(window.document.querySelectorAll('.gallery-group-title').length, 1);
  assert.equal(
    window.document.querySelector('.gallery-group-heading time').dateTime,
    '2026-09-30T18:15:00Z',
  );
  assert.equal(window.document.querySelectorAll('photo-card time').length, 0);
  if (!sharedPhoto) window.document.querySelector('.photo-open').click();
  await until(() => window.document.querySelector('dialog')?.open);
  const dialog = window.document.querySelector('dialog');
  assert.equal(window.location.hash, '#gallery=gallery1&photo=photo1');
  if (sharedPhoto) {
    assert(!requests.some((url) => url.pathname.endsWith('/com.atproto.repo.listRecords')));
    assert.equal(
      requests.filter(
        (url) =>
          url.searchParams.get('collection') === 'social.grain.gallery' &&
          url.pathname.endsWith('/com.atproto.repo.getRecord'),
      ).length,
      1,
    );
  }
  assert(
    dialog
      .querySelector('img')
      .src.startsWith('https://photos.example/xrpc/com.atproto.sync.getBlob'),
  );
  assert(dialog.querySelector('.image-loading'));
  const image = dialog.querySelector('img');
  const white = dialog.querySelector('input[value="white"]');
  white.checked = true;
  white.dispatchEvent(new Event('change', { bubbles: true }));
  await window.document.querySelector('photo-lightbox').updateComplete;
  assert.equal(dialog.querySelector('.lightbox-image').dataset.background, 'white');
  assert.equal(window.localStorage.getItem('crossgrain.lightbox.background'), 'white');
  assert.equal(dialog.querySelector('img'), image);
  const viewer = window.document.querySelector('photo-lightbox');
  const firstGroup = window.document.querySelector('photo-group');
  const details = dialog.querySelector('.lightbox-details');
  dialog.querySelector('.lightbox-image').click();
  await viewer.updateComplete;
  assert.equal(details.inert, false);
  image.click();
  await viewer.updateComplete;
  assert.equal(details.inert, true);
  assert.equal(details.getAttribute('aria-hidden'), 'true');
  dialog.querySelector('.lightbox-details-toggle').click();
  await viewer.updateComplete;
  assert.equal(details.inert, false);
  assert.equal(details.getAttribute('aria-hidden'), 'false');
  assert.equal(dialog.querySelector('img'), image);
  assert.equal(dialog.querySelector('.grain-link').hostname, 'grain.social');
  dialog.querySelector('.lightbox-close').click();
  assert.equal(window.document.body.style.overflow, '');
  await until(
    () =>
      !window.location.hash &&
      window.document.querySelector('photo-card') &&
      (!sharedPhoto || window.document.querySelector('photo-group') !== firstGroup),
  );
  assert.equal(window.document.querySelector('dialog'), dialog);
  window.history.forward();
  await until(() => dialog.open);
  assert.equal(window.location.hash, '#gallery=gallery1&photo=photo1');
  window.history.back();
  await until(() => !dialog.open);
  window.document.querySelector('.photo-open').click();
  await until(() => dialog.open);
  assert.equal(dialog.querySelector('input[value="white"]').checked, true);
  dialog.querySelector('.lightbox-close').click();
  await until(() => !window.location.hash);
  assert.equal(requests.length, sharedPhoto ? 8 : direct ? 4 : 5);
  if (direct) assert.equal(window.customElements.get('actor-search'), undefined);
  const credit = app.querySelector('.gallery-credit');
  assert.equal(
    app.querySelector('.gallery-heading .gallery-copyright').textContent.trim(),
    `© ${new Date().getFullYear()}`,
  );
  const homeLink = credit.querySelector('a');
  assert.equal(homeLink.getAttribute('href'), base);
  homeLink.click();
  await until(() => app.querySelector('form'));
  assert.equal(window.location.pathname, base);
  const homeCredit = app.querySelector('footer');
  assert(homeCredit.textContent.includes(`© ${new Date().getFullYear()} geesawra`));
  assert.equal(homeCredit.querySelector('a').href, 'https://github.com/geesawra/crossgrain');
  assert.equal(window.document.title, 'crossgrain');
  assert.equal(icon.getAttribute('href'), `${base}favicon.svg`);
  assert.equal(icon.type, 'image/svg+xml');
  console.log(
    `Production ${sharedPhoto ? 'photo link' : direct ? 'direct link' : 'home'} verified at ${base}: lazy account lookup, concurrent fonts and data, progressive gallery, optional profile link, avatar favicon and fallback, licenses, Pages redirect, lightbox controls, shared URLs, and Back/Forward. No browser launched.`,
  );
} finally {
  window.document.body.replaceChildren();
  await window.happyDOM.close();
}
