// The Workshop Matrix (the 307 local textures) is built from /public/textures by scripts/build-texture-manifest.mjs.
// It broke once: a code package shipped `textureManifest.json` = [] and unpacking it overwrote a full list, so every
// texture disappeared from the showcase although the images were still there. These tests hold the two guards in place:
//   1. the script NEVER overwrites a non-empty manifest with an empty scan; it writes both the bundle list and
//      public/textures/index.json when the folder is readable;
//   2. the catalog is live: an empty bundled manifest heals itself from /textures/index.json, and the engine only ever
//      asks for files that really exist.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveConventionTexture, textureCatalog, textureFiles, healTextureCatalog, bundledTextureFiles } from '../../src/data/textureCatalog';

const SCRIPT = new URL('../../scripts/build-texture-manifest.mjs', import.meta.url).pathname;

/** A throw-away project: scripts/, src/data/, public/ — exactly the shape the script expects. */
const sandbox = () => {
  const dir = mkdtempSync(join(tmpdir(), 'textures-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'src', 'data'), { recursive: true });
  mkdirSync(join(dir, 'public'), { recursive: true });
  writeFileSync(join(dir, 'scripts', 'build-texture-manifest.mjs'), readFileSync(SCRIPT, 'utf8'));
  return dir;
};
// the warnings go to stderr, so both streams are captured: the test checks the FILE, and that the warning was printed
const run = (dir: string) => {
  const r = spawnSync('node', [join(dir, 'scripts', 'build-texture-manifest.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 0, `the script must never fail a build: ${r.stderr}`);
  return `${r.stdout}${r.stderr}`;
};
const manifestOf = (dir: string) => JSON.parse(readFileSync(join(dir, 'src', 'data', 'textureManifest.json'), 'utf8'));

const webp = (n: number) => { const b = Buffer.alloc(20); b.write('RIFF', 0, 'ascii'); b.write('WEBP', 8, 'ascii'); b.writeUInt32LE(n, 4); return b; };
const png = () => { const b = Buffer.alloc(20); b.writeUInt32BE(0x89504e47, 0); return b; };

test('textures: an empty scan never wipes the list (the bug that emptied the Workshop Matrix)', () => {
  const dir = sandbox();
  try {
    const good = ['wood_egger.webp', 'wood_agt.jpg', 'stone_pda.png'];
    writeFileSync(join(dir, 'src', 'data', 'textureManifest.json'), JSON.stringify(good));
    // no public/textures at all — a code package unpacked without the images
    const out = run(dir);
    assert.deepEqual(manifestOf(dir), good, 'the 3 files the project already knew are still there');
    assert.match(out, /KEEPING/);
    // and an empty folder behaves the same way
    mkdirSync(join(dir, 'public', 'textures'));
    run(dir);
    assert.deepEqual(manifestOf(dir), good, 'an empty folder is not a reason to forget the list either');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('textures: a readable folder writes the list AND the index the running app heals from', () => {
  const dir = sandbox();
  try {
    writeFileSync(join(dir, 'src', 'data', 'textureManifest.json'), JSON.stringify(['old_file.webp']));
    mkdirSync(join(dir, 'public', 'textures'));
    writeFileSync(join(dir, 'public', 'textures', 'wood_egger.webp'), webp(1));
    writeFileSync(join(dir, 'public', 'textures', 'stone_pda.png'), png());
    writeFileSync(join(dir, 'public', 'textures', 'wood_broken.webp'), Buffer.from('NOTANIMAGE!!')); // rejected: header only
    writeFileSync(join(dir, 'public', 'textures', 'readme.txt'), 'not an image');
    const out = run(dir);
    const listed = manifestOf(dir);
    assert.deepEqual(listed, ['stone_pda.png', 'wood_egger.webp'], 'only real images, sorted, the broken one dropped');
    assert.match(out, /1 rejected/);
    const index = JSON.parse(readFileSync(join(dir, 'public', 'textures', 'index.json'), 'utf8'));
    assert.deepEqual(index, listed, 'the same list is served next to the images');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('textures: the catalog is live and the engine only asks for files that exist', async () => {
  // the bundle in this checkout ships an empty manifest on purpose (the images live outside the code package)
  assert.ok(Array.isArray(bundledTextureFiles));
  const before = textureFiles().length;
  // no server here: the heal fails quietly and the list stays what it was
  const after = await healTextureCatalog(true);
  assert.equal(after, before, 'a missing index.json changes nothing and throws nothing');
  assert.equal(textureCatalog().length, textureFiles().length, 'entries and files never drift apart');
  // convention lookup: only what is in the list is ever requested
  const files = new Set(['wood_egger.webp', 'stone_agt.jpeg']);
  assert.equal(resolveConventionTexture('wood_', 'egger', files), '/textures/wood_egger.webp');
  assert.equal(resolveConventionTexture('stone_', 'agt', files), '/textures/stone_agt.jpeg', 'jpeg, not only webp');
  assert.equal(resolveConventionTexture('wood_', 'unknown', files), null, 'no 404 for a brand without an image');
  assert.equal(resolveConventionTexture('wood_', '', files), null);
});
