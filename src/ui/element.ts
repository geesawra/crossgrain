import { LitElement } from 'lit';

// Keep the shared stylesheet and existing custom-element composition.
export class PhotoElement extends LitElement {
  protected createRenderRoot() {
    return this;
  }
}
