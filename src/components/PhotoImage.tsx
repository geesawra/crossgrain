import { useState } from 'react';
import type { SyntheticEvent } from 'react';
import type { Photo } from '../lib/grain';

export default function PhotoImage({ photo, fullSize = false, eager = false }: { photo: Photo; fullSize?: boolean; eager?: boolean }) {
  const [stage, setStage] = useState<'primary' | 'fallback' | 'failed'>('primary');
  const [loaded, setLoaded] = useState(false);
  const original = fullSize ? stage === 'primary' : stage === 'fallback';

  function imageFailed() {
    setLoaded(false);
    setStage(current => current === 'primary' ? 'fallback' : 'failed');
  }

  async function revealImage(event: SyntheticEvent<HTMLImageElement>) {
    const image = event.currentTarget;
    const loadedSource = image.currentSrc;
    try { await image.decode(); }
    catch {
      if (image.isConnected && image.currentSrc === loadedSource) imageFailed();
      return;
    }
    if (image.isConnected && image.currentSrc === loadedSource) setLoaded(true);
  }

  return <div className="photo-image-frame" aria-busy={!loaded && stage !== 'failed'}>
    {fullSize && !loaded && stage !== 'failed' && <span className="image-loading" role="status"><span className="image-spinner" aria-hidden="true" /><span>Loading full-resolution image…</span></span>}
    {stage !== 'failed' ? <img
      src={original ? photo.originalSrc : fullSize ? photo.fullSrc : photo.src}
      srcSet={!original && !fullSize ? `${photo.src} 1x, ${photo.fullSrc} 2x` : undefined}
      alt={photo.alt} width={photo.width} height={photo.height}
      loading={eager ? 'eager' : 'lazy'} decoding="async"
      className={`photo-image${loaded ? ' is-loaded' : ''}`}
      onLoad={revealImage} onError={imageFailed}
    /> : <span className="image-error">Photo unavailable.</span>}
  </div>;
}
