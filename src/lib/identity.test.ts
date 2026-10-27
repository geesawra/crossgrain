import { afterEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadBlueskyProfile } from './identity.ts';
import type { Identity } from './grain.ts';

const originalFetch = globalThis.fetch;
const account = (): Identity => ({
  did: 'did:plc:aaaaaaaaaaaaaaaaaaaaaaaa',
  handle: 'photographer.example',
  pds: 'https://photos.example',
});
const record = (identity: Identity, avatar?: unknown) => ({
  uri: `at://${identity.did}/app.bsky.actor.profile/self`,
  value: { $type: 'app.bsky.actor.profile', avatar },
});
afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('optional Bluesky profile', () => {
  it('reads only this account’s self record and reuses it for the avatar and profile link', async () => {
    const identity = account();
    let requests = 0;
    globalThis.fetch = async (input, init) => {
      requests++;
      const url = new URL(String(input));
      assert.equal(url.origin, identity.pds);
      assert.equal(url.pathname, '/xrpc/com.atproto.repo.getRecord');
      assert.equal(url.searchParams.get('repo'), identity.did);
      assert.equal(url.searchParams.get('collection'), 'app.bsky.actor.profile');
      assert.equal(url.searchParams.get('rkey'), 'self');
      assert(init?.signal);
      return Response.json(record(identity, { ref: { $link: 'bafkreiaaaaa' } }));
    };
    const signal = new AbortController().signal;
    const profile = await loadBlueskyProfile(identity, signal);
    assert.deepEqual(profile, {
      avatar: `https://cdn.bsky.app/img/avatar_thumbnail/plain/${identity.did}/bafkreiaaaaa@jpeg`,
    });
    assert.equal(await loadBlueskyProfile(identity, signal), profile);
    assert.equal(requests, 1);
  });
  it('keeps a valid profile link when its avatar is missing or malformed', async () => {
    for (const avatar of [undefined, {}, { ref: { $link: 'https://other.example/image' } }]) {
      const identity = account();
      globalThis.fetch = async () => Response.json(record(identity, avatar));
      assert.deepEqual(await loadBlueskyProfile(identity, new AbortController().signal), {});
    }
  });
  it('quietly ignores a missing, unavailable, or unrelated profile', async () => {
    const responses = [
      new Response('', { status: 404 }),
      Response.json({ error: 'RecordNotFound' }, { status: 400 }),
      new Response('', { status: 503 }),
      Response.json({ ...record(account()), uri: 'at://another/app.bsky.actor.profile/self' }),
      Response.json({ ...record(account()), value: { $type: 'another.collection' } }),
    ];
    for (const response of responses) {
      const identity = account();
      globalThis.fetch = async () => response;
      assert.equal(await loadBlueskyProfile(identity, new AbortController().signal), null);
      assert.equal(identity.bluesky, null);
    }
  });
  it('does not cache an aborted lookup as a missing profile', async () => {
    const identity = account();
    const controller = new AbortController();
    globalThis.fetch = async () => {
      controller.abort();
      throw new DOMException('Aborted', 'AbortError');
    };
    assert.equal(await loadBlueskyProfile(identity, controller.signal), null);
    assert.equal(identity.bluesky, undefined);
  });
});
