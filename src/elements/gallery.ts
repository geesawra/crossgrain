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
import { galleryPath } from '../lib/routes.ts';
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
  private groups: PhotoGroup[] = [];
  private photos: Photo[] = [];
  private eagerIds = new Set<string>();
  private controller?: AbortController;
  private pending?: Promise<Portfolio | undefined>;
  private observer?: IntersectionObserver;
  private viewerVersion = 0;
  private sentinel = createRef<HTMLDivElement>();
  private lightbox = createRef<PhotoLightbox>();

  constructor() {
    super();
    this.actor = '';
    this.initialError = this.moreError = this.viewerError = '';
    this.loadingMore = this.viewerReady = false;
    this.activeId = null;
  }
  connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated) void this.start();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.controller?.abort();
    this.observer?.disconnect();
    this.viewerVersion++;
    this.lightbox.value?.dismiss();
  }
  protected updated(changed: PropertyValues) {
    if (changed.has('actor')) void this.start();
    if (changed.has('current') || changed.has('moreError')) this.observeMore();
    this.updateLightbox();
  }
  private home() {
    this.dispatchEvent(new Event('gallery-home', { bubbles: true }));
  }

  private async start() {
    this.controller?.abort();
    const controller = (this.controller = new AbortController());
    this.initialError = '';
    const cached = portfolioCache.get(this.actor);
    try {
      const [data] = await Promise.all([
        cached && Date.now() - cached.time < 300_000
          ? cached.data
          : loadPortfolio(this.actor, controller.signal),
        loadTechnicalTypography(),
      ]);
      if (!controller.signal.aborted && this.isConnected) this.commit(data);
    } catch (error) {
      if (controller.signal.aborted || !this.isConnected) return;
      controller.abort();
      this.initialError = errorMessage(error, 'Couldn’t load this gallery. Please try again.');
    }
  }

  private commit(data: Portfolio) {
    this.groups = groupPhotos(data.photos);
    this.photos = this.groups.flatMap((group) => group.photos);
    this.eagerIds = new Set(this.photos.slice(0, 4).map((photo) => photo.id));
    this.current = data;
    const cached = { data, time: Date.now() };
    portfolioCache.set(this.actor, cached);
    portfolioCache.set(data.identity.did, cached);
    document.title = `${data.identity.handle}’s photography — Photoshow`;
    window.history.replaceState({}, '', galleryPath(data.identity.did));
  }

  private observeMore() {
    this.observer?.disconnect();
    if (!this.current?.cursor || this.moreError || !this.sentinel.value) return;
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) void this.loadMore();
      },
      { rootMargin: '1200px' },
    );
    this.observer.observe(this.sentinel.value);
  }

  loadMore(): Promise<Portfolio | undefined> {
    if (this.pending) return this.pending;
    const data = this.current,
      signal = this.controller?.signal;
    if (!data?.cursor || !signal || signal.aborted) return Promise.resolve(undefined);
    this.loadingMore = true;
    this.moreError = '';
    const promise = loadPortfolioPage(data.identity, data.cursor, signal)
      .then((page) => {
        if (signal.aborted || !this.isConnected) return undefined;
        const next = appendPortfolioPage(data, page);
        this.commit(next);
        return next;
      })
      .catch((error) => {
        if (!signal.aborted) {
          this.moreError = errorMessage(error, 'Couldn’t load more photos. Please try again.');
          this.observer?.disconnect();
        }
        return undefined;
      })
      .finally(() => {
        if (this.pending === promise) this.pending = undefined;
        if (!signal.aborted && this.isConnected) this.loadingMore = false;
      });
    return (this.pending = promise);
  }

  private async openPhoto(event: CustomEvent<Photo>) {
    const photo = event.detail;
    this.activeId = photo.id;
    const version = ++this.viewerVersion;
    this.viewerError = '';
    try {
      await import('./lightbox.ts');
      if (this.isConnected && version === this.viewerVersion && this.activeId === photo.id)
        this.viewerReady = true;
    } catch {
      if (!this.isConnected || version !== this.viewerVersion) return;
      this.activeId = null;
      this.viewerError = 'Couldn’t open the photo viewer. Tap the photo to retry.';
    }
  }
  private updateLightbox() {
    if (!this.lightbox.value || !this.activeId) return;
    const index = this.photos.findIndex((photo) => photo.id === this.activeId);
    if (index < 0) return;
    const last = index === this.photos.length - 1;
    this.lightbox.value.present({
      photo: this.photos[index],
      canPrevious: index > 0,
      canNext: !last || !!this.current?.cursor,
      loadingNext: last && this.loadingMore,
      error: last ? this.moreError : '',
    });
  }
  private previousPhoto() {
    const index = this.photos.findIndex((photo) => photo.id === this.activeId);
    if (index > 0) this.activeId = this.photos[index - 1].id;
  }
  private async nextPhoto() {
    const active = this.activeId,
      index = this.photos.findIndex((photo) => photo.id === active) + 1;
    if (!active || index < 1) return;
    if (index >= this.photos.length) await this.loadMore();
    if (this.isConnected && this.activeId === active && index < this.photos.length)
      this.activeId = this.photos[index].id;
  }
  private closePhoto() {
    this.activeId = null;
    this.viewerVersion++;
  }

  protected render() {
    const error = this.viewerError || this.moreError;
    const empty = !this.photos.length;
    return html`<main
      class="gallery"
      aria-label="Photographs"
      aria-busy=${String(!this.current && !this.initialError)}
      @photo-open=${this.openPhoto}
      @photo-next=${this.nextPhoto}
      @photo-previous=${this.previousPhoto}
      @photo-close=${this.closePhoto}
    >
      <h1 class="gallery-title" ?hidden=${!this.current}
        >${this.current ? `${this.current.identity.handle}’s photography` : ''}</h1
      >
      <div class="gallery-state" ?hidden=${!empty} role=${this.initialError ? nothing : 'status'}>
        ${
          this.initialError
            ? html`<p role="alert">${this.initialError}</p>
                <div class="state-actions">
                  <button @click=${this.start}>Retry</button
                  ><button @click=${this.home}>Change account</button>
                </div>`
            : this.current && !this.current.cursor
              ? html`No public Grain photos.<button @click=${this.home}>Change account</button>`
              : 'Loading photos…'
        }
      </div>
      <photo-masonry variant="galleries" ?hidden=${empty}
        >${repeat(
          this.groups,
          (group) => group.id,
          (group) => html` <photo-group .group=${group} .eagerIds=${this.eagerIds}></photo-group>`,
        )}</photo-masonry
      >
      <div
        class="gallery-sentinel"
        ${ref(this.sentinel)}
        aria-hidden="true"
        ?hidden=${!this.current?.cursor}
      ></div>
      <div class="pagination-status" ?hidden=${!error && !this.loadingMore}>
        ${
          error
            ? html`<p role="alert">${error}</p>
                ${!this.viewerError ? html`<button @click=${this.loadMore}>Retry</button>` : nothing}`
            : html`<p role="status">Loading photos…</p>`
        }
      </div>
      ${this.viewerReady ? html`<photo-lightbox ${ref(this.lightbox)}></photo-lightbox>` : nothing}
    </main>`;
  }
}

customElements.define('photo-gallery', PhotoGallery);
declare global {
  interface HTMLElementTagNameMap {
    'photo-gallery': PhotoGallery;
  }
}
