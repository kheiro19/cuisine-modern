// scripts/build-model-manifest.mjs
// Scans public/models/library and writes public/models/library/manifest.json: for every .glb its size, bounding box, number of
// triangles and materials, plus the content of library.json (bindings, overrides, extra pieces).
// Runs automatically before `npm run dev` and `npm run build` (like the textures). Drop a .glb in the folder, nothing else to do.
// A downloaded pack that is a .gltf + .bin + textures (Poly Haven, for example) works as it is: put its UNZIPPED FOLDER here.
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { basename, extname, join } from 'node:path';
import { externalUris, glbSummary, gltfSummary } from './lib/glb.mjs';

const NAME_RE = /^[a-z0-9][a-z0-9_-]*$/;

/** A folder holding one model as .gltf + .bin + textures: its name is the file name of the library. */
function addGltfFolder(manifest, dir, folder) {
  const path = join(dir, folder);
  try {
    const gltfs = readdirSync(path).filter((n) => extname(n).toLowerCase() === '.gltf').sort((a, b) => Number(b.includes('_1k')) - Number(a.includes('_1k')) || a.length - b.length);
    if (gltfs.length === 0) return; // not a model folder (docs, textures...)
    if (manifest.files[folder]) {
      manifest.warnings.push(`${folder}: a .glb with the same name exists, the folder is ignored`);
      return;
    }
    const text = readFileSync(join(path, gltfs[0]), 'utf8');
    const s = gltfSummary(text);
    const warnings = [...s.warnings];
    let bytes = Buffer.byteLength(text);
    for (const uri of externalUris(JSON.parse(text))) {
      const f = join(path, uri);
      if (existsSync(f)) bytes += statSync(f).size;
      else warnings.push(`missing file ${uri} next to ${gltfs[0]}`);
    }
    if (gltfs.length > 1) warnings.push(`${gltfs.length} .gltf files in the folder, ${gltfs[0]} is used`);
    manifest.files[folder] = { file: `${folder}/${gltfs[0]}`, bytes, bbox: s.bbox, triangles: s.triangles, materials: s.materials, extensions: s.extensions, warnings };
  } catch (e) {
    manifest.warnings.push(`${folder}/: ${e.message}: ignored`);
  }
}

/** Builds the manifest object of a folder (pure apart from reading the files). */
export function buildManifest(dir) {
  const manifest = { version: 1, generatedAt: new Date().toISOString(), files: {}, library: {}, warnings: [] };
  if (!existsSync(dir)) {
    manifest.warnings.push(`${dir} not found: empty library`);
    return manifest;
  }
  const libFile = join(dir, 'library.json');
  if (existsSync(libFile)) {
    try {
      manifest.library = JSON.parse(readFileSync(libFile, 'utf8'));
    } catch (e) {
      manifest.warnings.push(`library.json is not valid JSON (${e.message}): ignored`);
    }
  }
  for (const name of readdirSync(dir).sort()) {
    if (name.startsWith('_') || name.startsWith('.')) continue;
    if (statSync(join(dir, name)).isDirectory()) {
      addGltfFolder(manifest, dir, name);
      continue;
    }
    if (extname(name).toLowerCase() !== '.glb') continue;
    const stem = basename(name, extname(name));
    const path = join(dir, name);
    try {
      const buf = readFileSync(path);
      const s = glbSummary(buf);
      const warnings = [...s.warnings];
      if (!NAME_RE.test(stem)) warnings.push('file name should be lowercase letters, digits, dashes (it is used as the piece id)');
      if (s.extensions.some((x) => x === 'KHR_draco_mesh_compression' || x === 'EXT_meshopt_compression')) {
        warnings.push('compressed with Draco/Meshopt: the browser downloads a small decoder the first time (needs internet unless the decoder is hosted locally)');
      }
      if (manifest.files[stem]) manifest.warnings.push(`${stem}: a folder with the same name exists, the .glb is used`);
      manifest.files[stem] = { file: name, bytes: statSync(path).size, bbox: s.bbox, triangles: s.triangles, materials: s.materials, extensions: s.extensions, warnings };
    } catch (e) {
      manifest.warnings.push(`${name}: ${e.message}: ignored`);
    }
  }
  return manifest;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const dir = join(root, 'public', 'models', 'library');
  mkdirSync(dir, { recursive: true });
  const m = buildManifest(dir);
  writeFileSync(join(dir, 'manifest.json'), JSON.stringify(m, null, 2) + '\n');
  const n = Object.keys(m.files).length;
  console.log(`[models] ${n} 3D file(s) listed` + (m.warnings.length ? `, ${m.warnings.length} warning(s): ${m.warnings.join(' | ')}` : ''));
}
