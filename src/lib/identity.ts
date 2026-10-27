import { GalleryError } from './errors.ts';
import { normalizeActor, didDocumentUrl } from './actor.ts';
import { getJson } from './request.ts';
import type { BlobRef, Identity } from './grain.ts';

interface DidDocument {
  id: string;
  alsoKnownAs?: string[];
  service?: { id: string; type: string; serviceEndpoint: unknown }[];
}

export async function resolveIdentity(input: string, signal: AbortSignal): Promise<Identity> {
  const actor = normalizeActor(input);
  const isHandle = !actor.startsWith('did:');
  const did = isHandle
    ? (
        await getJson<{ did: string }>(
          `https://public.api.bsky.app/xrpc/com.atproto.identity.resolveHandle?handle=${encodeURIComponent(actor)}`,
          signal,
        )
      ).did
    : actor;
  if (typeof did !== 'string')
    throw new GalleryError('We couldn’t resolve that handle. Try using the account’s DID.');
  const document = await getJson<DidDocument>(didDocumentUrl(did), signal);
  if (document.id !== did)
    throw new GalleryError('This account’s identity document didn’t match its DID.');
  if (isHandle && !document.alsoKnownAs?.some((alias) => alias.toLowerCase() === `at://${actor}`)) {
    throw new GalleryError(
      'This handle couldn’t be verified. Try opening the account with its DID instead.',
    );
  }
  const service = document.service?.find(
    (entry) =>
      (entry.id === '#atproto_pds' || entry.id === `${did}#atproto_pds`) &&
      entry.type === 'AtprotoPersonalDataServer',
  );
  let pds: URL;
  try {
    if (typeof service?.serviceEndpoint !== 'string') throw new Error('No PDS');
    pds = new URL(service.serviceEndpoint);
    if (pds.protocol !== 'https:' || pds.username || pds.password || pds.search || pds.hash)
      throw new Error('Invalid PDS');
  } catch {
    throw new GalleryError(
      'This identity doesn’t have a public HTTPS data server connected to it.',
    );
  }
  const handle = document.alsoKnownAs?.find((alias) => alias.startsWith('at://'))?.slice(5) || did;
  return { did, pds: pds.href.replace(/\/$/, ''), handle };
}

export async function loadBlueskyProfile(identity: Identity, signal: AbortSignal) {
  if (identity.bluesky !== undefined) return identity.bluesky;
  try {
    const record = await getJson<{ uri: string; value?: { $type?: string; avatar?: BlobRef } }>(
      `${identity.pds}/xrpc/com.atproto.repo.getRecord?${new URLSearchParams({ repo: identity.did, collection: 'app.bsky.actor.profile', rkey: 'self' })}`,
      signal,
    );
    let profile: Identity['bluesky'] = null;
    if (
      record.uri === `at://${identity.did}/app.bsky.actor.profile/self` &&
      record.value?.$type === 'app.bsky.actor.profile'
    ) {
      const cid = record.value.avatar?.ref?.$link || record.value.avatar?.cid;
      profile = {};
      if (typeof cid === 'string' && /^b[a-z2-7]+$/.test(cid))
        profile.avatar = `https://cdn.bsky.app/img/avatar_thumbnail/plain/${encodeURIComponent(identity.did).replace(/%3A/gi, ':')}/${cid}@jpeg`;
    }
    if (!signal.aborted) identity.bluesky = profile;
    return profile;
  } catch {
    if (!signal.aborted) identity.bluesky = null;
    return null;
  }
}
