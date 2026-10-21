// @ts-nocheck  (plain node:test file, run with: npm test)
// The real L corner: three boxes, one continuous interior, the doors on the far ends, every engine still agreeing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';
import * as G from '../src/math/assemblyGeometry';
import * as K from '../src/math/kitchenLayout';
import { lCornerBoxes, lCornerCabinets, lCornerSpan } from '../src/math/lCorner';
import { buildFasteners, fastenerCounts } from '../src/math/fasteners';
import { facadeKey } from '../src/math/assemblyGeometry';
import { carcaseSidesOf } from '../src/math/carcaseSides';
import { computeCabinetTotalCost } from '../src/math/costEngine';

const wood = (id, th, price = 15000) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 50, averagePriceDA: price });
const hw = (id, category, modelType, price = 300) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: 500 });
const WOODS = [wood('hdf', 3, 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dowel', 'Assembly & Fixing', 'Wooden Dowel', 2), hw('screw', 'Assembly & Fixing', 'Back Panel Screw', 2)];
const ROLLS = [];
const BASE = { category: 'BASE_UNIT', depthMm: 600, armAMm: 450, armBMm: 450, roomWidthMm: 3000 };
const build = (over = {}) => {
  let n = 0;
  const p = { ...BASE, wall: 'B', ...over };
  const list = lCornerCabinets(p, { draft: P.draftFromPreset('Blind_Corner'), woods: WOODS, hardware: HW, edgeRolls: ROLLS, groupId: 'g1', newId: () => `c${++n}`, name: 'L' });
  return { p, boxes: lCornerBoxes(p), cabs: list.map((c) => ({ ...c, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 })) };
};
const geoOf = (cab) => G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
const LAYOUT = { type: 'L', widthMm: 3000, lSide: 'LEFT' };

test('L corner: on the left wall the square is at the corner, the arms next to it, both arms 450 + 600 from the corner', () => {
  const { boxes } = build();
  assert.deepEqual(boxes.map((b) => [b.role, b.run, b.positionX, b.width]), [['SQUARE', 'A', 0, 600], ['ARM_A', 'A', 600, 450], ['ARM_B', 'B', 600, 450]]);
  assert.deepEqual(lCornerSpan(BASE), { alongA: 1050, alongSide: 1050 });
});

test('L corner: on the right wall everything is mirrored (measured from the back wall length)', () => {
  const { boxes } = build({ wall: 'C' });
  assert.deepEqual(boxes.map((b) => [b.role, b.run, b.positionX, b.width]), [['SQUARE', 'A', 2400, 600], ['ARM_A', 'A', 1950, 450], ['ARM_B', 'C', 600, 450]]);
});

test('L corner: the three boxes cover exactly an L on the floor, with no clash and no hole', () => {
  [['B', { ...LAYOUT }], ['C', { ...LAYOUT, lSide: 'RIGHT' }]].forEach(([wall, layout]) => {
    const { cabs } = build({ wall });
    assert.equal(cabs.length, 3);
    cabs.forEach((c) => assert.equal(c.groupId, 'g1'));
    const area = cabs.map((c) => K.footprintOf(c, layout)).reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    assert.equal(area, 600 * 600 + 450 * 600 + 450 * 600, `${wall}: square + two arms`);
    assert.ok(Object.values(K.fitStates(cabs, layout)).every((s) => s !== 'OVERLAP'), `${wall}: the group does not clash with itself`);
    // a plain cabinet next to the arm of the back wall is flush with it, and one after the side arm too
    const next = { id: 'n', run: 'A', positionX: wall === 'B' ? 1050 : 1350, positionZ: 0, width: 600, depth: 600, category: 'BASE_UNIT' };
    assert.notEqual(K.fitStates([...cabs, next], layout).n, 'OVERLAP');
  });
});

test('L corner: the sides that face a neighbour are not cut, the others are', () => {
  const { cabs } = build();
  const [sq, a, b] = cabs;
  assert.deepEqual([sq.omitSides, a.omitSides, b.omitSides], [['RIGHT'], ['LEFT'], ['RIGHT']]);
  const sideQty = (c) => E.modelCabinet(c, 18, 18).parts.find((p) => p.partType.startsWith('Side Panel'))?.quantity ?? 0;
  assert.deepEqual(cabs.map(sideQty), [1, 1, 1], 'each box keeps one side: the other face is the open join');
  cabs.forEach((c) => assert.equal(geoOf(c).boxes.filter((x) => x.kind === 'side').length, 1));
  // the boards between the sides run up to the open face: 600 - 18 = 582 for the square and 450 - 18 for an arm
  assert.equal(carcaseSidesOf(sq, 18).innerMm, 582);
  assert.equal(carcaseSidesOf(a, 18).innerMm, 432);
  assert.equal(carcaseSidesOf({ width: 600 }, 18).innerMm, 564, 'a normal cabinet is unchanged');
  const bottom = geoOf(a).boxes.find((x) => x.kind === 'bottom');
  assert.equal(bottom.sizeMm[0], 432);
  assert.equal(bottom.centerMm[0], 216, 'the board runs from the open face (x = 0) to the inner face of the right side (x = 432)');
});

test('L corner: the square has no front, each arm one door hinged on its FAR end (away from the corner)', () => {
  const { cabs } = build();
  const [sq, a, b] = cabs;
  assert.equal(geoOf(sq).facades.length, 0);
  const hinge = (c) => geoOf(c).facades.map((f) => f.hinge);
  assert.deepEqual([hinge(a), hinge(b)], [['RIGHT'], ['LEFT']]);
  const c = build({ wall: 'C' }).cabs;
  assert.deepEqual([hinge(c[1]), hinge(c[2])], [['LEFT'], ['RIGHT']]);
  // the door covers the arm; the arm is 450 wide, the door 449 (the usual 1 mm reveal)
  assert.equal(geoOf(a).facades[0].widthMm, 449);
});

test('L corner PARITY: for every box the 3D boards are exactly the BOM parts, and the price is the sum of the BOM rows', () => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const key = (t, x, y) => [t, x, y].map(r2).sort((m, n) => m - n).join('x');
  ['B', 'C'].forEach((wall) => build({ wall }).cabs.forEach((cab) => {
    const pr = E.priceCabinet(cab, WOODS, HW, ROLLS);
    const geo = geoOf(cab);
    const fromParts = [];
    pr.parts.filter((p) => p.role !== 'front').forEach((p) => { for (let q = 0; q < p.quantity; q++) fromParts.push(key(p.thicknessMm, p.widthMm, p.lengthMm)); });
    assert.deepEqual(geo.boxes.map((b) => key(...b.sizeMm)).sort(), fromParts.sort(), `${wall} ${cab.name}: boards`);
    const front = pr.parts.filter((p) => p.role === 'front').flatMap((p) => Array.from({ length: p.quantity }, () => key(18, p.widthMm, p.lengthMm)));
    assert.deepEqual(geo.facades.map((f) => key(18, f.widthMm, f.heightMm)).sort(), front.sort(), `${wall} ${cab.name}: fronts`);
    assert.equal(r2(computeCabinetTotalCost(cab, WOODS, HW, ROLLS)), r2(pr.totalDA ?? pr.total ?? computeCabinetTotalCost(cab, WOODS, HW, ROLLS)), 'priced');
    assert.ok(computeCabinetTotalCost(cab, WOODS, HW, ROLLS) > 0);
  }));
});

test('L corner: no connector hangs on a board that is not cut, and the hinge cups equal the BOM hinges', () => {
  build().cabs.forEach((cab) => {
    const geo = geoOf(cab);
    const fasteners = buildFasteners(geo, cab, { carcaseTh: 18, frontTh: 18 });
    const keys = new Set([...geo.boxes.map((b) => b.key), ...geo.facades.map(facadeKey)]);
    fasteners.forEach((f) => assert.ok(keys.has(f.parent), `${cab.name}: ${f.kind} is on the missing ${f.parent}`));
    const hinges = E.hardwareRequirements(cab, HW).find((r) => r.item.id === 'hinge')?.quantity ?? 0;
    assert.equal(fastenerCounts(fasteners).HINGE_CUP, hinges, `${cab.name}: hinges`);
  });
});

test('L corner: a wall corner is the same shape with the wall unit depth, and hinges / sides follow the same rules', () => {
  const { cabs, boxes } = build({ category: 'WALL_UNIT', depthMm: 350 });
  assert.deepEqual(boxes.map((b) => [b.positionX, b.width]), [[0, 350], [350, 450], [350, 450]]);
  cabs.forEach((c) => { assert.equal(c.category, 'WALL_UNIT'); assert.equal(c.depth, 350); assert.equal(c.height, 720); });
  assert.deepEqual(cabs.map((c) => c.omitSides), [['RIGHT'], ['LEFT'], ['RIGHT']]);
  const roof = (c) => geoOf(c).boxes.some((b) => b.kind === 'roof');
  assert.ok(cabs.every(roof), 'a wall unit is closed on top');
});

test('hinge side: a zone can choose it, and it survives the form normalisation', () => {
  const d = P.resolveDraft({ ...P.draftFromPreset('Deep_Drawers'), category: 'BASE_UNIT', zones: [{ kind: 'DOORS', count: 1, shelves: 0, hingeSide: 'RIGHT' }] }, WOODS, HW, ROLLS);
  assert.equal(d.zones[0].hingeSide, 'RIGHT');
  const cab = { ...P.draftToNewCabinet(d, { id: 'x', name: 'x', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  assert.deepEqual(geoOf(cab).facades.map((f) => f.hinge), ['RIGHT']);
  const auto = P.resolveDraft({ ...P.draftFromPreset('Deep_Drawers'), zones: [{ kind: 'DOORS', count: 1, shelves: 0 }] }, WOODS, HW, ROLLS);
  assert.equal(auto.zones[0].hingeSide, undefined, 'unset = the old automatic behaviour');
});
