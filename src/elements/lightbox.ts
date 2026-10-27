import { html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { createRef, ref } from 'lit/directives/ref.js';
import type { Photo } from '../lib/grain.ts';
import { dateValue, formatExif } from '../lib/grain.ts';
import { PhotoElement } from '../ui/element.ts';
import { PhotoImage } from './image.ts';

export interface LightboxState {
  photo: Photo;
  canPrevious: boolean;
  canNext: boolean;
  loadingNext: boolean;
  error: string;
}
let detailsSequence = 0;
const backgroundKey = 'photoshow.lightbox.background';
type Background = 'gray' | 'white';
let preferredBackground: Background = 'gray';

export class PhotoLightbox extends PhotoElement {
  static properties = {
    state: { state: true },
    opened: { state: true },
    showDetails: { state: true },
    background: { state: true },
    revealed: { state: true },
  };
  declare private state?: LightboxState;
  declare private opened: boolean;
  declare private showDetails: boolean;
  declare private background: Background;
  declare private revealed: boolean;
  #dialog = createRef<HTMLDialogElement>();
  #image = createRef<PhotoImage>();
  #canvas = createRef<HTMLDivElement>();
  #details = createRef<HTMLDivElement>();
  #backgrounds = createRef<HTMLFieldSetElement>();
  #detailsId = `photo-details-${++detailsSequence}`;
  #previousOverflow = '';
  #returnFocus?: HTMLElement;
  #resetScroll = false;
  #swipe?: { id: number; x: number; y: number; time: number };
  #ignoreClickUntil = 0;
  #viewportChanged = () => {
    const zoomed = (window.visualViewport?.scale || 1) > 1.01;
    if (this.#canvas.value) this.#canvas.value.style.touchAction = zoomed ? 'auto' : '';
    if (zoomed) this.#cancelSwipe();
  };

  constructor() {
    super();
    this.opened = this.revealed = false;
    this.showDetails = true;
    this.background = preferredBackground;
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.dismiss();
  }

  present(state: LightboxState) {
    if (!this.opened) {
      this.#previousOverflow = document.body.style.overflow;
      this.#returnFocus =
        document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      document.body.style.overflow = 'hidden';
      this.showDetails = true;
      this.opened = true;
      try {
        const saved = window.localStorage.getItem(backgroundKey);
        if (saved === 'gray' || saved === 'white') preferredBackground = saved;
      } catch {
        /* Use the session choice. */
      }
      this.background = preferredBackground;
      window.visualViewport?.addEventListener('resize', this.#viewportChanged);
      this.#resetScroll = true;
      this.revealed = false;
    }
    if (this.state?.photo.id !== state.photo.id) {
      this.#resetScroll = true;
      this.revealed = false;
      this.#swipe = undefined;
    }
    this.state = state;
  }
  dismiss() {
    if (this.opened) {
      this.#dialog.value?.close();
      this.#closed();
    }
  }
  #closed() {
    if (!this.opened) return;
    this.opened = false;
    this.#swipe = undefined;
    window.visualViewport?.removeEventListener('resize', this.#viewportChanged);
    document.body.style.overflow = this.#previousOverflow;
    if (this.#returnFocus?.isConnected) this.#returnFocus.focus({ preventScroll: true });
    this.dispatchEvent(new Event('photo-close', { bubbles: true }));
  }
  protected updated() {
    if (!this.opened || !this.state) return;
    this.#image.value?.configure(this.state.photo, true, true);
    if (this.#resetScroll && this.#details.value) {
      this.#details.value.scrollTop = 0;
      this.#resetScroll = false;
    }
    if (this.#dialog.value && !this.#dialog.value.open) {
      this.#dialog.value.showModal();
      this.#dialog.value
        .querySelector<HTMLButtonElement>('.lightbox-close')
        ?.focus({ preventScroll: true });
    }
    this.#viewportChanged();
  }
  #navigate(name: 'photo-previous' | 'photo-next') {
    if (
      name === 'photo-previous'
        ? this.state?.canPrevious
        : this.state?.canNext && !this.state.loadingNext
    )
      this.dispatchEvent(new Event(name, { bubbles: true }));
  }
  #backgroundChanged(event: Event) {
    const value = (event.currentTarget as HTMLInputElement).value;
    if (value !== 'gray' && value !== 'white') return;
    this.background = preferredBackground = value;
    try {
      window.localStorage.setItem(backgroundKey, value);
    } catch {
      /* Keep the session choice. */
    }
  }
  #keydown(event: KeyboardEvent) {
    if (this.#backgrounds.value?.contains(event.target as Node)) return;
    if (event.key === 'ArrowLeft' && this.state?.canPrevious) {
      event.preventDefault();
      this.#navigate('photo-previous');
    }
    if (event.key === 'ArrowRight' && this.state?.canNext && !this.state.loadingNext) {
      event.preventDefault();
      this.#navigate('photo-next');
    }
  }
  #cancelSwipe() {
    this.#swipe = undefined;
    this.#ignoreClickUntil = performance.now() + 350;
  }
  #pointerDown(event: PointerEvent) {
    if (event.pointerType !== 'touch') return;
    this.#swipe = undefined;
    if (
      !event.isPrimary ||
      !this.opened ||
      (window.visualViewport?.scale || 1) > 1.01 ||
      (event.target as HTMLElement).closest('button, a, input')
    )
      return;
    this.#ignoreClickUntil = 0;
    this.#swipe = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      time: event.timeStamp,
    };
  }
  #pointerUp(event: PointerEvent) {
    const start = this.#swipe;
    if (!start || start.id !== event.pointerId) return;
    this.#swipe = undefined;
    const dx = event.clientX - start.x,
      dy = event.clientY - start.y;
    if (Math.abs(dx) > 10 || Math.abs(dy) > 10 || event.timeStamp - start.time > 800)
      this.#cancelSwipe();
    if (
      !this.opened ||
      (window.visualViewport?.scale || 1) > 1.01 ||
      Math.abs(dx) < 48 ||
      Math.abs(dx) < Math.abs(dy) * 1.5 ||
      event.timeStamp - start.time > 800
    )
      return;
    this.#navigate(dx < 0 ? 'photo-next' : 'photo-previous');
  }
  #imageClick(event: MouseEvent) {
    if (
      performance.now() < this.#ignoreClickUntil ||
      (event.target as HTMLElement).tagName !== 'IMG'
    )
      return;
    this.#toggleDetails();
  }
  #toggleDetails() {
    if (this.showDetails && this.#details.value?.contains(document.activeElement)) {
      this.#dialog.value
        ?.querySelector<HTMLButtonElement>('.lightbox-details-toggle')
        ?.focus({ preventScroll: true });
    }
    this.showDetails = !this.showDetails;
  }

  protected render() {
    const state = this.state,
      photo = state?.photo;
    const taken =
      photo?.takenAt && dateValue(photo.takenAt)
        ? new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
            new Date(photo.takenAt),
          )
        : '';
    const fields = photo
      ? [
          ['Camera', photo.camera],
          ['Lens', photo.exif?.lensModel || photo.exif?.lensMake || ''],
          ...formatExif(photo.exif).map((value) => [
            value.endsWith('mm')
              ? 'Focal length'
              : value.startsWith('ƒ/')
                ? 'Aperture'
                : value.startsWith('ISO ')
                  ? 'ISO'
                  : 'Exposure',
            value.replace(/^ISO /, ''),
          ]),
          ['Taken', taken],
        ].filter(([, value]) => value)
      : [];
    return html`<dialog
      class="lightbox"
      ${ref(this.#dialog)}
      aria-label=${photo?.caption || photo?.title || 'Photograph'}
      @close=${() => {
        if (!this.#dialog.value?.open) this.#closed();
      }}
      @cancel=${(event: Event) => {
        event.preventDefault();
        this.dismiss();
      }}
      @click=${(event: MouseEvent) => {
        if (event.target === this.#dialog.value) this.dismiss();
      }}
      @keydown=${this.#keydown}
      @pointerdown=${(event: PointerEvent) => {
        if (event.pointerType === 'touch' && !event.isPrimary) this.#cancelSwipe();
      }}
    >
      <div
        class=${this.showDetails ? 'lightbox-layout' : 'lightbox-layout lightbox-details-hidden'}
      >
        <div class="lightbox-controls">
          <button
            type="button"
            aria-label="Previous photo"
            ?disabled=${!state?.canPrevious}
            @click=${() => this.#navigate('photo-previous')}
          >
            ←
          </button>
          <button
            type="button"
            aria-label="Next photo"
            ?disabled=${!state?.canNext || state.loadingNext}
            @click=${() => this.#navigate('photo-next')}
          >
            →
          </button>
          <fieldset class="lightbox-background" ${ref(this.#backgrounds)}>
            <legend class="sr-only">Image background</legend>
            <div class="lightbox-background-options">
              ${(['gray', 'white'] as const).map(
                (value) =>
                  html`<label title=${`${value === 'gray' ? 'Gray' : 'White'} background`}>
                    <input
                      class="sr-only"
                      type="radio"
                      name=${`${this.#detailsId}-background`}
                      value=${value}
                      .checked=${this.background === value}
                      @change=${this.#backgroundChanged}
                    />
                    <span
                      class=${`lightbox-background-swatch lightbox-background-${value}`}
                      aria-hidden="true"
                    ></span
                    ><span class="sr-only"
                      >${value === 'gray' ? 'Gray' : 'White'} background</span
                    ></label
                  >`,
              )}
            </div>
          </fieldset>
        </div>
        <button
          type="button"
          class="lightbox-details-toggle"
          aria-expanded=${String(this.showDetails)}
          aria-controls=${this.#detailsId}
          @click=${this.#toggleDetails}
          >${this.showDetails ? 'Hide details' : 'Show details'}</button
        >
        <button
          type="button"
          class="lightbox-close"
          aria-label="Close photo"
          autofocus
          @click=${this.dismiss}
        >
          ×
        </button>
        <div
          class="lightbox-image"
          ${ref(this.#canvas)}
          data-background=${this.background}
          @pointerdown=${this.#pointerDown}
          @pointerup=${this.#pointerUp}
          @pointercancel=${this.#cancelSwipe}
          @lostpointercapture=${() => {
            this.#swipe = undefined;
          }}
        >
          ${
            this.opened && photo
              ? keyed(
                  photo.id,
                  photo.contentWarning && !this.revealed
                    ? html`<div class="content-warning">
                        <span>Content warning: ${photo.contentWarning}</span
                        ><button
                          @click=${() => {
                            this.revealed = true;
                          }}
                        >
                          Show photo
                        </button>
                      </div>`
                    : html`<photo-image
                        ${ref(this.#image)}
                        @click=${this.#imageClick}
                      ></photo-image>`,
                )
              : nothing
          }
        </div>
        <div
          class="lightbox-details"
          ${ref(this.#details)}
          id=${this.#detailsId}
          role="region"
          aria-label="Photo details"
          tabindex="0"
          ?inert=${!this.showDetails}
          aria-hidden=${String(!this.showDetails)}
        >
          <p class="lightbox-caption" ?hidden=${!photo?.caption && !photo?.title}
            >${photo?.caption || photo?.title}</p
          >
          <p
            class="lightbox-description"
            ?hidden=${!photo?.description || photo.description === photo.caption}
            >${photo?.description}</p
          >
          <dl class="lightbox-metadata" ?hidden=${!fields.length}>
            ${fields.map(
              ([label, value]) =>
                html`<div>
                  <dt>${label}</dt>
                  <dd>${value}</dd>
                </div>`,
            )}
          </dl>
          <a class="grain-link" href=${photo?.href || ''} target="_blank" rel="noopener noreferrer"
            >View on Grain ↗</a
          >
          <p
            class="lightbox-status"
            role=${state?.error ? 'alert' : 'status'}
            ?hidden=${!state?.loadingNext && !state?.error}
          >
            ${state?.error ? `${state.error} Use the next arrow to retry.` : state?.loadingNext ? 'Loading more photos…' : ''}
          </p>
        </div>
      </div>
    </dialog>`;
  }
}

customElements.define('photo-lightbox', PhotoLightbox);
declare global {
  interface HTMLElementTagNameMap {
    'photo-lightbox': PhotoLightbox;
  }
}
