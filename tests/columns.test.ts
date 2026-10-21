// @ts-nocheck  (plain node:test file, run with: npm test)
// A vertical board inside a zone: two columns (the appliance niche / the zone's doors, and a filler), math/columns.ts.
import * as LG from './fixtures/legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';
import { assemblyGeometry, facadeKey, applianceKey } from '../src/math/assemblyGeometry';
import { buildFasteners, explodeOffsets } from '../src/math/fasteners';
import { suggestFill, frontStripOf } from '../src/math/columns';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dow', 'Assembly & Fixing', 'Wooden Dowel', 2)];
const EPS = 1e-6;
const OPTS = { carcaseTh: 18, frontTh: 18, lift: false, inset: false };

/** Built_In_Appliance (zones: drawer, OVEN, MICROWAVE, doors) of width W with a split on the oven zone. */
const tower = (width, split = { mainSide: 'LEFT', fill: 'AUTO' }, hwItems = HW) => {
  const d0 = LG.draftFromPreset('Built_In_Appliance');
  d0.width = width;
  d0.zones = d0.zones.map((z) => (z.appliance === 'OVEN' && split ? { ...z, split } : z));
  const d = P.resolveDraft(d0, WOODS, hwItems, []);
  const cab = { ...P.draftToNewCabinet(d, { id: 't', name: 't', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  return { d, cab, pr: E.priceCabinet(cab, WOODS, hwItems, []), geo: assemblyGeometry(cab, OPTS) };
};
const ovenBand = (pr) => pr.model.layout.bands.find((b) => b.zone.appliance === 'OVEN');
const box = (c, s) => ({ x: [c[0] - s[0] / 2, c[0] + s[0] / 2], y: [c[1] - s[1] / 2, c[1] + s[1] / 2], z: [c[2] - s[2] / 2, c[2] + s[2] / 2] });
const ov = (a0, a1, b0, b1) => Math.min(a1, b1) - Math.max(a0, b0);
const hit = (a, b) => ov(...a.x, ...b.x) > EPS && ov(...a.y, ...b.y) > EPS && ov(...a.z, ...b.z) > EPS;

test('split: the board cuts the zone in two columns, the appliance column is its niche + clearance', () => {
  const { pr, geo, cab } = tower(800);
  const band = ovenBand(pr);
  const sp = band.split;
  assert.equal(sp.main.innerHiMm - sp.main.innerLoMm, 564, 'oven niche 560 + 4 mm clearance');
  assert.equal(sp.mainSide, 'LEFT');
  assert.equal(sp.boardXLoMm, 18 + 564);
  assert.equal(sp.fill.innerLoMm, sp.boardXLoMm + 18, 'the filler column starts after the board');
  assert.equal(sp.fill.innerHiMm, 800 - 18);
  assert.equal(sp.fill.fill, 'PULL_OUT', '182 mm left: a pull-out spice rack');
  const board = geo.boxes.find((b) => b.kind === 'vdivider');
  assert.deepEqual(board.sizeMm, [18, band.openingHeightMm, 600], 'as tall as the opening, as deep as the cabinet');
  assert.equal(board.centerMm[0], sp.boardXLoMm + 9);
  assert.equal(board.centerMm[1], band.openingBottomMm + band.openingHeightMm / 2);
  const oven = geo.appliances.find((a) => a.appliance === 'OVEN');
  assert.equal(oven.centerMm[0], (sp.main.innerLoMm + sp.main.innerHiMm) / 2, 'the oven is centred in its own column');
  assert.equal(oven.sizeMm[0], 560);
  const row = pr.parts.find((p) => /Zone Column Board/.test(p.partType));
  assert.equal(row.quantity, 1);
  assert.equal(row.widthMm, cab.depth);
  assert.equal(row.lengthMm, band.openingHeightMm);
  assert.equal(row.role, 'carcase');
});

test('split: moving the appliance to the other side mirrors the columns', () => {
  const left = tower(800), right = tower(800, { mainSide: 'RIGHT', fill: 'AUTO' });
  const l = ovenBand(left.pr).split, r = ovenBand(right.pr).split;
  assert.equal(r.mainSide, 'RIGHT');
  assert.equal(r.main.innerLoMm, 800 - l.main.innerHiMm);
  assert.equal(r.main.innerHiMm, 800 - l.main.innerLoMm);
  assert.equal(r.boardXLoMm, 800 - l.boardXLoMm - 18);
  const lo = left.geo.appliances.find((a) => a.appliance === 'OVEN'), ro = right.geo.appliances.find((a) => a.appliance === 'OVEN');
  assert.equal(ro.centerMm[0], 800 - lo.centerMm[0]);
  assert.equal(left.pr.totalDA, right.pr.totalDA, 'same parts, same price');
});

test('split: the leftover column is suggested from its width, and an explicit choice wins', () => {
  assert.equal(suggestFill(150), 'PULL_OUT');
  assert.equal(suggestFill(149), 'DOOR');
  assert.equal(suggestFill(100), 'DOOR');
  assert.equal(suggestFill(99), 'PANEL');
  assert.equal(ovenBand(tower(800).pr).split.fill.fill, 'PULL_OUT'); // 182
  assert.equal(ovenBand(tower(740).pr).split.fill.fill, 'DOOR');     // 122
  assert.equal(ovenBand(tower(700).pr).split.fill.fill, 'PANEL');    // 82
  assert.equal(ovenBand(tower(800, { mainSide: 'LEFT', fill: 'OPEN' }).pr).split.fill.fill, 'OPEN');
});

test('split: each filler is built and priced as what it is', () => {
  const faces = (t) => t.pr.model.plan.facades.filter((f) => f.column === 'FILL');
  // pull-out spice rack: one front on runners, in the leftover column
  const rack = tower(800);
  const [rf] = faces(rack);
  assert.equal(faces(rack).length, 1);
  assert.equal(rf.kind, 'DOOR'); assert.equal(rf.kinematic, 'PULL_OUT_FRAME');
  assert.equal(rack.pr.hardware.find((h) => h.item.id === 'slide').quantity, 2, 'the drawer below + the rack');
  assert.ok(!rack.pr.issues.some((i) => i.code === 'PULL_OUT_SIDE_BY_SIDE'));
  // small door: hinges, and the hinge side is the outer edge (away from the board)
  const door = tower(740);
  const [df] = faces(door);
  assert.equal(df.kind, 'DOOR'); assert.equal(df.kinematic, undefined); assert.equal(df.hingeSide, 'RIGHT');
  assert.equal(door.geo.facades.find((f) => f.column === 'FILL').hinge, 'RIGHT');
  assert.equal(door.pr.hardware.find((h) => h.item.id === 'hinge').quantity, 4 + 2, 'the top doors + two hinges for the small door');
  // fixed panel: a plain sheet, no mechanism
  const panel = tower(700);
  const [pf] = faces(panel);
  assert.equal(pf.kind, 'PANEL');
  const prow = panel.pr.parts.find((p) => /Fixed Filler Panel/.test(p.partType));
  assert.equal(prow.role, 'front');
  assert.equal(prow.widthMm, pf.widthMm);
  // open: nothing to see in front, no extra hardware
  const open = tower(800, { mainSide: 'LEFT', fill: 'OPEN' });
  assert.equal(faces(open).length, 0);
  assert.equal(open.pr.hardware.find((h) => h.item.id === 'slide').quantity, 1, 'only the drawer below');
});

test('split: with no room the board is dropped and the engine says so', () => {
  const t = tower(600);
  assert.equal(ovenBand(t.pr).split, undefined);
  assert.ok(t.pr.issues.some((i) => i.code === 'SPLIT_NO_ROOM'));
  assert.ok(!t.pr.parts.some((p) => /Zone Column Board/.test(p.partType)));
  assert.ok(!t.geo.boxes.some((b) => b.kind === 'vdivider'));
});

test('a free width beside an appliance with no board gets a hint; a tight niche does not', () => {
  const wide = tower(800, undefined);
  assert.ok(wide.pr.issues.some((i) => i.code === 'APPLIANCE_ZONE_WIDE'));
  assert.ok(!tower(600, undefined).pr.issues.some((i) => i.code === 'APPLIANCE_ZONE_WIDE'));
  assert.ok(!tower(800).pr.issues.some((i) => i.code === 'APPLIANCE_ZONE_WIDE' && /فرن|Oven/i.test(i.message)), 'the board answers the hint for the oven');
});

test('split: the zone\'s fronts, boards, appliances and trims never collide and stay inside their columns', () => {
  [tower(800), tower(800, { mainSide: 'RIGHT', fill: 'AUTO' }), tower(740), tower(700), tower(900, { mainSide: 'LEFT', fill: 'PULL_OUT' })].forEach(({ geo, pr, cab }) => {
    const solids = [
      ...geo.boxes.filter((b) => b.kind !== 'back').map((b) => ({ n: b.key, b: box(b.centerMm, b.sizeMm) })),
      ...geo.facades.map((f) => ({ n: facadeKey(f), b: { x: [f.xMm, f.xMm + f.widthMm], y: [f.yMm, f.yMm + f.heightMm], z: [f.zMm - 9, f.zMm + 9] } })),
      ...geo.appliances.flatMap((a) => [{ n: applianceKey(a.zoneIndex), b: box(a.centerMm, a.sizeMm) }, ...(a.trim ? [{ n: applianceKey(a.zoneIndex) + '-trim', b: box(a.trim.centerMm, a.trim.sizeMm) }] : [])]),
    ];
    for (let i = 0; i < solids.length; i++) for (let j = i + 1; j < solids.length; j++) assert.ok(!hit(solids[i].b, solids[j].b), `${solids[i].n} collides with ${solids[j].n}`);
    const band = ovenBand(pr);
    const sp = band.split;
    const oven = geo.appliances.find((a) => a.appliance === 'OVEN');
    assert.ok(oven.centerMm[0] - oven.sizeMm[0] / 2 >= sp.main.innerLoMm - EPS && oven.centerMm[0] + oven.sizeMm[0] / 2 <= sp.main.innerHiMm + EPS, 'the oven fits its column');
    const strip = frontStripOf(sp.main, cab.width);
    assert.ok(oven.trim.centerMm[0] - oven.trim.sizeMm[0] / 2 >= strip.loMm - EPS && oven.trim.centerMm[0] + oven.trim.sizeMm[0] / 2 <= strip.hiMm + EPS, 'the trim stays in its column strip');
    assert.ok(oven.trim.sizeMm[0] > oven.sizeMm[0], 'and still overlaps the niche edges');
    const fillStrip = frontStripOf(sp.fill, cab.width);
    geo.facades.filter((f) => f.column === 'FILL').forEach((f) => {
      assert.ok(f.xMm >= fillStrip.loMm - EPS && f.xMm + f.widthMm <= fillStrip.hiMm + EPS, 'the filler front stays in its strip');
      if (f.frame) assert.ok(f.frame.centerMm[0] - f.frame.sizeMm[0] / 2 >= sp.fill.innerLoMm - EPS && f.frame.centerMm[0] + f.frame.sizeMm[0] / 2 <= sp.fill.innerHiMm + EPS, 'the basket frame fits its column');
    });
  });
});

test('two pull-out baskets side by side: each has its column and the old warning goes away', () => {
  const d0 = LG.draftFromPreset('Tall_Pantry_Cargo');
  d0.zones = d0.zones.map((z) => ({ ...z, split: { mainSide: 'LEFT', mainWidthMm: 280, fill: 'PULL_OUT' } }));
  const d = P.resolveDraft(d0, WOODS, HW, []);
  const cab = { ...P.draftToNewCabinet(d, { id: 'p', name: 'p', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  const pr = E.priceCabinet(cab, WOODS, HW, []);
  const geo = assemblyGeometry(cab, OPTS);
  const sp = pr.model.layout.bands[0].split;
  assert.equal(sp.main.innerHiMm - sp.main.innerLoMm, 280);
  assert.equal(sp.fill.innerHiMm - sp.fill.innerLoMm, 600 - 36 - 18 - 280);
  assert.equal(geo.facades.length, 2);
  const [a, b] = geo.facades.sort((x, y) => x.xMm - y.xMm);
  assert.equal(a.column, 'MAIN'); assert.equal(b.column, 'FILL');
  assert.ok(a.frame && b.frame);
  assert.ok(a.frame.centerMm[0] + a.frame.sizeMm[0] / 2 <= sp.main.innerHiMm + EPS && b.frame.centerMm[0] - b.frame.sizeMm[0] / 2 >= sp.fill.innerLoMm - EPS, 'a board separates the two frames');
  assert.ok(!pr.issues.some((i) => i.code === 'PULL_OUT_SIDE_BY_SIDE'));
  assert.equal(pr.hardware.find((h) => h.item.id === 'slide').quantity, 2, 'one runner set per basket');
  // each basket's inner runner hangs on the vertical board, the outer ones on the sides
  const parents = buildFasteners(geo, cab, OPTS).filter((f) => f.kind === 'RUNNER').map((f) => f.parent).sort();
  assert.deepEqual(parents, ['side-left', 'side-right', 'vdiv-0', 'vdiv-0']);
  // the main column's baskets carry no fixed shelves (the template asks for 4: they are basket levels)
  assert.ok(!pr.parts.some((p) => /Adjustable Internal Shelf/.test(p.partType)));
});

test('split: shelves follow their column, with one row per width in the cutting list', () => {
  const d0 = LG.draftFromPreset('Deep_Drawers');
  d0.zones = [{ kind: 'DOORS', count: 1, shelves: 2, split: { mainSide: 'LEFT', mainWidthMm: 300, fill: 'DOOR' } }];
  const d = P.resolveDraft(d0, WOODS, HW, []);
  const cab = { ...P.draftToNewCabinet(d, { id: 's', name: 's', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  const pr = E.priceCabinet(cab, WOODS, HW, []);
  const geo = assemblyGeometry(cab, OPTS);
  const rows = pr.parts.filter((p) => /Adjustable Internal Shelf/.test(p.partType));
  assert.equal(rows.length, 2, 'two widths: the doors column and the small-door column');
  assert.deepEqual(rows.map((r) => r.quantity), [2, 2]);
  const shelves = geo.boxes.filter((b) => b.kind === 'shelf');
  assert.equal(shelves.length, 4);
  assert.deepEqual(rows.map((r) => r.lengthMm).sort(), [...new Set(shelves.map((s) => s.sizeMm[0]))].sort(), 'the cutting list and the 3D use the same shelf widths');
  const pins = buildFasteners(geo, cab, OPTS).filter((f) => f.kind === 'SHELF_PIN').map((f) => f.parent);
  assert.ok(pins.includes('vdiv-0') && pins.includes('side-left') && pins.includes('side-right'));
});

test('split: every connector belongs to a part that exists, and the vertical board is bolted at both ends', () => {
  const { geo, cab } = tower(800);
  const fast = buildFasteners(geo, cab, OPTS);
  const keys = new Set([...geo.boxes.map((b) => b.key), ...geo.facades.map(facadeKey)]);
  fast.forEach((f) => assert.ok(keys.has(f.parent), `unknown parent ${f.parent}`));
  fast.forEach((f) => f.centerMm.forEach((n) => assert.ok(Number.isFinite(n))));
  const vd = geo.boxes.find((b) => b.kind === 'vdivider');
  const onBoard = fast.filter((f) => f.parent === vd.key);
  const yBottom = vd.centerMm[1] - vd.sizeMm[1] / 2, yTop = vd.centerMm[1] + vd.sizeMm[1] / 2;
  assert.ok(onBoard.some((f) => f.kind === 'DOWEL' && Math.abs(f.centerMm[1] - yBottom) < EPS) && onBoard.some((f) => f.kind === 'DOWEL' && Math.abs(f.centerMm[1] - yTop) < EPS));
  const off = explodeOffsets(geo, cab, 1);
  assert.ok(off[vd.key]);
  assert.deepEqual(explodeOffsets(geo, cab, 0)[vd.key], [0, 0, 0]);
});

test('split: only a doors or appliance zone can carry a board, and a bad value falls back', () => {
  const d0 = LG.draftFromPreset('Deep_Drawers');
  d0.zones = [{ kind: 'DRAWERS', count: 3, split: { mainSide: 'LEFT' } }, { kind: 'DOORS', count: 2, split: { mainSide: 'SIDEWAYS', mainWidthMm: -5, fill: 'NONSENSE' } }];
  const d = P.resolveDraft(d0, WOODS, HW, []);
  assert.equal(d.zones[0].split, undefined);
  assert.deepEqual(d.zones[1].split, { mainSide: 'LEFT', fill: 'AUTO' });
});

test('split: a small door or a spice rack beside an appliance asks for its own hardware pickers', () => {
  const only = { ...LG.draftFromPreset('Built_In_Appliance'), width: 800 };
  only.zones = [{ kind: 'APPLIANCE', appliance: 'OVEN', heightMm: 595, split: { mainSide: 'LEFT', fill: 'DOOR' } }, { kind: 'OPEN', shelves: 1 }];
  const withDoor = P.resolveDraft(only, WOODS, HW, []);
  assert.equal(withDoor.hardwareItemId, 'hinge');
  assert.equal(withDoor.drawerHardwareItemId, '');
  const rack = P.resolveDraft({ ...only, zones: [{ ...only.zones[0], split: { mainSide: 'LEFT', fill: 'PULL_OUT' } }, only.zones[1]] }, WOODS, HW, []);
  assert.equal(rack.hardwareItemId, '');
  assert.equal(rack.drawerHardwareItemId, 'slide');
  // a cabinet saved with a small door keeps its hinge id through save and edit
  const cab = P.draftToNewCabinet(withDoor, { id: 'x', name: 'x', positionX: 0 });
  assert.equal(cab.frontConfig.hardwareItemId, 'hinge');
  assert.equal(P.cabinetToDraft({ ...cab, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 }).hardwareItemId, 'hinge');
});
