import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendPortfolioPage,
  blobUrl,
  buildPhotos,
  cameraName,
  cdnImageUrl,
  didDocumentUrl,
  formatDate,
  formatExif,
  GALLERY_PAGE_SIZE,
  groupPhotos,
  loadPortfolio,
  loadPortfolioPage,
  normalizeActor,
  resolveIdentity,
} from './grain.ts';
import type { ExifRecord, Identity, RecordEntry } from './grain.ts';
import { actorFromPath, galleryPath } from './routes.ts';

const TEST_DID = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});
const identity: Identity = {
  did: TEST_DID,
  pds: 'https://photos.example',
  handle: 'photographer.example',
};
const photoUri = `at://${TEST_DID}/social.grain.photo/photo1`;
const galleryUri = `at://${TEST_DID}/social.grain.gallery/gallery1`;
const entry = <T>(uri: string, value: T): RecordEntry<T> => ({ uri, value });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const document = {
  id: TEST_DID,
  alsoKnownAs: [`at://${identity.handle}`],
  service: [
    { id: '#atproto_pds', type: 'AtprotoPersonalDataServer', serviceEndpoint: identity.pds },
  ],
};

describe('identity resolution', () => {
  it('never requests an account when no handle or DID was supplied', async () => {
    let requests = 0;
    globalThis.fetch = (async () => {
      requests++;
      return json({});
    }) as typeof fetch;
    await assert.rejects(loadPortfolio('', new AbortController().signal), /Enter a DID or handle/);
    assert.equal(requests, 0);
  });
  it('round-trips gallery URLs without corrupting encoded did:web ports', () => {
    for (const did of [TEST_DID, 'did:web:photos.example%3A8443:users:alice']) {
      assert.equal(actorFromPath(galleryPath(did)), did);
    }
    assert.equal(galleryPath(TEST_DID), `/${TEST_DID}`);
    assert.equal(actorFromPath('/'), '');
  });
  it('normalizes handles and accepts supported DIDs', () => {
    assert.equal(normalizeActor('  @Photographer.Example  '), 'photographer.example');
    assert.equal(normalizeActor(TEST_DID), TEST_DID);
    assert.throws(() => normalizeActor('did:plc:wrong'));
    assert.throws(() => normalizeActor('https://grain.social/profile/someone'));
    assert.throws(() => normalizeActor('some name'));
  });
  it('resolves did:web documents, including ports and dotted path segments', () => {
    assert.equal(
      didDocumentUrl('did:web:photos.example'),
      'https://photos.example/.well-known/did.json',
    );
    assert.equal(
      didDocumentUrl('did:web:photos.example:users:jane.doe'),
      'https://photos.example/users/jane.doe/did.json',
    );
    assert.equal(
      didDocumentUrl('did:web:photos.example%3A8443:alice'),
      'https://photos.example:8443/alice/did.json',
    );
    for (const bad of [
      'did:web:photos.example:..:alice',
      'did:web:photos.example:%2Falice',
      'did:web:bad@photos.example',
      'did:web:photos.example?query',
      'did:web:photos.example:%ZZ',
    ])
      assert.throws(() => didDocumentUrl(bad));
  });
  it('verifies that a resolved handle is present in the DID document', async () => {
    globalThis.fetch = (async (input: string | URL | Request) =>
      String(input).includes('resolveHandle')
        ? json({ did: TEST_DID })
        : json(document)) as typeof fetch;
    assert.deepEqual(
      await resolveIdentity(identity.handle, new AbortController().signal),
      identity,
    );
    await assert.rejects(
      resolveIdentity('imposter.example', new AbortController().signal),
      /couldn’t be verified/,
    );
  });
  it('rejects mismatched DID documents and non-HTTPS data servers', async () => {
    globalThis.fetch = (async () =>
      json({ ...document, id: 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb' })) as typeof fetch;
    await assert.rejects(resolveIdentity(TEST_DID, new AbortController().signal), /didn’t match/);
    globalThis.fetch = (async () =>
      json({
        ...document,
        service: [{ ...document.service[0], serviceEndpoint: 'http://photos.example' }],
      })) as typeof fetch;
    await assert.rejects(resolveIdentity(TEST_DID, new AbortController().signal), /HTTPS/);
  });
});

describe('Grain photo aggregation', () => {
  const photos = [
    entry(photoUri, {
      photo: { ref: { $link: 'photo-cid' } },
      alt: 'The sea in winter',
      aspectRatio: { width: 1200, height: 1800 },
      createdAt: '2026-10-01T12:00:00Z',
    }),
  ];
  const galleries = [
    entry(galleryUri, {
      title: 'By the water',
      description: 'A quiet afternoon.',
      createdAt: '2026-10-01T13:00:00Z',
    }),
  ];
  const items = [entry('item1', { item: photoUri, gallery: galleryUri, position: 0 })];
  const exif: ExifRecord = {
    photo: photoUri,
    make: 'FUJIFILM',
    model: 'X-T5',
    focalLengthIn35mmFormat: 35_000_000,
    fNumber: 2_800_000,
    exposureTime: 4_000,
    iSO: 400_000_000,
    dateTimeOriginal: '2026-09-30T18:15:00Z',
  };

  it('joins a photo to its published post, caption, EXIF, dates, and original aspect ratio', () => {
    const result = buildPhotos(identity, photos, galleries, items, [entry('exif1', exif)]);
    assert.equal(result.length, 1);
    assert.equal(result[0].title, 'By the water');
    assert.equal(result[0].description, 'A quiet afternoon.');
    assert.equal(result[0].caption, 'The sea in winter');
    assert.equal(result[0].alt, 'The sea in winter');
    assert.equal(result[0].takenAt, exif.dateTimeOriginal);
    assert.equal(result[0].publishedAt, photos[0].value.createdAt);
    assert.equal(result[0].width, 1200);
    assert.equal(result[0].height, 1800);
    assert.equal(result[0].camera, 'FUJIFILM X-T5');
    const url = new URL(result[0].href);
    assert.equal(decodeURIComponent(url.pathname), `/profile/${TEST_DID}/gallery/gallery1`);
    assert.equal(url.origin, 'https://grain.social');
    assert.equal(
      result[0].src,
      `https://cdn.bsky.app/img/feed_thumbnail/plain/${TEST_DID}/photo-cid@jpeg`,
    );
    assert.equal(
      result[0].fullSrc,
      `https://cdn.bsky.app/img/feed_fullsize/plain/${TEST_DID}/photo-cid@jpeg`,
    );
    assert.equal(new URL(result[0].originalSrc).searchParams.get('cid'), 'photo-cid');
  });
  it('excludes discarded uploads and deduplicates photos belonging to multiple posts', () => {
    assert.equal(buildPhotos(identity, photos, galleries, [], []).length, 0);
    assert.equal(buildPhotos(identity, photos, [], items, []).length, 0);
    assert.equal(buildPhotos(identity, photos, galleries, [...items, ...items], []).length, 1);
  });
  it('keeps photo captions separate from the gallery description', () => {
    const result = buildPhotos(
      identity,
      photos,
      [entry(galleryUri, { title: 'The sea' })],
      items,
      [],
    );
    assert.equal(result[0].description, '');
    assert.equal(result[0].caption, 'The sea in winter');
    assert.equal(result[0].camera, '');
  });
  it('groups photos by gallery, with one shared title and description', () => {
    const [photo] = buildPhotos(identity, photos, galleries, items, []);
    const other = {
      ...photo,
      id: 'other-photo',
      galleryId: 'other-gallery',
      title: 'Elsewhere',
      description: 'Another day.',
    };
    const second = { ...photo, id: 'second-photo', caption: 'A second view' };
    const groups = groupPhotos([photo, other, second]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].title, 'By the water');
    assert.equal(groups[0].description, 'A quiet afternoon.');
    assert.deepEqual(
      groups[0].photos.map((item) => item.id),
      [photo.id, 'second-photo'],
    );
    assert.equal(groups[1].id, 'other-gallery');
    assert.equal(groups[1].photos[0].caption, 'The sea in winter');
  });
  it('preserves a post’s content warning', () => {
    const result = buildPhotos(
      identity,
      photos,
      [entry(galleryUri, { title: 'Photo', labels: { values: [{ val: 'nudity' }] } })],
      items,
      [],
    );
    assert.equal(result[0].contentWarning, 'nudity');
  });
  it('decodes Grain’s scaled EXIF without duplicating camera makes', () => {
    assert.deepEqual(formatExif(exif), ['35mm', 'ƒ/2.8', '1/250s', 'ISO 400']);
    assert.deepEqual(formatExif({ photo: photoUri, exposureTime: 3_200_000, iSO: 100_000_000 }), [
      '3.2s',
      'ISO 100',
    ]);
    assert.equal(
      cameraName({ photo: photoUri, make: 'Canon', model: 'Canon EOS R6' }),
      'Canon EOS R6',
    );
    assert.deepEqual(formatExif(), []);
  });
  it('handles absent blobs and dates', () => {
    assert.equal(blobUrl(identity), undefined);
    assert.equal(cdnImageUrl(identity), undefined);
    assert.equal(formatDate('not a date'), 'Date not shared');
    assert.equal(formatDate(''), 'Date not shared');
  });
  it('builds CDN URLs for old blob references and encoded web DIDs', () => {
    const webIdentity = { ...identity, did: 'did:web:photos.example%3A8443:alice' };
    const url = new URL(cdnImageUrl(webIdentity, { cid: 'photo-cid' })!);
    assert.equal(url.origin, 'https://cdn.bsky.app');
    assert.equal(
      decodeURIComponent(url.pathname),
      `/img/feed_thumbnail/plain/${webIdentity.did}/photo-cid@jpeg`,
    );
  });
});

describe('progressive metadata loading', () => {
  function mockRepository(
    options: {
      loop?: boolean;
      failPage?: string;
      exif?: boolean;
      wrongOwner?: boolean;
      malformedView?: boolean;
    } = {},
  ) {
    const requests: URL[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      if (init?.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
      const url = new URL(String(input));
      requests.push(url);
      if (url.hostname === 'plc.directory') return json(document);
      if (url.hostname === 'photos.example') {
        assert.equal(
          url.searchParams.get('collection'),
          'social.grain.gallery',
          'Do not scan photo/item/EXIF history',
        );
        assert.equal(url.searchParams.get('limit'), String(GALLERY_PAGE_SIZE));
        const cursor = url.searchParams.get('cursor') || '';
        if (options.failPage === cursor) return json({}, 503);
        const number = cursor ? 2 : 1;
        return json({
          records: [
            entry(`${galleryUri}-${number}`, {
              title: `Gallery ${number}`,
              description: 'A caption.',
              createdAt: `2026-10-0${3 - number}T12:00:00Z`,
            }),
          ],
          ...(!cursor || options.loop ? { cursor: 'page2' } : {}),
        });
      }
      assert.equal(url.hostname, 'grain.social');
      const uri = url.searchParams.get('gallery')!;
      const number = uri.endsWith('-2') ? 2 : 1;
      const owner = options.wrongOwner ? 'did:plc:bbbbbbbbbbbbbbbbbbbbbbbb' : TEST_DID;
      const itemUri = `at://${owner}/social.grain.photo/photo-${number}`;
      const cid = `bafkreiaaaaaaaaaaaaaaaaaaaaaa${number === 1 ? 'a' : 'b'}`;
      return json({
        gallery: {
          uri,
          items: options.malformedView
            ? undefined
            : [
                {
                  uri: itemUri,
                  thumb: `https://cdn.bsky.app/img/feed_thumbnail/plain/${owner}/${cid}@jpeg`,
                  fullsize: `https://cdn.bsky.app/img/feed_fullsize/plain/${owner}/${cid}@jpeg`,
                  aspectRatio: { width: 1200, height: 1800 },
                  alt: 'A photograph.',
                  ...(options.exif === false
                    ? {}
                    : {
                        exif: {
                          photo: itemUri,
                          make: 'FUJIFILM',
                          model: 'X-T5',
                          focalLengthIn35mmFormat: '35mm',
                          fNumber: 'f/2.8',
                          exposureTime: '1/250s',
                          iSO: 400,
                          dateTimeOriginal: '2026-09-30T18:15:00Z',
                        },
                      }),
                },
              ],
        },
      });
    }) as typeof fetch;
    return requests;
  }
  it('loads only the first post page and its metadata, without following the cursor', async () => {
    const requests = mockRepository();
    const portfolio = await loadPortfolio(TEST_DID, new AbortController().signal);
    assert.equal(portfolio.photos.length, 1);
    assert.equal(portfolio.cursor, 'page2');
    assert.equal(portfolio.identity.did, TEST_DID);
    assert.equal(requests.filter((url) => url.hostname === 'photos.example').length, 1);
    assert.equal(requests.filter((url) => url.hostname === 'grain.social').length, 1);
    assert(!requests.some((url) => url.searchParams.has('cursor')));
  });
  it('gets another metadata page only when explicitly requested', async () => {
    const requests = mockRepository();
    const signal = new AbortController().signal;
    const first = await loadPortfolio(TEST_DID, signal);
    const page = await loadPortfolioPage(first.identity, first.cursor, signal);
    const portfolio = appendPortfolioPage(first, page);
    assert.equal(portfolio.photos.length, 2);
    assert.equal(portfolio.cursor, undefined);
    assert.equal(requests.filter((url) => url.searchParams.get('cursor') === 'page2').length, 1);
    assert.equal(requests.filter((url) => url.hostname === 'plc.directory').length, 1);
    assert.deepEqual(
      portfolio.photos.map((photo) => photo.title),
      ['Gallery 1', 'Gallery 2'],
    );
  });
  it('normalizes formatted Grain EXIF without double-scaling ISO', async () => {
    mockRepository();
    const portfolio = await loadPortfolio(TEST_DID, new AbortController().signal);
    assert.deepEqual(formatExif(portfolio.photos[0].exif), ['35mm', 'ƒ/2.8', '1/250s', 'ISO 400']);
    assert.equal(portfolio.photos[0].camera, 'FUJIFILM X-T5');
    assert.equal(portfolio.photos[0].takenAt, '2026-09-30T18:15:00Z');
    assert.equal(portfolio.photos[0].description, 'A caption.');
    assert(new URL(portfolio.photos[0].originalSrc).searchParams.get('cid')?.startsWith('bafkrei'));
  });
  it('allows a photograph with no shared EXIF', async () => {
    mockRepository({ exif: false });
    const portfolio = await loadPortfolio(TEST_DID, new AbortController().signal);
    assert.equal(portfolio.photos.length, 1);
    assert.equal(portfolio.photos[0].exif, undefined);
  });
  it('does not show photos belonging to another identity', async () => {
    mockRepository({ wrongOwner: true });
    const portfolio = await loadPortfolio(TEST_DID, new AbortController().signal);
    assert.equal(portfolio.photos.length, 0);
  });
  it('retains the loaded page and cursor when a later page fails, allowing retry', async () => {
    const options = { failPage: 'page2' };
    mockRepository(options);
    const signal = new AbortController().signal;
    const first = await loadPortfolio(TEST_DID, signal);
    await assert.rejects(loadPortfolioPage(first.identity, first.cursor, signal), /503/);
    assert.equal(first.photos.length, 1);
    assert.equal(first.cursor, 'page2');
    options.failPage = '';
    const next = appendPortfolioPage(
      first,
      await loadPortfolioPage(first.identity, first.cursor, signal),
    );
    assert.equal(next.photos.length, 2);
    assert.equal(next.cursor, undefined);
  });
  it('does not duplicate photos or reorder the already displayed page', async () => {
    mockRepository();
    const first = await loadPortfolio(TEST_DID, new AbortController().signal);
    const next = appendPortfolioPage(first, { photos: first.photos, cursor: 'page3' });
    assert.equal(next.photos.length, 1);
    assert.equal(next.photos[0], first.photos[0]);
    assert.equal(first.cursor, 'page2');
  });
  it('rejects a repeated cursor and longer pagination cycles', async () => {
    mockRepository({ loop: true });
    const signal = new AbortController().signal;
    const first = await loadPortfolio(TEST_DID, signal);
    await assert.rejects(
      loadPortfolioPage(first.identity, first.cursor, signal),
      /repeated a page/,
    );
    const next = appendPortfolioPage(first, { photos: [], cursor: 'page3' });
    assert.throws(
      () => appendPortfolioPage(next, { photos: [], cursor: 'page2' }),
      /repeated a page/,
    );
  });
  it('rejects malformed gallery metadata instead of treating it as an empty post', async () => {
    mockRepository({ malformedView: true });
    await assert.rejects(
      loadPortfolio(TEST_DID, new AbortController().signal),
      /unexpected gallery metadata/,
    );
  });
  it('cancels pending metadata requests on navigation', async () => {
    mockRepository();
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(loadPortfolio(TEST_DID, controller.signal), { name: 'AbortError' });
  });
});
