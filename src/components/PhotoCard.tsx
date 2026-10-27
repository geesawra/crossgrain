import { useState } from 'react';
import type { Photo } from '../lib/grain';
import { dateValue, formatDate, formatExif } from '../lib/grain';
import PhotoImage from './PhotoImage';

export default function PhotoCard({ photo, index, onOpen }: { photo: Photo; index: number; onOpen: (photo: Photo) => void }) {
  const [revealed, setRevealed] = useState(false);
  const warned = !!photo.contentWarning && !revealed;
  const date = photo.takenAt || photo.publishedAt;
  const hasDate = !!dateValue(date);
  const metadata = [photo.camera, ...formatExif(photo.exif)].filter(Boolean).join(' · ');
  const description = photo.description !== photo.title ? photo.description : '';

  return <figure className="photo">
    <div className="photo-media" style={{ aspectRatio: `${photo.width} / ${photo.height}` }}>
      {warned ? <div className="content-warning"><span>Content warning: {photo.contentWarning}</span><button onClick={() => setRevealed(true)}>Show photo</button></div> : <button className="photo-open" onClick={() => onOpen(photo)} aria-haspopup="dialog" aria-label={`Open ${photo.title || 'photo'}`}>
        <PhotoImage photo={photo} eager={index < 4} />
      </button>}
    </div>
    <figcaption>
      {(photo.title || description) && <button type="button" className="caption" onClick={() => onOpen(photo)}>{photo.title && <span>{photo.title}</span>}{description && <span className="description">{description}</span>}</button>}
      {(hasDate || metadata) && <p className="photo-metadata">
        {hasDate && <time dateTime={date} title={`${photo.takenAt ? 'Taken' : 'Posted'} ${new Date(date).toLocaleString()}`}>{formatDate(date)}</time>}
        {hasDate && metadata && ' · '}{metadata}
      </p>}
    </figcaption>
  </figure>;
}
