import { html, nothing } from 'lit';
import { repeat } from 'lit/directives/repeat.js';
import type { PhotoGroup } from '../lib/grain.ts';
import { formatDate } from '../lib/grain.ts';
import { PhotoElement } from '../ui/element.ts';
import './card.ts';
import './masonry.ts';

export class GalleryGroup extends PhotoElement {
  static properties = { group: { attribute: false }, eagerIds: { attribute: false } };
  declare group?: PhotoGroup;
  declare eagerIds: ReadonlySet<string>;
  constructor() {
    super();
    this.eagerIds = new Set();
  }
  connectedCallback() {
    super.connectedCallback();
    this.classList.add('gallery-group');
    this.setAttribute('role', 'region');
  }
  protected updated() {
    this.setAttribute('aria-label', this.group?.title || 'Gallery');
  }
  protected render() {
    const group = this.group;
    if (!group) return nothing;
    const firstDate = group.takenFrom && formatDate(group.takenFrom);
    const lastDate = group.takenTo && formatDate(group.takenTo);
    return html`<div
        class="gallery-group-caption"
        ?hidden=${!group.title && !group.description && !firstDate}
      >
        <div class="gallery-group-heading" ?hidden=${!group.title && !firstDate}>
          <p class="gallery-group-title" ?hidden=${!group.title}>${group.title}</p>
          ${firstDate ? html`<p class="gallery-group-date"><time datetime=${group.takenFrom!}>${firstDate}</time>${lastDate && lastDate !== firstDate ? html` – <time datetime=${group.takenTo!}>${lastDate}</time>` : nothing}</p>` : nothing}
        </div>
        <p class="gallery-group-description" ?hidden=${!group.description}>${group.description}</p>
      </div>
      <photo-masonry
        >${repeat(
          group.photos,
          (photo) => photo.id,
          (photo) =>
            html` <photo-card .photo=${photo} .eager=${this.eagerIds.has(photo.id)}></photo-card>`,
        )}
      </photo-masonry>`;
  }
}

customElements.define('photo-group', GalleryGroup);
declare global {
  interface HTMLElementTagNameMap {
    'photo-group': GalleryGroup;
  }
}
