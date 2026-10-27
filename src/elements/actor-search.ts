import { LitElement, html, nothing, type PropertyValues } from 'lit';
import { actorQuery, searchActors, type ActorSuggestion } from '../lib/actor-search.ts';

let sequence = 0;

export class ActorSearch extends LitElement {
  static properties = {
    actors: { state: true },
    active: { state: true },
    opened: { state: true },
    status: { state: true },
  };
  declare private actors: ActorSuggestion[];
  declare private active: number;
  declare private opened: boolean;
  declare private status: string;
  #input?: HTMLInputElement;
  #events?: AbortController;
  #request?: AbortController;
  #timer?: ReturnType<typeof setTimeout>;
  #listId = `actor-options-${++sequence}`;
  #focus = () => this.#search();
  #blur = () => this.#close();
  #inputChanged = (event: Event) => {
    if ((event as InputEvent).isComposing) this.#close();
    else this.#search();
  };
  #key = (event: KeyboardEvent) => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (event.key === 'Escape' && (this.opened || this.#timer)) {
      event.preventDefault();
      this.#close();
    } else if (event.key === 'Enter') {
      if (this.opened && this.active >= 0) {
        event.preventDefault();
        this.#choose(this.actors[this.active]);
      } else this.#close();
    } else if (this.opened && this.actors.length && ['ArrowDown', 'ArrowUp'].includes(event.key)) {
      event.preventDefault();
      this.active =
        event.key === 'ArrowDown'
          ? (this.active + 1) % this.actors.length
          : (this.active < 0 ? this.actors.length - 1 : this.active - 1 + this.actors.length) %
            this.actors.length;
    } else if (event.key === 'Tab') this.#close();
  };

  constructor() {
    super();
    this.actors = [];
    this.active = -1;
    this.opened = false;
    this.status = '';
  }

  protected createRenderRoot() {
    // The app owns the input; this element renders only its popup beside it.
    const popup = document.createElement('div');
    popup.className = 'actor-popup';
    popup.hidden = true;
    this.append(popup);
    return popup;
  }

  connectedCallback() {
    super.connectedCallback();
    this.#input = this.querySelector('input') || undefined;
    if (!this.#input) return;
    const signal = (this.#events = new AbortController()).signal;
    this.#input.setAttribute('aria-controls', this.#listId);
    this.#input.addEventListener('input', this.#inputChanged, { signal });
    this.#input.addEventListener('compositionend', this.#inputChanged, { signal });
    this.#input.addEventListener('keydown', this.#key, { signal });
    this.#input.addEventListener('focus', this.#focus, { signal });
    this.#input.addEventListener('blur', this.#blur, { signal });
    if (document.activeElement === this.#input) this.#search();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#events?.abort();
    this.#close();
  }

  #cancel() {
    clearTimeout(this.#timer);
    this.#timer = undefined;
    this.#request?.abort();
    this.#request = undefined;
  }

  #close() {
    this.#cancel();
    this.opened = false;
    this.actors = [];
    this.active = -1;
    this.status = '';
  }

  #search() {
    this.#close();
    const query = actorQuery(this.#input?.value || '');
    if (!query || !this.isConnected || document.activeElement !== this.#input) return;
    const controller = (this.#request = new AbortController());
    this.#timer = setTimeout(async () => {
      this.#timer = undefined;
      this.opened = true;
      this.status = 'Searching…';
      try {
        const actors = await searchActors(query, controller.signal);
        if (controller.signal.aborted || !this.isConnected) return;
        this.actors = actors;
        this.status = actors.length
          ? ''
          : 'No matching accounts. You can enter a full handle or DID.';
      } catch {
        if (!controller.signal.aborted && this.isConnected)
          this.status = 'Search unavailable. You can still enter a full handle or DID.';
      }
    }, 250);
  }

  #choose(actor?: ActorSuggestion) {
    if (!actor || !this.isConnected) return;
    this.#input!.value = actor.handle;
    this.#close();
    this.dispatchEvent(new CustomEvent('actor-select', { bubbles: true, detail: actor.did }));
  }

  protected updated(changed: PropertyValues) {
    (this.renderRoot as HTMLElement).hidden = !this.opened;
    this.#input?.setAttribute('aria-expanded', String(this.opened));
    this.#input?.setAttribute('aria-busy', String(this.status === 'Searching…'));
    if (this.opened && this.active >= 0) {
      const id = `${this.#listId}-${this.active}`;
      this.#input?.setAttribute('aria-activedescendant', id);
      if (changed.has('active'))
        this.querySelector<HTMLElement>(`#${id}`)?.scrollIntoView({ block: 'nearest' });
    } else this.#input?.removeAttribute('aria-activedescendant');
  }

  protected render() {
    return html`<ul
        id=${this.#listId}
        role="listbox"
        aria-label="Accounts"
        ?hidden=${!this.actors.length}
        >${this.actors.map(
          (actor, index) =>
            html`<li
              id=${`${this.#listId}-${index}`}
              role="option"
              aria-selected=${String(this.active === index)}
              @pointermove=${() => {
                this.active = index;
              }}
              @mousedown=${(event: MouseEvent) => event.preventDefault()}
              @click=${() => this.#choose(actor)}
            >
              <span class="actor-avatar" aria-hidden="true"
                >${
                  actor.avatar
                    ? html`<img
                        src=${actor.avatar}
                        width="32"
                        height="32"
                        alt=""
                        loading="lazy"
                        decoding="async"
                        @error=${(event: Event) => {
                          (event.currentTarget as HTMLImageElement).hidden = true;
                        }}
                      />`
                    : nothing
                }</span
              >
              <span class="actor-identity">
                ${actor.displayName ? html`<span class="actor-name">${actor.displayName}</span>` : nothing}
                <span class="actor-handle"
                  >${actor.handle.startsWith('did:') ? actor.handle : `@${actor.handle}`}</span
                >
              </span>
            </li>`,
        )}</ul
      >
      <p class="actor-status" role="status" ?hidden=${!this.status}>${this.status}</p>
      <span class="sr-only" role="status"
        >${this.actors.length ? `${this.actors.length} accounts found.` : ''}</span
      >`;
  }
}

customElements.define('actor-search', ActorSearch);
declare global {
  interface HTMLElementTagNameMap {
    'actor-search': ActorSearch;
  }
}
