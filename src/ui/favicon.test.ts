import { after, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import { setFavicon } from './favicon.ts';

const dom = new Window({ url: 'http://localhost:4173/' });
Object.defineProperty(globalThis, 'document', { configurable: true, value: dom.document });
Object.defineProperty(globalThis, 'window', { configurable: true, value: dom });
const avatar = 'https://cdn.bsky.app/img/avatar_thumbnail/plain/did:plc:example/bafkreiaaaaa@jpeg';
let images: ReturnType<typeof createImage>[];
function createImage() {
  let ready!: () => void;
  let fail!: (error: Error) => void;
  const decoded = new Promise<void>((resolve, reject) => {
    ready = resolve;
    fail = reject;
  });
  return {
    src: '',
    onload: null as (() => Promise<void>) | null,
    onerror: null as (() => void) | null,
    decode: () => decoded,
    removeAttribute: () => {},
    ready,
    fail,
  };
}
beforeEach(() => {
  setFavicon();
  images = [];
  dom.document.head.innerHTML = '<link rel="icon" type="image/png" href="/favicon.png?v=3">';
  dom.Image = class {
    constructor() {
      const image = createImage();
      images.push(image);
      return image;
    }
  } as unknown as typeof dom.Image;
});
after(async () => {
  setFavicon();
  await dom.happyDOM.close();
});
const icon = () => dom.document.querySelector<HTMLLinkElement>('link[rel="icon"]')!;

describe('account favicon', () => {
  it('keeps our icon until the avatar loads and decodes, then reuses it', async () => {
    setFavicon(avatar);
    assert.equal(new URL(icon().href).pathname, '/favicon.png');
    assert.equal(images[0].src, avatar);
    const loading = images[0].onload!();
    await Promise.resolve();
    assert.equal(new URL(icon().href).pathname, '/favicon.png');
    images[0].ready();
    await loading;
    assert.equal(icon().href, avatar);
    assert.equal(icon().type, 'image/jpeg');
    setFavicon(avatar);
    assert.equal(images.length, 1);
  });
  it('keeps our icon when an avatar request or decoding fails', async () => {
    setFavicon(avatar);
    images[0].onerror!();
    assert.equal(new URL(icon().href).pathname, '/favicon.png');
    setFavicon(`${avatar}?different`);
    const loading = images[1].onload!();
    images[1].fail(new Error('Broken JPEG'));
    await loading;
    assert.equal(new URL(icon().href).pathname, '/favicon.png');
    assert.equal(icon().type, 'image/png');
  });
  it('restores our icon on home and ignores an old account’s late image', async () => {
    setFavicon(avatar);
    const loading = images[0].onload!();
    setFavicon();
    images[0].ready();
    await loading;
    assert.equal(new URL(icon().href).pathname, '/favicon.png');
    setFavicon(avatar);
    const loaded = images[1].onload!();
    images[1].ready();
    await loaded;
    assert.equal(icon().href, avatar);
    setFavicon();
    assert.equal(new URL(icon().href).pathname, '/favicon.png');
    assert.equal(icon().type, 'image/png');
  });
  it('does not let a stale avatar replace the next account’s avatar', async () => {
    setFavicon(avatar);
    const old = images[0].onload!();
    const nextAvatar = `${avatar}?next`;
    setFavicon(nextAvatar);
    const next = images[1].onload!();
    images[1].ready();
    await next;
    images[0].ready();
    await old;
    assert.equal(icon().href, nextAvatar);
  });
});
