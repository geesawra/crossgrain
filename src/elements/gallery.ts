import { html, nothing, type PropertyValues } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import { createRef, ref } from 'lit/directives/ref.js';
import {
  appendPortfolioPage,
  groupPhotos,
  loadPortfolio,
  loadPortfolioPage,
} from '../lib/grain.ts';
import type { Photo, PhotoGroup, Portfolio } from '../lib/grain.ts';
import { actorFromPath, galleryPath } from '../lib/routes.ts';
import { photoFromHash, photoPath } from '../lib/photo-route.ts';
import { errorMessage } from '../ui/dom.ts';
import { PhotoElement } from '../ui/element.ts';
import { loadTechnicalTypography } from '../ui/typography.ts';
import './group.ts';
import type { PhotoLightbox } from './lightbox.ts';

const portfolioCache = new Map<string, { data: Portfolio; time: number }>();

export class PhotoGallery extends PhotoElement {
  static properties = {
    actor: { attribute: false },
    current: { state: true },
    initialError: { state: true },
    loadingMore: { state: true },
    moreError: { state: true },
    viewerError: { state: true },
    viewerReady: { state: true },
    activeId: { state: true },
  };
  declare actor: string;
  declare private current?: Portfolio;
  declare private initialError: string;
  declare private loadingMore: boolean;
  declare private moreError: string;
  declare private viewerError: string;
  declare private viewerReady: boolean;
  declare private activeId: string | null;
  #groups: PhotoGroup[] = [];
  #photos: Photo[] = [];
  #eagerIds = new Set<string>();
  #controller?: AbortController;
  #pending?: Promise<Portfolio | undefined>;
  #observer?: IntersectionObserver;
  #viewerVersion = 0;
  #linkedGallery = '';
  #did = '';
  #routeHash = '';
  #routeChanged = () => {
    if (
      !this.matchesActor(actorFromPath(window.location.pathname)) ||
      this.#routeHash === window.location.hash
    )
      return;
    this.#routeHash = window.location.hash;
    void this.#readPhotoRoute();
  };
  #sentinel = createRef<HTMLDivElement>();
  #lightbox = createRef<PhotoLightbox>();

  constructor() {
    super();
    this.actor = '';
    this.initialError = this.moreError = this.viewerError = '';
    this.loadingMore = this.viewerReady = false;
    this.activeId = null;
  }
  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('popstate', this.#routeChanged);
    window.addEventListener('hashchange', this.#routeChanged);
    if (this.hasUpdated) void this.#start();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#controller?.abort();
    this.#observer?.disconnect();
    this.#viewerVersion++;
    this.activeId = null;
    this.#lightbox.value?.dismiss();
    window.removeEventListener('popstate', this.#routeChanged);
    window.removeEventListener('hashchange', this.#routeChanged);
  }
  protected updated(changed: PropertyValues) {
    if (changed.has('actor')) void this.#start();
    if (changed.has('current') || changed.has('moreError')) this.#observeMore();
    this.#updateLightbox();
  }
  #home() {
    this.dispatchEvent(new Event('gallery-home', { bubbles: true }));
  }
  matchesActor(actor: string) {
    return !!actor && (actor === this.actor || actor === this.#did);
  }

  #cacheKey(actor: string) {
    return this.#linkedGallery ? `${actor}#${this.#linkedGallery}` : actor;
  }

  async #start(refresh = false) {
    this.#controller?.abort();
    const controller = (this.#controller = new AbortController());
    this.#observer?.disconnect();
    this.activeId = null;
    this.#viewerVersion++;
    this.#lightbox.value?.dismiss();
    this.current = undefined;
    this.#groups = [];
    this.#photos = [];
    this.#pending = undefined;
    this.loadingMore = false;
    this.initialError = this.moreError = this.viewerError = '';
    this.#routeHash = window.location.hash;
    try {
      const link = photoFromHash(this.#routeHash);
      this.#linkedGallery = link?.gallery || '';
      const full = !refresh && portfolioCache.get(this.actor);
      if (
        full &&
        Date.now() - full.time < 300_000 &&
        full.data.photos.some(
          (photo) =>
            photo.galleryId ===
            `at://${full.data.identity.did}/social.grain.gallery/${link?.gallery}`,
        )
      )
        this.#linkedGallery = '';
      const cached = !refresh && portfolioCache.get(this.#cacheKey(this.actor));
      const [data] = await Promise.all([
        cached && Date.now() - cached.time < 300_000
          ? cached.data
          : loadPortfolio(this.actor, controller.signal, this.#linkedGallery || undefined),
        loadTechnicalTypography(),
      ]);
      if (!controller.signal.aborted && this.isConnected) {
        this.#commit(data);
        await this.#readPhotoRoute();
      }
    } catch (error) {
      if (controller.signal.aborted || !this.isConnected) return;
      controller.abort();
      this.initialError = errorMessage(error, 'Couldn’t load this gallery. Please try again.');
    }
  }

  #commit(data: Portfolio) {
    this.#did = data.identity.did;
    this.#groups = groupPhotos(data.photos);
    this.#photos = this.#groups.flatMap((group) => group.photos);
    this.#eagerIds = new Set(this.#photos.slice(0, 4).map((photo) => photo.id));
    this.current = data;
    const cached = { data, time: Date.now() };
    portfolioCache.set(this.#cacheKey(this.actor), cached);
    portfolioCache.set(this.#cacheKey(data.identity.did), cached);
    document.title = `${data.identity.handle}’s photography — Photoshow`;
    const path = galleryPath(data.identity.did) + window.location.hash;
    if (window.location.pathname + window.location.search + window.location.hash !== path)
      window.history.replaceState(window.history.state, '', path);
  }

  #observeMore() {
    this.#observer?.disconnect();
    if (!this.current?.cursor || this.moreError || !this.#sentinel.value) return;
    this.#observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void this.loadMore();
      },
      { rootMargin: '1200px' },
    );
    this.#observer.observe(this.#sentinel.value);
  }

  loadMore(): Promise<Portfolio | undefined> {
    if (this.#pending) return this.#pending;
    const data = this.current,
      signal = this.#controller?.signal;
    if (!data?.cursor || !signal || signal.aborted) return Promise.resolve(undefined);
    this.loadingMore = true;
    this.moreError = '';
    const promise = loadPortfolioPage(data.identity, data.cursor, signal)
      .then((page) => {
        if (signal.aborted || !this.isConnected) return undefined;
        const next = appendPortfolioPage(data, page);
        this.#commit(next);
        return next;
      })
      .catch((error) => {
        if (!signal.aborted) {
          this.moreError = errorMessage(error, 'Couldn’t load more photos. Please try again.');
          this.#observer?.disconnect();
        }
        return undefined;
      })
      .finally(() => {
        if (this.#pending === promise) this.#pending = undefined;
        if (!signal.aborted && this.isConnected) this.loadingMore = false;
      });
    return (this.#pending = promise);
  }

  async #readPhotoRoute() {
    if (!this.current) return this.#start();
    try {
      const link = photoFromHash(window.location.hash);
      this.viewerError = '';
      if (link) {
        const galleryId = `at://${this.current.identity.did}/social.grain.gallery/${link.gallery}`;
        const photo = this.#photos.find(
          (photo) =>
            photo.id === `at://${this.current!.identity.did}/social.grain.photo/${link.photo}` &&
            photo.galleryId === galleryId,
        );
        if (photo) {
          if (photo.id !== this.activeId) await this.#selectPhoto(photo);
        } else if (
          this.#linkedGallery === link.gallery ||
          this.#photos.some((photo) => photo.galleryId === galleryId)
        ) {
          throw new Error('This photo is no longer available in that gallery.');
        } else await this.#start();
      } else {
        this.activeId = null;
        this.#viewerVersion++;
        this.#lightbox.value?.dismiss();
        if (this.#linkedGallery) await this.#start();
      }
    } catch (error) {
      this.activeId = null;
      this.#viewerVersion++;
      this.#lightbox.value?.dismiss();
      this.viewerError = errorMessage(error, 'Couldn’t open this photo link.');
    }
  }
  #viewPortfolio() {
    window.history.replaceState({}, '', galleryPath(this.current?.identity.did || this.actor));
    this.#routeHash = '';
    void this.#start();
  }
  #openPhoto(event: CustomEvent<Photo>) {
    void this.#selectPhoto(event.detail);
  }
  async #selectPhoto(photo: Photo) {
    const did = this.current!.identity.did;
    const path = photoPath(did, photo);
    if (!window.history.state?.photoshowLightbox) {
      window.history.replaceState(window.history.state, '', galleryPath(did));
      window.history.pushState({ photoshowLightbox: true }, '', path);
    } else window.history.replaceState(window.history.state, '', path);
    this.#routeHash = window.location.hash;
    this.activeId = photo.id;
    const version = ++this.#viewerVersion;
    this.viewerError = '';
    try {
      await import('./lightbox.ts');
      if (this.isConnected && version === this.#viewerVersion && this.activeId === photo.id)
        this.viewerReady = true;
    } catch {
      if (!this.isConnected || version !== this.#viewerVersion) return;
      this.activeId = null;
      this.viewerError = 'Couldn’t open the photo viewer. Tap the photo to retry.';
    }
  }
  #updateLightbox() {
    if (!this.#lightbox.value || !this.activeId) return;
    const index = this.#photos.findIndex((photo) => photo.id === this.activeId);
    if (index < 0) return;
    const last = index === this.#photos.length - 1;
    this.#lightbox.value.present({
      photo: this.#photos[index],
      canPrevious: index > 0,
      canNext: !last || !!this.current?.cursor,
      loadingNext: last && this.loadingMore,
      error: last ? this.moreError : '',
    });
  }
  #previousPhoto() {
    const index = this.#photos.findIndex((photo) => photo.id === this.activeId);
    if (index > 0) void this.#selectPhoto(this.#photos[index - 1]);
  }
  async #nextPhoto() {
    const active = this.activeId,
      index = this.#photos.findIndex((photo) => photo.id === active) + 1;
    if (!active || index < 1) return;
    if (index >= this.#photos.length) await this.loadMore();
    if (this.isConnected && this.activeId === active && index < this.#photos.length)
      await this.#selectPhoto(this.#photos[index]);
  }
  #closePhoto() {
    const selected = this.activeId;
    this.activeId = null;
    this.#viewerVersion++;
    if (!selected || !this.isConnected) return;
    if (window.history.state?.photoshowLightbox) window.history.back();
    else this.#viewPortfolio();
  }

  protected render() {
    const error = this.viewerError || this.moreError;
    const empty = !this.#photos.length;
    return html`<main
      class="gallery"
      aria-label="Photographs"
      aria-busy=${String(!this.current && !this.initialError)}
      @photo-open=${this.#openPhoto}
      @photo-next=${this.#nextPhoto}
      @photo-previous=${this.#previousPhoto}
      @photo-close=${this.#closePhoto}
    >
      <h1 class="gallery-title" ?hidden=${!this.current}
        >${this.current ? `${this.current.identity.handle}’s photography` : ''}</h1
      >
      <div class="gallery-state" ?hidden=${!empty} role=${this.initialError ? nothing : 'status'}>
        ${
          this.initialError
            ? html`<p role="alert">${this.initialError}</p>
                <div class="state-actions">
                  <button @click=${() => this.#start(true)}>Retry</button
                  ><button @click=${window.location.hash ? this.#viewPortfolio : this.#home}
                    >${window.location.hash ? 'View portfolio' : 'Change account'}</button
                  >
                </div>`
            : this.current && !this.current.cursor
              ? html`No public Grain photos.<button @click=${this.#home}>Change account</button>`
              : 'Loading photos…'
        }
      </div>
      <photo-masonry variant="galleries" ?hidden=${empty}
        >${repeat(
          this.#groups,
          (group) => group.id,
          (group) => html` <photo-group .group=${group} .eagerIds=${this.#eagerIds}></photo-group>`,
        )}</photo-masonry
      >
      <div
        class="gallery-sentinel"
        ${ref(this.#sentinel)}
        aria-hidden="true"
        ?hidden=${!this.current?.cursor}
      ></div>
      <div class="pagination-status" ?hidden=${!error && !this.loadingMore}>
        ${
          error
            ? html`<p role="alert">${error}</p>
                <button @click=${this.viewerError ? () => this.#start(true) : this.loadMore}
                  >Retry</button
                >
                ${this.viewerError && window.location.hash ? html`<button @click=${this.#viewPortfolio}>View portfolio</button>` : nothing}`
            : html`<p role="status">Loading photos…</p>`
        }
      </div>
      ${this.viewerReady ? html`<photo-lightbox ${ref(this.#lightbox)}></photo-lightbox>` : nothing}
    </main>`;
  }
}

customElements.define('photo-gallery', PhotoGallery);
declare global {
  interface HTMLElementTagNameMap {
    'photo-gallery': PhotoGallery;
  }
}
