// src/data/libraryManifest.ts
// The external 3D library: what `npm run models` writes (public/models/library/manifest.json) and how the app reads it.
// Pure data and checks (no React, no three.js, no fetch): the loading is in modelLibraryStore.ts.
//
// How a piece of the library is found for a catalog piece:
//   1. library.json "bindings": { "<catalog id>": "<file name without .glb>" }
//   2. a file called exactly like the catalog id            (fridge-sbs.glb)
//   3. a file called after its model family                  (model-tap.glb serves every tap)
// Pieces that exist only in the library are declared in library.json "items" (no code): see parseExtraItems.

import {
  ACCESSORY_CATEGORIES,
  ACCESSORY_MOUNTS,
  AccessoryCategory,
  AccessoryItem,
  AccessoryMount,
  FINISHES,
  FinishKey,
} from './accessoryCatalog';
import { BBox, fitToBox, proportionMismatch, rotateBBoxY } from '../math/modelFit';

export interface GlbEntry {
  file: string;
  bytes: number;
  bbox: BBox;
  triangles: number;
  materials: string[];
  extensions: string[];
  warnings?: string[];
}

export interface LibraryOverride {
  /** 'contain' keeps the proportions (default), 'stretch' fills the catalog size on every side. */
  fit?: 'contain' | 'stretch';
  /** Turn the model about the vertical axis so its front looks towards the user (degrees). */
  rotateY?: number;
  /** Names of the materials the chosen finish recolours; none = the finish swatches are hidden for this piece. */
  tintMaterials?: string[];
  license?: string;
  author?: string;
  source?: string;
}

export interface LibraryFile {
  bindings?: Record<string, string>;
  overrides?: Record<string, LibraryOverride>;
  items?: unknown[];
}

export interface ModelManifest {
  version: 1;
  generatedAt?: string;
  files: Record<string, GlbEntry>;
  library: LibraryFile;
  warnings: string[];
}

export const emptyManifest = (): ModelManifest => ({ version: 1, files: {}, library: {}, warnings: [] });

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const isVec3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every(isNum);
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** Reads manifest.json defensively: a broken entry is dropped and reported, never thrown. */
export function parseManifest(raw: unknown): { manifest: ModelManifest; errors: string[] } {
  const errors: string[] = [];
  const manifest = emptyManifest();
  if (!isObj(raw)) return { manifest, errors: ['manifest.json: not an object'] };
  if (typeof raw.generatedAt === 'string') manifest.generatedAt = raw.generatedAt;
  manifest.warnings = strList(raw.warnings);
  if (isObj(raw.library)) manifest.library = raw.library as LibraryFile;
  if (isObj(raw.files)) {
    for (const [stem, e] of Object.entries(raw.files)) {
      if (!isObj(e) || typeof e.file !== 'string' || !isObj(e.bbox) || !isVec3(e.bbox.min) || !isVec3(e.bbox.max)) {
        errors.push(`${stem}: entry without file or bounding box, ignored`);
        continue;
      }
      manifest.files[stem] = {
        file: e.file,
        bytes: isNum(e.bytes) ? e.bytes : 0,
        bbox: { min: e.bbox.min, max: e.bbox.max },
        triangles: isNum(e.triangles) ? e.triangles : 0,
        materials: strList(e.materials),
        extensions: strList(e.extensions),
        warnings: strList(e.warnings),
      };
    }
  }
  return { manifest, errors };
}

const ID_RE = /^[a-z0-9][a-z0-9-]{1,40}$/;
const MAX_MM = 6000;

/** Validates the pieces declared in library.json "items". Valid ones come back ready to register; the others are reported. */
export function parseExtraItems(raw: unknown, takenIds: ReadonlySet<string>): { items: AccessoryItem[]; errors: string[] } {
  const items: AccessoryItem[] = [];
  const errors: string[] = [];
  if (raw === undefined) return { items, errors };
  if (!Array.isArray(raw)) return { items, errors: ['library.json: "items" must be a list'] };
  const seen = new Set<string>(takenIds);
  raw.forEach((r, i) => {
    const where = isObj(r) && typeof r.id === 'string' ? r.id : `#${i + 1}`;
    const bad = (msg: string) => errors.push(`${where}: ${msg}`);
    if (!isObj(r)) return bad('not an object');
    if (typeof r.id !== 'string' || !ID_RE.test(r.id)) return bad('id must be lowercase letters, digits and dashes (2 to 41 characters)');
    if (seen.has(r.id)) return bad('this id already exists');
    if (!ACCESSORY_CATEGORIES.includes(r.category as AccessoryCategory)) return bad(`category must be one of ${ACCESSORY_CATEGORIES.join(', ')}`);
    if (!ACCESSORY_MOUNTS.includes(r.mount as AccessoryMount)) return bad(`mount must be one of ${ACCESSORY_MOUNTS.join(', ')}`);
    if (typeof r.nameAr !== 'string' || r.nameAr.trim() === '') return bad('nameAr is required');
    const s = r.sizeMm;
    if (!isObj(s) || ![s.w, s.h, s.d].every((v) => isNum(v) && v > 0 && v <= MAX_MM)) return bad(`sizeMm needs w, h and d between 1 and ${MAX_MM} mm`);
    const finishes = strList(r.finishes).filter((k): k is FinishKey => k in FINISHES);
    const mount = r.mount as AccessoryMount;
    const zPlace = r.zPlace === 'CENTER' || r.zPlace === 'FRONT' || r.zPlace === 'REAR' ? r.zPlace : 'REAR';
    seen.add(r.id);
    items.push({
      id: r.id,
      category: r.category as AccessoryCategory,
      nameAr: r.nameAr.trim(),
      nameEn: typeof r.nameEn === 'string' && r.nameEn.trim() ? r.nameEn.trim() : r.nameAr.trim(),
      icon: typeof r.icon === 'string' && r.icon ? r.icon : '📦',
      mount,
      model: 'placeholder',
      sizeMm: { w: s.w as number, h: s.h as number, d: s.d as number },
      zPlace,
      ...(finishes.length > 0 ? { finishes } : {}),
      ...(typeof r.note === 'string' ? { note: r.note } : {}),
      ...(typeof r.tags === 'string' ? { tags: r.tags } : {}),
      ...(r.noCollide === true ? { noCollide: true } : {}),
      external: true,
    });
    return;
  });
  return { items, errors };
}

export interface GlbResolution {
  stem: string;
  entry: GlbEntry;
  fit: 'contain' | 'stretch';
  rotateY: number;
  tintMaterials: string[];
  override: LibraryOverride;
}

/** The 3D file that draws a catalog piece, or undefined (the piece is then drawn by its built-in shapes). */
export function resolveGlb(itemId: string, model: string, manifest: ModelManifest): GlbResolution | undefined {
  const stems = [manifest.library.bindings?.[itemId], itemId, `model-${model}`].filter((s): s is string => typeof s === 'string');
  for (const stem of stems) {
    const entry = manifest.files[stem];
    if (!entry) continue;
    const override = manifest.library.overrides?.[itemId] ?? manifest.library.overrides?.[stem] ?? {};
    return {
      stem,
      entry,
      fit: override.fit === 'stretch' ? 'stretch' : 'contain',
      rotateY: isNum(override.rotateY) ? override.rotateY : 0,
      tintMaterials: strList(override.tintMaterials),
      override,
    };
  }
  return undefined;
}

export const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_TRIANGLES = 60000;
export const MAX_MISMATCH = 0.35;

/** Warnings for a library: files that do not look like their catalog piece, are too heavy, have no licence or serve nothing. */
export function checkLibrary(manifest: ModelManifest, items: readonly AccessoryItem[]): string[] {
  const out: string[] = [];
  const used = new Set<string>();
  for (const item of items) {
    const res = resolveGlb(item.id, item.model, manifest);
    if (!res) continue;
    used.add(res.stem);
    const box = rotateBBoxY(res.entry.bbox, res.rotateY);
    const mismatch = proportionMismatch(box, item.sizeMm);
    if (res.fit === 'contain' && mismatch > MAX_MISMATCH) {
      out.push(`${res.stem}: its proportions differ ${Math.round(mismatch * 100)} % from "${item.nameAr}" (${item.sizeMm.w}x${item.sizeMm.h}x${item.sizeMm.d} mm): wrong model, wrong rotateY (try 90 or 180), or use fit "stretch"`);
    }
    const f = fitToBox(box, item.sizeMm, res.fit);
    if (!f.scale.every((v) => Number.isFinite(v) && v > 0)) out.push(`${res.stem}: could not be fitted`);
  }
  for (const [stem, e] of Object.entries(manifest.files)) {
    if (!used.has(stem)) out.push(`${stem}: no catalog piece uses this file (name it like a catalog id, "model-<family>", or bind it in library.json)`);
    if (e.bytes > MAX_BYTES) out.push(`${stem}: ${(e.bytes / 1048576).toFixed(1)} MB is heavy for a phone (limit ${MAX_BYTES / 1048576} MB): compress it (Draco / Meshopt, 1024 px textures)`);
    if (e.triangles > MAX_TRIANGLES) out.push(`${stem}: ${e.triangles} triangles (limit ${MAX_TRIANGLES}): simplify it`);
    const o = manifest.library.overrides?.[stem];
    if (!o?.license) out.push(`${stem}: no licence recorded in library.json "overrides" (keep proof of the right to use it in a paid project)`);
    for (const m of o?.tintMaterials ?? []) if (!e.materials.includes(m)) out.push(`${stem}: tintMaterials "${m}" is not a material of this file (${e.materials.join(', ') || 'none'})`);
  }
  return out;
}

/** Licences and authors of the files that are really used, for the credits list. */
export function creditsOf(manifest: ModelManifest): Array<{ stem: string; license: string; author?: string; source?: string }> {
  return Object.keys(manifest.files).sort().map((stem) => {
    const o = manifest.library.overrides?.[stem] ?? {};
    return { stem, license: o.license ?? '', ...(o.author ? { author: o.author } : {}), ...(o.source ? { source: o.source } : {}) };
  });
}
