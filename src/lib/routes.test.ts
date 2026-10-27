import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { Window } from 'happy-dom';
import { actorFromPath, galleryPath, restorePageRoute } from './routes.ts';
import { photoFromHash, photoPath } from './photo-route.ts';

const window = new Window({ url: 'https://photographer.github.io/crossgrain/' });
Object.defineProperty(globalThis, 'window', { configurable: true, value: window });
after(() => window.happyDOM.close());

describe('static site routes', () => {
  it('round-trips DIDs and handles at root and project URLs', () => {
    for (const base of ['/', '/crossgrain/', '/crossgrain']) {
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
    assert.equal(actorFromPath('/elsewhere/photographer.example', '/crossgrain/'), '');
    assert.equal(actorFromPath('/crossgrainish/photographer.example', '/crossgrain/'), '');
  });

  it('restores direct gallery links without losing encoded DIDs, queries, or fragments', () => {
    for (const base of ['/', '/crossgrain/', '/crossgrain']) {
      const root = base.endsWith('/') ? base : `${base}/`;
      const target = `${galleryPath('did:web:photos.example%3A8443:alice', base)}?view=all#gallery=gallery1&photo=photo2`;
      window.history.replaceState(
        {},
        '',
        `${root}?__crossgrain_route=${encodeURIComponent(target)}`,
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
      '/crossgrainish/photo',
      '/crossgrain/../photo',
      'http://[invalid',
    ]) {
      const path = `/crossgrain/?__crossgrain_route=${encodeURIComponent(target)}`;
      window.history.replaceState({}, '', path);
      restorePageRoute('/crossgrain/');
      assert.equal(window.location.pathname + window.location.search, path);
    }
    const path =
      '/crossgrain/photographer.example?__crossgrain_route=%2Fcrossgrain%2Fother.example';
    window.history.replaceState({}, '', path);
    restorePageRoute('/crossgrain/');
    assert.equal(window.location.pathname + window.location.search, path);
    window.history.replaceState({}, '', '/crossgrain/');
    restorePageRoute('/crossgrain/');
    assert.equal(window.location.pathname, '/crossgrain/');
  });
});

describe('lightbox links', () => {
  it('uses stable record keys and round-trips encoded characters and web DIDs', () => {
    for (const did of ['did:plc:aaaaaaaaaaaaaaaaaaaaaaaa', 'did:web:photos.example%3A8443:alice']) {
      const path = photoPath(did, {
        galleryId: `at://${did}/social.grain.gallery/pre:fix`,
        id: `at://${did}/social.grain.photo/~1.2-3_`,
      });
      const url = new URL(path, 'https://photos.example');
      assert.equal(actorFromPath(url.pathname), did);
      assert.deepEqual(photoFromHash(url.hash), { gallery: 'pre:fix', photo: '~1.2-3_' });
    }
    assert.equal(photoFromHash(''), undefined);
    assert.equal(photoFromHash('#ordinary-anchor'), undefined);
  });
  it('rejects incomplete, ambiguous, and invalid photo selections', () => {
    for (const hash of [
      '#gallery=one',
      '#photo=two',
      '#gallery=&photo=two',
      '#gallery=one&photo=two&photo=three',
      '#gallery=one&gallery=two&photo=three',
    ])
      assert.throws(() => photoFromHash(hash), /incomplete or invalid/);
    for (const key of [
      '.',
      '..',
      'a/b',
      'at://someone/photo',
      'any space',
      'é',
      'x'.repeat(513),
      '%ZZ',
    ])
      assert.throws(
        () => photoFromHash(`#${new URLSearchParams({ gallery: key, photo: 'valid' })}`),
        /incomplete or invalid/,
      );
    assert.deepEqual(photoFromHash(`#gallery=${'a'.repeat(512)}&photo=Valid-KEY`), {
      gallery: 'a'.repeat(512),
      photo: 'Valid-KEY',
    });
  });
});
