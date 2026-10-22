// @ts-nocheck  (tests are plain node:test files, run with: npm test)
// Structural guards found by the cabinet audit: a hinge is never mounted on nothing, the two doors of an L corner never go through
// each other, an inset door never goes through a board, and an overhead lift only sits where it can open.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';
import * as Z from '../src/math/zones';
import { assemblyGeometry, facadeKey } from '../src/math/assemblyGeometry';
import { buildFasteners } from '../src/math/fasteners';
import { lCornerCabinets } from '../src/math/lCorner';
import { toFrame } from '../src/math/kitchenLayout';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('lift', 'Overhead Lift Systems', 'Aventos HK', 2500), hw('gola', 'Gola & Handle Profiles', 'Gola C', 1800)];
const HW_INSET = HW.map((h) => (h.id === 'hinge' ? { ...h, modelType: 'Inset Hinge (Cranked)' } : h));
const ROLLS = [{ id: 'e1', brand: 'PVC', thickness: 1, width: 22, totalLengthMm: 0, totalLengthMeters: 100, rollPriceDA: 3000 }];

let n = 0;
const make = (category, w, h, d, zones, extra = {}, items = HW) => {
  const r = P.resolveDraft({ ...P.draftFromPreset(category === 'BASE_UNIT' ? 'Standard_Base' : 'Standard_Wall'), width: w, height: h, depth: d, zones, ...extra }, WOODS, items, ROLLS);
  return { ...P.draftToNewCabinet(r, { id: 'c' + n++, name: 'c' + n, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const optsOf = (cab, items = HW) => { const hwItem = E.pickFrontHardware(cab, 'DOORS', items); return { lift: E.isLiftItem(hwItem), inset: !!hwItem && hwItem.modelType.includes('Inset Hinge') }; };
const geoOf = (cab, items = HW) => assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, ...optsOf(cab, items) });
const box = (b) => ({ x0: b.centerMm[0] - b.sizeMm[0] / 2, x1: b.centerMm[0] + b.sizeMm[0] / 2, y0: b.centerMm[1] - b.sizeMm[1] / 2, y1: b.centerMm[1] + b.sizeMm[1] / 2, z0: b.centerMm[2] - b.sizeMm[2] / 2, z1: b.centerMm[2] + b.sizeMm[2] / 2 });
const fbox = (f, th = 18) => ({ x0: f.xMm, x1: f.xMm + f.widthMm, y0: f.yMm, y1: f.yMm + f.heightMm, z0: f.zMm - th / 2, z1: f.zMm + th / 2 });
const overlap = (a, b, tol = 0.5) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > tol && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > tol && Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) > tol;

test('hinge boards: every hinge of a row of doors hangs on a board, whatever the number of doors', () => {
  for (const count of [2, 3, 4, 5, 6]) for (const width of [900, 1200, 1500]) {
    const cab = make('BASE_UNIT', width, 870, 600, [{ kind: 'DOORS', count, shelves: 2 }]);
    const geo = geoOf(cab);
    const boards = geo.boxes.filter((b) => b.kind === 'side' || b.kind === 'vdivider').map(box);
    geo.facades.filter((f) => f.motion === 'SWING').forEach((f) => {
      const hx = f.hinge === 'LEFT' ? f.xMm : f.xMm + f.widthMm;
      assert.ok(boards.some((b) => hx >= b.x0 - 0.5 && hx <= b.x1 + 0.5 && f.yMm + f.heightMm / 2 >= b.y0 && f.yMm + f.heightMm / 2 <= b.y1), `${count} doors in ${width}: the hinge of door ${f.index} at x=${hx} has no board behind it`);
    });
    const partitions = geo.boxes.filter((b) => b.key.startsWith('vpart-'));
    assert.equal(partitions.length, Math.floor((count - 1) / 2), `${count} doors alternate their hinges: one board per pair of neighbours that share a hinge edge`);
    const bom = E.priceCabinet(cab, WOODS, HW, ROLLS).parts.filter((p) => p.partType.startsWith('Door Hinge Board')).reduce((s, p) => s + p.quantity, 0);
    assert.equal(bom, partitions.length, 'the cutting list has exactly the boards the drawing has');
    // a hinge plate sits on the face of its board and the arm is a normal hinge arm, never a bar across the cabinet
    buildFasteners(geo, cab, { carcaseTh: 18, frontTh: 18 }).filter((x) => x.kind === 'HINGE_ARM').forEach((a) => assert.ok(a.sizeMm[0] <= 40, `hinge arm of ${a.sizeMm[0]} mm`));
    // no shelf passes through a board
    geo.boxes.filter((b) => b.kind === 'shelf').forEach((s) => partitions.forEach((p) => assert.ok(!overlap(box(s), box(p)), `${s.key} crosses ${p.key}`)));
  }
});

test('hinge boards: two doors need none, unless every hinge is forced to one side', () => {
  assert.equal(geoOf(make('BASE_UNIT', 800, 870, 600, [{ kind: 'DOORS', count: 2 }])).boxes.filter((b) => b.key.startsWith('vpart-')).length, 0);
  const cab = make('BASE_UNIT', 800, 870, 600, [{ kind: 'DOORS', count: 2, hingeSide: 'LEFT' }]);
  const geo = geoOf(cab);
  assert.equal(geo.boxes.filter((b) => b.key.startsWith('vpart-')).length, 1, 'door 1 hangs on its left edge, which is in the middle of the cabinet: a board is cut there');
  assert.deepEqual(geo.facades.map((f) => f.hinge), ['LEFT', 'LEFT']);
});

test('hinge boards: doors too narrow for the boards are reported, not drawn through the sides', () => {
  // five doors in a 60 mm column: the two hinge boards do not fit between the column's walls
  const cab = make('BASE_UNIT', 300, 870, 600, [{ kind: 'DOORS', count: 5, split: { mainSide: 'RIGHT', mainWidthMm: 60, fill: 'PANEL' } }]);
  const pr = E.priceCabinet(cab, WOODS, HW, ROLLS);
  assert.ok(pr.issues.some((i) => i.code === 'DOORS_TOO_NARROW'));
  assert.equal(geoOf(cab).boxes.filter((b) => b.key.startsWith('vpart-')).length, 0);
});

test('hinge boards: the doors of a split column hang on boards too', () => {
  const cab = make('BASE_UNIT', 1000, 870, 600, [{ kind: 'DOORS', count: 3, shelves: 1, split: { mainSide: 'LEFT', mainWidthMm: 700, fill: 'PULL_OUT' } }]);
  const geo = geoOf(cab);
  const boards = geo.boxes.filter((b) => b.kind === 'side' || b.kind === 'vdivider').map(box);
  geo.facades.filter((f) => f.motion === 'SWING').forEach((f) => {
    const hx = f.hinge === 'LEFT' ? f.xMm : f.xMm + f.widthMm;
    assert.ok(boards.some((b) => hx >= b.x0 - 0.5 && hx <= b.x1 + 0.5), `door ${f.index} hinge at ${hx}`);
  });
});

test('L corner: the two doors never go through each other, and each keeps a millimetre off the other', () => {
  for (const category of ['BASE_UNIT', 'WALL_UNIT']) for (const wall of ['B', 'C']) for (const [armA, armB] of [[300, 300], [600, 600], [700, 400], [450, 700]]) {
    const depthMm = category === 'WALL_UNIT' ? 350 : 600;
    const draft = P.resolveDraft(P.draftFromPreset(category === 'WALL_UNIT' ? 'L_Corner_Wall' : 'L_Corner_Base'), WOODS, HW, ROLLS);
    let k = 0;
    const cabs = lCornerCabinets({ category, wall, roomWidthMm: 3600, depthMm, armAMm: armA, armBMm: armB }, { draft, woods: WOODS, hardware: HW, edgeRolls: ROLLS, groupId: 'g', newId: () => 'k' + k++, name: 'L' })
      .map((c) => ({ ...c, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 }));
    const doors = [];
    cabs.forEach((c) => {
      const run = c.run ?? 'A';
      const fc = toFrame(c, run);
      assemblyGeometry(c, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }).facades.forEach((f) => {
        const F = fbox(f);
        const x0 = F.x0 + fc.positionX, x1 = F.x1 + fc.positionX, z0 = F.z0 + c.depth / 2 - c.positionZ, z1 = F.z1 + c.depth / 2 - c.positionZ;
        const w = run === 'A' ? { x0, x1, z0, z1 } : run === 'B' ? { x0: z0, x1: z1, z0: -x1, z1: -x0 } : { x0: 3600 - z1, x1: 3600 - z0, z0: x0, z1: x1 };
        doors.push({ run, ...w, y0: F.y0, y1: F.y1 });
      });
    });
    assert.equal(doors.length, 2, 'the square has no door: one door per arm');
    const [a, b] = doors;
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    assert.ok(!(ox > 0 && oz > 0), `${category} wall ${wall} arms ${armA}/${armB}: the doors overlap ${ox} x ${oz} mm at the corner`);
    // the arm along the side wall is the one that stops short: one front thickness + 1 mm, then its normal 0.5 mm reveal on the other end
    const armBBox = cabs.find((c) => c.name.includes('ARM_B') || c.frontSetbackSides);
    assert.ok(armBBox.frontSetbackSides?.length === 1, 'only the arm along the side wall carries the setback');
    const armBDoor = assemblyGeometry(armBBox, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }).facades[0];
    assert.equal(armBDoor.widthMm, armB - 19 - 0.5, 'its door is 19 mm shorter at the corner end');
  }
});

test('inset hinges: no front goes through a board, the reveal is 2 mm, and the cutting list uses the same fronts as the drawing', () => {
  const stacks = [
    [{ kind: 'DOORS', count: 1 }], [{ kind: 'DOORS', count: 2, shelves: 2 }], [{ kind: 'DOORS', count: 3, shelves: 1 }], [{ kind: 'DOORS', count: 5 }],
    [{ kind: 'DRAWERS', count: 3 }], [{ kind: 'APRON', heightMm: 120 }, { kind: 'DOORS', count: 2 }], [{ kind: 'DRAWERS', count: 2, heightMm: 300 }, { kind: 'DOORS', count: 4, shelves: 1 }],
    [{ kind: 'DOORS', count: 3, split: { mainSide: 'RIGHT', mainWidthMm: 500, fill: 'DOOR' } }],
  ];
  for (const zones of stacks) for (const width of [600, 900, 1200]) for (const openingMode of ['HANDLE', 'GOLA']) {
    const cab = make('BASE_UNIT', width, 870, 600, zones, { openingMode }, HW_INSET);
    const geo = geoOf(cab, HW_INSET);
    assert.equal(optsOf(cab, HW_INSET).inset, zones.some((z) => z.kind === 'DOORS'), 'inset fronts follow the inset hinge (a drawers-only cabinet has no hinge)');
    const boards = geo.boxes.filter((b) => b.kind !== 'back').map((b) => ({ key: b.key, ...box(b) }));
    geo.facades.forEach((f) => boards.forEach((b) => assert.ok(!overlap(fbox(f), b), `${facadeKey(f)} goes through ${b.key} (${width}, ${JSON.stringify(zones)})`)));
    const sideL = boards.find((b) => b.key === 'side-left'), sideR = boards.find((b) => b.key === 'side-right');
    if (optsOf(cab, HW_INSET).inset) geo.facades.forEach((f) => assert.ok(f.xMm >= sideL.x1 + 2 - 1e-6 && f.xMm + f.widthMm <= sideR.x0 - 2 + 1e-6, `${facadeKey(f)} keeps its 2 mm reveal to the sides`));
    const pr = E.priceCabinet(cab, WOODS, HW_INSET, ROLLS);
    assert.deepEqual(pr.model.plan.facades.map((f) => [f.xMm, f.yMm, f.widthMm, f.heightMm]), geo.facades.map((f) => [f.xMm, f.yMm, f.widthMm, f.heightMm]), 'BOM and drawing read one plan');
    // a Gola profile is an overlay profile: with inset fronts it is dropped (and the engine says so) wherever overlay fronts would have had one
    const overlayHadChannels = Z.planFronts(cab, Z.layoutZones(cab, 18)).channels.length > 0;
    assert.equal(pr.issues.some((i) => i.code === 'GOLA_NOT_WITH_INSET'), optsOf(cab, HW_INSET).inset && overlayHadChannels);
    if (optsOf(cab, HW_INSET).inset) assert.equal(pr.model.plan.channels.length, 0);
  }
});

test('overhead lift: only the top, only doors zone gets one, and its kit touches the board it hangs on', () => {
  // single doors zone: the lift is picked and the kit sits right under the roof
  const one = make('WALL_UNIT', 600, 720, 350, [{ kind: 'DOORS', count: 1 }], { preferLift: true });
  assert.ok(E.isLiftItem(E.pickFrontHardware(one, 'DOORS', HW)));
  const geoOne = geoOf(one);
  const roof = geoOne.boxes.find((b) => b.key === 'roof');
  const kit = buildFasteners(geoOne, one, { carcaseTh: 18, frontTh: 18 }).find((x) => x.kind === 'LIFT_KIT');
  assert.equal(kit.parent, 'roof');
  assert.ok(Math.abs(kit.centerMm[1] + kit.sizeMm[1] / 2 - box(roof).y0) < 0.5, 'the kit is flush under the roof, not hanging in the air');
  // two door zones: a lift would sweep through the zone above, so the draft takes hinges instead
  const two = make('WALL_UNIT', 600, 900, 350, [{ kind: 'DOORS', count: 1, heightMm: 300 }, { kind: 'DOORS', count: 1 }], { preferLift: true });
  assert.ok(!E.isLiftItem(E.pickFrontHardware(two, 'DOORS', HW)), 'two door zones: hinges');
  assert.ok(geoOf(two).facades.every((f) => f.motion === 'SWING'));
  // a lift under another zone that was forced by hand is an error, and the zone helper says why
  const forced = { ...two, frontConfig: { ...two.frontConfig, hardwareItemId: 'lift' } };
  assert.ok(E.priceCabinet(forced, WOODS, HW, ROLLS).issues.some((i) => i.code === 'LIFT_ZONE_NOT_TOP' && i.severity === 'error'));
  // a small filler door beside an appliance is a door too: it would be a second lift zone
  const filler = make('WALL_UNIT', 800, 900, 350, [{ kind: 'APPLIANCE', appliance: 'OVEN', heightMm: 600, split: { mainSide: 'LEFT', fill: 'DOOR' } }, { kind: 'DOORS', count: 2 }], { preferLift: true });
  assert.ok(!E.isLiftItem(E.pickFrontHardware(filler, 'DOORS', HW)), 'a filler door below the doors zone: hinges');
  // an apron under a single doors zone is fine: the doors zone is still the top one
  const apron = make('WALL_UNIT', 600, 900, 350, [{ kind: 'APRON', heightMm: 120 }, { kind: 'DOORS', count: 1 }], { preferLift: true });
  assert.ok(E.isLiftItem(E.pickFrontHardware(apron, 'DOORS', HW)));
});

test('hinge helpers: edges, sides and the boards they need', () => {
  assert.deepEqual(Z.hingeSidesOf(4), ['LEFT', 'RIGHT', 'LEFT', 'RIGHT']);
  assert.deepEqual(Z.hingeSidesOf(2, 'RIGHT'), ['RIGHT', 'RIGHT']);
  assert.deepEqual(Z.hingeEdgesOf(3, Z.hingeSidesOf(3)), [2]);
  assert.deepEqual(Z.hingeEdgesOf(6, Z.hingeSidesOf(6)), [2, 4]);
  assert.deepEqual(Z.hingeEdgesOf(2, Z.hingeSidesOf(2, 'LEFT')), [1]);
  assert.deepEqual(Z.doorEdgesOf(3, 900), [0, 300, 600, 900]);
  const row = Z.insetRowOf(3, [2], 18, 882, 18, 2); // 3 inset doors, a board before the third
  assert.equal(row.doors.length, 3);
  assert.equal(row.boards.length, 1);
  assert.ok(row.doors[2].xMm >= row.boards[0].xLoMm + 18 + 2 - 1e-6 && row.doors[1].xMm + row.doors[1].widthMm <= row.boards[0].xLoMm - 2 + 1e-6, 'doors keep 2 mm off the board on both sides');
});
