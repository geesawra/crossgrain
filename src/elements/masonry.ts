export class PhotoMasonry extends HTMLElement {
  static observedAttributes = ['pending'];
  #observer?: ResizeObserver;
  #childrenObserver?: MutationObserver;
  #items = new Set<Element>();
  #frame = 0;

  attributeChangedCallback() {
    this.#schedule();
  }

  connectedCallback() {
    this.classList.add('masonry');
    this.#observer = new ResizeObserver(() => this.#schedule());
    this.#observer.observe(this);
    this.#childrenObserver = new MutationObserver(() => this.#syncChildren());
    this.#childrenObserver.observe(this, { childList: true });
    this.#syncChildren();
    this.layout();
  }

  disconnectedCallback() {
    this.#observer?.disconnect();
    this.#childrenObserver?.disconnect();
    this.#items.clear();
    cancelAnimationFrame(this.#frame);
  }

  #syncChildren() {
    for (const item of this.#items)
      if (item.parentElement !== this) {
        this.#observer?.unobserve(item);
        this.#items.delete(item);
      }
    for (const item of this.children)
      if (!this.#items.has(item)) {
        item.classList.add('masonry-item');
        this.#observer?.observe(item);
        this.#items.add(item);
      }
    this.#schedule();
  }

  #schedule() {
    cancelAnimationFrame(this.#frame);
    this.#frame = requestAnimationFrame(() => this.layout());
  }

  layout() {
    const width = this.clientWidth;
    if (!this.isConnected || !width) return;
    const galleries = this.getAttribute('variant') === 'galleries';
    const columns = galleries
      ? width < 1000 || (this.children.length === 1 && !this.hasAttribute('pending'))
        ? 1
        : 2
      : width < 440
        ? 1
        : width < 900
          ? 2
          : 3;
    const gap = galleries ? 40 : width < 580 ? 12 : 20;
    const bottomGap = galleries ? 56 : gap + 8;
    const cardWidth = (width - (columns - 1) * gap) / columns;
    const heights = Array<number>(columns).fill(0);
    for (const child of this.children) {
      const item = child as HTMLElement;
      item.style.width = `${cardWidth}px`;
      if (galleries)
        item.querySelectorAll<PhotoMasonry>('photo-masonry').forEach((masonry) => masonry.layout());
      const shortest = heights.indexOf(Math.min(...heights));
      item.style.transform = `translate(${shortest * (cardWidth + gap)}px, ${heights[shortest]}px)`;
      heights[shortest] += item.getBoundingClientRect().height + bottomGap;
    }
    this.style.height = `${Math.max(...heights, 0) - (this.children.length ? bottomGap : 0)}px`;
    this.classList.add('masonry-ready');
  }
}

customElements.define('photo-masonry', PhotoMasonry);
declare global {
  interface HTMLElementTagNameMap {
    'photo-masonry': PhotoMasonry;
  }
}
