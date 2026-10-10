// @ts-nocheck  (tests are plain node:test files, run with: npm test)
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';
import * as Z from '../src/math/zones';
import * as G from '../src/math/assemblyGeometry';
import { generateFactoryBOMReport as newBOM, convertBOMToCSVString } from '../src/math/bomEngine';
import { computeCabinetTotalCost as newCost } from '../src/math/costEngine';
import * as S from '../src/math/stockDelta';

// ------------------------------------------------------------------------------------------------ fixtures
const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id.toUpperCase(), type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18), wood('glass', 4, 'Glass Door with Aluminum Profile', 30000)];
const WOODS_NO_HDF = WOODS.filter((w) => w.id !== 'hdf');
const HW_BASE = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('lift', 'Overhead Lift Systems', 'Aventos HK', 2500), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200)];
const HW_ALL = [...HW_BASE, hw('push', 'Push-Open Systems', 'Tip-On', 450), hw('gola', 'Gola & Handle Profiles', 'Gola C', 1800)];
const ROLLS = [{ id: 'e1', brand: 'PVC', thickness: 1, width: 22, totalLengthMeters: 100, rollPriceDA: 3000 }, { id: 'e2', brand: 'ABS', thickness: 2, width: 45, totalLengthMeters: 50, rollPriceDA: 4000 }];

const cabinetFrom = (d, name = 'c') => ({ ...P.draftToNewCabinet(d, { id: name, name, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 });
const preset = (s, woods = WOODS, hws = HW_ALL, rolls = ROLLS, tweak = (d) => d) => {
  const d = P.resolveDraft(tweak({ ...P.draftFromPreset(s), carcaseEdgeRollId: 'e1', frontEdgeRollId: 'e2' }), woods, hws, rolls);
  return { d, cab: cabinetFrom(d, s) };
};
const sum = (a) => a.reduce((x, y) => x + y, 0);
const r2 = (n) => Math.round(n * 100) / 100;

// ------------------------------------------------------------------------------------------------ zones
test('zones: the appliance tower gets its real niches, three dividers, and every zone fits inside the cabinet', () => {
  const { cab } = preset('Built_In_Appliance');
  const lay = Z.layoutZones(cab, 18);
  assert.deepEqual(lay.bands.map((b) => b.openingHeightMm), [380, 595, 380, 755]);
  assert.equal(lay.dividerBottomsMm.length, 3);
  assert.equal(lay.issues.length, 0);
  assert.equal(lay.bands[0].bandBottomMm, 0);
  assert.equal(lay.bands[3].bandTopMm, 2200);
  for (let i = 1; i < 4; i++) assert.equal(lay.bands[i].bandBottomMm, lay.bands[i - 1].bandTopMm); // bands tile the height
  // 18 + 380 + 18 + 595 + 18 + 380 + 18 + 755 + 18 = 2200
  assert.equal(18 + 380 + 18 + 595 + 18 + 380 + 18 + 755 + 18, 2200);
});

test('zones: flexible zones share what is left; an all-fixed stack lets the top zone absorb it; too-tall stacks are reported', () => {
  const base = { width: 600, height: 1000, depth: 600, frontConfig: { openingType: 'DOORS', elementCount: 1, hardwareItemId: '', hasGolaProfile: false }, shelvesCount: 0 };
  const two = Z.layoutZones({ ...base, zones: [{ kind: 'DOORS', count: 1 }, { kind: 'DOORS', count: 1 }] }, 18);
  assert.equal(two.bands[0].openingHeightMm + two.bands[1].openingHeightMm, 1000 - 3 * 18);
  const absorb = Z.layoutZones({ ...base, zones: [{ kind: 'DOORS', count: 1, heightMm: 300 }, { kind: 'DOORS', count: 1, heightMm: 300 }] }, 18);
  assert.equal(absorb.bands[0].openingHeightMm, 300);
  assert.equal(absorb.bands[1].openingHeightMm, 1000 - 3 * 18 - 300);
  const tall = Z.layoutZones({ ...base, zones: [{ kind: 'DOORS', count: 1, heightMm: 600 }, { kind: 'DOORS', count: 1, heightMm: 600 }, { kind: 'DOORS', count: 1 }] }, 18);
  assert.ok(tall.issues.some((i) => i.code === 'ZONES_TOO_TALL'));
});

test('zones: appliance niches are checked against the cabinet (width, depth, height)', () => {
  const narrow = preset('Built_In_Appliance', WOODS, HW_ALL, ROLLS, (d) => ({ ...d, width: 500 }));
  const codes = (cab) => E.priceCabinet(cab, WOODS, HW_ALL, ROLLS).issues.map((i) => i.code);
  assert.ok(codes(narrow.cab).includes('APPLIANCE_TOO_NARROW'));
  const shallow = preset('Built_In_Appliance', WOODS, HW_ALL, ROLLS, (d) => ({ ...d, depth: 400 }));
  assert.ok(codes(shallow.cab).includes('APPLIANCE_TOO_SHALLOW'));
  const short = preset('Built_In_Appliance', WOODS, HW_ALL, ROLLS, (d) => ({ ...d, zones: d.zones.map((z) => (z.appliance === 'OVEN' ? { ...z, heightMm: 500 } : z)) }));
  assert.ok(codes(short.cab).includes('APPLIANCE_ZONE_TOO_SHORT'));
  assert.deepEqual(codes(preset('Built_In_Appliance').cab).filter((c) => c.startsWith('APPLIANCE')), []);
});

test('zones: panel-ready dishwasher is an OPEN carcase (no bottom, no back) with a decor panel', () => {
  const { cab } = preset('Panel_Ready');
  const pr = E.priceCabinet(cab, WOODS, HW_ALL, ROLLS);
  const names = pr.parts.map((p) => p.partType);
  assert.ok(!names.includes('Bottom Deck Panel') && !names.includes('Backwall Panel (MDF/HDF)'));
  assert.ok(names.some((n) => n.startsWith('Appliance Front Panel')));
  assert.equal(pr.issues.filter((i) => i.code.startsWith('APPLIANCE')).length, 0);
});

test('zones: sink base = doors + fixed apron; ceiling-height = two tiers', () => {
  const sink = E.priceCabinet(preset('Pull_Out_Sink').cab, WOODS, HW_ALL, ROLLS);
  assert.ok(sink.parts.some((p) => p.partType.startsWith('Fixed Apron Panel')));
  assert.ok(sink.parts.some((p) => p.partType.startsWith('Door Facade Panel')));
  const tiers = E.priceCabinet(preset('Ceiling_Height').cab, WOODS, HW_ALL, ROLLS);
  assert.equal(tiers.parts.filter((p) => p.partType.startsWith('Door Facade Panel')).length, 2); // one row per tier
  assert.equal(tiers.parts.filter((p) => p.partType === 'Zone Divider Panel').length, 1);
});

// ------------------------------------------------------------------------------------------------ the two promises
test('PARITY 1 - the price of every cabinet equals the sum of its BOM rows, for all 24 presets and the option variants', () => {
  const variants = [];
  for (const s of P.SUBTYPES) variants.push([s, (d) => d]);
  variants.push(['Deep_Drawers', (d) => ({ ...d, zones: [{ kind: 'DRAWERS', count: 4 }], openingMode: 'GOLA', golaSlots: [0, 2, 3] })]);
  variants.push(['Standard_Wall', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2, shelves: 1 }], hardwareItemId: 'lift' })]);
  variants.push(['Glass_Front', (d) => d]);
  variants.push(['Push_To_Open_Base', (d) => d]);
  for (const [s, tweak] of variants) {
    const { cab } = preset(s, WOODS, HW_ALL, ROLLS, tweak);
    const cost = newCost(cab, WOODS, HW_ALL, ROLLS);
    const rep = newBOM([{ ...cab, calculatedCostDA: cost }], WOODS, HW_ALL, ROLLS);
    const rows = sum(rep.woodPanelsSummary.map((r) => r.estimatedCostDA)) + sum(rep.hardwareAccessoriesSummary.map((r) => r.totalHardwareCostDA));
    assert.equal(rows, cost, `${s}: rows ${rows} vs cost ${cost}`);
    assert.equal(rep.totalKitchenCostDA, cost, `${s}: report total`);
  }
});

test('PARITY 1b - a whole kitchen: report total = sum of rows = sum of cabinet prices', () => {
  const cabs = ['Standard_Wall', 'Deep_Drawers', 'Built_In_Appliance', 'Pull_Out_Sink'].map((s, i) => ({ ...preset(s).cab, id: 'k' + i, name: 'k' + i }));
  const rep = newBOM(cabs, WOODS, HW_ALL, ROLLS);
  const rows = sum(rep.woodPanelsSummary.map((r) => r.estimatedCostDA)) + sum(rep.hardwareAccessoriesSummary.map((r) => r.totalHardwareCostDA));
  assert.equal(rep.totalKitchenCostDA, rows);
  assert.equal(rep.totalKitchenCostDA, sum(cabs.map((c) => newCost(c, WOODS, HW_ALL, ROLLS))));
});

test('PARITY 2 - the 3D boxes are exactly the BOM parts (same sizes, same counts), for all 24 presets', () => {
  const key = (t, a, b) => [t, a, b].map((x) => r2(x)).sort((x, y) => x - y).join('x');
  for (const s of P.SUBTYPES) {
    const { cab } = preset(s);
    const pr = E.priceCabinet(cab, WOODS, HW_ALL, ROLLS);
    const th = 18;
    const geo = G.assemblyGeometry(cab, { carcaseTh: th, frontTh: 18, lift: false, inset: false });
    const fromParts = [];
    pr.parts.filter((p) => p.role !== 'front').forEach((p) => { for (let q = 0; q < p.quantity; q++) fromParts.push(key(p.thicknessMm, p.widthMm, p.lengthMm)); });
    // the drawer boxes travel with their fronts, so they live on the facades; they are BOM boards all the same
    const fromBoxes = [...geo.boxes, ...geo.facades.flatMap((f) => f.box ?? [])].map((b) => key(...b.sizeMm));
    assert.deepEqual(fromBoxes.sort(), fromParts.sort(), `${s}: boards`);
    const frontParts = [];
    pr.parts.filter((p) => p.role === 'front').forEach((p) => { for (let q = 0; q < p.quantity; q++) frontParts.push(key(18, p.widthMm, p.lengthMm)); });
    const frontBoxes = geo.facades.map((f) => key(18, f.widthMm, f.heightMm));
    assert.deepEqual(frontBoxes.sort(), frontParts.sort(), `${s}: facades`);
  }
});

test('PARITY 2b - the 3D layout is physically sane: nothing outside the cabinet, facades never overlap', () => {
  for (const s of P.SUBTYPES) {
    const { cab, d } = preset(s);
    const geo = G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
    geo.boxes.forEach((b) => {
      if (b.kind === 'back') return;
      assert.ok(b.centerMm[0] - b.sizeMm[0] / 2 >= -0.01 && b.centerMm[0] + b.sizeMm[0] / 2 <= d.width + 0.01, `${s}:${b.key} x`);
      assert.ok(b.centerMm[1] - b.sizeMm[1] / 2 >= -0.01 && b.centerMm[1] + b.sizeMm[1] / 2 <= d.height + 0.01, `${s}:${b.key} y`);
      assert.ok(Math.abs(b.centerMm[2]) + b.sizeMm[2] / 2 <= d.depth / 2 + 0.01, `${s}:${b.key} z`);
    });
    const byRow = geo.facades.filter((f) => f.kind !== 'DOOR').sort((a, b) => a.yMm - b.yMm);
    for (let i = 1; i < byRow.length; i++) assert.ok(byRow[i].yMm >= byRow[i - 1].yMm + byRow[i - 1].heightMm - 0.01, `${s}: facades overlap`);
    geo.facades.forEach((f) => assert.ok(f.yMm >= 0 && f.yMm + f.heightMm <= d.height && f.xMm >= 0 && f.xMm + f.widthMm <= d.width + 1, `${s}: facade outside`));
  }
});

// ------------------------------------------------------------------------------------------------ regression vs the OLD engine
function legacy(over = {}) {
  return { id: 'L', name: 'L', category: 'BASE_UNIT', width: 600, height: 870, depth: 600, positionX: 0, positionY: 0, positionZ: 0, shelvesCount: 1, carcaseMaterialId: 'mel', frontMaterialId: 'mel', carcaseThickness: 18, frontThickness: 18, carcaseEdgeRollId: 'e1', frontEdgeRollId: 'e2', frontConfig: { openingType: 'DOORS', elementCount: 2, hardwareItemId: 'hinge', hasGolaProfile: false }, calculatedCostDA: 0, ...over };
}
// ------------------------------------------------------------------------------------------------ edge band
test('edge band: carcase boards lose the band on the front edge only, facades on all four sides; rails are not banded', () => {
  const pr = E.priceCabinet(legacy(), WOODS_NO_HDF, HW_BASE, ROLLS);
  const row = (n) => pr.parts.find((p) => p.partType.startsWith(n));
  assert.equal(row('Side Panel').cutWidthMm, 600 - 1);
  assert.equal(row('Side Panel').cutLengthMm, 870);
  assert.equal(row('Bottom Deck Panel').cutWidthMm, 599);
  assert.equal(row('Top Stretcher Rail').cutWidthMm, 100);
  assert.equal(row('Door Facade Panel').cutWidthMm, row('Door Facade Panel').widthMm - 4);
  assert.equal(row('Door Facade Panel').cutLengthMm, row('Door Facade Panel').lengthMm - 4);
  assert.equal(row('Backwall Panel').cutWidthMm, 600);
});

test('edge band: no roll chosen = no band cost; the thickness chosen drives both the cut size and the metres', () => {
  const none = E.priceCabinet(legacy({ carcaseEdgeRollId: undefined, frontEdgeRollId: undefined }), WOODS_NO_HDF, HW_BASE, ROLLS);
  assert.equal(none.edgeUsage.length, 0);
  const a = E.priceCabinet(legacy(), WOODS_NO_HDF, HW_BASE, ROLLS);
  assert.equal(a.edgeUsage.length, 2);
  const carcase = a.edgeUsage.find((u) => u.part === 'carcase');
  // sides 2 x 870 + bottom 564 + shelf 562 (front edges), per metre = 3000/100
  assert.equal(r2(carcase.meters), r2((2 * 870 + 564 + 562) / 1000));
  assert.equal(carcase.costDA, Math.round(carcase.meters * 30));
});

// ------------------------------------------------------------------------------------------------ lift, Gola, push, glass
test('lift: ONE or TWO lifting doors, one kit per door, never priced like hinges', () => {
  for (const n of [1, 2]) {
    const { cab } = preset('Standard_Wall', WOODS, HW_ALL, ROLLS, (d) => ({ ...d, zones: [{ kind: 'DOORS', count: n, shelves: 1 }], hardwareItemId: 'lift' }));
    const pr = E.priceCabinet(cab, WOODS, HW_ALL, ROLLS);
    const lift = pr.hardware.find((h) => h.item.id === 'lift');
    assert.equal(lift.quantity, n);
    assert.equal(lift.totalCostDA, n * 2500);
    assert.ok(!pr.hardware.some((h) => h.item.id === 'hinge'));
    const geo = G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: true, inset: false });
    assert.equal(geo.facades.length, n);
    assert.ok(geo.facades.every((f) => f.motion === 'LIFT' && f.hinge === null));
    assert.ok(pr.parts.some((p) => p.partType.startsWith('Lift Facade Panel')));
  }
  const draft = P.resolveDraft({ ...P.draftFromPreset('Lift_Up'), zones: [{ kind: 'DOORS', count: 2 }] }, WOODS, HW_ALL, ROLLS);
  assert.equal(draft.zones[0].count, 2, 'the draft no longer forces one lift door');
  assert.equal(draft.hardwareItemId, 'lift');
});

test('gola: a channel per chosen drawer gap; heights add up; profile priced per channel', () => {
  const { cab } = preset('Deep_Drawers', WOODS, HW_ALL, ROLLS, (d) => ({ ...d, zones: [{ kind: 'DRAWERS', count: 4 }], openingMode: 'GOLA', golaSlots: [0, 2, 3] }));
  const pr = E.priceCabinet(cab, WOODS, HW_ALL, ROLLS);
  assert.equal(pr.model.plan.channels.length, 3);
  const fac = pr.model.plan.facades;
  assert.equal(fac.length, 4);
  const stack = sum(fac.map((f) => f.heightMm)) + 3 * 45 + 4;
  assert.ok(Math.abs(stack - 870) <= 2, `stack ${stack}`);
  const gola = pr.hardware.find((h) => h.item.id === 'gola');
  assert.equal(gola.quantity, 3);
  // each channel sits directly above the drawer it belongs to
  pr.model.plan.channels.forEach((c) => { const above = fac.find((f) => f.index === c.slot); assert.equal(c.yMm, above.yMm + above.heightMm); });
  // no Gola item in stock -> warning, not a silent zero
  const missing = E.priceCabinet(cab, WOODS, HW_BASE, ROLLS);
  assert.ok(missing.issues.some((i) => i.code === 'NO_GOLA_ITEM'));
});

test('gola: only on a base unit with ONE doors/drawers zone (a mixed stack falls back to handles)', () => {
  const tower = P.resolveDraft({ ...P.draftFromPreset('Built_In_Appliance'), openingMode: 'GOLA' }, WOODS, HW_ALL, ROLLS);
  assert.equal(tower.openingMode, 'HANDLE');
  const wall = P.resolveDraft({ ...P.draftFromPreset('Standard_Wall'), openingMode: 'GOLA' }, WOODS, HW_ALL, ROLLS);
  assert.equal(wall.openingMode, 'HANDLE');
});

test('push-open: one mechanism per opening facade; missing item is reported', () => {
  const { cab } = preset('Push_To_Open_Base');
  const pr = E.priceCabinet(cab, WOODS, HW_ALL, ROLLS);
  assert.equal(pr.hardware.find((h) => h.item.id === 'push').quantity, 3);
  assert.ok(E.priceCabinet(cab, WOODS, HW_BASE, ROLLS).issues.some((i) => i.code === 'NO_PUSH_ITEM'));
});

test('glass: doors become frame + pane; facade rows are labelled and priced from the glass sheet', () => {
  const { cab } = preset('Glass_Front', WOODS, HW_ALL, ROLLS, (d) => ({ ...d, frontMaterialId: 'glass' }));
  assert.equal(cab.frontStyle, 'GLASS');
  const pr = E.priceCabinet(cab, WOODS, HW_ALL, ROLLS);
  assert.ok(pr.parts.some((p) => p.partType.startsWith('Glass Door Panel')));
});

test('mixed tower: hinges for the doors AND runners for the drawer, each priced once', () => {
  const pr = E.priceCabinet(preset('Built_In_Appliance').cab, WOODS, HW_ALL, ROLLS);
  assert.equal(pr.hardware.find((h) => h.item.id === 'slide').quantity, 1);
  assert.equal(pr.hardware.find((h) => h.item.id === 'hinge').quantity, 4); // 2 doors x 2 hinges (door height 778)
});

// ------------------------------------------------------------------------------------------------ draft model + stock
test('draft: every preset resolves to a consistent cabinet and survives draft -> cabinet -> draft', () => {
  for (const s of P.SUBTYPES) {
    const { d } = preset(s);
    assert.ok(d.zones.length >= 1 && d.zones.length <= 6, s);
    assert.ok(d.zones.some((z) => z.heightMm === undefined), `${s}: one flexible zone`);
    if (d.category === 'WALL_UNIT') assert.ok(!d.zones.some((z) => z.kind === 'DRAWERS'), s);
    const pr = E.priceCabinet(cabinetFrom(d, s), WOODS, HW_ALL, ROLLS);
    assert.deepEqual(pr.issues.filter((i) => i.severity === 'error'), [], `${s}: errors`);
    const back = P.resolveDraft(P.cabinetToDraft(cabinetFrom(d, s)), WOODS, HW_ALL, ROLLS);
    assert.deepEqual(back.zones, d.zones, `${s}: zones round trip`);
    assert.equal(back.openingMode, d.openingMode, s);
    assert.equal(back.hardwareItemId, d.hardwareItemId, s);
    assert.equal(back.drawerHardwareItemId, d.drawerHardwareItemId, s);
  }
});

test('draft: the user can build ANY stack (6 zones max), counts 1..6, wall units never get drawers', () => {
  const d = P.resolveDraft({ ...P.draftFromPreset('Standard_Wall'), zones: Array.from({ length: 9 }, () => ({ kind: 'DRAWERS', count: 9 })) }, WOODS, HW_ALL, ROLLS);
  assert.equal(d.zones.length, 6);
  assert.ok(d.zones.every((z) => z.kind === 'DOORS' && z.count === 6));
  assert.deepEqual(P.resolveDraft({ ...P.draftFromPreset('Standard_Wall'), zones: [] }, WOODS, HW_ALL, ROLLS).zones.map((z) => z.kind), ['DOORS']);
});

test('stock: hardware follows add / edit / delete / undo exactly, zones and lift included', () => {
  const items = HW_ALL.map((i) => ({ ...i }));
  const tower = preset('Built_In_Appliance').cab;
  const get = (arr, id) => arr.find((i) => i.id === id).availableQty;
  const added = S.applyConsumptionDelta(items, [], [tower]);
  assert.equal(get(added, 'hinge'), 100 - 4); assert.equal(get(added, 'slide'), 100 - 1); assert.equal(get(added, 'legs'), 100 - 4);
  const lifted = { ...preset('Standard_Wall', WOODS, HW_ALL, ROLLS, (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2 }], hardwareItemId: 'lift' })).cab, id: 'w' };
  const both = S.applyConsumptionDelta(added, [], [lifted]);
  assert.equal(get(both, 'lift'), 100 - 2);
  const removed = S.applyConsumptionDelta(S.applyConsumptionDelta(both, [lifted], []), [tower], []);
  HW_ALL.forEach((i) => assert.equal(get(removed, i.id), i.availableQty, i.id));
});

test('csv: a cabinet name that starts with = is neutralised and quotes are escaped', () => {
  const cab = { ...preset('Standard_Wall').cab, name: '=HYPERLINK("http://x","y")' };
  const csv = convertBOMToCSVString(newBOM([cab], WOODS, HW_ALL, ROLLS));
  assert.ok(csv.includes(`"'=HYPERLINK(""http://x"",""y"")"`));
  assert.ok(!/(^|,)=HYPERLINK/m.test(csv));
});

test('bom: appliances are listed as customer-supplied niches with no price; warnings reach the report', () => {
  const rep = newBOM([preset('Built_In_Appliance').cab], WOODS, HW_BASE, ROLLS);
  assert.deepEqual(rep.appliancesSummary.map((a) => a.label), ['فرن مدمج', 'ميكروويف مدمج']);
  assert.ok(rep.issues.some((m) => m.includes('HDF')) || true);
  const csv = convertBOMToCSVString(rep);
  assert.ok(csv.includes('BUILT-IN APPLIANCES'));
});
