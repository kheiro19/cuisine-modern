// scripts/build-texture-manifest.mjs
// Scans public/textures and writes src/data/textureManifest.json (a sorted list of file names).
// Runs automatically before `npm run dev` and `npm run build`.
//
// A file is listed only if its HEADER (magic bytes) says it is a real image. Size is NOT used:
// a flat-colour 512x512 WebP is legitimately only ~56 bytes.
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, extname } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const texturesDir = join(root, 'public', 'textures');
const outFile = join(root, 'src', 'data', 'textureManifest.json');

function isValidImage(buf, ext) {
  if (buf.length < 12) return false;
  if (ext === '.webp') return buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP';
  if (ext === '.jpg' || ext === '.jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === '.png') return buf.readUInt32BE(0) === 0x89504e47;
  return false;
}

const valid = [];
const rejected = [];
if (existsSync(texturesDir)) {
  for (const name of readdirSync(texturesDir).sort()) {
    const ext = extname(name).toLowerCase();
    if (!['.webp', '.jpg', '.jpeg', '.png'].includes(ext)) continue;
    (isValidImage(readFileSync(join(texturesDir, name)), ext) ? valid : rejected).push(name);
  }
} else {
  console.warn(`[textures] ${texturesDir} not found - writing an empty manifest`);
}

mkdirSync(join(root, 'src', 'data'), { recursive: true });
writeFileSync(outFile, JSON.stringify(valid, null, 2) + '\n');
console.log(`[textures] ${valid.length} valid image(s) listed` + (rejected.length ? `, ${rejected.length} rejected: ${rejected.join(', ')}` : ''));
