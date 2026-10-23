// @ts-nocheck  (plain node:test file, run with: npm test)
// What a floor unit stands on: legs, legs + plinth board (PVC or cut from the sheet), a wooden frame, or the floor.
// cabinet.height is the FINISHED height: the base is taken out of it, never added to it.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';
import { assemblyGeometry } from '../src/math/assemblyGeometry';
import { baseBoxes, baseOf, basePartsOf, bodyView } from '../src/math/base';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 50, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 500) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const LEGS_ITEM = hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120);
const PVC_ITEM = hw('pvc', 'Assembly & Fixing', 'PVC Plinth Base Board (With Rubber)', 900);
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), LEGS_ITEM, PVC_ITEM, hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dowel', 'Assembly & Fixing', 'Wooden Dowel', 2)];
const ROLLS = [];

let n = 0;
const make = (w, h, d, zones, extra = {}, items = HW) => {
  const r = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), width: w, height: h, depth: d, zones, ...extra }, WOODS, items, ROLLS);
  return { ...P.draftToNewCabinet(r, { id: 'c' + n++, name: 'c' + n, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const DOORS = [{ kind: 'DOORS', count: 2, shelves: 0 }];
const geoOf = (cab) => assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
const priced = (cab, items = HW) => E.priceCabinet(cab, WOODS, items, ROLLS);
const qtyOf = (pr, part) => pr.parts.filter((p) => p.partType === part).reduce((s, p) => s + p.quantity, 0);
const hwQty = (cab, id, items = HW) => E.hardwareRequirements(cab, items).filter((r) => r.item.id === id).reduce((s, r) => s + r.quantity, 0);
const r2 = (v) => Math.round(v * 100) / 100;
const key = (...d) => d.map(r2).sort((a, b) => a - b).join('x');
const sideHeight = (cab) => E.modelCabinet(cab, 18, 18).parts.find((p) => p.partType.startsWith('Side Panel'));

test('legacy: a cabinet without a base keeps its old behaviour - nothing drawn, full height, 4 legs counted', () => {
  const cab = make(600, 870, 600, DOORS, { base: undefined });
  assert.equal(cab.base, undefined);
  assert.equal(baseOf(cab).legacy, true);
  assert.equal(bodyView(cab), cab, 'the very same object: nothing subtracted');
  assert.equal(geoOf(cab).base.length, 0);
  assert.equal(hwQty(cab, 'legs'), 4);
  assert.equal(Math.max(sideHeight(cab).widthMm, sideHeight(cab).lengthMm), 870);
});

test('the app default: a floor unit stands on legs (100 mm), a wall unit hangs and has none', () => {
  assert.deepEqual(P.draftFromPreset('Standard_Base').base, { type: 'LEGS' });
  assert.equal(P.draftFromPreset('Standard_Wall').base, undefined);
  const wall = P.resolveDraft({ ...P.draftFromPreset('Standard_Wall'), base: { type: 'WOOD' } }, WOODS, HW, ROLLS);
  assert.equal(wall.base, undefined, 'a base on a wall unit is dropped');
});

test('LEGS: the base comes OUT of the finished height (870 -> 770 body), the legs are as long as the base', () => {
  const cab = make(600, 870, 600, DOORS, { base: { type: 'LEGS', heightMm: 100 } });
  const b = baseOf(cab);
  assert.deepEqual([b.type, b.heightMm, b.legCount, b.legCountAuto], ['LEGS', 100, 4, true]);
  assert.equal(bodyView(cab).height, 770);
  assert.equal(bodyView(bodyView(cab)).height, 770, 'applying the body view twice changes nothing');
  assert.equal(Math.max(sideHeight(cab).widthMm, sideHeight(cab).lengthMm), 770, 'the sides are cut for the body');
  const geo = geoOf(cab);
  assert.equal(Math.max(...geo.boxes.map((x) => x.centerMm[1] + x.sizeMm[1] / 2)), 770, 'the body is drawn 770 high, from its own bottom');
  assert.equal(geo.base.length, 4);
  geo.base.forEach((l) => { assert.equal(l.kind, 'leg'); assert.equal(l.sizeMm[1], 100); assert.equal(l.centerMm[1], 50); });
  assert.equal(hwQty(cab, 'legs'), 4);
  assert.equal(hwQty(cab, 'pvc'), 0);
});

test('LEGS: 4 legs up to 900 mm wide, 6 above; or as many as the user asks (2 to 12), spread inside the cabinet', () => {
  assert.equal(baseOf(make(900, 870, 600, DOORS, { base: { type: 'LEGS' } })).legCount, 4);
  const wide = make(1200, 870, 600, DOORS, { base: { type: 'LEGS' } });
  assert.equal(baseOf(wide).legCount, 6);
  assert.equal(hwQty(wide, 'legs'), 6);
  [2, 5, 8, 12].forEach((k) => {
    const cab = make(1200, 870, 600, DOORS, { base: { type: 'LEGS', legCount: k } });
    assert.equal(geoOf(cab).base.length, k);
    assert.equal(hwQty(cab, 'legs'), k);
    geoOf(cab).base.forEach((l) => {
      assert.ok(l.centerMm[0] - 20 >= 0 && l.centerMm[0] + 20 <= 1200, 'inside the width');
      assert.ok(Math.abs(l.centerMm[2]) + 20 <= 300, 'inside the depth');
    });
  });
  assert.equal(baseOf(make(600, 870, 600, DOORS, { base: { type: 'LEGS', legCount: 1 } })).legCountAuto, true, 'fewer than 2 = automatic');
});

test('PLINTH (PVC): legs + one PVC board as wide as the cabinet, set back from the front, with the legs behind it', () => {
  const cab = make(800, 870, 600, DOORS, { base: { type: 'PLINTH', heightMm: 120, frontSetbackMm: 50, plinthMaterial: 'PVC' } });
  const geo = geoOf(cab);
  const plinth = geo.base.find((x) => x.kind === 'plinth');
  assert.deepEqual(plinth.sizeMm, [800, 117, 16], 'width = cabinet width, 3 mm clear of the floor');
  assert.equal(plinth.centerMm[2], 300 - 50 - 8, 'its front face is 50 mm behind the front of the cabinet');
  geo.base.filter((x) => x.kind === 'leg').forEach((l) => { if (l.centerMm[2] > 0) assert.ok(l.centerMm[2] + 20 <= plinth.centerMm[2] - 8, 'the front legs are behind the board'); });
  assert.equal(hwQty(cab, 'legs'), 4);
  assert.equal(hwQty(cab, 'pvc'), 1, 'one PVC board is bought');
  assert.equal(qtyOf(priced(cab), 'Plinth Board'), 0, 'a PVC board is not cut from the sheet');
  assert.equal(bodyView(cab).height, 750);
});

test('PLINTH (PVC): without the board in stock it is flagged, not silently free', () => {
  const noPvc = HW.filter((h) => h.id !== 'pvc');
  const cab = make(800, 870, 600, DOORS, { base: { type: 'PLINTH', plinthMaterial: 'PVC' } }, noPvc);
  assert.ok(priced(cab, noPvc).issues.some((i) => i.code === 'NO_PLINTH_IN_STOCK'));
  assert.ok(!priced(cab, HW).issues.some((i) => i.code === 'NO_PLINTH_IN_STOCK'));
});

test('PLINTH (board): the board is cut from the cabinet sheet, and the drawing has the same board', () => {
  const cab = make(800, 870, 600, DOORS, { base: { type: 'PLINTH', heightMm: 100, plinthMaterial: 'BOARD' } });
  const pr = priced(cab);
  assert.equal(qtyOf(pr, 'Plinth Board'), 1);
  const part = pr.parts.find((p) => p.partType === 'Plinth Board');
  const box = geoOf(cab).base.find((x) => x.kind === 'plinth');
  assert.equal(key(part.thicknessMm, part.widthMm, part.lengthMm), key(...box.sizeMm));
  assert.equal(hwQty(cab, 'pvc'), 0, 'no PVC bought');
});

test('WOOD: a closed frame of boards cut from the cabinet sheet, no legs, set back from the wall, cross supports every 600 mm', () => {
  const cab = make(1200, 870, 600, DOORS, { base: { type: 'WOOD', heightMm: 100, frontSetbackMm: 50, backSetbackMm: 20 } });
  const pr = priced(cab);
  assert.equal(qtyOf(pr, 'Wood Base Front/Back Board'), 2);
  assert.equal(qtyOf(pr, 'Wood Base Side Board'), 2);
  assert.equal(qtyOf(pr, 'Wood Base Cross Support'), 1, '1200 wide: one support in the middle');
  const geo = geoOf(cab);
  assert.equal(geo.base.length, 2 + 2 + 1);
  assert.equal(hwQty(cab, 'legs'), 0, 'no legs under a wooden frame');
  assert.ok(!pr.issues.some((i) => i.code === 'NO_LEGS_IN_STOCK'));
  const back = geo.base.find((x) => x.key === 'wood-back'), front = geo.base.find((x) => x.key === 'wood-front');
  assert.equal(back.centerMm[2] - 9, -300 + 20, 'back face 20 mm in from the wall');
  assert.equal(front.centerMm[2] + 9, 300 - 50, 'front face 50 mm behind the front');
  // the frame is inside the footprint of the cabinet, and as high as the base
  geo.base.forEach((x) => { assert.equal(x.sizeMm[1], 100); assert.ok(x.centerMm[0] - x.sizeMm[0] / 2 >= -0.01 && x.centerMm[0] + x.sizeMm[0] / 2 <= 1200.01); });
  // 600 wide needs no support; 1800 needs two
  assert.equal(basePartsOf(make(600, 870, 600, DOORS, { base: { type: 'WOOD' } }), 18).filter((p) => p.partType.includes('Support')).length, 0);
  assert.equal(basePartsOf(make(1800, 870, 600, DOORS, { base: { type: 'WOOD' } }), 18).find((p) => p.partType.includes('Support')).quantity, 2);
});

test('PARITY: for every kind of base the boards drawn under the cabinet are exactly the boards in the cutting list', () => {
  const bases = [{ type: 'PLINTH', plinthMaterial: 'BOARD' }, { type: 'WOOD' }, { type: 'WOOD', frontSetbackMm: 0, backSetbackMm: 0, heightMm: 150 }];
  for (const width of [450, 600, 1000, 1500]) for (const base of bases) {
    const cab = make(width, 870, 600, DOORS, { base });
    const drawn = geoOf(cab).base.filter((x) => x.kind !== 'leg').map((x) => key(...x.sizeMm));
    const cut = priced(cab).parts.filter((p) => /^(Plinth Board|Wood Base)/.test(p.partType)).flatMap((p) => Array.from({ length: p.quantity }, () => key(p.thicknessMm, p.widthMm, p.lengthMm)));
    assert.deepEqual(drawn.sort(), cut.sort(), `${base.type} ${width}`);
  }
});

test('limits: a base can never eat the cabinet - the body keeps at least 100 mm, a tiny unit takes no base', () => {
  assert.equal(baseOf(make(600, 870, 600, DOORS, { base: { type: 'LEGS', heightMm: 999 } })).heightMm, 200, 'at most 200');
  assert.equal(baseOf(make(600, 870, 600, DOORS, { base: { type: 'LEGS', heightMm: 5 } })).heightMm, 40, 'at least 40');
  const low = make(600, 280, 600, DOORS, { base: { type: 'WOOD', heightMm: 200 } });
  assert.ok(bodyView(low).height >= 100, 'body keeps 100 mm');
  const tiny = baseOf({ ...make(600, 870, 600, DOORS), height: 120, base: { type: 'LEGS', heightMm: 100 } });
  assert.deepEqual([tiny.type, tiny.heightMm, tiny.ignored], ['NONE', 0, 'TOO_LOW']);
  // setbacks cannot leave the frame less than 150 mm deep
  const deep = baseOf(make(600, 870, 400, DOORS, { base: { type: 'WOOD', frontSetbackMm: 150, backSetbackMm: 100 } }));
  assert.ok(400 - deep.frontSetbackMm - deep.backSetbackMm >= 150);
});

test('NONE and the appliance bay: the cabinet stands on the floor, no legs, nothing under it', () => {
  const none = make(600, 870, 600, DOORS, { base: { type: 'NONE' } });
  assert.equal(baseOf(none).legacy, false);
  assert.equal(bodyView(none).height, 870);
  assert.equal(hwQty(none, 'legs'), 0, 'NONE adds no legs (unlike a legacy cabinet)');
  assert.ok(!priced(none).issues.some((i) => i.code === 'NO_LEGS_IN_STOCK'));
  const bay = make(600, 870, 600, [{ kind: 'APPLIANCE', appliance: 'DISHWASHER', count: 1 }], { base: { type: 'WOOD' } });
  const b = baseOf(bay);
  assert.deepEqual([b.type, b.ignored], ['NONE', 'APPLIANCE_BAY'], 'a dishwasher stands on its own feet');
  assert.equal(geoOf(bay).base.length, 0);
});

test('the whole stack: base + body = the finished height, and the price follows the base', () => {
  const body = (cab) => Math.max(...geoOf(cab).boxes.map((x) => x.centerMm[1] + x.sizeMm[1] / 2));
  for (const type of ['LEGS', 'PLINTH', 'WOOD']) {
    const cab = make(600, 870, 600, DOORS, { base: { type, heightMm: 130 } });
    const top = Math.max(...geoOf(cab).base.map((x) => x.centerMm[1] + x.sizeMm[1] / 2));
    assert.equal(top, 130, `${type}: the base reaches exactly the bottom of the body`);
    assert.equal(top + body(cab), 870, `${type}: 130 + 740 = 870`);
  }
  const legacy = priced(make(600, 870, 600, DOORS, { base: undefined })).totalDA;
  const legs = priced(make(600, 870, 600, DOORS, { base: { type: 'LEGS' } })).totalDA;
  const wood = priced(make(600, 870, 600, DOORS, { base: { type: 'WOOD' } })).totalDA;
  assert.ok(legs < legacy, 'a shorter body uses less sheet');
  assert.ok(wood !== legs, 'the frame is priced');
});

test('the form: the base is kept, cleaned and written back; a legacy cabinet is left as it is when edited', () => {
  const d = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), base: { type: 'PLINTH', heightMm: 120.4, frontSetbackMm: 60, legCount: 6, plinthMaterial: 'BOARD', junk: 1 } }, WOODS, HW, ROLLS);
  assert.deepEqual(d.base, { type: 'PLINTH', heightMm: 120, frontSetbackMm: 60, legCount: 6, plinthMaterial: 'BOARD' });
  const cab = { ...P.draftToNewCabinet(d, { id: 'x', name: 'x', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  assert.deepEqual(P.cabinetToDraft(cab).base, d.base);
  assert.equal(P.resolveDraft({ ...d, base: { type: 'ROCKET' } }, WOODS, HW, ROLLS).base, undefined, 'an unknown type is dropped');
  const legacy = make(600, 870, 600, DOORS, { base: undefined });
  assert.equal(P.cabinetToDraft(legacy).base, undefined);
  assert.equal('base' in P.draftToCabinetPatch(P.cabinetToDraft(legacy)), false, 'saving does not invent a base');
  assert.deepEqual(P.draftToCabinetPatch({ ...P.cabinetToDraft(legacy), base: { type: 'NONE' } }).base, { type: 'NONE' });
});

test('an L corner takes the base of the draft on all three boxes, and the boxes still line up', async () => {
  const { lCornerCabinets } = await import('../src/math/lCorner');
  const cabs = lCornerCabinets({ category: 'BASE_UNIT', wall: 'B', roomWidthMm: 3000, depthMm: 600, armAMm: 450, armBMm: 450 },
    { draft: { ...P.draftFromPreset('L_Corner_Base'), base: { type: 'WOOD', heightMm: 80 } }, woods: WOODS, hardware: HW, edgeRolls: ROLLS, groupId: 'g', newId: () => 'i' + n++, name: 'L' });
  cabs.forEach((c) => { assert.deepEqual(c.base, { type: 'WOOD', heightMm: 80 }); assert.equal(baseOf(c).heightMm, 80); });
});
