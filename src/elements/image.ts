import type { Photo } from '../lib/grain.ts';
import { node } from '../ui/dom.ts';

export class PhotoImage extends HTMLElement {
  private photo?: Photo;
  private fullSize = false;
  private eager = false;
  private image?: HTMLImageElement;
  private version = 0;

  configure(photo: Photo, fullSize = false, eager = false) {
    if (this.photo === photo && this.fullSize === fullSize && this.eager === eager) return;
    this.photo = photo;
    this.fullSize = fullSize;
    this.eager = eager;
    if (this.isConnected) this.render();
  }

  connectedCallback() {
    this.render();
  }
  disconnectedCallback() {
    this.cancel();
  }

  private cancel() {
    this.version++;
    if (!this.image) return;
    this.image.onload = this.image.onerror = null;
    this.image.removeAttribute('srcset');
    this.image.removeAttribute('src');
  }

  private render() {
    if (!this.photo) return;
    this.cancel();
    const version = this.version;
    const photo = this.photo;
    const fullSize = this.fullSize;
    const frame = node('div', 'photo-image-frame');
    frame.setAttribute('aria-busy', 'true');
    const image = node('img', 'photo-image');
    this.image = image;
    image.alt = photo.alt;
    image.width = photo.width;
    image.height = photo.height;
    image.loading = this.eager ? 'eager' : 'lazy';
    image.decoding = 'async';
    let stage = 0;
    let indicator: HTMLElement | undefined;
    if (fullSize) {
      indicator = node('span', 'image-loading');
      indicator.setAttribute('role', 'status');
      const spinner = node('span', 'image-spinner');
      spinner.setAttribute('aria-hidden', 'true');
      indicator.append(spinner, node('span', '', 'Loading full-resolution image…'));
      frame.append(indicator);
    }
    const current = () => this.isConnected && this.version === version;
    const setSource = () => {
      const original = fullSize ? stage === 0 : stage === 1;
      if (!original && !fullSize) image.srcset = `${photo.src} 1x, ${photo.fullSrc} 2x`;
      else image.removeAttribute('srcset');
      image.src = original ? photo.originalSrc : fullSize ? photo.fullSrc : photo.src;
    };
    const fail = () => {
      if (!current()) return;
      image.classList.remove('is-loaded');
      if (stage++ === 0) setSource();
      else {
        image.onload = image.onerror = null;
        frame.setAttribute('aria-busy', 'false');
        frame.replaceChildren(node('span', 'image-error', 'Photo unavailable.'));
      }
    };
    image.onerror = fail;
    image.onload = async () => {
      const source = image.currentSrc || image.src;
      try {
        await image.decode();
      } catch {
        if (current() && (image.currentSrc || image.src) === source) fail();
        return;
      }
      if (!current() || (image.currentSrc || image.src) !== source) return;
      image.classList.add('is-loaded');
      frame.setAttribute('aria-busy', 'false');
      indicator?.remove();
    };
    frame.append(image);
    this.replaceChildren(frame);
    setSource();
  }
}

customElements.define('photo-image', PhotoImage);
declare global {
  interface HTMLElementTagNameMap {
    'photo-image': PhotoImage;
  }
}
