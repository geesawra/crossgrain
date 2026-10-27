import { after, afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { Photo } from '../lib/grain.ts';
import { formatDate, groupPhotos } from '../lib/grain.ts';

// A DOM emulator exercises custom-element lifecycle and events. No browser is launched.
const dom = new Window({
  url: 'http://localhost:4173/',
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
  'HTMLImageElement',
  'HTMLDialogElement',
  'Event',
  'CustomEvent',
  'KeyboardEvent',
  'MouseEvent',
  'MutationObserver',
  'customElements',
]) {
  Object.defineProperty(globalThis, key, {
    configurable: true,
    writable: true,
    value: key === 'window' ? dom : dom[key as keyof Window],
  });
}
const frames = new Map<number, FrameRequestCallback>();
let frameId = 0;
globalThis.requestAnimationFrame = (callback) => {
  frames.set(++frameId, callback);
  return frameId;
};
globalThis.cancelAnimationFrame = (id) => {
  frames.delete(id);
};

class ResizeMock {
  static instances = new Set<ResizeMock>();
  targets = new Set<Element>();
  private callback: ResizeObserverCallback;
  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeMock.instances.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  unobserve(target: Element) {
    this.targets.delete(target);
  }
  disconnect() {
    this.targets.clear();
  }
  trigger() {
    this.callback([], this as unknown as ResizeObserver);
  }
}
class IntersectionMock {
  static instances = new Set<IntersectionMock>();
  targets = new Set<Element>();
  private callback: IntersectionObserverCallback;
  constructor(callback: IntersectionObserverCallback) {
    this.callback = callback;
    IntersectionMock.instances.add(this);
  }
  observe(target: Element) {
    this.targets.add(target);
  }
  disconnect() {
    this.targets.clear();
  }
  trigger() {
    this.callback(
      [...this.targets].map((target) => ({
        target,
        isIntersecting: true,
      })) as IntersectionObserverEntry[],
      this as unknown as IntersectionObserver,
    );
  }
}
Object.defineProperty(globalThis, 'ResizeObserver', { configurable: true, value: ResizeMock });
Object.defineProperty(globalThis, 'IntersectionObserver', {
  configurable: true,
  value: IntersectionMock,
});

await import('./app.ts');
await import('./gallery.ts');
await import('./lightbox.ts');

const originalFetch = globalThis.fetch;
const imageDecode = dom.HTMLImageElement.prototype.decode;
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
async function until(predicate: () => unknown) {
  const deadline = Date.now() + 2000;
  while (!predicate()) {
    if (Date.now() > deadline) throw new Error('DOM update did not complete');
    await tick();
  }
}
function flushLayouts() {
  const pending = [...frames.values()];
  frames.clear();
  pending.forEach((callback) => callback(0));
}

function pointer(
  target: Element,
  type: string,
  x: number,
  y: number,
  options: PointerEventInit = {},
  time?: number,
) {
  const event = new dom.PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    pointerType: 'touch',
    pointerId: 1,
    isPrimary: true,
    clientX: x,
    clientY: y,
    ...options,
  });
  if (time !== undefined) Object.defineProperty(event, 'timeStamp', { value: time });
  target.dispatchEvent(event);
  return event;
}
function swipe(target: Element, dx: number, dy = 0) {
  pointer(target, 'pointerdown', 200, 150, {}, 100);
  pointer(target, 'pointerup', 200 + dx, 150 + dy, {}, 300);
}

let sequence = 0;
function repository() {
  const did = `did:plc:${'abcdefghijklmnopqrstuvwxyz234567'[sequence++].repeat(24)}`;
  const handle = `photographer${sequence}.example`;
  const requests: { url: URL; signal?: AbortSignal | null }[] = [];
  const options = {
    failNext: false,
    holdNext: false,
    holdLinked: false,
    failLinked: false,
    missingLinked: false,
  };
  let release: (() => void) | undefined;
  const photoUri = (n: number) => `at://${did}/social.grain.photo/photo${n}`;
  const galleryUri = (n: number) => `at://${did}/social.grain.gallery/gallery${n}`;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    requests.push({ url, signal: init?.signal });
    if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (url.hostname === 'public.api.bsky.app') return json({ did });
    if (url.hostname === 'plc.directory')
      return json({
        id: did,
        alsoKnownAs: [`at://${handle}`],
        service: [
          {
            id: '#atproto_pds',
            type: 'AtprotoPersonalDataServer',
            serviceEndpoint: 'https://photos.example',
          },
        ],
      });
    if (url.hostname === 'photos.example') {
      if (url.pathname.endsWith('/com.atproto.repo.getRecord')) {
        if (options.holdLinked)
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
        if (options.failLinked) return json({}, 503);
        if (options.missingLinked) return json({}, 404);
        const number = url.searchParams.get('rkey') === 'gallery2' ? 2 : 1;
        return json({
          uri: galleryUri(number),
          value: {
            title: `Gallery ${number}`,
            description: 'Shared description',
            createdAt: '2026-09-01T00:00:00Z',
          },
        });
      }
      const next = !!url.searchParams.get('cursor');
      if (next && options.holdNext)
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      if (next && options.failNext) return json({}, 503);
      return json({
        records: [
          {
            uri: galleryUri(next ? 2 : 1),
            value: {
              title: `Gallery ${next ? 2 : 1}`,
              description: 'Shared description',
              createdAt: next ? '2026-09-01T00:00:00Z' : '2026-10-01T00:00:00Z',
            },
          },
        ],
        ...(!next ? { cursor: 'next' } : {}),
      });
    }
    assert.equal(url.hostname, 'grain.social');
    const next = url.searchParams.get('gallery') === galleryUri(2);
    return json({
      gallery: {
        uri: galleryUri(next ? 2 : 1),
        items: (next ? [3] : [1, 2]).map((n) => ({
          uri: photoUri(n),
          thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/${did}/bafkreiaaaaa${'abc'[n - 1]}@jpeg`,
          fullsize: `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/bafkreiaaaaa${'abc'[n - 1]}@jpeg`,
          alt: `Photo ${n} caption`,
          aspectRatio: { width: 1200, height: 1800 },
          exif: {
            photo: photoUri(n),
            model: 'X-T5',
            make: 'FUJIFILM',
            fNumber: 'f/2.8',
            exposureTime: '1/250s',
            iSO: 400,
            dateTimeOriginal: '2026-09-30T18:15:00Z',
          },
        })),
      },
    });
  }) as typeof fetch;
  return { did, handle, requests, options, release: () => release?.() };
}

const photo: Photo = {
  id: 'photo1',
  src: 'https://cdn.bsky.app/thumb',
  fullSrc: 'https://cdn.bsky.app/full',
  originalSrc: 'https://photos.example/original',
  alt: 'A photograph',
  width: 1200,
  height: 1800,
  title: 'Shared gallery title',
  description: 'Shared description',
  caption: 'Individual caption',
  publishedAt: '2026-10-01T12:00:00Z',
  takenAt: '2026-09-30T18:15:00Z',
  href: 'https://grain.social/profile/test/gallery/test',
  galleryId: 'gallery1',
  camera: 'FUJIFILM X-T5',
  exif: { photo: 'photo1', fNumber: 2_800_000, exposureTime: 4_000, iSO: 400_000_000 },
};
const state = (selected = photo) => ({
  photo: selected,
  canPrevious: false,
  canNext: true,
  loadingNext: false,
  error: '',
});

beforeEach(() => {
  dom.history.replaceState({}, '', '/');
  dom.document.body.style.overflow = '';
  dom.localStorage.clear();
  dom.localStorage.setItem('photoshow.lightbox.background', 'gray');
  globalThis.fetch = (async () => {
    throw new Error('Unexpected account request');
  }) as typeof fetch;
});
afterEach(async () => {
  dom.document.body.replaceChildren();
  await tick();
  frames.clear();
  ResizeMock.instances.clear();
  IntersectionMock.instances.clear();
  dom.HTMLImageElement.prototype.decode = imageDecode;
  globalThis.fetch = originalFetch;
});
after(async () => {
  await dom.happyDOM.close();
});

describe('Lit app and paged galleries', () => {
  it('renders just the handle form on home and never requests a default account', async () => {
    let calls = 0;
    globalThis.fetch = (async () => {
      calls++;
      return json({});
    }) as typeof fetch;
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await tick();
    assert.equal(app.querySelectorAll('input').length, 1);
    assert.equal(app.querySelector('input')?.placeholder, 'your handle here');
    assert.equal(app.querySelectorAll('img, h1, nav, footer, header').length, 0);
    assert.equal(calls, 0);
    app.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await tick();
    assert.equal(app.querySelector('input')?.getAttribute('aria-invalid'), 'true');
    assert.equal(calls, 0);
  });
  it('opens a handle, canonicalizes the DID URL, and adds the photography title', async () => {
    const api = repository();
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await tick();
    app.querySelector('input')!.value = api.handle;
    app.querySelector('form')!.dispatchEvent(new Event('submit', { cancelable: true }));
    await until(() => app.querySelector('photo-card'));
    assert.equal(dom.location.pathname, `/${api.did}`);
    assert.equal(app.querySelector('h1')?.textContent, `${api.handle}’s photography`);
    assert.equal(app.querySelectorAll('photo-group').length, 1);
    assert.equal(app.querySelectorAll('.gallery-group-title').length, 1);
    assert.equal(app.querySelectorAll('.gallery-group-date time').length, 1);
    assert.equal(app.querySelectorAll('photo-card time').length, 0);
    assert.equal(app.querySelectorAll('photo-card').length, 2);
    assert(!app.textContent?.includes('Posted'));
    assert(!api.requests.some(({ url }) => url.searchParams.has('cursor')));
    assert.equal(app.querySelector('img')?.getAttribute('loading'), 'eager');
  });
  it('loads the next page at the scroll sentinel without rebuilding existing photos', async () => {
    const api = repository();
    const gallery = dom.document.createElement('photo-gallery');
    gallery.actor = api.did;
    dom.document.body.append(gallery);
    await until(() => gallery.querySelectorAll('photo-card').length === 2);
    const firstCard = gallery.querySelector('photo-card');
    const firstImage = gallery.querySelector('img');
    const observer = [...IntersectionMock.instances].find((item) => item.targets.size)!;
    observer.trigger();
    observer.trigger();
    await until(() => gallery.querySelectorAll('photo-card').length === 3);
    assert.equal(gallery.querySelectorAll('photo-group').length, 2);
    assert.equal(gallery.querySelector('photo-card'), firstCard);
    assert.equal(gallery.querySelector('img'), firstImage);
    assert.equal(api.requests.filter(({ url }) => url.searchParams.has('cursor')).length, 1);
    assert.equal(gallery.querySelector<HTMLElement>('.gallery-sentinel')?.hidden, true);
  });
  it('retains photos and allows retry after a later metadata request fails', async () => {
    const api = repository();
    api.options.failNext = true;
    const gallery = dom.document.createElement('photo-gallery');
    gallery.actor = api.did;
    dom.document.body.append(gallery);
    await until(() => gallery.querySelector('photo-card'));
    await gallery.loadMore();
    assert.equal(gallery.querySelectorAll('photo-card').length, 2);
    assert(
      gallery.querySelector('.pagination-status [role="alert"]')?.textContent?.includes('503'),
    );
    api.options.failNext = false;
    gallery.querySelector<HTMLButtonElement>('.pagination-status button')!.click();
    await until(() => gallery.querySelectorAll('photo-card').length === 3);
    assert.equal(gallery.querySelector<HTMLElement>('.pagination-status')?.hidden, true);
  });
  it('uses cached metadata on a return visit, without fetching another account', async () => {
    const api = repository();
    const gallery = dom.document.createElement('photo-gallery');
    gallery.actor = api.did;
    dom.document.body.append(gallery);
    await until(() => gallery.querySelector('photo-card'));
    const calls = api.requests.length;
    gallery.remove();
    const returned = dom.document.createElement('photo-gallery');
    returned.actor = api.did;
    dom.document.body.append(returned);
    await until(() => returned.querySelector('photo-card'));
    assert.equal(api.requests.length, calls);
  });
  it('aborts requests and disconnects observers when navigating away', async () => {
    const api = repository();
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    app.navigate(api.did);
    await until(() => app.querySelector('photo-card'));
    const gallery = app.querySelector('photo-gallery')!;
    api.options.holdNext = true;
    const pending = gallery.loadMore();
    await until(() => api.requests.some(({ url }) => url.searchParams.has('cursor')));
    app.navigate('');
    await tick();
    const request = api.requests.find(({ url }) => url.searchParams.has('cursor'))!;
    assert.equal(request.signal?.aborted, true);
    assert([...IntersectionMock.instances].every((item) => item.targets.size === 0));
    assert([...ResizeMock.instances].every((item) => item.targets.size === 0));
    api.release();
    await pending;
    assert(app.querySelector('form'));
    assert.equal(app.querySelector('photo-card'), null);
  });
  it('handles popstate without leaving the previous gallery mounted', async () => {
    const api = repository();
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    app.navigate(api.did);
    await until(() => app.querySelector('photo-card'));
    dom.history.replaceState({}, '', '/');
    dom.dispatchEvent(new Event('popstate'));
    await until(() => app.querySelector('form'));
    assert.equal(app.querySelector('photo-gallery'), null);
  });
});

describe('shareable lightboxes', () => {
  it('loads an older gallery directly, then returns to the portfolio with Back and reopens with Forward', async () => {
    const api = repository();
    const url = `/${api.did}#gallery=gallery2&photo=photo3`;
    dom.history.replaceState({}, '', url);
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await until(() => app.querySelector('dialog')?.open);
    const gallery = app.querySelector('photo-gallery');
    const dialog = app.querySelector('dialog')!;
    assert.equal(dialog.querySelector('.lightbox-caption')?.textContent, 'Photo 3 caption');
    assert.equal(dom.location.pathname + dom.location.hash, url);
    assert.equal(api.requests.length, 3);
    assert(!api.requests.some(({ url }) => url.pathname.endsWith('/com.atproto.repo.listRecords')));
    assert.equal(api.requests.filter(({ url }) => url.hostname === 'grain.social').length, 1);
    assert.equal(app.querySelectorAll('photo-card').length, 1);
    const historyLength = dom.history.length;
    dom.history.back();
    await until(() => !dialog.open && app.querySelectorAll('photo-card').length === 2);
    assert.equal(dom.location.hash, '');
    assert.equal(app.querySelector('photo-gallery'), gallery);
    assert.equal(dom.document.body.style.overflow, '');
    assert.equal(
      api.requests.filter(({ url }) => url.pathname.endsWith('/com.atproto.repo.listRecords'))
        .length,
      1,
    );
    const calls = api.requests.length;
    dom.history.forward();
    await until(() => app.querySelector('dialog')?.open);
    assert.equal(app.querySelector('.lightbox-caption')?.textContent, 'Photo 3 caption');
    assert.equal(dom.location.pathname + dom.location.hash, url);
    assert.equal(dom.history.length, historyLength);
    assert.equal(api.requests.length, calls);
    app.querySelector<HTMLButtonElement>('.lightbox-close')!.click();
    await until(() => !dom.location.hash && app.querySelectorAll('photo-card').length === 2);
    assert.equal(api.requests.length, calls);
  });

  it('updates the URL across swipes and metadata pages without adding a history entry per photo', async () => {
    const api = repository();
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    app.navigate(api.handle);
    await until(() => app.querySelectorAll('photo-card').length === 2);
    const gallery = app.querySelector('photo-gallery');
    const firstImage = app.querySelector('img');
    const initialLength = dom.history.length;
    app.querySelectorAll<HTMLButtonElement>('.photo-open')[1].click();
    await until(() => app.querySelector('dialog')?.open);
    const dialog = app.querySelector('dialog')!;
    assert.equal(
      dom.location.pathname + dom.location.hash,
      `/${api.did}#gallery=gallery1&photo=photo2`,
    );
    assert.equal(dom.history.length, initialLength + 1);
    swipe(dialog.querySelector('.lightbox-image')!, -100);
    await until(() => dialog.querySelector('.lightbox-caption')?.textContent === 'Photo 3 caption');
    assert.equal(dom.location.hash, '#gallery=gallery2&photo=photo3');
    assert.equal(dom.history.length, initialLength + 1);
    assert.equal(app.querySelector('img'), firstImage);
    const calls = api.requests.length;
    dom.history.back();
    await until(() => !dialog.open);
    assert.equal(dom.location.hash, '');
    assert.equal(app.querySelector('photo-gallery'), gallery);
    assert.equal(app.querySelector('img'), firstImage);
    dom.history.forward();
    await until(() => dialog.open);
    assert.equal(dialog.querySelector('.lightbox-caption')?.textContent, 'Photo 3 caption');
    assert.equal(app.querySelector('photo-gallery'), gallery);
    assert.equal(api.requests.length, calls);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    await until(() => !dom.location.hash);
    assert.equal(app.querySelector('img'), firstImage);
  });

  it('opens a fresh link to a non-first photo and updates its fragment when navigating backwards', async () => {
    const api = repository();
    dom.history.replaceState({}, '', `/${api.handle}#gallery=gallery1&photo=photo2`);
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await until(() => app.querySelector('dialog')?.open);
    const dialog = app.querySelector('dialog')!;
    assert.equal(dialog.querySelector('.lightbox-caption')?.textContent, 'Photo 2 caption');
    assert.equal(dom.location.pathname, `/${api.did}`);
    dialog.querySelector<HTMLButtonElement>('[aria-label="Previous photo"]')!.click();
    await until(() => dialog.querySelector('.lightbox-caption')?.textContent === 'Photo 1 caption');
    assert.equal(dom.location.hash, '#gallery=gallery1&photo=photo1');
    assert(!api.requests.some(({ url }) => url.pathname.endsWith('/com.atproto.repo.listRecords')));
  });

  it('rejects invalid photo fragments without fetching data and offers the portfolio', async () => {
    const api = repository();
    dom.history.replaceState({}, '', `/${api.did}#gallery=gallery1&photo=..`);
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await until(() => app.querySelector('.gallery-state [role="alert"]'));
    assert(app.querySelector('[role="alert"]')?.textContent?.includes('incomplete or invalid'));
    assert.equal(api.requests.length, 0);
    const portfolio = [...app.querySelectorAll<HTMLButtonElement>('.state-actions button')].find(
      (button) => button.textContent === 'View portfolio',
    )!;
    portfolio.click();
    await until(() => app.querySelectorAll('photo-card').length === 2);
    assert.equal(dom.location.hash, '');
    assert(!app.querySelector('dialog')?.open);
  });

  it('reports missing photos and removed galleries, and retries failed gallery requests', async () => {
    const api = repository();
    api.options.failLinked = true;
    dom.history.replaceState({}, '', `/${api.did}#gallery=gallery2&photo=photo3`);
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await until(() => app.querySelector('.gallery-state [role="alert"]'));
    assert(app.querySelector('[role="alert"]')?.textContent?.includes('503'));
    api.options.failLinked = false;
    app.querySelector<HTMLButtonElement>('.state-actions button')!.click();
    await until(() => app.querySelector('dialog')?.open);
    app.querySelector<HTMLButtonElement>('.lightbox-close')!.click();
    await until(() => !dom.location.hash && app.querySelectorAll('photo-card').length === 2);
    dom.history.replaceState({}, '', `/${api.did}#gallery=gallery1&photo=missing`);
    dom.dispatchEvent(new Event('hashchange'));
    await until(() => app.querySelector('.pagination-status [role="alert"]'));
    assert(
      app
        .querySelector('.pagination-status [role="alert"]')
        ?.textContent?.includes('photo is no longer available'),
    );
    assert(!app.querySelector('dialog')?.open);
    api.options.missingLinked = true;
    app.querySelector<HTMLButtonElement>('.pagination-status button')!.click();
    await until(() => app.querySelector('.gallery-state [role="alert"]'));
    assert(
      app
        .querySelector('.gallery-state [role="alert"]')
        ?.textContent?.includes('gallery is no longer available'),
    );
  });

  it('cancels an incoming photo link when leaving the account', async () => {
    const api = repository();
    api.options.holdLinked = true;
    dom.history.replaceState({}, '', `/${api.did}#gallery=gallery2&photo=photo3`);
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await until(() =>
      api.requests.some(({ url }) => url.pathname.endsWith('/com.atproto.repo.getRecord')),
    );
    app.navigate('');
    await tick();
    const request = api.requests.find(({ url }) =>
      url.pathname.endsWith('/com.atproto.repo.getRecord'),
    )!;
    assert.equal(request.signal?.aborted, true);
    api.release();
    await tick();
    assert(app.querySelector('form'));
    assert.equal(app.querySelector('dialog'), null);
    assert.equal(dom.document.body.style.overflow, '');
  });
  it('keeps the resolved account mounted when going Back during a linked-gallery request', async () => {
    const api = repository();
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    app.navigate(api.handle);
    await until(() => app.querySelectorAll('photo-card').length === 2);
    const gallery = app.querySelector('photo-gallery');
    api.options.holdLinked = true;
    dom.history.pushState({}, '', `/${api.did}#gallery=gallery2&photo=photo3`);
    dom.dispatchEvent(new Event('hashchange'));
    await until(() =>
      api.requests.some(({ url }) => url.pathname.endsWith('/com.atproto.repo.getRecord')),
    );
    const request = api.requests.find(({ url }) =>
      url.pathname.endsWith('/com.atproto.repo.getRecord'),
    )!;
    dom.history.back();
    await until(() => !dom.location.hash && app.querySelectorAll('photo-card').length === 2);
    assert.equal(request.signal?.aborted, true);
    assert.equal(app.querySelector('photo-gallery'), gallery);
    api.release();
    await tick();
    assert(!app.querySelector('dialog')?.open);
    assert.equal(dom.location.hash, '');
  });
  it('reopens the selected photo after remounting without adding another lightbox history entry', async () => {
    const api = repository();
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    app.navigate(api.did);
    await until(() => app.querySelectorAll('photo-card').length === 2);
    app.querySelectorAll<HTMLButtonElement>('.photo-open')[1].click();
    await until(() => app.querySelector('dialog')?.open);
    const historyLength = dom.history.length;
    app.remove();
    const restored = dom.document.createElement('photo-show');
    dom.document.body.append(restored);
    await until(() => restored.querySelector('dialog')?.open);
    assert.equal(restored.querySelector('.lightbox-caption')?.textContent, 'Photo 2 caption');
    assert.equal(dom.history.length, historyLength);
    dom.history.back();
    await until(() => !restored.querySelector('dialog')?.open);
    assert.equal(dom.location.hash, '');
    assert.equal(restored.querySelectorAll('photo-card').length, 2);
  });
  it('follows another shared link and ignores its response if the selection changes again', async () => {
    const api = repository();
    dom.history.replaceState({}, '', `/${api.did}#gallery=gallery1&photo=photo1`);
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    await until(() => app.querySelector('dialog')?.open);
    api.options.holdLinked = true;
    dom.history.replaceState({}, '', `/${api.did}#gallery=gallery2&photo=photo3`);
    dom.dispatchEvent(new Event('hashchange'));
    await until(() =>
      api.requests.some(
        ({ url }) =>
          url.pathname.endsWith('/com.atproto.repo.getRecord') &&
          url.searchParams.get('rkey') === 'gallery2',
      ),
    );
    const pending = api.requests.find(({ url }) => url.searchParams.get('rkey') === 'gallery2')!;
    api.options.holdLinked = false;
    dom.history.replaceState({}, '', `/${api.did}#gallery=gallery1&photo=photo2`);
    dom.dispatchEvent(new Event('hashchange'));
    await until(
      () =>
        app.querySelector('dialog')?.open &&
        app.querySelector('.lightbox-caption')?.textContent === 'Photo 2 caption',
    );
    assert.equal(pending.signal?.aborted, true);
    api.release();
    await tick();
    assert.equal(app.querySelector('.lightbox-caption')?.textContent, 'Photo 2 caption');
    assert.equal(dom.location.hash, '#gallery=gallery1&photo=photo2');
    assert(!api.requests.some(({ url }) => url.pathname.endsWith('/com.atproto.repo.listRecords')));
  });
});

describe('image readiness and fallback', () => {
  it('waits for decoding before revealing the original and removing the lightbox spinner', async () => {
    let decoded!: () => void;
    dom.HTMLImageElement.prototype.decode = () =>
      new Promise<void>((resolve) => {
        decoded = resolve;
      });
    const element = dom.document.createElement('photo-image');
    element.configure(photo, true, true);
    dom.document.body.append(element);
    const image = element.querySelector('img')!;
    assert.equal(image.src, photo.originalSrc);
    assert(element.querySelector('[role="status"]'));
    image.dispatchEvent(new Event('load'));
    assert(!image.classList.contains('is-loaded'));
    decoded();
    await tick();
    assert(image.classList.contains('is-loaded'));
    assert.equal(element.querySelector('[role="status"]'), null);
    assert.equal(element.firstElementChild?.getAttribute('aria-busy'), 'false');
  });
  it('falls back from the original to the large CDN image, then stops with an error', () => {
    const element = dom.document.createElement('photo-image');
    element.configure(photo, true, true);
    dom.document.body.append(element);
    const image = element.querySelector('img')!;
    image.dispatchEvent(new Event('error'));
    assert.equal(image.src, photo.fullSrc);
    image.dispatchEvent(new Event('error'));
    assert.equal(element.querySelector('img'), null);
    assert.equal(element.textContent, 'Photo unavailable.');
    assert.equal(element.querySelector('[role="status"]'), null);
  });
  it('uses lazy CDN images in the wall and a direct fallback without a srcset loop', () => {
    const element = dom.document.createElement('photo-image');
    element.configure(photo);
    dom.document.body.append(element);
    const image = element.querySelector('img')!;
    assert.equal(image.loading, 'lazy');
    assert.equal(image.src, photo.src);
    assert(image.srcset.includes('2x'));
    image.dispatchEvent(new Event('error'));
    assert.equal(image.src, photo.originalSrc);
    assert.equal(image.srcset, '');
  });
  it('ignores a decode promise that finishes after the image was removed', async () => {
    let decoded!: () => void;
    dom.HTMLImageElement.prototype.decode = () =>
      new Promise<void>((resolve) => {
        decoded = resolve;
      });
    const element = dom.document.createElement('photo-image');
    element.configure(photo);
    dom.document.body.append(element);
    const image = element.querySelector('img')!;
    image.dispatchEvent(new Event('load'));
    element.remove();
    decoded();
    await tick();
    assert(!image.classList.contains('is-loaded'));
    assert.equal(image.getAttribute('src'), null);
  });
});

describe('lightbox and captions', async () => {
  it('opens from a photo and fetches more metadata when advancing beyond the last loaded image', async () => {
    const api = repository();
    const gallery = dom.document.createElement('photo-gallery');
    gallery.actor = api.did;
    dom.document.body.append(gallery);
    await until(() => gallery.querySelectorAll('photo-card').length === 2);
    gallery.querySelectorAll<HTMLButtonElement>('.photo-open')[1].click();
    await until(() => gallery.querySelector('dialog')?.open);
    const dialog = gallery.querySelector('dialog')!;
    assert.equal(dialog.querySelector('.lightbox-caption')?.textContent, 'Photo 2 caption');
    swipe(dialog.querySelector('.lightbox-image')!, -100);
    await until(() => dialog.querySelector('.lightbox-caption')?.textContent === 'Photo 3 caption');
    assert.equal(api.requests.filter(({ url }) => url.searchParams.has('cursor')).length, 1);
    assert.equal(
      dialog.querySelector<HTMLButtonElement>('[aria-label="Next photo"]')?.disabled,
      true,
    );
  });
  it('preserves details visibility across navigation and restores scroll and focus on close', async () => {
    const trigger = dom.document.createElement('button');
    dom.document.body.append(trigger);
    trigger.focus();
    const viewer = dom.document.createElement('photo-lightbox');
    dom.document.body.append(viewer);
    viewer.present(state());
    await tick();
    const dialog = viewer.querySelector('dialog')!;
    assert(dialog.open);
    assert.equal(dom.document.body.style.overflow, 'hidden');
    const toggle = viewer.querySelector<HTMLButtonElement>('.lightbox-details-toggle')!;
    toggle.click();
    await tick();
    assert.equal(toggle.getAttribute('aria-expanded'), 'false');
    viewer.present(state({ ...photo, id: 'photo2' }));
    await tick();
    assert.equal(viewer.querySelector<HTMLElement>('.lightbox-details')?.inert, true);
    assert.equal(toggle.textContent, 'Show details');
    assert(!viewer.textContent?.includes('Posted'));
    assert.equal(viewer.querySelector<HTMLAnchorElement>('.grain-link')?.href, photo.href);
    let closes = 0;
    viewer.addEventListener('photo-close', () => closes++);
    dialog.dispatchEvent(new Event('cancel', { cancelable: true }));
    assert(!dialog.open);
    assert.equal(dom.document.body.style.overflow, '');
    assert.equal(dom.document.activeElement, trigger);
    assert.equal(closes, 1);
  });
  it('supports arrow keys and backdrop close without treating image clicks as backdrop clicks', async () => {
    const viewer = dom.document.createElement('photo-lightbox');
    dom.document.body.append(viewer);
    viewer.present({ ...state(), canPrevious: true });
    await tick();
    let next = 0,
      previous = 0;
    viewer.addEventListener('photo-next', () => next++);
    viewer.addEventListener('photo-previous', () => previous++);
    const dialog = viewer.querySelector('dialog')!;
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    assert.equal(next, 1);
    assert.equal(previous, 1);
    viewer.querySelector('img')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(dialog.open);
    dialog.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    assert(!dialog.open);
  });
  it('saves the background choice across photos, details visibility, and new viewers without reloading the image', async () => {
    const viewer = dom.document.createElement('photo-lightbox');
    dom.document.body.append(viewer);
    viewer.present(state());
    await tick();
    const image = viewer.querySelector('img');
    const white = viewer.querySelector<HTMLInputElement>('input[value="white"]')!;
    white.checked = true;
    white.dispatchEvent(new Event('change', { bubbles: true }));
    await tick();
    assert.equal(viewer.querySelector<HTMLElement>('.lightbox-image')?.dataset.background, 'white');
    assert.equal(dom.localStorage.getItem('photoshow.lightbox.background'), 'white');
    assert.equal(viewer.querySelector('img'), image);
    viewer.querySelector<HTMLButtonElement>('.lightbox-details-toggle')!.click();
    viewer.present(state({ ...photo, id: 'photo2' }));
    await tick();
    assert.equal(viewer.querySelector<HTMLElement>('.lightbox-details')?.inert, true);
    assert.equal(viewer.querySelector<HTMLElement>('.lightbox-image')?.dataset.background, 'white');
    viewer.remove();
    const returned = dom.document.createElement('photo-lightbox');
    dom.document.body.append(returned);
    returned.present(state());
    await tick();
    assert.equal(returned.querySelector<HTMLInputElement>('input[value="white"]')?.checked, true);
    assert.equal(
      returned.querySelector<HTMLElement>('.lightbox-image')?.dataset.background,
      'white',
    );
  });
  it('ignores invalid stored backgrounds and rereads the saved preference when reopening', async () => {
    const viewer = dom.document.createElement('photo-lightbox');
    dom.document.body.append(viewer);
    viewer.present(state());
    await tick();
    viewer.dismiss();
    dom.localStorage.setItem('photoshow.lightbox.background', 'url(https://unexpected.example)');
    viewer.present(state());
    await tick();
    assert.equal(viewer.querySelector<HTMLElement>('.lightbox-image')?.dataset.background, 'gray');
    assert.equal(viewer.querySelectorAll('input:checked').length, 1);
    viewer.dismiss();
    dom.localStorage.setItem('photoshow.lightbox.background', 'white');
    viewer.present(state());
    await tick();
    assert.equal(viewer.querySelector<HTMLInputElement>('input[value="white"]')?.checked, true);
  });
  it('keeps background selection usable when local storage is blocked', async () => {
    const viewer = dom.document.createElement('photo-lightbox');
    dom.document.body.append(viewer);
    viewer.present(state());
    await tick();
    const descriptor = Object.getOwnPropertyDescriptor(dom, 'localStorage')!;
    Object.defineProperty(dom, 'localStorage', {
      configurable: true,
      get() {
        throw new Error('Storage blocked');
      },
    });
    try {
      const white = viewer.querySelector<HTMLInputElement>('input[value="white"]')!;
      white.checked = true;
      white.dispatchEvent(new Event('change', { bubbles: true }));
      await tick();
      assert.equal(
        viewer.querySelector<HTMLElement>('.lightbox-image')?.dataset.background,
        'white',
      );
      viewer.dismiss();
      viewer.present(state());
      await tick();
      assert.equal(viewer.querySelector<HTMLInputElement>('input[value="white"]')?.checked, true);
    } finally {
      Object.defineProperty(dom, 'localStorage', descriptor);
    }
  });
  it('leaves radio-group arrow keys to the background control', async () => {
    const viewer = dom.document.createElement('photo-lightbox');
    dom.document.body.append(viewer);
    viewer.present({ ...state(), canPrevious: true });
    await tick();
    let navigations = 0;
    viewer.addEventListener('photo-next', () => navigations++);
    viewer.addEventListener('photo-previous', () => navigations++);
    const radio = viewer.querySelector<HTMLInputElement>('input[value="gray"]')!;
    for (const key of ['ArrowRight', 'ArrowLeft']) {
      const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
      radio.dispatchEvent(event);
      assert.equal(event.defaultPrevented, false);
    }
    assert.equal(navigations, 0);
  });
  it('resets the details scroll only when changing the selected photo', async () => {
    const viewer = dom.document.createElement('photo-lightbox');
    dom.document.body.append(viewer);
    viewer.present(state());
    await tick();
    const details = viewer.querySelector<HTMLElement>('.lightbox-details')!;
    assert.equal(details.tabIndex, 0);
    details.scrollTop = 300;
    viewer.present({ ...state(), loadingNext: true });
    await tick();
    assert.equal(details.scrollTop, 300);
    viewer.present(state({ ...photo, id: 'photo2' }));
    await tick();
    assert.equal(details.scrollTop, 0);
  });
  it('does not reopen the viewer if it was closed during a next-page request', async () => {
    const api = repository();
    api.options.holdNext = true;
    const gallery = dom.document.createElement('photo-gallery');
    gallery.actor = api.did;
    dom.document.body.append(gallery);
    await until(() => gallery.querySelectorAll('photo-card').length === 2);
    gallery.querySelectorAll<HTMLButtonElement>('.photo-open')[1].click();
    await until(() => gallery.querySelector('dialog')?.open);
    const dialog = gallery.querySelector('dialog')!;
    dialog.querySelector<HTMLButtonElement>('[aria-label="Next photo"]')!.click();
    await until(() => api.requests.some(({ url }) => url.searchParams.has('cursor')));
    dialog.querySelector<HTMLButtonElement>('.lightbox-close')!.click();
    api.release();
    await until(() => gallery.querySelectorAll('photo-card').length === 3);
    await tick();
    assert(!dialog.open);
  });
  it('restores document scrolling when navigating away from an open lightbox', async () => {
    const api = repository();
    const app = dom.document.createElement('photo-show');
    dom.document.body.append(app);
    app.navigate(api.did);
    await until(() => app.querySelector('photo-card'));
    app.querySelector<HTMLButtonElement>('.photo-open')!.click();
    await until(() => app.querySelector('dialog')?.open);
    assert.equal(dom.document.body.style.overflow, 'hidden');
    app.navigate('');
    await tick();
    assert.equal(dom.document.body.style.overflow, '');
    assert.equal(app.querySelector('photo-lightbox'), null);
    assert(app.querySelector('form'));
  });
  it('withholds sensitive images until revealed and inserts captions as text', async () => {
    const card = dom.document.createElement('photo-card');
    card.photo = { ...photo, contentWarning: 'nudity', caption: '<img src=x onerror=alert(1)>' };
    dom.document.body.append(card);
    await tick();
    assert.equal(card.querySelector('img'), null);
    assert.equal(card.querySelector('.caption')?.textContent, '<img src=x onerror=alert(1)>');
    card.querySelector<HTMLButtonElement>('.content-warning button')!.click();
    await tick();
    assert(card.querySelector('img'));
    assert.equal(card.querySelectorAll('.gallery-group-title').length, 0);
    const noCapture = dom.document.createElement('photo-card');
    noCapture.photo = { ...photo, takenAt: undefined };
    dom.document.body.append(noCapture);
    await tick();
    assert.equal(noCapture.querySelector('time'), null);
  });
  it('shows capture dates beside the gallery title, with a range only for different days', async () => {
    const element = dom.document.createElement('photo-group');
    const first = '2026-09-28T18:15:00Z';
    const last = '2026-09-30T18:15:00Z';
    const photos = [
      { ...photo, id: 'last', takenAt: last },
      { ...photo, id: 'first', takenAt: first },
      { ...photo, id: 'missing', takenAt: undefined },
      { ...photo, id: 'invalid', takenAt: 'not-a-date' },
    ];
    element.group = groupPhotos(photos)[0];
    dom.document.body.append(element);
    await tick();
    const heading = element.querySelector('.gallery-group-heading')!;
    assert.equal(heading.querySelector('.gallery-group-title')?.textContent, photo.title);
    assert.equal(
      heading.querySelector('.gallery-group-date')?.textContent,
      `${formatDate(first)} – ${formatDate(last)}`,
    );
    assert.deepEqual(
      [...heading.querySelectorAll('time')].map((time) => time.dateTime),
      [first, last],
    );
    assert.equal(element.querySelectorAll('photo-card time').length, 0);
    element.group = groupPhotos([
      photo,
      { ...photo, id: 'same-day', takenAt: '2026-09-30T19:15:00Z' },
    ])[0];
    await tick();
    assert.equal(heading.querySelectorAll('time').length, 1);
    assert.equal(heading.querySelector('.gallery-group-date')?.textContent, formatDate(last));
    element.group = groupPhotos(photos.slice(2))[0];
    await tick();
    assert.equal(heading.querySelector('.gallery-group-date'), null);
  });
});

describe('lightbox touch gestures', () => {
  async function viewer() {
    const element = dom.document.createElement('photo-lightbox');
    dom.document.body.append(element);
    element.present({ ...state(), canPrevious: true });
    await tick();
    return element;
  }
  it('swipes in both directions without changing details visibility or handling mouse drags', async () => {
    const element = await viewer(),
      canvas = element.querySelector('.lightbox-image')!;
    let next = 0,
      previous = 0;
    element.addEventListener('photo-next', () => next++);
    element.addEventListener('photo-previous', () => previous++);
    swipe(canvas, -100);
    swipe(canvas, 100);
    canvas.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    assert.equal(next, 1);
    assert.equal(previous, 1);
    assert.equal(element.querySelector<HTMLElement>('.lightbox-details')?.inert, false);
    pointer(canvas, 'pointerdown', 200, 150, { pointerType: 'mouse' });
    pointer(canvas, 'pointerup', 50, 150, { pointerType: 'mouse' });
    assert.equal(next, 1);
  });
  it('taps only the image to toggle details, leaving the surround, loading frame, and controls alone', async () => {
    const element = await viewer(),
      image = element.querySelector('img')!;
    for (const selector of [
      '.lightbox-image',
      '.photo-image-frame',
      'photo-image',
      '.image-loading',
      '.lightbox-details',
      '.lightbox-controls',
      'label',
    ]) {
      element.querySelector<HTMLElement>(selector)!.click();
      await tick();
      assert.equal(element.querySelector<HTMLElement>('.lightbox-details')?.inert, false);
    }
    element.querySelector<HTMLAnchorElement>('.grain-link')!.focus();
    image.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    assert.equal(element.querySelector<HTMLElement>('.lightbox-details')?.inert, true);
    assert.equal(element.querySelector('.lightbox-details')?.getAttribute('aria-hidden'), 'true');
    assert.equal(dom.document.activeElement, element.querySelector('.lightbox-details-toggle'));
    assert.equal(element.querySelector('img'), image);
    image.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await tick();
    assert.equal(element.querySelector<HTMLElement>('.lightbox-details')?.inert, false);
    assert.equal(element.querySelector('.lightbox-details')?.getAttribute('aria-hidden'), 'false');
    element.querySelector('label')!.click();
    await tick();
    assert.equal(element.querySelector<HTMLElement>('.lightbox-details')?.inert, false);
  });
  it('ignores vertical, diagonal, short, slow, and cancelled gestures', async () => {
    const element = await viewer(),
      canvas = element.querySelector('.lightbox-image')!;
    let navigations = 0;
    element.addEventListener('photo-next', () => navigations++);
    for (const [dx, dy] of [
      [-20, 0],
      [-10, 100],
      [-90, 80],
    ])
      swipe(canvas, dx, dy);
    pointer(canvas, 'pointerdown', 200, 150, {}, 100);
    pointer(canvas, 'pointerup', 50, 150, {}, 1100);
    pointer(canvas, 'pointerdown', 200, 150);
    pointer(canvas, 'pointercancel', 200, 150);
    pointer(canvas, 'pointerup', 50, 150);
    pointer(canvas, 'pointerdown', 200, 150);
    pointer(canvas, 'lostpointercapture', 200, 150);
    pointer(canvas, 'pointerup', 50, 150);
    swipe(element.querySelector('.lightbox-details')!, -100);
    assert.equal(navigations, 0);
  });
  it('respects navigation limits and loading, and discards gestures when the photo changes', async () => {
    const element = await viewer(),
      canvas = element.querySelector('.lightbox-image')!;
    let next = 0,
      previous = 0;
    element.addEventListener('photo-next', () => next++);
    element.addEventListener('photo-previous', () => previous++);
    element.present({ ...state(), canNext: false });
    await tick();
    swipe(canvas, -100);
    swipe(canvas, 100);
    element.present({ ...state(), loadingNext: true, canPrevious: true });
    await tick();
    swipe(canvas, -100);
    swipe(canvas, 100);
    assert.equal(next, 0);
    assert.equal(previous, 1);
    pointer(canvas, 'pointerdown', 200, 150);
    element.present(state({ ...photo, id: 'photo2' }));
    await tick();
    pointer(canvas, 'pointerup', 50, 150);
    assert.equal(next, 0);
    pointer(canvas, 'pointerdown', 200, 150);
    element.dismiss();
    element.present(state());
    await tick();
    pointer(canvas, 'pointerup', 50, 150);
    assert.equal(next, 0);
  });
  it('leaves pinch gestures and zoomed panning to the browser and removes viewport listeners on close', async () => {
    const viewport = new dom.EventTarget();
    let scale = 1;
    Object.defineProperty(viewport, 'scale', { get: () => scale });
    Object.defineProperty(dom, 'visualViewport', { configurable: true, value: viewport });
    try {
      const element = await viewer(),
        canvas = element.querySelector<HTMLElement>('.lightbox-image')!;
      let next = 0;
      element.addEventListener('photo-next', () => next++);
      pointer(canvas, 'pointerdown', 200, 150);
      pointer(element.querySelector('.lightbox-details')!, 'pointerdown', 250, 150, {
        pointerId: 2,
        isPrimary: false,
      });
      pointer(canvas, 'pointerup', 50, 150);
      assert.equal(next, 0);
      scale = 2;
      viewport.dispatchEvent(new Event('resize'));
      assert.equal(canvas.style.touchAction, 'auto');
      swipe(canvas, -100);
      assert.equal(next, 0);
      scale = 1;
      viewport.dispatchEvent(new Event('resize'));
      swipe(canvas, -100);
      assert.equal(next, 1);
      element.dismiss();
      scale = 2;
      viewport.dispatchEvent(new Event('resize'));
      assert.equal(canvas.style.touchAction, '');
    } finally {
      Reflect.deleteProperty(dom, 'visualViewport');
    }
  });
  it('keeps the sensitive-photo reveal button tappable without swiping or hiding details', async () => {
    const element = await viewer();
    element.present(state({ ...photo, contentWarning: 'nudity' }));
    await tick();
    const button = element.querySelector<HTMLButtonElement>('.content-warning button')!;
    let next = 0;
    element.addEventListener('photo-next', () => next++);
    swipe(button, -100);
    button.click();
    await tick();
    assert.equal(next, 0);
    assert(element.querySelector('img'));
    assert.equal(element.querySelector<HTMLElement>('.lightbox-details')?.inert, false);
  });
});

describe('masonry positioning', () => {
  it('places each photo in the shortest column and recalculates on resize', () => {
    const masonry = dom.document.createElement('photo-masonry');
    let width = 600;
    Object.defineProperty(masonry, 'clientWidth', { get: () => width });
    for (const height of [100, 150, 80]) {
      const child = dom.document.createElement('div');
      child.getBoundingClientRect = () => ({ height }) as DOMRect;
      masonry.append(child);
    }
    dom.document.body.append(masonry);
    assert.equal((masonry.children[2] as HTMLElement).style.transform, 'translate(0px, 128px)');
    assert.equal(masonry.style.height, '208px');
    width = 400;
    [...ResizeMock.instances].find((item) => item.targets.has(masonry))!.trigger();
    flushLayouts();
    assert.equal((masonry.children[2] as HTMLElement).style.transform, 'translate(0px, 290px)');
    assert.equal(masonry.style.height, '370px');
  });
  it('staggers gallery groups independently, with larger spacing', () => {
    const masonry = dom.document.createElement('photo-masonry');
    masonry.setAttribute('variant', 'galleries');
    Object.defineProperty(masonry, 'clientWidth', { value: 1100 });
    for (const height of [120, 200, 80, 100]) {
      const child = dom.document.createElement('div');
      child.getBoundingClientRect = () => ({ height }) as DOMRect;
      masonry.append(child);
    }
    dom.document.body.append(masonry);
    assert.equal((masonry.children[2] as HTMLElement).style.transform, 'translate(0px, 176px)');
    assert.equal((masonry.children[3] as HTMLElement).style.transform, 'translate(570px, 256px)');
    assert.equal(masonry.style.height, '356px');
  });
});
