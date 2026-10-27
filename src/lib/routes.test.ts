import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { actorFromPath, galleryPath, restorePageRoute } from './routes.ts';

const window = new Window({ url: 'https://photographer.github.io/photoshow/' });
Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
after(() => window.happyDOM.close());

describe('static site routes', () => {
  it('round-trips DIDs and handles at root and project URLs', () => {
    for (const base of ['/', '/photoshow/', '/photoshow']) {
      for (const actor of [
        'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
        'did:web:photos.example%3A8443:users:alice',
        'photographer.example',
      ]) {
        const path = galleryPath(actor, base);
        assert.equal(actorFromPath(path, base), actor);
        assert.equal(actorFromPath(`${path}/`, base), actor);
      }
      assert.equal(actorFromPath(galleryPath('', base), base), '');
    }
    assert.equal(actorFromPath('/elsewhere/photographer.example', '/photoshow/'), '');
    assert.equal(actorFromPath('/photoshowish/photographer.example', '/photoshow/'), '');
  });

  it('restores direct gallery links without losing encoded DIDs, queries, or fragments', () => {
    for (const base of ['/', '/photoshow/', '/photoshow']) {
      const root = base.endsWith('/') ? base : `${base}/`;
      const target = `${galleryPath('did:web:photos.example%3A8443:alice', base)}?view=all#photo`;
      window.history.replaceState(
        {},
        '',
        `${root}?__photoshow_route=${encodeURIComponent(target)}`,
      );
      restorePageRoute(base);
      assert.equal(
        window.location.pathname + window.location.search + window.location.hash,
        target,
      );
      assert.equal(
        actorFromPath(window.location.pathname, base),
        'did:web:photos.example%3A8443:alice',
      );
    }
  });

  it('ignores redirects outside the site, invalid targets, and ordinary gallery queries', () => {
    for (const target of [
      'https://elsewhere.example/photo',
      '//elsewhere.example/photo',
      '/elsewhere/photo',
      '/photoshowish/photo',
      '/photoshow/../photo',
      'http://[invalid',
    ]) {
      const path = `/photoshow/?__photoshow_route=${encodeURIComponent(target)}`;
      window.history.replaceState({}, '', path);
      restorePageRoute('/photoshow/');
      assert.equal(window.location.pathname + window.location.search, path);
    }
    const path = '/photoshow/photographer.example?__photoshow_route=%2Fphotoshow%2Fother.example';
    window.history.replaceState({}, '', path);
    restorePageRoute('/photoshow/');
    assert.equal(window.location.pathname + window.location.search, path);
    window.history.replaceState({}, '', '/photoshow/');
    restorePageRoute('/photoshow/');
    assert.equal(window.location.pathname, '/photoshow/');
  });
});
