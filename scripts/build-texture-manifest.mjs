// scripts/build-texture-manifest.mjs
// Scans public/textures and writes:
//   - src/data/textureManifest.json   (the list the bundle ships: Workshop Matrix, and the wood_/stone_ lookups)
//   - public/textures/index.json      (the same list, served next to the images: lets the running app heal itself)
// Runs automatically before `npm run dev`, `npm test` and `npm run build`.
//
// A file is listed only if its HEADER (magic bytes) says it is a real image. Size is NOT used:
// a flat-colour 512x512 WebP is legitimately only ~56 bytes.
//
// 🛑 IT NEVER DESTROYS A GOOD LIST. If the scan finds nothing (the folder is not in this checkout — the textures live
// outside the code package on purpose) the manifest that is already there is KEPT, with a loud warning. That is the bug
// that made 307 textures disappear: an empty scan used to overwrite a full manifest with `[]`.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const texturesDir = join(root, 'public', 'textures');
const outFile = join(root, 'src', 'data', 'textureManifest.json');
const publicIndex = join(texturesDir, 'index.json');

function isValidImage(buf, ext) {
  if (buf.length < 12) return false;
  if (ext === '.webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (ext === '.jpg' || ext === '.jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === '.png') return buf.readUInt32BE(0) === 0x89504e47;
  return false;
}

/** What the manifest holds right now (a missing or broken file reads as an empty list). */
function currentManifest() {
  try {
    const parsed = JSON.parse(readFileSync(outFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

const valid = [];
const rejected = [];
if (existsSync(texturesDir)) {
  for (const name of readdirSync(texturesDir).sort()) {
    const ext = extname(name).toLowerCase();
    if (!['.webp', '.jpg', '.jpeg', '.png'].includes(ext)) continue;
    (isValidImage(readFileSync(join(texturesDir, name)), ext) ? valid : rejected).push(name);
  }
}

const previous = currentManifest();

if (valid.length === 0 && previous.length > 0) {
  // The folder is not here (or it is empty) but the project knows 307 files: keep them. Writing `[]` here is exactly how
  // the Workshop Matrix went empty after a code package was unpacked over a working project.
  console.warn(`[textures] ⚠ public/textures not found or empty — KEEPING the ${previous.length} file(s) already listed in src/data/textureManifest.json.`);
  console.warn('[textures]   On a machine that has the folder, run `npm run textures` to rebuild the list.');
  process.exit(0);
}

mkdirSync(join(root, 'src', 'data'), { recursive: true });
writeFileSync(outFile, JSON.stringify(valid, null, 2) + '\n');

// The same list, served as a static file: a running app whose bundled manifest is empty fetches this and comes back to life
// without a rebuild (src/data/textureCatalog.ts).
if (existsSync(texturesDir)) {
  writeFileSync(publicIndex, JSON.stringify(valid) + '\n');
}

console.log(`[textures] ${valid.length} valid image(s) listed` + (rejected.length ? `, ${rejected.length} rejected: ${rejected.join(', ')}` : ''));
