// src/data/onlineSources.ts
// The two CC0 texture sites the "Workshop Matrix Online" tab can browse live: Poly Haven and ambientCG. Pure functions only
// (URL builders and defensive parsers of what their public APIs answer): the loading is in onlineTextureLoader.ts.
//
// Poly Haven   https://api.polyhaven.com   free for non-commercial use, needs a visible "Powered by Poly Haven" credit.
//              GET /assets?type=textures -> { <id>: { name, categories, tags, authors, ... } }
//              GET /files/<id>           -> { Diffuse: { "1k": { jpg: { url, size } } }, ... }
// ambientCG    https://ambientcg.com/api/v2 (v2: frozen, still served)
//              GET /full_json?type=Material&q=...&limit=..&offset=..&include=downloadData,previewData
//              textures come as zip packs (<id>_1K-JPG.zip) holding <id>_1K-JPG_Color.jpg and the other maps.

export type OnlineSource = 'polyhaven' | 'ambientcg';

export interface OnlineTexture {
  /** "<source>:<id>", unique across sources. */
  key: string;
  source: OnlineSource;
  id: string;
  name: string;
  categories: string[];
  thumbUrl: string;
  pageUrl: string;
  author?: string;
  /** ambientCG: the zip pack to download (about 5 to 15 MB). */
  zipUrl?: string;
  sizeBytes?: number;
}

export const POLYHAVEN_API = 'https://api.polyhaven.com';
export const AMBIENTCG_API = 'https://ambientcg.com/api/v2';
export const SOURCE_LABEL: Record<OnlineSource, string> = { polyhaven: 'Poly Haven', ambientcg: 'ambientCG' };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown): string | undefined => (typeof v === 'string' && v.trim() !== '' ? v : undefined);
const prettify = (id: string) => id.replace(/[_-]+/g, ' ').replace(/\s+\d+$/, (m) => m).replace(/\b\w/g, (c) => c.toUpperCase());

// ---- Poly Haven ----------------------------------------------------------------------------------------------------------
export const polyHavenListUrl = (base = POLYHAVEN_API) => `${base}/assets?type=textures`;
export const polyHavenFilesUrl = (id: string, base = POLYHAVEN_API) => `${base}/files/${encodeURIComponent(id)}`;

export function parsePolyHavenList(raw: unknown): OnlineTexture[] {
  if (!isObj(raw)) return [];
  const out: OnlineTexture[] = [];
  for (const [id, e] of Object.entries(raw)) {
    if (!isObj(e)) continue;
    out.push({
      key: `polyhaven:${id}`,
      source: 'polyhaven',
      id,
      name: str(e.name) ?? prettify(id),
      categories: [...(Array.isArray(e.categories) ? e.categories : []), ...(Array.isArray(e.tags) ? e.tags : [])].filter((x): x is string => typeof x === 'string').map((x) => x.toLowerCase()),
      thumbUrl: str(e.thumbnail_url) ?? `https://cdn.polyhaven.com/asset_img/thumbs/${encodeURIComponent(id)}.png?width=256&height=256`,
      pageUrl: `https://polyhaven.com/a/${encodeURIComponent(id)}`,
      ...(isObj(e.authors) && Object.keys(e.authors).length > 0 ? { author: Object.keys(e.authors).join(', ') } : {}),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

const RES_ORDER = ['1k', '2k', '512', '4k', '8k'];

/** The URL of the colour map of a Poly Haven texture (1k preferred: light for a phone), or null. */
export function pickPolyHavenColor(raw: unknown): string | null {
  if (!isObj(raw)) return null;
  const key = Object.keys(raw).find((k) => /^(diffuse|diff|color|colour|albedo|base_?color)$/i.test(k));
  const maps = key ? raw[key] : undefined;
  if (!isObj(maps)) return null;
  const resolutions = [...RES_ORDER.filter((r) => r in maps), ...Object.keys(maps).filter((r) => !RES_ORDER.includes(r))];
  for (const r of resolutions) {
    const formats = maps[r];
    if (!isObj(formats)) continue;
    for (const f of ['jpg', 'jpeg', 'png', 'webp']) {
      const file = formats[f];
      if (isObj(file) && typeof file.url === 'string' && file.url.startsWith('https://')) return file.url;
    }
  }
  return null;
}

// ---- ambientCG -----------------------------------------------------------------------------------------------------------
export function ambientListUrl(opts: { q?: string; offset?: number; limit?: number } = {}, base = AMBIENTCG_API): string {
  const limit = Math.max(1, Math.min(250, opts.limit ?? 48));
  const q = opts.q?.trim();
  return `${base}/full_json?type=Material&sort=Popular&limit=${limit}&offset=${Math.max(0, opts.offset ?? 0)}&include=downloadData,previewData${q ? `&q=${encodeURIComponent(q)}` : ''}`;
}

export const ambientCategoriesUrl = (base = AMBIENTCG_API) => `${base}/categories_json`;
export const ambientZipFallbackUrl = (id: string) => `https://ambientcg.com/get?file=${encodeURIComponent(id)}_1K-JPG.zip`;
const ambientThumbFallback = (id: string) => `https://acg-media.struffelproductions.com/file/ambientCG-Web/media/thumbnail/256-JPG-FFFFFF/${encodeURIComponent(id)}.jpg`;

/** The "1K-JPG" download of an asset, searched anywhere in its downloadFolders tree. */
function findOneKZip(node: unknown, depth = 0): { url?: string; size?: number } | null {
  if (depth > 6) return null;
  if (Array.isArray(node)) {
    for (const x of node) {
      const r = findOneKZip(x, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (!isObj(node)) return null;
  if (node.attribute === '1K-JPG' || (typeof node.fileName === 'string' && /_1K-JPG\.zip$/i.test(node.fileName))) {
    const url = str(node.downloadLink) ?? str(node.rawLink) ?? str(node.fullDownloadPath);
    return { ...(url ? { url } : {}), ...(typeof node.size === 'number' ? { size: node.size } : {}) };
  }
  for (const v of Object.values(node)) {
    const r = findOneKZip(v, depth + 1);
    if (r) return r;
  }
  return null;
}

function ambientThumb(a: Record<string, unknown>, id: string): string {
  const p = a.previewImage;
  if (typeof p === 'string' && p.startsWith('https://')) return p;
  if (isObj(p)) {
    const entries = Object.entries(p).filter(([, v]) => typeof v === 'string' && (v as string).startsWith('https://')) as Array<[string, string]>;
    const small = entries.find(([k]) => k.includes('256')) ?? entries.find(([k]) => k.includes('128')) ?? entries[0];
    if (small) return small[1];
  }
  return ambientThumbFallback(id);
}

export function parseAmbientList(raw: unknown): { items: OnlineTexture[]; total: number } {
  if (!isObj(raw) || !Array.isArray(raw.foundAssets)) return { items: [], total: 0 };
  const items: OnlineTexture[] = [];
  for (const a of raw.foundAssets) {
    if (!isObj(a) || typeof a.assetId !== 'string') continue;
    const id = a.assetId;
    const zip = findOneKZip(a.downloadFolders);
    items.push({
      key: `ambientcg:${id}`,
      source: 'ambientcg',
      id,
      name: str(a.customDisplayName) ?? str(a.displayName) ?? prettify(id),
      categories: [str(a.category), str(a.displayCategory)].filter((x): x is string => !!x).map((x) => x.toLowerCase()),
      thumbUrl: ambientThumb(a, id),
      pageUrl: str(a.shortLink) ?? `https://ambientcg.com/view?id=${encodeURIComponent(id)}`,
      zipUrl: zip?.url ?? ambientZipFallbackUrl(id),
      ...(zip?.size ? { sizeBytes: zip.size } : {}),
    });
  }
  return { items, total: typeof raw.numberOfResults === 'number' ? raw.numberOfResults : items.length };
}

/** Keeps the textures whose name, id or categories contain every word of the query. */
export function filterTextures(list: readonly OnlineTexture[], query: string): OnlineTexture[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...list];
  return list.filter((t) => {
    const hay = `${t.name} ${t.id} ${t.categories.join(' ')}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

/** Quick filters of the browser: Arabic label and the English keyword the two sites understand. */
export const QUICK_FILTERS: ReadonlyArray<{ label: string; q: string }> = [
  { label: 'خشب', q: 'wood' },
  { label: 'رخام', q: 'marble' },
  { label: 'بلاط', q: 'tiles' },
  { label: 'معدن', q: 'metal' },
  { label: 'خرسانة', q: 'concrete' },
  { label: 'حجر', q: 'stone' },
  { label: 'جلد', q: 'leather' },
];
