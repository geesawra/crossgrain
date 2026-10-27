const fallback = `${import.meta.env?.BASE_URL || '/'}favicon.png?v=3`;
let pending: HTMLImageElement | undefined;
let current: HTMLLinkElement | null;
let source: string | undefined;

export function setFavicon(avatar?: string) {
  const icon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!icon || (current === icon && source === avatar)) return;
  current = icon;
  source = avatar;
  if (pending) {
    pending.onload = pending.onerror = null;
    pending.removeAttribute('src');
    pending = undefined;
  }
  icon.href = fallback;
  icon.type = 'image/png';
  if (!avatar) return;
  const image = (pending = new window.Image());
  image.onload = async () => {
    try {
      await image.decode();
      if (pending === image) {
        icon.href = avatar;
        icon.type = 'image/jpeg';
      }
    } catch {
      /* Keep the crossgrain icon if the avatar cannot be decoded. */
    } finally {
      if (pending === image) pending = undefined;
    }
  };
  image.onerror = () => {
    if (pending === image) pending = undefined;
  };
  image.src = avatar;
}
