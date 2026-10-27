import { GalleryError } from './errors.ts';

// Record requests go straight from the browser to the public data owner.
export async function getJson<T>(url: string, signal: AbortSignal, notFound?: string): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(25_000)]) });
  } catch (error) {
    if (signal.aborted) throw error;
    throw new GalleryError(
      'We couldn’t reach this account’s data server. It may be offline or may not allow browser access. Please try again in a moment.',
    );
  }
  if (!response.ok) {
    if (response.status === 429)
      throw new GalleryError(
        'This account’s data server is busy. Please give it a moment, then try again.',
      );
    if (
      response.status === 404 ||
      (notFound &&
        response.status === 400 &&
        (await response.json().catch(() => null))?.error === 'RecordNotFound')
    )
      throw new GalleryError(
        notFound || 'We couldn’t find that account. Check the DID or handle and try again.',
      );
    throw new GalleryError(
      `This account’s data server couldn’t complete the request (${response.status}). Please try again.`,
    );
  }
  try {
    return (await response.json()) as T;
  } catch {
    throw new GalleryError(
      'The account’s data server sent an unexpected response. Please try again later.',
    );
  }
}
