// Keep the familiar /did:plc:… URL while round-tripping encoded did:web ports.
const siteBase = import.meta.env?.BASE_URL || '/';

export function galleryPath(actor: string, base = siteBase): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  return actor ? `${root}${encodeURIComponent(actor).replace(/%3A/gi, ':')}` : root;
}

export function actorFromPath(pathname: string, base = siteBase): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  if (!pathname.startsWith(root)) return '';
  const path = pathname.slice(root.length).replace(/^\/+|\/+$/g, '');
  try {
    return decodeURIComponent(path);
  } catch {
    return path;
  }
}

// GitHub Pages sends unknown paths to 404.html, which redirects here once.
export function restorePageRoute(base = siteBase) {
  const root = new URL(base.endsWith('/') ? base : `${base}/`, window.location.origin);
  if (window.location.pathname !== root.pathname) return;
  const saved = new URLSearchParams(window.location.search).get('__photoshow_route');
  if (!saved) return;
  try {
    const target = new URL(saved, root);
    if (target.origin === root.origin && target.pathname.startsWith(root.pathname)) {
      window.history.replaceState({}, '', target.pathname + target.search + target.hash);
    }
  } catch {
    // A malformed redirect must not prevent the home page from opening.
  }
}
