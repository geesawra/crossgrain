import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import Masonry from './components/Masonry';
import GalleryGroup from './components/GalleryGroup';
import PhotoLightbox from './components/PhotoLightbox';
import { appendPortfolioPage, GalleryError, loadPortfolio, loadPortfolioPage, groupPhotos, normalizeActor } from './lib/grain';
import type { Photo, Portfolio } from './lib/grain';
import { actorFromPath, galleryPath } from './lib/routes';

const portfolioCache = new Map<string, { data: Portfolio; time: number }>();

function routeActor(): string {
  return typeof window === 'undefined' ? '' : actorFromPath(window.location.pathname);
}

function Home({ onOpen }: { onOpen: (actor: string) => void }) {
  const [input, setInput] = useState('');
  const [error, setError] = useState('');

  useEffect(() => { document.title = 'Photoshow'; }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    try { onOpen(normalizeActor(input)); }
    catch (error) { setError(error instanceof Error ? error.message : 'Enter a Grain handle or DID.'); }
  }

  return <main className="home">
    <form className="handle-form" onSubmit={submit} noValidate>
      <label htmlFor="handle" className="sr-only">Your Grain handle or DID</label>
      <div className="handle-input">
        <input id="handle" value={input} onChange={event => { setInput(event.target.value); setError(''); }}
          placeholder="your handle here" autoCapitalize="none" autoCorrect="off" spellCheck={false}
          aria-invalid={!!error} aria-describedby={error ? 'handle-error' : undefined} />
        <button type="submit">Open</button>
      </div>
      {error && <p id="handle-error" className="form-error" role="alert">{error}</p>}
    </form>
  </main>;
}

function Gallery({ actor, onHome }: { actor: string; onHome: () => void }) {
  const [portfolio, setPortfolio] = useState<Portfolio | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  const [moreError, setMoreError] = useState('');
  const [activeId, setActiveId] = useState<string | null>(null);
  const sentinel = useRef<HTMLDivElement>(null);
  const current = useRef<Portfolio | null>(null);
  const controller = useRef<AbortController | null>(null);
  const pendingPage = useRef<Promise<Portfolio | undefined> | null>(null);

  const commit = useCallback((data: Portfolio) => {
    current.current = data;
    setPortfolio(data);
    const cached = { data, time: Date.now() };
    portfolioCache.set(actor, cached);
    portfolioCache.set(data.identity.did, cached);
  }, [actor]);

  useEffect(() => {
    const request = new AbortController();
    controller.current = request;
    const cached = portfolioCache.get(actor);
    if (cached && Date.now() - cached.time < 300_000) {
      commit(cached.data); setStatus('ready');
      window.history.replaceState({}, '', galleryPath(cached.data.identity.did));
      return () => request.abort();
    }
    setStatus('loading'); setError(''); setPortfolio(null);
    loadPortfolio(actor, request.signal).then(data => {
      if (request.signal.aborted) return;
      commit(data); setStatus('ready');
      window.history.replaceState({}, '', galleryPath(data.identity.did));
    }).catch(error => {
      if (request.signal.aborted) return;
      request.abort();
      setError(error instanceof GalleryError ? error.message : 'Couldn’t load this gallery. Please try again.');
      setStatus('error');
    });
    return () => request.abort();
  }, [actor, retry, commit]);

  const loadMore = useCallback((): Promise<Portfolio | undefined> => {
    if (pendingPage.current) return pendingPage.current;
    const data = current.current;
    const signal = controller.current?.signal;
    if (!data?.cursor || !signal || signal.aborted) return Promise.resolve(undefined);
    setLoadingMore(true); setMoreError('');
    const promise = loadPortfolioPage(data.identity, data.cursor, signal).then(page => {
      if (signal.aborted) return undefined;
      const next = appendPortfolioPage(data, page);
      commit(next);
      return next;
    }).catch(error => {
      if (!signal.aborted) setMoreError(error instanceof GalleryError ? error.message : 'Couldn’t load more photos. Please try again.');
      return undefined;
    }).finally(() => {
      pendingPage.current = null;
      if (!signal.aborted) setLoadingMore(false);
    });
    pendingPage.current = promise;
    return promise;
  }, [commit]);

  useEffect(() => {
    document.title = portfolio ? `${portfolio.identity.handle} — Photoshow` : 'Photoshow';
  }, [portfolio]);

  const groups = useMemo(() => groupPhotos(portfolio?.photos || []), [portfolio]);
  const photos = useMemo(() => groups.flatMap(group => group.photos), [groups]);
  const eagerIds = useMemo(() => new Set(photos.slice(0, 4).map(photo => photo.id)), [photos]);
  const openPhoto = useCallback((photo: Photo) => setActiveId(photo.id), []);
  const items = useMemo(() => groups.map(group => ({
    id: group.id, content: <GalleryGroup group={group} eagerIds={eagerIds} onOpen={openPhoto} />,
  })), [groups, eagerIds, openPhoto]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || moreError) return;
    const observer = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      void loadMore();
    }, { rootMargin: '1200px' });
    observer.observe(element);
    return () => observer.disconnect();
  }, [groups.length, portfolio?.cursor, moreError, loadMore]);

  const activeIndex = photos.findIndex(photo => photo.id === activeId);
  const hasMore = !!portfolio?.cursor;
  async function nextPhoto() {
    const index = activeIndex + 1;
    const data = index < photos.length ? portfolio : await loadMore();
    if (controller.current?.signal.aborted) return;
    const nextPhotos = data ? groupPhotos(data.photos).flatMap(group => group.photos) : [];
    if (index < nextPhotos.length) setActiveId(currentId => currentId === activeId ? nextPhotos[index].id : currentId);
  }

  return <main className="gallery" aria-label="Photographs" aria-busy={status === 'loading'}>
    {status === 'loading' && <p className="gallery-state" role="status">Loading photos…</p>}
    {status === 'error' && <div className="gallery-state"><p role="alert">{error}</p><div className="state-actions"><button onClick={() => setRetry(value => value + 1)}>Retry</button><button onClick={onHome}>Change account</button></div></div>}
    {status === 'ready' && <>
      {photos.length ? <Masonry items={items} variant="galleries" /> : <div className="gallery-state"><p>{hasMore ? 'Loading photos…' : 'No public Grain photos.'}</p>{!hasMore && <button onClick={onHome}>Change account</button>}</div>}
      {hasMore && <div ref={sentinel} className="gallery-sentinel" aria-hidden="true" />}
      {loadingMore && <p className="pagination-status" role="status">Loading photos…</p>}
      {moreError && <div className="pagination-status"><p role="alert">{moreError}</p><button onClick={() => void loadMore()}>Retry</button></div>}
    </>}
    {activeIndex >= 0 && <PhotoLightbox photo={photos[activeIndex]} canPrevious={activeIndex > 0}
      canNext={activeIndex < photos.length - 1 || hasMore} loadingNext={loadingMore && activeIndex === photos.length - 1}
      error={activeIndex === photos.length - 1 ? moreError : ''}
      onPrevious={() => { if (activeIndex > 0) setActiveId(photos[activeIndex - 1].id); }}
      onNext={() => void nextPhoto()} onClose={() => setActiveId(null)} />}
  </main>;
}

export default function App() {
  const [actor, setActor] = useState(routeActor);

  useEffect(() => {
    const onPop = () => setActor(routeActor());
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  function navigate(nextActor: string) {
    window.history.pushState({}, '', galleryPath(nextActor));
    setActor(nextActor);
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  // The home page never mounts a loader or requests an account's photographs.
  return actor ? <Gallery key={actor} actor={actor} onHome={() => navigate('')} /> : <Home onOpen={navigate} />;
}
