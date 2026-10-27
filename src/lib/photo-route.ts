import { GalleryError } from './errors.ts';
import { galleryPath } from './routes.ts';
import type { Photo } from './grain.ts';

export interface PhotoLink {
  gallery: string;
  photo: string;
}

export function validRecordKey(key: string): boolean {
  return /^[A-Za-z0-9._~:-]{1,512}$/.test(key) && key !== '.' && key !== '..';
}

export function photoFromHash(hash: string): PhotoLink | undefined {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  if (!params.has('gallery') && !params.has('photo')) return;
  const gallery = params.get('gallery') || '';
  const photo = params.get('photo') || '';
  if (
    !validRecordKey(gallery) ||
    !validRecordKey(photo) ||
    params.getAll('gallery').length !== 1 ||
    params.getAll('photo').length !== 1
  )
    throw new GalleryError('This photo link is incomplete or invalid.');
  return { gallery, photo };
}

export function photoPath(did: string, photo: Pick<Photo, 'galleryId' | 'id'>): string {
  return `${galleryPath(did)}#${new URLSearchParams({
    gallery: photo.galleryId.split('/').at(-1)!,
    photo: photo.id.split('/').at(-1)!,
  })}`;
}
