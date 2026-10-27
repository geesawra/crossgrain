// Keep the familiar /did:plc:… URL while round-tripping encoded did:web ports.
export function galleryPath(actor: string): string {
  return actor ? `/${encodeURIComponent(actor).replace(/%3A/gi, ':')}` : '/';
}

export function actorFromPath(pathname: string): string {
  const path = pathname.replace(/^\/+|\/+$/g, '');
  try { return decodeURIComponent(path); } catch { return path; }
}
