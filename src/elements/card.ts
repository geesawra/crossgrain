import { html, nothing, type PropertyValues } from 'lit';
import { createRef, ref } from 'lit/directives/ref.js';
import type { Photo } from '../lib/grain.ts';
import { formatExif } from '../lib/grain.ts';
import { PhotoElement } from '../ui/element.ts';
import { PhotoImage } from './image.ts';

export class PhotoCard extends PhotoElement {
  static properties = {
    photo: { attribute: false },
    eager: { type: Boolean },
    captions: { type: Boolean },
    details: { type: Boolean },
    revealed: { state: true },
  };
  declare photo?: Photo;
  declare eager: boolean;
  declare captions: boolean;
  declare details: boolean;
  declare private revealed: boolean;
  #image = createRef<PhotoImage>();
  constructor() {
    super();
    this.eager = this.revealed = false;
    this.captions = this.details = true;
  }
  protected willUpdate(changed: PropertyValues) {
    if (changed.has('photo') && (changed.get('photo') as Photo | undefined)?.id !== this.photo?.id)
      this.revealed = false;
  }
  protected updated() {
    if (this.photo) this.#image.value?.configure(this.photo, false, this.eager);
  }
  #open() {
    this.dispatchEvent(
      new CustomEvent<Photo>('photo-open', { bubbles: true, detail: this.photo! }),
    );
  }
  protected render() {
    const photo = this.photo;
    if (!photo) return nothing;
    const metadata = [photo.camera, ...formatExif(photo.exif)].filter(Boolean).join(' · ');
    return html`<figure class="photo">
      <div class="photo-media" style=${`aspect-ratio: ${photo.width} / ${photo.height}`}>
        ${
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
            : html`<button
                class="photo-open"
                aria-haspopup="dialog"
                aria-label=${`Open ${photo.title || 'photo'}`}
                @click=${this.#open}
              >
                <photo-image ${ref(this.#image)}></photo-image>
              </button>`
        }
      </div>
      ${
        (this.captions && photo.caption) || (this.details && metadata)
          ? html`<figcaption>
              ${this.captions && photo.caption ? html`<button class="caption" @click=${this.#open}>${photo.caption}</button>` : nothing}
              ${this.details && metadata ? html`<p class="photo-metadata">${metadata}</p>` : nothing}
            </figcaption>`
          : nothing
      }
    </figure>`;
  }
}

customElements.define('photo-card', PhotoCard);
declare global {
  interface HTMLElementTagNameMap {
    'photo-card': PhotoCard;
  }
}
