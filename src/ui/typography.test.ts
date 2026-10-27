import { afterEach, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { loadTechnicalTypography, loadTypography } from './typography.ts';

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, 'document');
let loaded: () => void;
let failed: (error: Error) => void;
let faces: unknown[];
let pending: Promise<void>;

beforeEach(() => {
  faces = [];
  pending = new Promise<void>((resolve, reject) => {
    loaded = resolve;
    failed = reject;
  });
  class FontMock {
    family: string;
    source: string;
    descriptors: FontFaceDescriptors;
    constructor(family: string, source: string, descriptors: FontFaceDescriptors) {
      this.family = family;
      this.source = source;
      this.descriptors = descriptors;
    }
    load() {
      return pending.then(() => this);
    }
  }
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { FontFace: FontMock },
  });
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { fonts: { add: (face: unknown) => faces.push(face) } },
  });
});
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, 'window', originalWindow);
  else Reflect.deleteProperty(globalThis, 'window');
  if (originalDocument) Object.defineProperty(globalThis, 'document', originalDocument);
  else Reflect.deleteProperty(globalThis, 'document');
});

describe('typography startup', () => {
  it('waits for the complete variable face before registering it for rendering', async () => {
    let ready = false;
    const loading = loadTypography().then(() => {
      ready = true;
    });
    await Promise.resolve();
    assert.equal(ready, false);
    assert.equal(faces.length, 0);
    loaded();
    await loading;
    assert.equal(ready, true);
    assert.equal(faces.length, 1);
    const face = faces[0] as { family: string; source: string; descriptors: FontFaceDescriptors };
    assert.equal(face.family, 'Atkinson Hyperlegible Next');
    assert(face.source.includes('atkinson-hyperlegible-next.woff2'));
    assert.equal(face.descriptors.weight, '200 800');
  });
  it('allows a stable fallback when the font request fails', async () => {
    const loading = loadTypography();
    failed(new Error('Font unavailable'));
    await loading;
    assert.equal(faces.length, 0);
  });
  it('allows a stable fallback on a slow connection and never adds a late font', async (context) => {
    context.mock.timers.enable({ apis: ['setTimeout'] });
    let ready = false;
    const loading = loadTypography().then(() => {
      ready = true;
    });
    context.mock.timers.tick(2999);
    await Promise.resolve();
    assert.equal(ready, false);
    context.mock.timers.tick(1);
    await loading;
    assert.equal(ready, true);
    assert.equal(faces.length, 0);
    loaded();
    await pending;
    await Promise.resolve();
    assert.equal(faces.length, 0);
  });
  it('still starts when the font loading API is unavailable', async () => {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: {} });
    await loadTypography();
    assert.equal(faces.length, 0);
  });
  it('loads the regular Mono face once for technical details', async () => {
    const loading = loadTechnicalTypography();
    assert.equal(loadTechnicalTypography(), loading);
    assert.equal(faces.length, 0);
    loaded();
    await loading;
    const face = faces[0] as { family: string; source: string; descriptors: FontFaceDescriptors };
    assert.equal(face.family, 'Atkinson Hyperlegible Mono');
    assert(face.source.includes('atkinson-hyperlegible-mono.woff2'));
    assert.equal(face.descriptors.weight, '400');
    assert.equal(loadTechnicalTypography(), loading);
    assert.equal(faces.length, 1);
  });
});
