// @ts-nocheck  (plain node:test file, run with: npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';
import * as G from '../src/math/assemblyGeometry';
import * as F from '../src/math/fasteners';
import * as S from '../src/math/stockDelta';
import { generateFactoryBOMReport as BOM } from '../src/math/bomEngine';
import { computeCabinetTotalCost as COST } from '../src/math/costEngine';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id.toUpperCase(), type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 1000) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges'), hw('slide', 'Drawer Slide Systems'), hw('lift', 'Overhead Lift Systems', 'Aventos', 2500), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200)];
const FIX = [hw('cam', 'Assembly & Fixing', 'Cam Lock Connector (Minifix) with Bolt', 12), hw('dowel', 'Assembly & Fixing', 'Wooden Dowel (8x30mm)', 2), hw('bscrew', 'Assembly & Fixing', 'Back Panel Screw (3.5x16mm)', 1), hw('pin', 'Assembly & Fixing', 'Shelf Support Pin (5mm)', 3)];
const ROLLS = [];
const sum = (a) => a.reduce((x, y) => x + y, 0);

function build(s, hws = HW, tweak = (d) => d) {
  const d = P.resolveDraft(tweak(P.draftFromPreset(s)), WOODS, hws, ROLLS);
  const cab = { ...P.draftToNewCabinet(d, { id: s, name: s, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  const doorHw = E.pickFrontHardware(cab, 'DOORS', hws);
  const geo = G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: E.isLiftItem(doorHw), inset: false });
  return { d, cab, geo, list: F.buildFasteners(geo, cab, { carcaseTh: 18, frontTh: 18 }), doorHw };
}

// ------------------------------------------------------------------------------------------- explode
test('explode: 0 = assembled; offsets scale linearly; every part moves in its natural direction', () => {
  const { cab, geo } = build('Built_In_Appliance');
  const zero = F.explodeOffsets(geo, cab, 0);
  Object.values(zero).forEach((o) => assert.deepEqual(o, [0, 0, 0]));
  const one = F.explodeOffsets(geo, cab, 1), half = F.explodeOffsets(geo, cab, 0.5);
  Object.keys(one).forEach((k) => one[k].forEach((v, i) => assert.ok(Math.abs(half[k][i] - v / 2) < 1e-9, `${k} not linear`)));
  assert.ok(one['side-left'][0] < 0 && one['side-right'][0] > 0);
  assert.ok(one['bottom'][1] < 0 && one['rail-front'][1] > 0 && one['rail-rear'][1] > 0);
  assert.ok(one['back'][2] < 0);
  geo.facades.forEach((f) => assert.ok(one[G.facadeKey(f)][2] > 0, 'facades come forward'));
  const clamp = F.explodeOffsets(geo, cab, 7); assert.deepEqual(clamp, one);
});

test('explode: after a full explosion no two parts occupy the same space (all 24 presets)', () => {
  for (const s of P.SUBTYPES) {
    const { cab, geo } = build(s);
    const off = F.explodeOffsets(geo, cab, 1);
    const boxes = [];
    geo.boxes.forEach((b) => boxes.push({ k: b.key, c: b.centerMm.map((v, i) => v + off[b.key][i]), s: b.sizeMm }));
    geo.facades.forEach((f) => { const k = G.facadeKey(f); boxes.push({ k, c: [f.xMm + f.widthMm / 2 + off[k][0], f.yMm + f.heightMm / 2 + off[k][1], f.zMm + off[k][2]], s: [f.widthMm, f.heightMm, 18] }); });
    geo.appliances.forEach((a) => { const k = G.applianceKey(a.zoneIndex); boxes.push({ k, c: a.centerMm.map((v, i) => v + off[k][i]), s: a.sizeMm }); });
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      const o = [0, 1, 2].map((ax) => Math.min(boxes[i].c[ax] + boxes[i].s[ax] / 2, boxes[j].c[ax] + boxes[j].s[ax] / 2) - Math.max(boxes[i].c[ax] - boxes[i].s[ax] / 2, boxes[j].c[ax] - boxes[j].s[ax] / 2));
      assert.ok(!(o[0] > 0.01 && o[1] > 0.01 && o[2] > 0.01), `${s}: ${boxes[i].k} overlaps ${boxes[j].k} when exploded`);
    }
  }
});

// ------------------------------------------------------------------------------------------- fasteners
test('fasteners: every connector belongs to a part that exists', () => {
  for (const s of P.SUBTYPES) {
    const { geo, list } = build(s);
    const keys = new Set([...geo.boxes.map((b) => b.key), ...geo.facades.map(G.facadeKey)]);
    list.forEach((f) => assert.ok(keys.has(f.parent), `${s}: ${f.kind} -> ${f.parent}`));
  }
});

test('fasteners: PARITY - hinge cups = BOM hinges, lift kits = BOM lift kits, runner pairs = BOM runners, for all presets and variants', () => {
  const variants = P.SUBTYPES.map((s) => [s, (d) => d]);
  variants.push(['Standard_Wall', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2, shelves: 1 }], hardwareItemId: 'lift' })]);
  variants.push(['Standard_Wall', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 1, shelves: 1 }], hardwareItemId: 'lift' })]);
  variants.push(['Deep_Drawers', (d) => ({ ...d, zones: [{ kind: 'DRAWERS', count: 5 }] })]);
  for (const [s, tw] of variants) {
    const { cab, list, doorHw } = build(s, HW, tw);
    const reqs = E.hardwareRequirements(cab, HW);
    const qty = (id) => reqs.find((r) => r.item.id === id)?.quantity ?? 0;
    const cups = list.filter((f) => f.kind === 'HINGE_CUP').length;
    assert.equal(cups, E.isLiftItem(doorHw) ? 0 : qty('hinge'), `${s}: hinge cups vs BOM`);
    assert.equal(list.filter((f) => f.kind === 'HINGE_PLATE').length, cups, `${s}: a plate per cup`);
    assert.equal(list.filter((f) => f.kind === 'LIFT_KIT').length, qty('lift'), `${s}: lift kits vs BOM`);
    assert.equal(list.filter((f) => f.kind === 'RUNNER').length, 2 * qty('slide'), `${s}: runners vs BOM`);
  }
});

test('fasteners: positions are physically right (dowels on the joint plane, plates on the side faces, cups inside their door, pins under their shelf)', () => {
  const { cab, geo, list } = build('Built_In_Appliance');
  const th = 18, W = cab.width;
  list.filter((f) => f.kind === 'DOWEL').forEach((f) => assert.ok(Math.abs(f.centerMm[0] - th) < 0.01 || Math.abs(f.centerMm[0] - (W - th)) < 0.01));
  list.filter((f) => f.kind === 'HINGE_PLATE').forEach((f) => assert.ok(Math.abs(f.centerMm[0] - (th + 4)) < 0.01 || Math.abs(f.centerMm[0] - (W - th - 4)) < 0.01));
  const doors = geo.facades.filter((f) => f.kind === 'DOOR');
  list.filter((f) => f.kind === 'HINGE_CUP').forEach((f) => {
    const door = doors.find((d) => G.facadeKey(d) === f.parent);
    assert.ok(door, 'cup has a door');
    assert.ok(f.centerMm[0] - 17.5 >= door.xMm - 0.01 && f.centerMm[0] + 17.5 <= door.xMm + door.widthMm + 0.01, 'cup inside the door width');
    assert.ok(f.centerMm[1] > door.yMm && f.centerMm[1] < door.yMm + door.heightMm, 'cup inside the door height');
  });
  const back = geo.boxes.find((b) => b.kind === 'back');
  list.filter((f) => f.kind === 'BACK_SCREW').forEach((f) => {
    assert.ok(f.centerMm[0] >= 0 && f.centerMm[0] <= W && f.centerMm[1] >= 0 && f.centerMm[1] <= cab.height, 'screw inside the back panel outline');
    assert.ok(f.centerMm[2] < back.centerMm[2] + back.sizeMm[2] / 2 + 14 && f.centerMm[2] > back.centerMm[2] - back.sizeMm[2] / 2 - 1, 'screw crosses the back panel');
  });
  const shelves = geo.boxes.filter((b) => b.kind === 'shelf');
  assert.equal(list.filter((f) => f.kind === 'SHELF_PIN').length, 4 * shelves.length);
  list.filter((f) => f.kind === 'SHELF_PIN').forEach((f) => assert.ok(shelves.some((sh) => f.centerMm[1] < sh.centerMm[1] - sh.sizeMm[1] / 2 && f.centerMm[1] > sh.centerMm[1] - sh.sizeMm[1] / 2 - 8)));
});

test('fasteners: cam bolt + cam housing + dowel per joint position; joints = boards x 2 sides', () => {
  const { geo, list } = build('Built_In_Appliance');
  const expected = sum(geo.boxes.filter((b) => ['bottom', 'divider', 'rail', 'roof'].includes(b.kind)).map((b) => 2 * F.jointZs(b.centerMm[2] - b.sizeMm[2] / 2, b.centerMm[2] + b.sizeMm[2] / 2).length));
  const c = F.fastenerCounts(list);
  assert.equal(c.CAM, expected); assert.equal(c.CAM_BOLT, expected); assert.equal(c.DOWEL, expected);
  assert.ok(expected > 20);
  assert.deepEqual(F.jointZs(-300, 300), [263, 0, -263]);     // deep board: front, middle, back
  assert.deepEqual(F.jointZs(-50, 50), [0]);                  // a 100 mm rail: one connector
});

test('fasteners: an open (panel-ready) carcase has no back screws; a wall unit has none of the base-only parts', () => {
  assert.equal(F.fastenerCounts(build('Panel_Ready').list).BACK_SCREW, 0);
  assert.ok(F.fastenerCounts(build('Standard_Wall').list).BACK_SCREW > 0);
});

// ------------------------------------------------------------------------------------------- BOM / stock
test('BOM: connectors are counted and priced when the stock has the matching item, and the price still equals the rows', () => {
  const stock = [...HW, ...FIX];
  const { cab, list } = build('Built_In_Appliance', stock);
  const counts = F.fastenerCounts(list);
  const reqs = E.hardwareRequirements(cab, stock);
  const q = (id) => reqs.find((r) => r.item.id === id)?.quantity;
  assert.equal(q('cam'), counts.CAM); assert.equal(q('dowel'), counts.DOWEL); assert.equal(q('bscrew'), counts.BACK_SCREW); assert.equal(q('pin'), counts.SHELF_PIN);
  const rep = BOM([{ ...cab, calculatedCostDA: 0 }], WOODS, stock, ROLLS);
  const row = (n) => rep.hardwareAccessoriesSummary.find((r) => r.modelType.includes(n));
  assert.equal(row('Cam Lock').quantityRequired, counts.CAM);
  assert.equal(row('Cam Lock').totalHardwareCostDA, counts.CAM * 12);
  const cost = COST(cab, WOODS, stock, ROLLS);
  assert.equal(rep.totalKitchenCostDA, cost);
  assert.equal(sum(rep.woodPanelsSummary.map((r) => r.estimatedCostDA)) + sum(rep.hardwareAccessoriesSummary.map((r) => r.totalHardwareCostDA)), cost);
  // without those items in stock nothing is invented
  const plain = BOM([cab], WOODS, HW, ROLLS);
  assert.ok(!plain.hardwareAccessoriesSummary.some((r) => /Cam Lock|Dowel|Back Panel Screw|Shelf Support/.test(r.modelType)));
});

test('stock: connectors follow add / delete exactly', () => {
  const stock = [...HW, ...FIX].map((i) => ({ ...i }));
  const { cab } = build('Deep_Drawers', [...HW, ...FIX]);
  const added = S.applyConsumptionDelta(stock, [], [cab]);
  const get = (arr, id) => arr.find((i) => i.id === id).availableQty;
  assert.ok(get(added, 'cam') < 1000 && get(added, 'dowel') < 1000);
  const back = S.applyConsumptionDelta(added, [cab], []);
  stock.forEach((i) => assert.equal(get(back, i.id), i.availableQty, i.id));
});
