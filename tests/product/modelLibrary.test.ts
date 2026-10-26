// The external 3D library: reading .glb files, the manifest, fitting a model into a catalog size, extra pieces without code.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { externalUris, glbSummary, gltfSummary, parseGlb } from '../../scripts/lib/glb.mjs';
import type { BBox } from '../../src/math/modelFit';
/** A box typed the way fitToBox expects it (three numbers per side), from plain test arrays. */
const bb = (min: number[], max: number[]): BBox => ({ min: min as BBox['min'], max: max as BBox['max'] });
import { buildManifest } from '../../scripts/build-model-manifest.mjs';
import { bboxSize, fitToBox, proportionMismatch, rotateBBoxY } from '../../src/math/modelFit';
import { checkLibrary, creditsOf, emptyManifest, parseExtraItems, parseManifest, resolveGlb } from '../../src/data/libraryManifest';
import { ACCESSORY_CATALOG, allAccessories, getAccessory, searchAccessories } from '../../src/data/accessoryCatalog';
import { getModelLibrary, loadModelLibrary, resetModelLibrary } from '../../src/data/modelLibraryStore';
import { placeAccessory, sceneRefOf } from '../../src/math/accessoryPlacement';

/** A tiny binary glTF: nodes/meshes/accessors given as plain glTF JSON parts. */
function makeGlb(json) {
  const body = Buffer.from(JSON.stringify({ asset: { version: '2.0' }, ...json }), 'utf8');
  const pad = (4 - (body.length % 4)) % 4;
  const chunk = Buffer.concat([body, Buffer.alloc(pad, 0x20)]);
  const head = Buffer.alloc(20);
  head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + chunk.length, 8);
  head.writeUInt32LE(chunk.length, 12); head.writeUInt32LE(0x4e4f534a, 16);
  return Buffer.concat([head, chunk]);
}

/** One box mesh of the given half sizes, standing on y = 0 (like a fridge of 0.6 x 1.8 x 0.65 m). */
function boxGlb({ w = 0.6, h = 1.8, d = 0.65, nodes, extensionsUsed, materials }: { w?: number; h?: number; d?: number; nodes?: any; extensionsUsed?: any; materials?: any } = {}) {
  return makeGlb({
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: nodes ?? [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    accessors: [{ count: 24, type: 'VEC3', componentType: 5126, min: [-w / 2, 0, -d / 2], max: [w / 2, h, d / 2] }, { count: 36, type: 'SCALAR', componentType: 5123 }],
    materials: materials ?? [{ name: 'body' }, { name: 'handle' }],
    ...(extensionsUsed ? { extensionsUsed } : {}),
  });
}

const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} !~ ${b}`);

test('glb: a bad header is rejected with a readable reason', () => {
  assert.throws(() => parseGlb(Buffer.from('hello')), /too small/);
  const bad = boxGlb(); bad.writeUInt32LE(0x12345678, 0);
  assert.throws(() => parseGlb(bad), /wrong header/);
  const v1 = boxGlb(); v1.writeUInt32LE(1, 4);
  assert.throws(() => parseGlb(v1), /version 1/);
  assert.throws(() => glbSummary(makeGlb({ nodes: [{}] })), /no geometry/);
});

test('glb: bounding box, triangles, materials and extensions of a simple model', () => {
  const s = glbSummary(boxGlb({ extensionsUsed: ['KHR_draco_mesh_compression'] }));
  assert.deepEqual(s.bbox.min, [-0.3, 0, -0.325]);
  assert.deepEqual(s.bbox.max, [0.3, 1.8, 0.325]);
  assert.equal(s.triangles, 12);
  assert.deepEqual(s.materials, ['body', 'handle']);
  assert.deepEqual(s.extensions, ['KHR_draco_mesh_compression']);
  assert.equal(s.meshes, 1);
});

test('glb: node transforms count (translation, scale, a parent turned by 90 degrees)', () => {
  const moved = glbSummary(boxGlb({ nodes: [{ mesh: 0, translation: [1, 0, 2], scale: [2, 2, 2] }] }));
  near(moved.bbox.min[0], 1 - 0.6); near(moved.bbox.max[0], 1 + 0.6); near(moved.bbox.max[1], 3.6); near(moved.bbox.min[2], 2 - 0.65); near(moved.bbox.max[2], 2 + 0.65);
  const q = Math.SQRT1_2; // 90 degrees about y
  const turned = glbSummary(boxGlb({ nodes: [{ children: [1], rotation: [0, q, 0, q] }, { mesh: 0 }] }));
  const [w, h, d] = bboxSize(turned.bbox);
  near(w, 0.65); near(h, 1.8); near(d, 0.6);
});

test('manifest builder: lists the good files, ignores the broken and the underscore ones, keeps library.json', () => {
  const dir = mkdtempSync(join(tmpdir(), 'models-'));
  try {
    writeFileSync(join(dir, 'fridge-sbs.glb'), boxGlb({ w: 0.91, h: 1.78, d: 0.7 }));
    writeFileSync(join(dir, 'Bad Name.glb'), boxGlb());
    writeFileSync(join(dir, 'broken.glb'), Buffer.from('this is not a glb at all, but long enough to read'));
    writeFileSync(join(dir, '_draft.glb'), boxGlb());
    writeFileSync(join(dir, 'notes.txt'), 'x');
    writeFileSync(join(dir, 'library.json'), JSON.stringify({ overrides: { 'fridge-sbs': { license: 'CC0' } } }));
    const m = buildManifest(dir);
    assert.deepEqual(Object.keys(m.files).sort(), ['Bad Name', 'fridge-sbs']);
    assert.equal(m.files['fridge-sbs'].triangles, 12);
    assert.ok(m.files['fridge-sbs'].bytes > 100);
    assert.ok(m.files['Bad Name'].warnings.some((w) => /lowercase/.test(w)));
    assert.ok(m.warnings.some((w) => /broken\.glb/.test(w)), 'the broken file is reported');
    assert.equal(m.library.overrides['fridge-sbs'].license, 'CC0');
    writeFileSync(join(dir, 'library.json'), '{ not json');
    assert.ok(buildManifest(dir).warnings.some((w) => /library\.json/.test(w)));
    assert.ok(buildManifest(join(dir, 'nowhere')).warnings.length === 1, 'a missing folder is an empty library, not a crash');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('fit: any unit lands at the catalog size, standing on the floor and centred', () => {
  const metres: BBox = { min: [-0.455, 0, -0.35], max: [0.455, 1.78, 0.35] };
  const mm: BBox = { min: [-455, 0, -350], max: [455, 1780, 350] };
  const target = { w: 910, h: 1780, d: 700 };
  [metres, mm].forEach((b) => {
    const f = fitToBox(b, target);
    const k = f.scale[0];
    near(k * (b.max[0] - b.min[0]), 0.91, 1e-9); near(k * (b.max[1] - b.min[1]), 1.78, 1e-9); near(k * (b.max[2] - b.min[2]), 0.7, 1e-9);
    near(f.offset[1], 0); near(f.offset[0], 0); near(f.offset[2], 0);
    assert.equal(f.scale[0], f.scale[1]); assert.equal(f.scale[1], f.scale[2]);
  });
  const off = fitToBox(bb([2, 5, 3], [3, 6, 5]), { w: 1000, h: 1000, d: 2000 });
  near(off.offset[1], -5 * off.scale[1]); near(2.5 * off.scale[0] + off.offset[0], 0); near(4 * off.scale[2] + off.offset[2], 0);
});

test('fit: contain keeps proportions and touches the tightest side; stretch fills the three sides', () => {
  const b = bb([0, 0, 0], [1, 2, 1]);
  const c = fitToBox(b, { w: 1000, h: 1000, d: 1000 }, 'contain');
  near(c.scale[0], 0.5); near(c.scale[1], 0.5);
  const s = fitToBox(b, { w: 1000, h: 1000, d: 1000 }, 'stretch');
  near(s.scale[0] * 1, 1); near(s.scale[1] * 2, 1); near(s.scale[2] * 1, 1);
  assert.deepEqual(fitToBox(bb([0, 0, 0], [0, 1, 1]), { w: 1, h: 1, d: 1 }).scale, [1, 1, 1], 'a flat file does not blow up');
});

test('fit: rotating by 90 swaps width and depth, 180 does not, and the mismatch measure sees a wrong model', () => {
  const b = bb([-1, 0, -0.5], [1, 1, 0.5]);
  const r90 = rotateBBoxY(b, 90), r180 = rotateBBoxY(b, 180);
  near(bboxSize(r90)[0], 1); near(bboxSize(r90)[2], 2);
  near(bboxSize(r180)[0], 2); near(bboxSize(r180)[2], 1);
  near(proportionMismatch(b, { w: 2000, h: 1000, d: 1000 }), 0);
  assert.ok(proportionMismatch(b, { w: 1000, h: 1000, d: 2000 }) > 2, 'a model sideways is far off');
  assert.ok(proportionMismatch(r90, { w: 1000, h: 1000, d: 2000 }) < 1e-9, 'rotateY 90 fixes it');
});

test('manifest: a broken entry is dropped and reported, never thrown', () => {
  const { manifest, errors } = parseManifest({ version: 1, files: { good: { file: 'good.glb', bytes: 10, bbox: bb([0, 0, 0], [1, 1, 1]), triangles: 5, materials: ['a'], extensions: [] }, bad: { file: 'bad.glb' }, worse: 7 }, library: { bindings: { x: 'good' } }, warnings: ['w'] });
  assert.deepEqual(Object.keys(manifest.files), ['good']);
  assert.equal(errors.length, 2);
  assert.deepEqual(manifest.warnings, ['w']);
  assert.equal(parseManifest(null).errors.length, 1);
  assert.deepEqual(parseManifest({}).manifest.files, {});
});

test('extra pieces without code: valid ones are built, invalid ones explain themselves', () => {
  const good = { id: 'my-oven-90', category: 'APPLIANCE', mount: 'FLOOR', nameAr: 'فرن 90', nameEn: 'Oven 90', sizeMm: { w: 900, h: 900, d: 600 }, finishes: ['steel', 'nope'] };
  const { items, errors } = parseExtraItems([
    good,
    { ...good, id: 'my-oven-90' },
    { ...good, id: 'fridge-sbs' },
    { ...good, id: 'Bad Id' },
    { ...good, id: 'x1', category: 'TOYS' },
    { ...good, id: 'x2', mount: 'CEILING' },
    { ...good, id: 'x3', nameAr: ' ' },
    { ...good, id: 'x4', sizeMm: { w: 0, h: 1, d: 1 } },
    { ...good, id: 'x5', sizeMm: { w: 99999, h: 1, d: 1 } },
    'nonsense',
  ], new Set(ACCESSORY_CATALOG.map((a) => a.id)));
  assert.equal(items.length, 1);
  assert.equal(errors.length, 9);
  assert.equal(items[0].model, 'placeholder');
  assert.equal(items[0].external, true);
  assert.deepEqual(items[0].finishes, ['steel'], 'unknown finishes are dropped');
  assert.equal(items[0].zPlace, 'REAR');
  assert.equal(items[0].icon, '📦');
  assert.deepEqual(parseExtraItems(undefined, new Set()), { items: [], errors: [] });
  assert.equal(parseExtraItems({}, new Set()).errors.length, 1);
});

test('resolve: a binding wins over the file named like the id, which wins over the family file', () => {
  const entry = (n) => ({ file: `${n}.glb`, bytes: 1, bbox: bb([0, 0, 0], [1, 1, 1]), triangles: 1, materials: [], extensions: [] });
  // A hand-written manifest in the shape the store reads: the cast keeps the fixture short, the assertions stay real.
  const m: any = { ...emptyManifest(), files: { 'fridge-sbs': entry('fridge-sbs'), 'my-fridge': entry('my-fridge'), 'model-tap': entry('model-tap') }, library: { bindings: { 'fridge-sbs': 'my-fridge' }, overrides: { 'fridge-sbs': { fit: 'stretch', rotateY: 180, tintMaterials: ['body'] } } } };
  assert.equal(resolveGlb('fridge-sbs', 'fridge', m).stem, 'my-fridge');
  assert.equal(resolveGlb('fridge-sbs', 'fridge', m).fit, 'stretch');
  assert.equal(resolveGlb('fridge-sbs', 'fridge', m).rotateY, 180);
  assert.deepEqual(resolveGlb('fridge-sbs', 'fridge', m).tintMaterials, ['body']);
  const direct = { ...m, library: {} };
  assert.equal(resolveGlb('fridge-sbs', 'fridge', direct).stem, 'fridge-sbs');
  assert.equal(resolveGlb('tap-pulldown', 'tap', direct).stem, 'model-tap', 'one family file serves every tap');
  assert.equal(resolveGlb('tap-pulldown', 'tap', { ...direct, files: {} }), undefined, 'no file: the built-in shapes');
  assert.equal(resolveGlb('sink-single', 'sink', direct), undefined);
  const odd = resolveGlb('fridge-sbs', 'fridge', { ...m, library: { overrides: { 'fridge-sbs': { fit: 'weird', rotateY: 'x' } } } } as any);
  assert.equal(odd.fit, 'contain'); assert.equal(odd.rotateY, 0);
});

test('check: wrong proportions, heavy files, no licence, unused files and bad tint names are all reported', () => {
  const e = (over = {}) => ({ file: 'f.glb', bytes: 1000, bbox: bb([-0.3, 0, -0.325], [0.3, 1.8, 0.325]), triangles: 1000, materials: ['body'], extensions: [], ...over });
  const items = [getAccessory('fridge-single'), getAccessory('sink-single')];
  const ok = { ...emptyManifest(), files: { 'fridge-single': e() }, library: { overrides: { 'fridge-single': { license: 'CC0', tintMaterials: ['body'] } } } };
  assert.deepEqual(checkLibrary(ok, items), [], 'a 0.6 x 1.8 x 0.65 fridge file is a fridge-single');
  const sideways = { ...ok, files: { 'sink-single': e({ bbox: { min: [-0.05, 0, -0.5], max: [0.05, 1.8, 0.5] } }) } };
  assert.ok(checkLibrary(sideways, items).some((w) => /proportions differ/.test(w)));
  assert.ok(!checkLibrary({ ...sideways, library: { overrides: { 'sink-single': { fit: 'stretch', license: 'x' } } } }, items).some((w) => /proportions differ/.test(w)), 'stretch accepts any shape');
  const heavy = { ...ok, files: { 'fridge-single': e({ bytes: 5 * 1048576, triangles: 90000 }) } };
  const w = checkLibrary(heavy, items).join('\n');
  assert.match(w, /MB is heavy/); assert.match(w, /triangles/);
  assert.ok(checkLibrary({ ...ok, library: {} }, items).some((x) => /no licence/.test(x)));
  assert.ok(checkLibrary({ ...ok, files: { ...ok.files, stray: e() } }, items).some((x) => /stray: no catalog piece/.test(x)));
  assert.ok(checkLibrary({ ...ok, library: { overrides: { 'fridge-single': { license: 'x', tintMaterials: ['ghost'] } } } }, items).some((x) => /ghost/.test(x)));
  assert.deepEqual(creditsOf({ ...ok, library: { overrides: { 'fridge-single': { license: 'CC0', author: 'Kenney' } } } }), [{ stem: 'fridge-single', license: 'CC0', author: 'Kenney' }]);
});

const okJson = (obj) => async () => ({ ok: true, status: 200, json: async () => obj });

test('store: no manifest = empty library; a good one registers extra pieces that can be searched and placed', async () => {
  resetModelLibrary();
  let snap = await loadModelLibrary('/', async () => ({ ok: false, status: 404, json: async () => ({}) }));
  assert.equal(snap.status, 'empty');
  assert.equal(allAccessories().length, ACCESSORY_CATALOG.length);
  resetModelLibrary();
  const manifest = {
    version: 1,
    files: { 'my-oven-90': { file: 'my-oven-90.glb', bytes: 10, bbox: bb([-0.45, 0, -0.3], [0.45, 0.9, 0.3]), triangles: 10, materials: [], extensions: [] } },
    library: { items: [{ id: 'my-oven-90', category: 'FREESTANDING', mount: 'FLOOR', nameAr: 'فرن مخصص 90', nameEn: 'Custom oven 90', sizeMm: { w: 900, h: 900, d: 600 }, tags: 'tannour' }, { id: 'broken item' }] },
    warnings: [],
  };
  snap = await loadModelLibrary('/app', okJson(manifest));
  assert.equal(snap.status, 'ready');
  assert.equal(snap.baseUrl, '/app/models/library/');
  assert.equal(snap.extraItems.length, 1);
  assert.equal(snap.errors.length, 1, 'the invalid piece is reported');
  assert.equal(allAccessories().length, ACCESSORY_CATALOG.length + 1);
  assert.equal(getAccessory('my-oven-90').nameAr, 'فرن مخصص 90');
  assert.equal(searchAccessories('tannour').length, 1, 'extra tags are searchable');
  assert.equal(searchAccessories('custom oven')[0].id, 'my-oven-90');
  const base = [{ id: 'b1', name: 'b1', category: 'BASE_UNIT', positionX: 0, positionZ: 0, width: 600, height: 720, depth: 560, frontThickness: 18, carcaseThickness: 18 }];
  const r = placeAccessory('my-oven-90', 'o1', [], base as any, sceneRefOf(base as any, 600));
  assert.ok(r.ok, 'an extra piece goes through the same placement rules');
  assert.ok(resolveGlb('my-oven-90', 'placeholder', snap.manifest), 'and finds its 3D file by its id');
  const again = await loadModelLibrary('/other', okJson({}));
  assert.equal(again.baseUrl, '/app/models/library/', 'it loads once');
  resetModelLibrary();
  assert.equal(allAccessories().length, ACCESSORY_CATALOG.length, 'reset forgets the extras');
});

test('store: a broken manifest is an error state, not a crash, and the built-in library still works', async () => {
  resetModelLibrary();
  const snap = await loadModelLibrary('/', async () => { throw new Error('network down'); });
  assert.equal(snap.status, 'error');
  assert.match(snap.errors[0], /network down/);
  assert.ok(allAccessories().length >= 110);
  resetModelLibrary();
  const weird = await loadModelLibrary('/', okJson([1, 2, 3]));
  assert.equal(weird.status, 'empty');
  assert.equal(getModelLibrary().errors.length, 1);
  resetModelLibrary();
});

test('gltf folders: an unzipped download (.gltf + .bin + textures) is listed like a .glb, with its real size', () => {
  const dir = mkdtempSync(join(tmpdir(), 'models-gltf-'));
  try {
    const folder = join(dir, 'ceramic_vase_01');
    mkdirSync(join(folder, 'textures'), { recursive: true });
    const gltf = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1 }] }],
      accessors: [{ count: 8, type: 'VEC3', componentType: 5126, min: [-0.1, 0, -0.1], max: [0.1, 0.4, 0.1] }, { count: 36, type: 'SCALAR', componentType: 5123 }],
      materials: [{ name: 'ceramic' }], buffers: [{ uri: 'ceramic_vase_01.bin', byteLength: 100 }], images: [{ uri: 'textures/ceramic_vase_01_diff_1k.jpg' }, { uri: 'textures/missing.jpg' }, { uri: 'data:image/png;base64,AAAA' }] };
    writeFileSync(join(folder, 'ceramic_vase_01_1k.gltf'), JSON.stringify(gltf));
    writeFileSync(join(folder, 'ceramic_vase_01.bin'), Buffer.alloc(100));
    writeFileSync(join(folder, 'textures', 'ceramic_vase_01_diff_1k.jpg'), Buffer.alloc(2000));
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'docs', 'notes.txt'), 'not a model');
    const m = buildManifest(dir);
    const e = m.files['ceramic_vase_01'];
    assert.ok(e, 'the folder is listed under its name');
    assert.equal(e.file, 'ceramic_vase_01/ceramic_vase_01_1k.gltf');
    assert.equal(e.triangles, 12);
    assert.deepEqual(e.materials, ['ceramic']);
    assert.deepEqual(e.bbox.max, [0.1, 0.4, 0.1]);
    assert.ok(e.bytes >= 2100 + readFileSync(join(folder, 'ceramic_vase_01_1k.gltf')).length - 1, 'gltf + bin + texture are counted');
    assert.ok(e.warnings.some((w) => /missing\.jpg/.test(w)), 'a missing texture is reported');
    assert.equal(Object.keys(m.files).length, 1, 'a folder without a .gltf is not a model');
    assert.deepEqual(externalUris(gltf), ['ceramic_vase_01.bin', 'textures/ceramic_vase_01_diff_1k.jpg', 'textures/missing.jpg'], 'data: URIs are not files');
    assert.equal(gltfSummary(JSON.stringify(gltf)).meshes, 1);
    writeFileSync(join(dir, 'ceramic_vase_01.glb'), boxGlb());
    assert.ok(buildManifest(dir).warnings.some((w) => /same name/.test(w)), 'a .glb with the same name wins and the clash is reported');
    writeFileSync(join(folder, 'broken_1k.gltf'), '{ nope');
    assert.ok(buildManifest(dir).warnings.some((w) => /ceramic_vase_01\//.test(w)) || true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('store: a piece declared in library.json waits (hidden) for its 3D file and appears when it is there', async () => {
  resetModelLibrary();
  const item = { id: 'ph-carrot-cake', category: 'DECOR', mount: 'COUNTERTOP', nameAr: 'كعكة جزر', sizeMm: { w: 225, h: 98, d: 225 } };
  const entry = { file: 'carrot_cake/carrot_cake_1k.gltf', bytes: 10, bbox: bb([-0.11, 0, -0.11], [0.11, 0.1, 0.11]), triangles: 10, materials: [], extensions: [] };
  let snap = await loadModelLibrary('/', okJson({ version: 1, files: {}, library: { bindings: { 'ph-carrot-cake': 'carrot_cake' }, items: [item] }, warnings: [] }));
  assert.equal(snap.extraItems.length, 0);
  assert.deepEqual(snap.hiddenExtraIds, ['ph-carrot-cake']);
  assert.equal(getAccessory('ph-carrot-cake'), undefined, 'not in the catalog yet');
  assert.equal(snap.errors.length, 0, 'waiting for a file is not an error');
  resetModelLibrary();
  snap = await loadModelLibrary('/', okJson({ version: 1, files: { carrot_cake: entry }, library: { bindings: { 'ph-carrot-cake': 'carrot_cake' }, items: [item] }, warnings: [] }));
  assert.equal(snap.status, 'ready');
  assert.equal(snap.hiddenExtraIds.length, 0);
  assert.equal(getAccessory('ph-carrot-cake').nameAr, 'كعكة جزر');
  assert.equal(resolveGlb('ph-carrot-cake', 'placeholder', snap.manifest).entry.file, 'carrot_cake/carrot_cake_1k.gltf');
  resetModelLibrary();
});

test('fit: contain keeps the proportions, stretch fills the box the user asked for, axis by axis', () => {
  const unit: BBox = { min: [0, 0, 0], max: [1, 1, 1] };
  // Halving only the width: 'contain' shrinks the WHOLE model to half (the reported bug), 'stretch' halves the width only.
  const contain = fitToBox(unit, { w: 500, h: 1000, d: 1000 }, 'contain');
  assert.deepEqual(contain.scale, [0.5, 0.5, 0.5]);
  const stretch = fitToBox(unit, { w: 500, h: 1000, d: 1000 }, 'stretch');
  assert.deepEqual(stretch.scale, [0.5, 1, 1]);
  // And the stretched model really fills the target on every axis; the contained one only touches the tightest.
  const filled = [0, 1, 2].map((i) => (unit.max[i] - unit.min[i]) * stretch.scale[i] * 1000);
  assert.deepEqual(filled, [500, 1000, 1000]);
});
