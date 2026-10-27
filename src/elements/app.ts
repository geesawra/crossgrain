import { html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { normalizeActor } from '../lib/actor.ts';
import { actorFromPath, galleryPath, restorePageRoute } from '../lib/routes.ts';
import { loadTypography } from '../ui/typography.ts';
import { setFavicon } from '../ui/favicon.ts';
import { PhotoElement } from '../ui/element.ts';
import { galleryLoading } from '../ui/loading.ts';

const typography = loadTypography();

export class CrossgrainApp extends PhotoElement {
  static properties = {
    actor: { state: true },
    ready: { state: true },
    routeError: { state: true },
    formError: { state: true },
  };
  declare private actor: string;
  declare private ready: boolean;
  declare private routeError: boolean;
  declare private formError: string;
  #version = 0;
  #pop = () => {
    void this.#readRoute();
  };

  constructor() {
    super();
    this.actor = '';
    this.ready = false;
    this.routeError = false;
    this.formError = '';
  }
  connectedCallback() {
    super.connectedCallback();
    this.inert = true;
    void typography.then(() => {
      this.inert = false;
      this.setAttribute('fonts-ready', '');
    });
    window.addEventListener('popstate', this.#pop);
    void this.#readRoute();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.#version++;
    window.removeEventListener('popstate', this.#pop);
  }

  navigate(actor: string) {
    window.history.pushState({}, '', galleryPath(actor));
    window.scrollTo({ top: 0, behavior: 'instant' });
    void this.#readRoute();
  }

  async #readRoute() {
    const actor = actorFromPath(window.location.pathname);
    if (this.ready && this.querySelector('photo-gallery')?.matchesActor(actor)) return;
    setFavicon();
    const version = ++this.#version;
    this.actor = actor;
    this.ready = this.routeError = false;
    this.formError = '';
    document.title = 'crossgrain';
    if (!this.actor) return;
    try {
      await import('./gallery.ts');
      if (this.isConnected && version === this.#version) this.ready = true;
    } catch {
      if (this.isConnected && version === this.#version) this.routeError = true;
    }
  }

  #submit(event: SubmitEvent) {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).querySelector('input')!;
    try {
      this.navigate(normalizeActor(input.value));
    } catch (cause) {
      this.formError = cause instanceof Error ? cause.message : 'Enter a Grain handle or DID.';
    }
  }

  #loadSearch() {
    void import('./actor-search.ts').catch(() => {
      /* Direct handle and DID entry still works if the lookup cannot load. */
    });
  }

  protected render() {
    if (this.actor)
      return this.ready
        ? keyed(
            this.actor,
            html`<photo-gallery
              .actor=${this.actor}
              @gallery-home=${() => this.navigate('')}
            ></photo-gallery>`,
          )
        : html`<main class="gallery" aria-label="Photographs" aria-busy=${String(!this.routeError)}>
            ${galleryLoading(!this.routeError)}
            ${this.routeError ? html`<p class="gallery-state" role="alert">Couldn’t load the gallery. Please try again.<button @click=${this.#pop}>Retry</button></p>` : nothing}
          </main>`;
    return html`<div class="home-page"
      ><main class="home">
        <form class="handle-form" novalidate @submit=${this.#submit}>
          <h1 class="home-name">crossgrain</h1>
          <label for="handle" class="sr-only">Your Grain handle or DID</label>
          <actor-search @actor-select=${(event: CustomEvent<string>) => this.navigate(event.detail)}
            ><div class="handle-input">
              <input
                id="handle"
                placeholder="jcsalterego.bsky.social"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                autocomplete="off"
                role="combobox"
                aria-autocomplete="list"
                aria-expanded="false"
                aria-invalid=${String(!!this.formError)}
                aria-describedby=${this.formError ? 'handle-hint handle-error' : 'handle-hint'}
                @input=${() => {
                  this.formError = '';
                }}
                @focus=${this.#loadSearch}
              />
              <button type="submit">Open</button>
            </div></actor-search
          >
          <p id="handle-hint" class="form-hint"
            >A gallery viewer for your grain.social photos. Enter your Atmosphere handle or DID to
            open your gallery.</p
          >
          <p id="handle-error" class="form-error" role="alert" ?hidden=${!this.formError}>
            ${this.formError}
          </p>
        </form>
      </main>
      <footer class="site-credit home-credit">
        © ${new Date().getFullYear()} geesawra ·
        <a href="https://github.com/geesawra/crossgrain" target="_blank" rel="noopener noreferrer"
          >GitHub</a
        >
      </footer>
    </div>`;
  }
}

restorePageRoute();
customElements.define('crossgrain-app', CrossgrainApp);
declare global {
  interface HTMLElementTagNameMap {
    'crossgrain-app': CrossgrainApp;
  }
}
