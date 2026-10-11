// @ts-nocheck  (plain node:test file, run with: npm test)
// The 3D materials own GPU memory (a texture clone each): the rules that decide when they are rebuilt and released.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import { assemblyGeometry } from '../src/math/assemblyGeometry';
import { facadeMaterialSignature, grainOf, materialKeyOf, parseMaterialKey, disposeOwned, reviveOwned, canAttachTexture } from '../src/math/materialLifecycle';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const sigOf = (subtype, over = {}, cabOver = {}) => {
  const d = P.resolveDraft({ ...P.draftFromPreset(subtype), ...over }, WOODS, [], []);
  const cab = { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0, ...cabOver };
  return facadeMaterialSignature(assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }).facades);
};

test('materials: the front materials are keyed by facade SIZES, so a cabinet that only moves or is renamed keeps them', () => {
  const base = sigOf('Deep_Drawers');
  assert.ok(base.length > 0);
  assert.equal(sigOf('Deep_Drawers', {}, { positionX: 1500, name: 'other', calculatedCostDA: 99999 }), base, 'moving / renaming / re-pricing does not rebuild any material');
  assert.notEqual(sigOf('Deep_Drawers', { width: 800 }), base, 'a wider cabinet has other front sizes: new materials');
});

test('materials: equal fronts share one material, and drawers run their grain across', () => {
  const d = P.resolveDraft({ ...P.draftFromPreset('Deep_Drawers'), zones: [{ kind: 'DRAWERS', count: 4 }] }, WOODS, [], []);
  const cab = { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  const facades = assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }).facades;
  assert.equal(facades.length, 4);
  const keys = facadeMaterialSignature(facades).split('|');
  assert.ok(keys.length <= 2, 'four drawers need at most two sizes (the remainder can differ by 1 mm)');
  assert.ok(keys.every((k) => k.endsWith('xhorizontal')));
  assert.equal(grainOf('DOOR'), 'vertical');
  assert.equal(grainOf('APRON'), 'horizontal');
  assert.equal(materialKeyOf({ kind: 'DOOR', widthMm: 599.5, heightMm: 718, }), '599.5x718xvertical');
});

test('materials: a key survives the round trip, half millimetres included', () => {
  assert.deepEqual(parseMaterialKey('599.5x718.5xhorizontal'), { widthMm: 599.5, heightMm: 718.5, grain: 'horizontal' });
  assert.deepEqual(parseMaterialKey('300x200xvertical'), { widthMm: 300, heightMm: 200, grain: 'vertical' });
  assert.equal(facadeMaterialSignature([]), '');
});

const fakeMaterial = () => {
  const log = [];
  return { log, userData: {}, map: { dispose: () => log.push('map') }, dispose: () => log.push('material') };
};

test('materials: releasing frees the texture clone and the material, and a late texture is refused', () => {
  const m = fakeMaterial();
  assert.equal(canAttachTexture(m), true);
  disposeOwned(m);
  assert.deepEqual(m.log, ['map', 'material']);
  assert.equal(canAttachTexture(m), false, 'a file that finishes loading after the release must not attach a clone nobody will free');
  const bare = { userData: {}, map: null, dispose: () => {} }; // X-ray material: no texture
  assert.doesNotThrow(() => disposeOwned(bare));
});

test('materials: StrictMode runs setup, cleanup, setup on the same materials and they stay usable', () => {
  const m = fakeMaterial();
  reviveOwned(m);               // setup
  disposeOwned(m);              // simulated unmount
  reviveOwned(m);               // setup again
  assert.equal(canAttachTexture(m), true, 'the texture that arrives next still attaches');
  disposeOwned(m);              // the real unmount
  assert.equal(canAttachTexture(m), false);
});
