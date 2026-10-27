import { html } from 'lit';

export function galleryLoading(visible: boolean) {
  return html`<div
    class="gallery-loading"
    role="status"
    aria-label="Loading gallery"
    aria-hidden=${String(!visible)}
    ><span class="image-spinner" aria-hidden="true"></span
  ></div>`;
}
