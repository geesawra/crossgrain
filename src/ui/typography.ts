// Load each font before rendering the text that uses it.
// Register only a loaded face: a failed or timed-out request cannot cause a late swap.
export function loadTypography(): Promise<void> {
  return loadFont(
    'Atkinson Hyperlegible Next',
    new URL('../assets/fonts/atkinson-hyperlegible-next.woff2', import.meta.url).href,
    '200 800',
  );
}

let technicalTypography: Promise<void> | undefined;
export function loadTechnicalTypography(): Promise<void> {
  return (technicalTypography ??= loadFont(
    'Atkinson Hyperlegible Mono',
    new URL('../assets/fonts/atkinson-hyperlegible-mono.woff2', import.meta.url).href,
    '400',
  ));
}

async function loadFont(family: string, source: string, weight: string): Promise<void> {
  if (!window.FontFace || !document.fonts) return;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const face = new window.FontFace(family, `url("${source}") format("woff2")`, {
      style: 'normal',
      weight,
      display: 'block',
    });
    const loaded = await Promise.race([
      face.load().then(
        () => true,
        () => false,
      ),
      new Promise<boolean>((resolve) => {
        timeout = setTimeout(() => resolve(false), 3000);
      }),
    ]);
    if (loaded) document.fonts.add(face);
  } catch {
    /* Keep a stable system fallback if fonts are unavailable. */
  } finally {
    clearTimeout(timeout);
  }
}
