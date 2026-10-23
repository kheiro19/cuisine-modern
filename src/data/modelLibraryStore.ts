// src/data/modelLibraryStore.ts
// Loads the external 3D library once (public/models/library/manifest.json) and keeps it where the 3D scene and the library panel
// can both read it. No React here: components subscribe through useModelLibrary.ts. A missing manifest is normal (nobody has
// dropped a .glb yet): the app then uses its built-in shapes.
import { AccessoryItem, ACCESSORY_CATALOG, registerExtraAccessories } from './accessoryCatalog';
import { ModelManifest, emptyManifest, parseExtraItems, parseManifest, resolveGlb } from './libraryManifest';

export type LibraryStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export interface LibrarySnapshot {
  status: LibraryStatus;
  manifest: ModelManifest;
  /** Problems found while reading the library (broken entries, invalid extra pieces). */
  errors: string[];
  /** Pieces declared in library.json "items" whose 3D file exists (the only ones shown). */
  extraItems: readonly AccessoryItem[];
  /** Ids declared in library.json "items" that wait for their 3D file (hidden until it is in the folder). */
  hiddenExtraIds: readonly string[];
  /** Base folder the .glb files are served from, with a trailing slash. */
  baseUrl: string;
}

export type Fetcher = (url: string) => Promise<{ ok: boolean; status: number; json: () => Promise<unknown> }>;

const initial = (): LibrarySnapshot => ({ status: 'idle', manifest: emptyManifest(), errors: [], extraItems: [], hiddenExtraIds: [], baseUrl: '/models/library/' });

let snapshot: LibrarySnapshot = initial();
const listeners = new Set<() => void>();

const publish = (next: LibrarySnapshot) => {
  snapshot = next;
  listeners.forEach((l) => l());
};

export const getModelLibrary = (): LibrarySnapshot => snapshot;

export function subscribeModelLibrary(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

/** Starts loading (once). `appBase` is the Vite base ("/" or "/my-app/"). */
export async function loadModelLibrary(appBase = '/', fetcher?: Fetcher): Promise<LibrarySnapshot> {
  if (snapshot.status !== 'idle') return snapshot;
  const base = (appBase.endsWith('/') ? appBase : appBase + '/') + 'models/library/';
  publish({ ...initial(), status: 'loading', baseUrl: base });
  const doFetch: Fetcher = fetcher ?? ((u) => fetch(u));
  try {
    const res = await doFetch(base + 'manifest.json');
    if (!res.ok) {
      publish({ ...snapshot, status: 'empty' });
      return snapshot;
    }
    const { manifest, errors } = parseManifest(await res.json());
    const extra = parseExtraItems(manifest.library.items, new Set(ACCESSORY_CATALOG.map((a) => a.id)));
    // A piece that only exists in the library is shown once its 3D file is there: nobody wants a grey box in the catalog.
    const shown = extra.items.filter((i) => resolveGlb(i.id, i.model, manifest) !== undefined);
    const hidden = extra.items.filter((i) => !shown.includes(i)).map((i) => i.id);
    registerExtraAccessories(shown);
    const hasContent = Object.keys(manifest.files).length > 0 || shown.length > 0;
    publish({ ...snapshot, status: hasContent ? 'ready' : 'empty', manifest, errors: [...errors, ...extra.errors], extraItems: shown, hiddenExtraIds: hidden });
  } catch (e) {
    publish({ ...snapshot, status: 'error', errors: [`manifest.json: ${e instanceof Error ? e.message : String(e)}`] });
  }
  return snapshot;
}

/** Forgets everything (tests, or after the user drops new files and wants to reload). */
export function resetModelLibrary(): void {
  registerExtraAccessories([]);
  publish(initial());
}
