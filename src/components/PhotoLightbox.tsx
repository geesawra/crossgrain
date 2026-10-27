import { useEffect, useId, useRef, useState } from 'react';
import type { Photo } from '../lib/grain';
import { dateValue, formatExif } from '../lib/grain';
import PhotoImage from './PhotoImage';

function LightboxImage({ photo }: { photo: Photo }) {
  const [revealed, setRevealed] = useState(false);
  return photo.contentWarning && !revealed
    ? <div className="content-warning"><span>Content warning: {photo.contentWarning}</span><button onClick={() => setRevealed(true)}>Show photo</button></div>
    : <PhotoImage photo={photo} fullSize eager />;
}

interface LightboxProps {
  photo: Photo;
  canPrevious: boolean;
  canNext: boolean;
  loadingNext: boolean;
  error: string;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
}

function timestamp(value: string): string {
  return dateValue(value) ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '';
}

export default function PhotoLightbox({ photo, canPrevious, canNext, loadingNext, error, onPrevious, onNext, onClose }: LightboxProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [showDetails, setShowDetails] = useState(true);
  const detailsId = useId();

  useEffect(() => {
    const element = dialog.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    return () => { element.close(); document.body.style.overflow = previousOverflow; };
  }, []);

  const fields = [
    ['Camera', photo.camera],
    ['Lens', photo.exif?.lensModel || photo.exif?.lensMake || ''],
    ...formatExif(photo.exif).map(value => [value.endsWith('mm') ? 'Focal length' : value.startsWith('ƒ/') ? 'Aperture' : value.startsWith('ISO ') ? 'ISO' : 'Exposure', value.replace(/^ISO /, '')]),
    ['Taken', timestamp(photo.takenAt || '')],
  ].filter(([, value]) => value);

  return <dialog ref={dialog} className="lightbox" aria-label={photo.title || 'Photograph'} onClose={() => { if (!dialog.current?.open) onClose(); }}
    onCancel={event => { event.preventDefault(); dialog.current?.close(); }}
    onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
    onKeyDown={event => {
      if (event.key === 'ArrowLeft' && canPrevious) { event.preventDefault(); onPrevious(); }
      if (event.key === 'ArrowRight' && canNext && !loadingNext) { event.preventDefault(); onNext(); }
    }}>
    <div className={`lightbox-layout${showDetails ? '' : ' lightbox-details-hidden'}`}>
      <div className="lightbox-controls"><button onClick={onPrevious} disabled={!canPrevious} aria-label="Previous photo">←</button><button onClick={onNext} disabled={!canNext || loadingNext} aria-label="Next photo">→</button></div>
      <button className="lightbox-details-toggle" aria-expanded={showDetails} aria-controls={detailsId} onClick={() => setShowDetails(value => !value)}>{showDetails ? 'Hide details' : 'Show details'}</button>
      <button className="lightbox-close" onClick={() => dialog.current?.close()} aria-label="Close photo" autoFocus>×</button>
      <div className="lightbox-image"><LightboxImage photo={photo} key={photo.id} /></div>
      <div className="lightbox-details" id={detailsId} hidden={!showDetails}>
        {(photo.caption || photo.title) && <p className="lightbox-caption">{photo.caption || photo.title}</p>}
        {photo.description && photo.description !== photo.caption && <p className="lightbox-description">{photo.description}</p>}
        {fields.length > 0 && <dl className="lightbox-metadata">{fields.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>}
        <a className="grain-link" href={photo.href} target="_blank" rel="noopener noreferrer">View on Grain ↗</a>
        {loadingNext && <p className="lightbox-status" role="status">Loading more photos…</p>}
        {error && <p className="lightbox-status" role="alert">{error} Use the next arrow to retry.</p>}
      </div>
    </div>
  </dialog>;
}
