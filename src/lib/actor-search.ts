import { normalizeActor } from './actor.ts';

export interface ActorSuggestion {
  did: string;
  handle: string;
  displayName: string;
  avatar?: string;
}

const cache = new Map<string, { actors: ActorSuggestion[]; time: number }>();

export function actorQuery(value: string): string {
  const query = value.trim().replace(/^@/, '').toLowerCase();
  return query.length >= 2 && query.length <= 253 && !query.startsWith('did:') ? query : '';
}

export async function searchActors(value: string, signal: AbortSignal): Promise<ActorSuggestion[]> {
  signal.throwIfAborted();
  const query = actorQuery(value);
  if (!query) return [];
  const saved = cache.get(query);
  if (saved && Date.now() - saved.time < 300_000) return saved.actors;
  const response = await fetch(
    `https://public.api.bsky.app/xrpc/app.bsky.actor.searchActorsTypeahead?${new URLSearchParams({ q: query, limit: '5' })}`,
    { signal: AbortSignal.any([signal, AbortSignal.timeout(8000)]), credentials: 'omit' },
  );
  if (!response.ok) throw new Error('Search unavailable');
  const data = await response.json();
  if (!Array.isArray(data?.actors)) throw new Error('Unexpected search results');
  const actors: ActorSuggestion[] = [];
  const seen = new Set<string>();
  for (const actor of data.actors) {
    try {
      const did = typeof actor?.did === 'string' ? normalizeActor(actor.did) : '';
      if (!did.startsWith('did:') || seen.has(did)) continue;
      seen.add(did);
      const handle =
        typeof actor.handle === 'string' && actor.handle && actor.handle !== 'handle.invalid'
          ? actor.handle
          : did;
      actors.push({
        did,
        handle,
        displayName: typeof actor.displayName === 'string' ? actor.displayName : '',
        avatar:
          typeof actor.avatar === 'string' &&
          /^https:\/\/cdn\.bsky\.app\/img\/avatar(?:_thumbnail)?\//.test(actor.avatar)
            ? actor.avatar.replace('/img/avatar/', '/img/avatar_thumbnail/')
            : undefined,
      });
      if (actors.length === 5) break;
    } catch {
      /* Ignore malformed identities without discarding other suggestions. */
    }
  }
  signal.throwIfAborted();
  if (cache.size >= 20) cache.delete(cache.keys().next().value!);
  cache.set(query, { actors, time: Date.now() });
  return actors;
}
