import { GalleryError } from './errors.ts';
import { getJson } from './request.ts';
import { resolveIdentity } from './identity.ts';
export { GalleryError } from './errors.ts';
export { normalizeActor, didDocumentUrl } from './actor.ts';
export { resolveIdentity } from './identity.ts';

export interface BlobRef {
  ref?: { $link: string };
  cid?: string;
}
export interface PhotoRecord {
  photo: BlobRef;
  alt?: string;
  aspectRatio?: { width: number; height: number };
  createdAt?: string;
}
export interface ExifRecord {
  photo: string;
  dateTimeOriginal?: string;
  make?: string;
  model?: string;
  lensMake?: string;
  lensModel?: string;
  exposureTime?: number;
  fNumber?: number;
  focalLengthIn35mmFormat?: number;
  iSO?: number;
}
export interface GalleryRecord {
  title: string;
  description?: string;
  createdAt?: string;
  labels?: { values?: { val: string }[] };
}
export interface ItemRecord {
  gallery: string;
  item: string;
  position?: number;
}
export interface RecordEntry<T> {
  uri: string;
  cid?: string;
  value: T;
}
export interface Photo {
  id: string;
  src: string;
  fullSrc: string;
  originalSrc: string;
  alt: string;
  width: number;
  height: number;
  title: string;
  description: string;
  caption: string;
  publishedAt: string;
  takenAt?: string;
  href: string;
  galleryId: string;
  camera: string;
  exif?: ExifRecord;
  contentWarning?: string;
}
export interface Identity {
  did: string;
  pds: string;
  handle: string;
}
export interface PhotoGroup {
  id: string;
  title: string;
  description: string;
  takenFrom?: string;
  takenTo?: string;
  photos: Photo[];
}
export interface PortfolioPage {
  photos: Photo[];
  cursor?: string;
}
export interface Portfolio extends PortfolioPage {
  identity: Identity;
  seenCursors: string[];
}
export const GALLERY_PAGE_SIZE = 3;

interface ExifView extends Omit<
  ExifRecord,
  'exposureTime' | 'fNumber' | 'focalLengthIn35mmFormat'
> {
  exposureTime?: string | number;
  fNumber?: string | number;
  focalLengthIn35mmFormat?: string | number;
}
interface PhotoView {
  uri: string;
  thumb: string;
  fullsize: string;
  alt?: string;
  aspectRatio?: PhotoRecord['aspectRatio'];
  createdAt?: string;
  exif?: ExifView;
  gallery?: { item: string; itemCreatedAt: string; itemPosition: number };
}
interface GalleryView {
  uri: string;
  items: PhotoView[];
  labels?: { val: string }[];
}
export function blobUrl(identity: Identity, blob?: BlobRef): string | undefined {
  const cid = blob?.ref?.$link || blob?.cid;
  if (!cid) return undefined;
  return `${identity.pds}/xrpc/com.atproto.sync.getBlob?${new URLSearchParams({ did: identity.did, cid })}`;
}

export function cdnImageUrl(
  identity: Identity,
  blob?: BlobRef,
  preset: 'feed_thumbnail' | 'feed_fullsize' = 'feed_thumbnail',
): string | undefined {
  const cid = blob?.ref?.$link || blob?.cid;
  if (!cid) return undefined;
  const did = encodeURIComponent(identity.did).replace(/%3A/gi, ':');
  return `https://cdn.bsky.app/img/${preset}/plain/${did}/${encodeURIComponent(cid)}@jpeg`;
}

export function cameraName(exif?: ExifRecord): string {
  if (!exif) return '';
  const make = exif.make?.trim() || '';
  const model = exif.model?.trim() || '';
  return model.toLowerCase().startsWith(make.toLowerCase())
    ? model
    : [make, model].filter(Boolean).join(' ');
}

// Grain scales all numeric EXIF values, including ISO, by one million.
export function formatExif(exif?: ExifRecord): string[] {
  if (!exif) return [];
  const settings: string[] = [];
  const scaled = (value?: number) => (value && value > 0 ? value / 1_000_000 : 0);
  const focal = scaled(exif.focalLengthIn35mmFormat);
  const aperture = scaled(exif.fNumber);
  const shutter = scaled(exif.exposureTime);
  const iso = scaled(exif.iSO);
  if (focal) settings.push(`${Number(focal.toFixed(1))}mm`);
  if (aperture) settings.push(`ƒ/${Number(aperture.toFixed(1))}`);
  if (shutter)
    settings.push(shutter < 1 ? `1/${Math.round(1 / shutter)}s` : `${Number(shutter.toFixed(2))}s`);
  if (iso) settings.push(`ISO ${Math.round(iso)}`);
  return settings;
}

export function buildPhotos(
  identity: Identity,
  photos: RecordEntry<PhotoRecord>[],
  galleries: RecordEntry<GalleryRecord>[],
  items: RecordEntry<ItemRecord>[],
  exifs: RecordEntry<ExifRecord>[],
): Photo[] {
  const galleryMap = new Map(galleries.map((record) => [record.uri, record.value]));
  const itemMap = new Map<string, ItemRecord>();
  items.forEach((record) => {
    if (!itemMap.has(record.value.item)) itemMap.set(record.value.item, record.value);
  });
  const exifMap = new Map(exifs.map((record) => [record.value.photo, record.value]));
  return photos.flatMap(({ uri, value }) => {
    const src = cdnImageUrl(identity, value.photo);
    const fullSrc = cdnImageUrl(identity, value.photo, 'feed_fullsize');
    const originalSrc = blobUrl(identity, value.photo);
    if (!src || !fullSrc || !originalSrc) return [];
    const item = itemMap.get(uri);
    const gallery = item ? galleryMap.get(item.gallery) : undefined;
    // Unattached uploads have no Grain post to visit and may be discarded drafts.
    if (!gallery || !item) return [];
    const exif = exifMap.get(uri);
    const aspect = value.aspectRatio;
    const width = aspect && aspect.width > 0 ? aspect.width : 4;
    const height = aspect && aspect.height > 0 ? aspect.height : 3;
    const warning = gallery.labels?.values
      ?.map((label) => label.val)
      .filter((label) =>
        ['porn', 'sexual', 'nudity', 'graphic-media', 'corpse', 'gore'].includes(label),
      )
      .join(', ');
    return [
      {
        id: uri,
        src,
        fullSrc,
        originalSrc,
        width,
        height,
        alt: value.alt || gallery.title || 'Photograph from Grain',
        title: gallery.title || '',
        description: gallery.description || '',
        caption: value.alt || '',
        publishedAt: value.createdAt || gallery.createdAt || '',
        takenAt: exif?.dateTimeOriginal,
        href: `https://grain.social/profile/${encodeURIComponent(identity.did)}/gallery/${encodeURIComponent(item.gallery.split('/').at(-1)!)}`,
        galleryId: item.gallery,
        camera: cameraName(exif),
        exif,
        contentWarning: warning,
      },
    ];
  });
}

// The public gallery view includes only the requested post's photos and EXIF.
// Reading it per page avoids scanning the whole photo/item/EXIF collections.
function photoBlob(view: PhotoView): BlobRef {
  for (const source of [view.fullsize, view.thumb]) {
    try {
      const url = new URL(source);
      const cid =
        url.searchParams.get('cid') ||
        decodeURIComponent(url.pathname.split('/').at(-1) || '').split('@')[0];
      if (/^b[a-z2-7]+$/.test(cid)) return { ref: { $link: cid } };
    } catch {
      /* Try the other image URL. */
    }
  }
  throw new GalleryError('Grain returned an unsupported image URL. Please try again later.');
}

function normalizeExif(view: ExifView): ExifRecord {
  const scaled = (value?: string | number): number | undefined => {
    const number =
      typeof value === 'number' ? value : Number.parseFloat((value || '').replace(/^[fƒ]\//i, ''));
    return Number.isFinite(number) && number > 0 ? Math.round(number * 1_000_000) : undefined;
  };
  let exposure: number | undefined;
  if (typeof view.exposureTime === 'string' && view.exposureTime.includes('/')) {
    const [numerator, denominator] = view.exposureTime.split('/').map(Number.parseFloat);
    if (denominator > 0) exposure = scaled(numerator / denominator);
  } else exposure = scaled(view.exposureTime);
  return {
    ...view,
    exposureTime: exposure,
    fNumber: scaled(view.fNumber),
    focalLengthIn35mmFormat: scaled(view.focalLengthIn35mmFormat),
    iSO: scaled(view.iSO),
  };
}

async function loadGallery(
  identity: Identity,
  record: RecordEntry<GalleryRecord>,
  signal: AbortSignal,
): Promise<Photo[]> {
  const result = await getJson<{ gallery: GalleryView }>(
    `https://grain.social/xrpc/social.grain.unspecced.getGallery?${new URLSearchParams({ gallery: record.uri })}`,
    signal,
  );
  const view = result.gallery;
  if (!view || view.uri !== record.uri || !Array.isArray(view.items))
    throw new GalleryError('Grain returned unexpected gallery metadata. Please try again.');
  const photos: RecordEntry<PhotoRecord>[] = [];
  const items: RecordEntry<ItemRecord>[] = [];
  const exifs: RecordEntry<ExifRecord>[] = [];
  for (const photo of view.items) {
    // A portfolio only displays photos owned by the requested identity.
    if (!photo.uri.startsWith(`at://${identity.did}/social.grain.photo/`)) continue;
    photos.push({
      uri: photo.uri,
      value: {
        photo: photoBlob(photo),
        alt: photo.alt,
        aspectRatio: photo.aspectRatio,
        createdAt: photo.createdAt || photo.gallery?.itemCreatedAt || record.value.createdAt,
      },
    });
    items.push({
      uri: photo.gallery?.item || photo.uri,
      value: { item: photo.uri, gallery: record.uri, position: photo.gallery?.itemPosition },
    });
    if (photo.exif) exifs.push({ uri: photo.uri, value: normalizeExif(photo.exif) });
  }
  const labels = [...(record.value.labels?.values || []), ...(view.labels || [])];
  return buildPhotos(
    identity,
    photos,
    [{ ...record, value: { ...record.value, labels: { values: labels } } }],
    items,
    exifs,
  );
}

export async function loadPortfolioPage(
  identity: Identity,
  cursor: string | undefined,
  signal: AbortSignal,
): Promise<PortfolioPage> {
  const params = new URLSearchParams({
    repo: identity.did,
    collection: 'social.grain.gallery',
    limit: String(GALLERY_PAGE_SIZE),
  });
  if (cursor) params.set('cursor', cursor);
  const page = await getJson<{ records: RecordEntry<GalleryRecord>[]; cursor?: string }>(
    `${identity.pds}/xrpc/com.atproto.repo.listRecords?${params}`,
    signal,
  );
  if (
    !Array.isArray(page.records) ||
    (page.cursor !== undefined && typeof page.cursor !== 'string')
  )
    throw new GalleryError('This account’s data server returned an unexpected record list.');
  if (cursor && page.cursor === cursor)
    throw new GalleryError(
      'The data server repeated a page. Please try loading the gallery again.',
    );
  if (
    page.records.some(
      (record) => !record.uri.startsWith(`at://${identity.did}/social.grain.gallery/`),
    )
  )
    throw new GalleryError('The returned galleries don’t belong to this account.');
  const galleries = await Promise.all(
    page.records.map((record) => loadGallery(identity, record, signal)),
  );
  const photos = [...new Map(galleries.flat().map((photo) => [photo.id, photo])).values()];
  photos.sort((a, b) => dateValue(b.publishedAt) - dateValue(a.publishedAt));
  return { photos, cursor: page.cursor || undefined };
}

export async function loadPortfolio(actor: string, signal: AbortSignal): Promise<Portfolio> {
  const identity = await resolveIdentity(actor, signal);
  const page = await loadPortfolioPage(identity, undefined, signal);
  return { identity, ...page, seenCursors: page.cursor ? [page.cursor] : [] };
}

export function appendPortfolioPage(portfolio: Portfolio, page: PortfolioPage): Portfolio {
  if (page.cursor && portfolio.seenCursors.includes(page.cursor))
    throw new GalleryError(
      'The data server repeated a page. Please try loading the gallery again.',
    );
  const photos = new Map(portfolio.photos.map((photo) => [photo.id, photo]));
  for (const photo of page.photos) if (!photos.has(photo.id)) photos.set(photo.id, photo);
  return {
    ...portfolio,
    cursor: page.cursor,
    photos: [...photos.values()],
    seenCursors: page.cursor ? [...portfolio.seenCursors, page.cursor] : portfolio.seenCursors,
  };
}

export function groupPhotos(photos: Photo[]): PhotoGroup[] {
  const groups = new Map<string, PhotoGroup>();
  for (const photo of photos) {
    let group = groups.get(photo.galleryId);
    if (!group) {
      group = {
        id: photo.galleryId,
        title: photo.title,
        description: photo.description,
        photos: [],
      };
      groups.set(photo.galleryId, group);
    }
    group.photos.push(photo);
    const taken = dateValue(photo.takenAt || '');
    if (taken) {
      if (!group.takenFrom || taken < dateValue(group.takenFrom)) group.takenFrom = photo.takenAt;
      if (!group.takenTo || taken > dateValue(group.takenTo)) group.takenTo = photo.takenAt;
    }
  }
  return [...groups.values()];
}

export function dateValue(date: string): number {
  const value = Date.parse(date);
  return Number.isNaN(value) ? 0 : value;
}

export function formatDate(date: string): string {
  return dateValue(date)
    ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(date),
      )
    : 'Date not shared';
}
