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
import { loadBlueskyProfile } from '../lib/identity.ts';
import { setFavicon } from '../ui/favicon.ts';
import { galleryLoading } from '../ui/loading.ts';
import './group.ts';
import type { PhotoLightbox } from './lightbox.ts';

import { readViewSettings, viewSettingsSearch, type ViewSettings } from '../lib/view-settings.ts';

const portfolioCache = new Map<string, { data: Portfolio; time: number }>();

export class PhotoGallery extends PhotoElement {
  static properties = {
    actor: { attribute: false },
    settings: { attribute: false },
    current: { state: true },
    initialError: { state: true },
    loadingMore: { state: true },
    moreError: { state: true },
    viewerError: { state: true },
    viewerReady: { state: true },
    activeId: { state: true },
    initialLoading: { state: true },
    profileUrl: { state: true },
  };
  declare actor: string;
  declare settings: ViewSettings;
  declare private current?: Portfolio;
  declare private initialError: string;
  declare private loadingMore: boolean;
  declare private moreError: string;
  declare private viewerError: string;
  declare private viewerReady: boolean;
  declare private activeId: string | null;
  declare private initialLoading: boolean;
  declare private profileUrl: string;
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
    this.settings = readViewSettings(window.location.search);
    this.initialError = this.moreError = this.viewerError = '';
    this.loadingMore = this.viewerReady = false;
    this.activeId = null;
    this.initialLoading = true;
    this.profileUrl = '';
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
    if (changed.has('current') || changed.has('moreError') || changed.has('initialLoading'))
      this.#observeMore();
    this.#updateLightbox();
  }
  #galleryPath(actor: string) {
    return galleryPath(actor) + viewSettingsSearch(this.settings);
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
    this.initialLoading = true;
    this.profileUrl = '';
    this.initialError = this.moreError = this.viewerError = '';
    this.#routeHash = window.location.hash;
    const typography = loadTechnicalTypography();
    let checkingProfile = false;
    const progress = (data: Portfolio) => {
      if (controller.signal.aborted || !this.isConnected) return;
      if (!checkingProfile) {
        checkingProfile = true;
        void loadBlueskyProfile(data.identity, controller.signal).then((profile) => {
          if (!controller.signal.aborted && this.isConnected) {
            this.profileUrl = profile
              ? `https://bsky.app/profile/${encodeURIComponent(data.identity.did).replace(/%3A/gi, ':')}`
              : '';
            setFavicon(profile?.avatar);
          }
        });
      }
      if (!this.current) this.#commit({ ...data, photos: [] }, false);
      void typography.then(() => {
        if (!controller.signal.aborted && this.isConnected && data.photos.length)
          this.#commit(data, false);
      });
    };
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
          ? Promise.resolve(cached.data).then((data) => {
              progress(data);
              return data;
            })
          : loadPortfolio(
              this.actor,
              controller.signal,
              this.#linkedGallery || undefined,
              progress,
            ),
        typography,
      ]);
      if (!controller.signal.aborted && this.isConnected) {
        this.#commit(data);
        this.initialLoading = false;
        await this.#readPhotoRoute();
      }
    } catch (error) {
      if (controller.signal.aborted || !this.isConnected) return;
      controller.abort();
      this.initialError = errorMessage(error, 'Couldn’t load this gallery. Please try again.');
    } finally {
      if (this.#controller === controller) this.initialLoading = false;
    }
  }

  #commit(data: Portfolio, complete = true) {
    this.#did = data.identity.did;
    this.#groups = groupPhotos(data.photos);
    this.#photos = this.#groups.flatMap((group) => group.photos);
    this.#eagerIds = new Set(this.#photos.slice(0, 4).map((photo) => photo.id));
    this.current = data;
    if (complete) {
      const cached = { data, time: Date.now() };
      portfolioCache.set(this.#cacheKey(this.actor), cached);
      portfolioCache.set(this.#cacheKey(data.identity.did), cached);
    }
    document.title = `${data.identity.handle}’s photography — crossgrain`;
    const path = this.#galleryPath(data.identity.did) + window.location.hash;
    if (window.location.pathname + window.location.search + window.location.hash !== path)
      window.history.replaceState(window.history.state, '', path);
  }

  #observeMore() {
    this.#observer?.disconnect();
    if (this.initialLoading || !this.current?.cursor || this.moreError || !this.#sentinel.value)
      return;
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
    const promise = loadPortfolioPage(data.identity, data.cursor, signal, (photos) => {
      if (!signal.aborted && this.isConnected)
        this.#commit({ ...appendPortfolioPage(data, { photos }), cursor: data.cursor }, false);
    })
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
        } else if (this.initialLoading) {
          await this.#start();
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
    window.history.replaceState(
      {},
      '',
      this.#galleryPath(this.current?.identity.did || this.actor),
    );
    this.#routeHash = '';
    void this.#start();
  }
  #openPhoto(event: CustomEvent<Photo>) {
    void this.#selectPhoto(event.detail);
  }
  async #selectPhoto(photo: Photo) {
    const did = this.current!.identity.did;
    const path = photoPath(did, photo).replace('#', viewSettingsSearch(this.settings) + '#');
    if (!window.history.state?.crossgrainLightbox && !window.history.state?.photoshowLightbox) {
      window.history.replaceState(window.history.state, '', this.#galleryPath(did));
      window.history.pushState({ crossgrainLightbox: true }, '', path);
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
    if (window.history.state?.crossgrainLightbox || window.history.state?.photoshowLightbox)
      window.history.back();
    else this.#viewPortfolio();
  }

  protected render() {
    const empty = !this.#photos.length;
    const error = this.viewerError || this.moreError || (!empty && this.initialError);
    return html`<main
      class="gallery"
      aria-label="Photographs"
      aria-busy=${String(this.initialLoading || this.loadingMore)}
      @photo-open=${this.#openPhoto}
      @photo-next=${this.#nextPhoto}
      @photo-previous=${this.#previousPhoto}
      @photo-close=${this.#closePhoto}
    >
      ${galleryLoading(this.initialLoading && empty)}
      <header class="gallery-heading" ?hidden=${!this.current}>
        <h1 class="gallery-title"
          >${this.current ? html`${this.profileUrl ? html`<a href=${this.profileUrl} target="_blank" rel="noopener noreferrer">${this.current.identity.handle}</a>` : this.current.identity.handle}’s photography` : nothing}</h1
        >
        <p class="site-credit gallery-copyright">© ${new Date().getFullYear()}</p>
      </header>
      <p class="site-credit gallery-credit" ?hidden=${!this.current}>
        <a
          href=${this.#galleryPath('')}
          @click=${(event: MouseEvent) => {
            if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
              return;
            event.preventDefault();
            this.#home();
          }}
          >Want your own?</a
        >
      </p>
      <div
        class="gallery-state"
        ?hidden=${!empty || this.initialLoading}
        role=${this.initialError ? nothing : 'status'}
      >
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
              : nothing
        }
      </div>
      <photo-masonry
        variant=${this.settings.groups ? 'galleries' : nothing}
        columns=${!this.settings.captions && !this.settings.details && !this.settings.groups ? this.settings.columns : nothing}
        ?pending=${this.initialLoading || !!this.current?.cursor}
        ?hidden=${empty}
        >${
          this.settings.groups
            ? repeat(
                this.#groups,
                (group) => group.id,
                (group) =>
                  html`<photo-group
                    .group=${group}
                    .eagerIds=${this.#eagerIds}
                    .settings=${this.settings}
                  ></photo-group>`,
              )
            : repeat(
                this.#photos,
                (photo) => photo.id,
                (photo) =>
                  html`<photo-card
                    .photo=${photo}
                    .eager=${this.#eagerIds.has(photo.id)}
                    .captions=${this.settings.captions}
                    .details=${this.settings.details}
                  ></photo-card>`,
              )
        }</photo-masonry
      >
      <div
        class="gallery-sentinel"
        ${ref(this.#sentinel)}
        aria-hidden="true"
        ?hidden=${!this.current?.cursor}
      ></div>
      <div class="pagination-status" ?hidden=${!error}>
        ${
          error
            ? html`<p role="alert">${error}</p>
                <button
                  @click=${this.viewerError || this.initialError ? () => this.#start(true) : this.loadMore}
                  >Retry</button
                >
                ${this.viewerError && window.location.hash ? html`<button @click=${this.#viewPortfolio}>View portfolio</button>` : nothing}`
            : nothing
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
