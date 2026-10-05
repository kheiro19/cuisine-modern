// src/data/onlineTextures.ts
// "Workshop Matrix online": textures served from the web instead of /public/textures.
import type { TextureEntry } from './textureCatalog';

/**
 * PERMANENT online textures. Add your own links here, for example:
 *   { id: 'online_royal_oak', name: 'Premium Royal Oak',
 *     path: 'https://raw.githubusercontent.com/<user>/<repo>/main/oak.jpg', finish: 'Embossed Wood Grain' },
 *
 * The two links that used to live here were cut off in the project ('https://githubusercontent.com' with no
 * path), so they cannot be recovered and the list starts empty. The showcase also lets you paste any https image
 * link at run time (kept for the current session only).
 *
 * The server MUST send CORS headers (raw.githubusercontent.com does). Without them the thumbnail may show but
 * WebGL cannot use the image, and the cabinet simply keeps its flat colour.
 */
export const onlineTextureCatalog: TextureEntry[] = [];

const IMAGE_EXTENSION = /\.(jpe?g|png|webp)$/i;

/** Validates a pasted link. Only plain https image links are accepted (no http, data:, javascript:, credentials). */
export function makeOnlineTextureEntry(raw: string): TextureEntry | null {
  let url: URL;
  try {
    url = new URL(String(raw).trim());
  } catch (e) {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (!IMAGE_EXTENSION.test(url.pathname)) return null;

  const lastSegment = url.pathname.split('/').pop() || '';
  let file = lastSegment;
  try {
    file = decodeURIComponent(lastSegment);
  } catch (e) {
    /* keep the raw segment */
  }
  return {
    id: `online_${url.href}`,
    name: file.replace(/\.[^.]+$/, '') || url.hostname,
    path: url.href,
    finish: 'MDF Melamine Matt',
  };
}
