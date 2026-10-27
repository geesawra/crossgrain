import { html, nothing } from 'lit';
import { keyed } from 'lit/directives/keyed.js';
import { normalizeActor } from '../lib/actor.ts';
import { actorFromPath, galleryPath } from '../lib/routes.ts';
import { loadTypography } from '../ui/typography.ts';
import { PhotoElement } from '../ui/element.ts';

export class PhotoshowApp extends PhotoElement {
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
  private version = 0;
  private pop = () => {
    void this.readRoute();
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
    window.addEventListener('popstate', this.pop);
    void this.readRoute();
  }
  disconnectedCallback() {
    super.disconnectedCallback();
    this.version++;
    window.removeEventListener('popstate', this.pop);
  }

  navigate(actor: string) {
    window.history.pushState({}, '', galleryPath(actor));
    window.scrollTo({ top: 0, behavior: 'instant' });
    void this.readRoute();
  }

  private async readRoute() {
    const version = ++this.version;
    this.actor = actorFromPath(window.location.pathname);
    this.ready = this.routeError = false;
    this.formError = '';
    document.title = 'Photoshow';
    if (!this.actor) return;
    try {
      await import('./gallery.ts');
      if (this.isConnected && version === this.version) this.ready = true;
    } catch {
      if (this.isConnected && version === this.version) this.routeError = true;
    }
  }

  private submit(event: SubmitEvent) {
    event.preventDefault();
    const input = (event.currentTarget as HTMLFormElement).querySelector('input')!;
    try {
      this.navigate(normalizeActor(input.value));
    } catch (cause) {
      this.formError = cause instanceof Error ? cause.message : 'Enter a Grain handle or DID.';
    }
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
        : html`<main class="gallery">
            <p class="gallery-state" role=${this.routeError ? 'alert' : 'status'}>
              ${this.routeError ? html`Couldn’t load the gallery. Please try again.<button @click=${this.pop}>Retry</button>` : 'Loading photos…'}
            </p>
          </main>`;
    return html`<main class="home">
      <form class="handle-form" novalidate @submit=${this.submit}>
        <label for="handle" class="sr-only">Your Grain handle or DID</label>
        <div class="handle-input">
          <input
            id="handle"
            placeholder="your handle here"
            autocapitalize="none"
            autocorrect="off"
            spellcheck="false"
            aria-invalid=${String(!!this.formError)}
            aria-describedby=${this.formError ? 'handle-error' : nothing}
            @input=${() => {
              this.formError = '';
            }}
          />
          <button type="submit">Open</button>
        </div>
        <p id="handle-error" class="form-error" role="alert" ?hidden=${!this.formError}>
          ${this.formError}
        </p>
      </form>
    </main>`;
  }
}

void loadTypography().then(() => customElements.define('photo-show', PhotoshowApp));
declare global {
  interface HTMLElementTagNameMap {
    'photo-show': PhotoshowApp;
  }
}
