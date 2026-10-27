import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { actorQuery, searchActors } from './actor-search.ts';

const originalFetch = globalThis.fetch;
const did = 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa';
const signal = () => new AbortController().signal;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('public Bluesky account lookup', () => {
  it('normalizes prefixes and skips short queries and direct DIDs', async () => {
    assert.equal(actorQuery(' @Photo.Example '), 'photo.example');
    for (const value of ['', 'a', '@a', did, 'DID:web:example.com', 'a'.repeat(254)])
      assert.equal(actorQuery(value), '');
    globalThis.fetch = async () => {
      throw new Error('Unexpected request');
    };
    assert.deepEqual(await searchActors(did, signal()), []);
  });
  it('uses the public API without credentials and returns small, validated suggestions', async () => {
    globalThis.fetch = async (input, init) => {
      const url = new URL(String(input));
      assert.equal(url.origin, 'https://public.api.bsky.app');
      assert.equal(url.pathname, '/xrpc/app.bsky.actor.searchActorsTypeahead');
      assert.equal(url.searchParams.get('q'), 'test & lookup');
      assert.equal(url.searchParams.get('limit'), '5');
      assert.equal(init?.credentials, 'omit');
      assert(init?.signal instanceof AbortSignal);
      return Response.json({
        actors: [
          null,
          { did: 'did:plc:broken' },
          {
            did,
            handle: 'photo.example',
            displayName: '<b>Photo</b>',
            avatar: 'https://cdn.bsky.app/img/avatar/plain/photo@jpeg',
          },
          { did, handle: 'duplicate.example' },
          { did: 'did:web:photo.example', handle: 'handle.invalid', avatar: 'javascript:alert(1)' },
          { did: 'did:web:empty.example', handle: '' },
          { did: 'did:web:four.example', handle: 'four.example', displayName: 123 },
          {
            did: 'did:web:five.example',
            handle: 'five.example',
            avatar: 'https://cdn.bsky.app.evil/img/avatar/1',
          },
          { did: 'did:web:six.example', handle: 'six.example' },
        ],
      });
    };
    const actors = await searchActors(' @TEST & lookup ', signal());
    assert.equal(actors.length, 5);
    assert.deepEqual(actors[0], {
      did,
      handle: 'photo.example',
      displayName: '<b>Photo</b>',
      avatar: 'https://cdn.bsky.app/img/avatar_thumbnail/plain/photo@jpeg',
    });
    assert.equal(actors[1].handle, 'did:web:photo.example');
    assert.equal(actors[2].handle, 'did:web:empty.example');
    assert.equal(actors[1].avatar, undefined);
    assert.equal(actors[4].avatar, undefined);
    assert.equal(actors[3].displayName, '');
  });
  it('reuses recent results, expires them after five minutes, and bounds the memory cache', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: 1_000_000 });
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ actors: [] });
    };
    await searchActors('cache-first', signal());
    await searchActors(' @CACHE-FIRST ', signal());
    assert.equal(calls, 1);
    t.mock.timers.tick(300_001);
    await searchActors('cache-first', signal());
    assert.equal(calls, 2);
    for (let i = 0; i < 20; i++) await searchActors(`cache-extra-${i}`, signal());
    await searchActors('cache-first', signal());
    assert.equal(calls, 23);
  });
  it('rejects failures and malformed responses without caching them', async () => {
    for (const response of [
      new Response('', { status: 503 }),
      Response.json({}),
      Response.json(null),
    ]) {
      globalThis.fetch = async () => response;
      await assert.rejects(searchActors('failure-query', signal()));
    }
    globalThis.fetch = async () => Response.json({ actors: [] });
    assert.deepEqual(await searchActors('failure-query', signal()), []);
  });
  it('does not cache responses that arrive after cancellation', async () => {
    const controller = new AbortController();
    globalThis.fetch = async () => {
      controller.abort();
      return Response.json({ actors: [] });
    };
    await assert.rejects(searchActors('cancelled-query', controller.signal), {
      name: 'AbortError',
    });
    let calls = 0;
    globalThis.fetch = async () => {
      calls++;
      return Response.json({ actors: [] });
    };
    await searchActors('cancelled-query', signal());
    assert.equal(calls, 1);
    await assert.rejects(searchActors('cancelled-query', controller.signal), {
      name: 'AbortError',
    });
  });
});
