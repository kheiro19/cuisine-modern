// scripts/check-models.ts   (npm run models:check)
// Tells, before the client sees it, which 3D files do not look like their catalog piece, are too heavy or have no licence.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { ACCESSORY_CATALOG } from '../src/data/accessoryCatalog';
import { checkLibrary, parseExtraItems, parseManifest, resolveGlb } from '../src/data/libraryManifest';

const file = join(fileURLToPath(new URL('..', import.meta.url)), 'public', 'models', 'library', 'manifest.json');
if (!existsSync(file)) {
  console.log('[models:check] no manifest yet: run `npm run models` first');
  process.exit(0);
}
const { manifest, errors } = parseManifest(JSON.parse(readFileSync(file, 'utf8')));
const extra = parseExtraItems(manifest.library.items, new Set(ACCESSORY_CATALOG.map((a) => a.id)));
const waiting = extra.items.filter((i) => !resolveGlb(i.id, i.model, manifest)).map((i) => `${i.id}: declared in library.json but its 3D file is not in the folder yet (hidden): expected "${manifest.library.bindings?.[i.id] ?? i.id}"`);
const warnings = [...errors, ...extra.errors, ...waiting, ...manifest.warnings, ...checkLibrary(manifest, [...ACCESSORY_CATALOG, ...extra.items])];
console.log(`[models:check] ${Object.keys(manifest.files).length} file(s), ${extra.items.length} extra piece(s), ${warnings.length} warning(s)`);
warnings.forEach((w) => console.log(' - ' + w));
