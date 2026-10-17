// src/data/onlineTextureLoader.ts
// Fetches the colour map of a texture of Poly Haven / ambientCG and hands it to the 3D scene as a blob: address.
// A blob is same-origin, so WebGL can use it, and the fetch tells us EXACTLY why a site refused (a CORS block, a bad status,
// a page that is not an image) instead of a texture that silently stays grey.
import { extractZipEntry, ZipError } from './zipRead';
import {
  AMBIENTCG_API,
  OnlineTexture,
  POLYHAVEN_API,
  ambientCategoriesUrl,
  ambientListUrl,
  parseAmbientList,
  parsePolyHavenList,
  pickPolyHavenColor,
  polyHavenFilesUrl,
  polyHavenListUrl,
} from './onlineSources';

export type LoadErrorKind = 'network' | 'http' | 'format' | 'zip' | 'notfound';

export class OnlineLoadError extends Error {
  constructor(readonly kind: LoadErrorKind, message: string, readonly status?: number) {
    super(message);
  }
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer: () => Promise<ArrayBuffer>; json: () => Promise<unknown> }>;

export interface LoaderDeps {
  fetcher?: Fetcher;
  makeUrl?: (blob: Blob) => string;
  polyHavenBase?: string;
  /** Maps an ambientCG address to the one the page can call (the same-origin proxy). Identity by default. */
  rewrite?: (url: string) => string;
  /** Called with the downloaded fraction (0..1) when known. Only for the big ambientCG zips. */
  onProgress?: (fraction: number) => void;
}

const same = (u: string) => u;

const defaultFetcher: Fetcher = (u) => fetch(u, { referrerPolicy: 'no-referrer' });

async function get(url: string, f: Fetcher) {
  let res;
  try {
    res = await f(url);
  } catch (e) {
    throw new OnlineLoadError('network', 'تعذّر الاتصال بالموقع. إمّا لا يوجد اتصال بالإنترنت، وإمّا أن الموقع يمنع تطبيقك من قراءة ملفاته (CORS).');
  }
  if (!res.ok) throw new OnlineLoadError('http', `ردّ الموقع بالحالة ${res.status}.`, res.status);
  return res;
}

const imageKind = (b: Uint8Array): 'jpeg' | 'png' | 'webp' | null => {
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  if (b.length > 4 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'webp';
  return null;
};

const cache = new Map<string, string>();

/** Empties the blob cache (tests). */
export function clearTextureCache(): void {
  cache.clear();
}

/** The address (blob:) of the colour map of `tex`, downloaded once and kept for the session. */
export async function loadTextureBlobUrl(tex: OnlineTexture, deps: LoaderDeps = {}): Promise<string> {
  const hit = cache.get(tex.key);
  if (hit) return hit;
  const f = deps.fetcher ?? defaultFetcher;
  const makeUrl = deps.makeUrl ?? ((b: Blob) => URL.createObjectURL(b));
  const rewrite = deps.rewrite ?? same;
  let bytes: Uint8Array;

  if (tex.source === 'polyhaven') {
    const files = await (await get(polyHavenFilesUrl(tex.id, deps.polyHavenBase ?? POLYHAVEN_API), f)).json();
    const url = pickPolyHavenColor(files);
    if (!url) throw new OnlineLoadError('notfound', 'لم أجد صورة اللون (Diffuse) لهذه الخامة عند Poly Haven.');
    bytes = new Uint8Array(await (await get(url, f)).arrayBuffer());
  } else {
    // 1) the square colour preview (a small image, no zip); 2) the zip pack, from which only the colour map is kept.
    let previewError: unknown = null;
    let got: Uint8Array | null = null;
    if (tex.colorUrl) {
      try {
        const b = new Uint8Array(await (await get(rewrite(tex.colorUrl), f)).arrayBuffer());
        if (imageKind(b)) got = b;
        else previewError = new OnlineLoadError('format', 'صورة اللون المعاينة ليست صورة.');
      } catch (e) {
        previewError = e;
      }
    }
    if (got) {
      bytes = got;
    } else {
      if (!tex.zipUrl) throw previewError instanceof OnlineLoadError ? previewError : new OnlineLoadError('notfound', 'لا يوجد رابط تنزيل لهذه الخامة.');
      const res = await get(rewrite(tex.zipUrl), f);
      deps.onProgress?.(0.5);
      const zipBytes = new Uint8Array(await res.arrayBuffer());
      try {
        const entry = await extractZipEntry(zipBytes, (n) => /_Color\.(jpe?g|png)$/i.test(n));
        if (!entry) throw new OnlineLoadError('zip', 'حزمة ambientCG لا تحوي صورة اللون (Color).');
        bytes = entry.data;
      } catch (e) {
        if (e instanceof OnlineLoadError) throw e;
        throw new OnlineLoadError('zip', e instanceof ZipError ? e.message : 'تعذّر فتح الحزمة المضغوطة.');
      }
    }
  }

  const kind = imageKind(bytes);
  if (!kind) throw new OnlineLoadError('format', 'الملف المستلم ليس صورة (ربما صفحة خطأ من الموقع).');
  const url = makeUrl(new Blob([bytes as BlobPart], { type: kind === 'jpeg' ? 'image/jpeg' : `image/${kind}` }));
  cache.set(tex.key, url);
  return url;
}

export interface SourceStatus { ok: boolean; message: string }

/** "Test the connection": does each site answer, and can this app read the answer? */
export async function checkSources(deps: LoaderDeps = {}): Promise<Record<'polyhaven' | 'ambientcg', SourceStatus>> {
  const f = deps.fetcher ?? defaultFetcher;
  const one = async (run: () => Promise<string>): Promise<SourceStatus> => {
    try {
      return { ok: true, message: await run() };
    } catch (e) {
      return { ok: false, message: e instanceof Error ? e.message : String(e) };
    }
  };
  return {
    polyhaven: await one(async () => {
      const n = parsePolyHavenList(await (await get(polyHavenListUrl(deps.polyHavenBase ?? POLYHAVEN_API), f)).json()).length;
      if (n === 0) throw new OnlineLoadError('format', 'الردّ وصل لكن بلا خامات (شكل غير متوقع).');
      return `${n} خامة`;
    }),
    ambientcg: await one(async () => {
      const rewrite = deps.rewrite ?? same;
      const list = parseAmbientList(await (await get(rewrite(ambientListUrl({ limit: 1 }, AMBIENTCG_API)), f)).json());
      if (list.items.length === 0) {
        await (await get(rewrite(ambientCategoriesUrl(AMBIENTCG_API)), f)).json();
        throw new OnlineLoadError('format', 'الردّ وصل لكن بلا خامات (شكل غير متوقع).');
      }
      const first = list.items[0];
      try {
        const b = new Uint8Array(await (await get(rewrite(first.colorUrl ?? ''), f)).arrayBuffer());
        if (!imageKind(b)) throw new OnlineLoadError('format', 'ليست صورة.');
      } catch (e) {
        throw new OnlineLoadError('network', `القائمة تعمل (${list.total} خامة) لكن صورة اللون ممنوعة: ${e instanceof Error ? e.message : String(e)}`);
      }
      return `${list.total} خامة، وصورة اللون متاحة`;
    }),
  };
}

export { parseAmbientList, parsePolyHavenList, ambientListUrl, polyHavenListUrl };
