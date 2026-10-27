import { GalleryError } from './errors.ts';

export function normalizeActor(input: string): string {
  const actor = input.trim().replace(/^@/, '');
  if (!actor) throw new GalleryError('Enter a DID or handle to find your photographs.');
  if (actor.startsWith('did:plc:')) {
    if (!/^did:plc:[a-z2-7]{24}$/.test(actor))
      throw new GalleryError(
        'That DID doesn’t look quite right. A PLC DID starts with did:plc: followed by 24 letters and numbers.',
      );
    return actor;
  }
  if (actor.startsWith('did:web:')) {
    didDocumentUrl(actor);
    return actor;
  }
  if (actor.startsWith('did:'))
    throw new GalleryError('This gallery supports did:plc and did:web identities.');
  if (
    actor.length > 253 ||
    !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z][a-z0-9-]*$/i.test(actor)
  ) {
    throw new GalleryError('Enter a complete DID or a handle like yourname.bsky.social.');
  }
  return actor.toLowerCase();
}

export function didDocumentUrl(did: string): string {
  if (/^did:plc:[a-z2-7]{24}$/.test(did)) return `https://plc.directory/${did}`;
  if (!did.startsWith('did:web:'))
    throw new GalleryError('That DID isn’t supported. Use a did:plc or did:web identity.');
  try {
    const segments = did.slice(8).split(':').map(decodeURIComponent);
    const domain = segments.shift()!;
    if (
      !domain ||
      /[/@?#\s\\]/.test(domain) ||
      segments.some(
        (segment) => !segment || segment === '.' || segment === '..' || /[/?#\\]/.test(segment),
      )
    )
      throw new Error('Invalid DID');
    const path = segments.length
      ? `/${segments.map(encodeURIComponent).join('/')}/did.json`
      : '/.well-known/did.json';
    const url = new URL(`https://${domain}${path}`);
    if (url.username || url.password || url.hash || url.search) throw new Error('Invalid DID');
    return url.href;
  } catch {
    throw new GalleryError(
      'That web DID doesn’t look quite right. Check the domain and path and try again.',
    );
  }
}
