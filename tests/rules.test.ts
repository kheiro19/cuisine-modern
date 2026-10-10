// @ts-nocheck  (tests are plain node:test files, run with: npm test)
// حرّاس طبقة القواعد (src/rules): إن كسر تعديلٌ قاعدةً، يفشل هنا بدل أن يظهر في السعر أو الرسم.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as R from '../src/rules';
import { LIMITS } from '../src/math/constants';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';
import * as G from '../src/math/assemblyGeometry';
import { buildFasteners } from '../src/math/fasteners';
import * as Z from '../src/math/zones';

const templates = Object.entries(R.TEMPLATES);

test('families: four families, each with templates, and every template carries a valid family', () => {
  assert.deepEqual(R.FAMILY_ORDER.slice().sort(), ['BASE', 'BUILT_IN', 'CORNER', 'WALL']);
  for (const f of R.FAMILY_ORDER) assert.ok(R.templatesOf(f).length > 0, `${f}: no templates`);
  for (const [key, t] of templates) assert.ok(R.FAMILIES[t.family], `${key}: unknown family`);
  assert.equal(templates.length, 24, 'the 24 ready templates are all still registered');
});

test('families: every kinematic a family lists exists, and a MODELLED one accepts the family category', () => {
  for (const f of Object.values(R.FAMILIES)) {
    for (const id of f.kinematics) {
      const k = R.KINEMATICS[id];
      assert.ok(k, `${f.id}: unknown kinematic ${id}`);
      if (k.status === 'MODELLED') assert.ok(k.categories.includes(f.category), `${f.id}: ${id} is not allowed for ${f.category}`);
    }
  }
});

test('kinematics: a MODELLED mechanism has stock category + quantity rule; a PLANNED one has no quantity rule yet', () => {
  for (const k of Object.values(R.KINEMATICS)) {
    assert.equal(k.id in R.KINEMATICS, true);
    if (k.status === 'MODELLED') {
      assert.ok(k.hardwareCategory, `${k.id}: no hardware category`);
      assert.equal(typeof k.quantity, 'function', `${k.id}: no quantity rule`);
    } else {
      assert.equal(k.quantity, undefined, `${k.id}: PLANNED but already has a quantity rule: mark it MODELLED`);
    }
  }
});

test('templates: a template that waits for a PLANNED mechanism always says so (never hidden), and dims fit the limits', () => {
  for (const [key, t] of templates) {
    if (t.kinematic) {
      assert.ok(R.KINEMATICS[t.kinematic], `${key}: unknown kinematic ${t.kinematic}`);
      if (R.KINEMATICS[t.kinematic].status === 'PLANNED') assert.ok(t.note && t.note.length > 0, `${key}: waits for ${t.kinematic} but has no note`);
    }
    assert.ok(t.dims.width >= LIMITS.WIDTH_MM[0] && t.dims.width <= LIMITS.WIDTH_MM[1], `${key}: width`);
    assert.ok(t.dims.height >= LIMITS.HEIGHT_MM[0] && t.dims.height <= LIMITS.HEIGHT_MM[1], `${key}: height`);
    assert.ok(t.dims.depth >= LIMITS.DEPTH_MM[0] && t.dims.depth <= LIMITS.DEPTH_MM[1], `${key}: depth`);
    assert.ok(t.zones.length >= 1 && t.zones.length <= LIMITS.ZONES[1], `${key}: zones count`);
    if (t.category === 'WALL_UNIT') assert.ok(!t.zones.some((z) => z.kind === 'DRAWERS'), `${key}: drawers in a wall unit`);
  }
});

test('kinematics: stock categories that drive doors / drawers, per cabinet category', () => {
  assert.deepEqual(R.hardwareCategoriesFor('DOOR', 'WALL_UNIT'), ['Cabinet Hinges', 'Overhead Lift Systems']);
  assert.deepEqual(R.hardwareCategoriesFor('DOOR', 'BASE_UNIT'), ['Cabinet Hinges']);
  assert.deepEqual(R.hardwareCategoriesFor('DOOR'), ['Cabinet Hinges', 'Overhead Lift Systems']);
  assert.deepEqual(R.hardwareCategoriesFor('DRAWER'), ['Drawer Slide Systems']);
});

test('kinematics: quantity rules (hinges by door height, one lift kit per door, one runner set per drawer)', () => {
  const hinge = { category: 'Cabinet Hinges' }, lift = { category: 'Overhead Lift Systems' }, slide = { category: 'Drawer Slide Systems' };
  assert.equal(R.frontHardwareQuantity(hinge, [{ heightMm: 700 }, { heightMm: 1800 }]), 2 + 4);
  assert.equal(R.frontHardwareQuantity(lift, [{ heightMm: 700 }, { heightMm: 700 }]), 2);
  assert.equal(R.frontHardwareQuantity(slide, [{ heightMm: 200 }, { heightMm: 200 }, { heightMm: 200 }]), 3);
  assert.equal(R.frontHardwareQuantity(undefined, [{ heightMm: 700 }]), 0);
  assert.equal(R.motionOf('DOOR'), 'SWING');
  assert.equal(R.motionOf('DOOR', { lift: true }), 'LIFT');
  assert.equal(R.motionOf('DRAWER'), 'SLIDE');
  assert.equal(R.motionOf('APRON'), 'FIXED');
});

test('openings: Gola only on an allowed category with ONE doors / drawers zone; no fronts = handle', () => {
  const one = (kind) => [{ kind }];
  assert.equal(R.canUseGola('BASE_UNIT', one('DRAWERS')), true);
  assert.equal(R.canUseGola('BASE_UNIT', one('DOORS')), true);
  assert.equal(R.canUseGola('BASE_UNIT', one('OPEN')), false);
  assert.equal(R.canUseGola('BASE_UNIT', [{ kind: 'DOORS' }, { kind: 'DRAWERS' }]), false);
  assert.equal(R.canUseGola('WALL_UNIT', one('DOORS')), false);
  assert.equal(R.canUseGola('BASE_UNIT', []), false);
  assert.equal(R.resolveOpeningMode('GOLA', 'WALL_UNIT', one('DOORS')), 'HANDLE');
  assert.equal(R.resolveOpeningMode('GOLA', 'BASE_UNIT', one('DRAWERS')), 'GOLA');
  assert.equal(R.resolveOpeningMode('PUSH', 'BASE_UNIT', one('OPEN')), 'HANDLE');
  assert.equal(R.resolveOpeningMode(undefined, 'BASE_UNIT', one('DOORS')), 'HANDLE');
  assert.equal(R.openingModeOf({ frontConfig: { hasGolaProfile: true } }), 'GOLA');
  assert.equal(R.openingModeOf({ openingMode: 'PUSH', frontConfig: { hasGolaProfile: true } }), 'PUSH');
});

test('construction: base = rails + legs, wall = roof + hanger plates', () => {
  assert.equal(R.constructionOf('BASE_UNIT').top, 'RAILS');
  assert.equal(R.constructionOf('BASE_UNIT').fixing.group, 'Base Fixing System');
  assert.equal(R.constructionOf('WALL_UNIT').top, 'ROOF');
  assert.equal(R.constructionOf('WALL_UNIT').fixing.group, 'Wall Fixing System');
});

// ---- zone.kinematic: the optional field on a zone
const wood = (id, th) => ({ id, brand: id, type: id === 'hdf' ? 'HDF Standard 3mm' : 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const resolve = (subtype, mutate = (d) => d) => P.resolveDraft(mutate({ ...P.draftFromPreset(subtype) }), WOODS, [], []);

test('zone kinematic: default comes from the zone kind unless declared', () => {
  assert.equal(R.kinematicOfZone({ kind: 'DOORS' }), 'SWING');
  assert.equal(R.kinematicOfZone({ kind: 'DOORS' }, { lift: true }), 'LIFT');
  assert.equal(R.kinematicOfZone({ kind: 'DRAWERS' }), 'SLIDE');
  assert.equal(R.kinematicOfZone({ kind: 'OPEN' }), undefined);
  assert.equal(R.kinematicOfZone({ kind: 'DOORS', kinematic: 'PULL_OUT_FRAME' }), 'PULL_OUT_FRAME');
});

test('zone kinematic: accepted only for a zone kind and cabinet category the mechanism allows; junk is dropped', () => {
  assert.equal(R.validKinematic('PULL_OUT_FRAME', 'DRAWERS', 'BASE_UNIT'), 'PULL_OUT_FRAME');
  assert.equal(R.validKinematic('PULL_OUT_FRAME', 'DOORS', 'BASE_UNIT'), 'PULL_OUT_FRAME');
  assert.equal(R.validKinematic('SLIDE', 'DOORS', 'BASE_UNIT'), undefined);
  assert.equal(R.validKinematic('LIFT', 'DOORS', 'BASE_UNIT'), undefined);
  // swing / lift / slide are decided by the hardware item chosen for the cabinet, never declared on a zone
  assert.equal(R.validKinematic('LIFT', 'DOORS', 'WALL_UNIT'), undefined);
  assert.equal(R.validKinematic('SWING', 'DOORS', 'BASE_UNIT'), undefined);
  assert.equal(R.validKinematic('POCKET_FOLD', 'DOORS', 'WALL_UNIT'), 'POCKET_FOLD');
  assert.equal(R.validKinematic('ROTARY', 'DOORS', 'WALL_UNIT'), undefined);
  assert.equal(R.validKinematic('NOPE', 'DOORS', 'BASE_UNIT'), undefined);
  assert.equal(R.validKinematic('toString', 'DOORS', 'BASE_UNIT'), undefined);
  assert.equal(R.validKinematic(undefined, 'DOORS', 'BASE_UNIT'), undefined);
});

test('zone kinematic: templates write their mechanism on the zones it moves, others stay untouched', () => {
  assert.equal(R.TEMPLATES.Tall_Pantry_Cargo.zones[0].kinematic, 'PULL_OUT_FRAME');
  assert.equal(R.TEMPLATES.Cargo_Pull_Out.zones[0].kinematic, 'PULL_OUT_FRAME');
  assert.equal(R.TEMPLATES.Lift_Up.zones[0].kinematic, undefined, 'lift is chosen by the hardware item, not stamped on the zone');
  assert.equal(R.TEMPLATES.Standard_Wall.zones[0].kinematic, undefined);
  assert.equal(R.TEMPLATES.Built_In_Appliance.zones.some((z) => z.kinematic), false);
});

test('zone kinematic: resolveDraft keeps a valid declaration and drops an invalid one (old cabinets have none)', () => {
  assert.equal(resolve('Tall_Pantry_Cargo').zones[0].kinematic, 'PULL_OUT_FRAME');
  assert.equal(resolve('Standard_Wall').zones[0].kinematic, undefined);
  assert.equal(resolve('Tall_Pantry_Cargo', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2, kinematic: 'SLIDE' }] })).zones[0].kinematic, undefined);
  assert.equal(resolve('Standard_Wall', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2, kinematic: 'CORNER_TRAYS' }] })).zones[0].kinematic, undefined);
  assert.equal(resolve('Standard_Wall', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2, kinematic: 'LIFT' }] })).zones[0].kinematic, undefined);
  assert.equal(resolve('Standard_Wall', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 1, kinematic: 'POCKET_FOLD' }] })).zones[0].kinematic, 'POCKET_FOLD');
  // changing the zone to a kind the mechanism cannot move removes it
  assert.equal(resolve('Cargo_Pull_Out', (d) => ({ ...d, zones: [{ kind: 'OPEN', shelves: 2, kinematic: 'PULL_OUT_FRAME' }] })).zones[0].kinematic, undefined);
});

// ---- PULL_OUT_FRAME (basket frame on full-extension runners)
const hw = (id, category, modelType = 'x', price = 300) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: 100 });
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('lift', 'Overhead Lift Systems', 'Aventos'), hw('slide', 'Drawer Slide Systems', 'Tandem', 900), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 100), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('pin', 'Assembly & Fixing', 'Shelf Support Pin', 2)];
const cabinetOf = (subtype, mutate = (d) => d) => {
  const d = P.resolveDraft(mutate({ ...P.draftFromPreset(subtype) }), WOODS, HW, []);
  return { d, cab: { ...P.draftToNewCabinet(d, { id: subtype, name: subtype, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 } };
};

test('pull-out: a zone mechanism wins for its facades, otherwise doors swing / lift and drawers slide', () => {
  assert.equal(R.effectiveKinematic({ kind: 'DOOR' }), 'SWING');
  assert.equal(R.effectiveKinematic({ kind: 'DOOR' }, { lift: true }), 'LIFT');
  assert.equal(R.effectiveKinematic({ kind: 'DRAWER' }), 'SLIDE');
  assert.equal(R.effectiveKinematic({ kind: 'DOOR', kinematic: 'PULL_OUT_FRAME' }, { lift: true }), 'PULL_OUT_FRAME');
  assert.equal(R.effectiveKinematic({ kind: 'DOOR', kinematic: 'ROTARY' }), 'SWING', 'a PLANNED mechanism does not change the engines yet');
  assert.equal(R.effectiveKinematic({ kind: 'APRON' }), undefined);
  assert.equal(R.motionOf('DOOR', { kinematic: 'PULL_OUT_FRAME' }), 'PULL_OUT');
  assert.equal(R.motionOf('DRAWER', { kinematic: 'PULL_OUT_FRAME' }), 'PULL_OUT');
  assert.equal(R.hardwareKindOfZone({ kind: 'DOORS' }), 'DOOR');
  assert.equal(R.hardwareKindOfZone({ kind: 'DOORS', kinematic: 'PULL_OUT_FRAME' }), 'DRAWER', 'pull-out doors want runners, not hinges');
  assert.equal(R.hardwareKindOfZone({ kind: 'DRAWERS', kinematic: 'PULL_OUT_FRAME' }), 'DRAWER');
  assert.equal(R.hardwareKindOfZone({ kind: 'OPEN' }), undefined);
  // the picker for doors still offers only hinges / lift: a pull-out set is never offered as a hinge
  assert.deepEqual(R.hardwareCategoriesFor('DOOR'), ['Cabinet Hinges', 'Overhead Lift Systems']);
  assert.equal(R.kinematicOfHardware({ category: 'Drawer Slide Systems' }).id, 'SLIDE');
});

test('pull-out: one runner set per front, no hinges, no fixed shelves, and the price is the rows', () => {
  for (const s of ['Tall_Pantry_Cargo', 'Tandem_Pantry', 'Cargo_Pull_Out']) {
    const { d, cab } = cabinetOf(s);
    assert.equal(R.TEMPLATES[s].zones[0].kinematic, 'PULL_OUT_FRAME');
    assert.equal(d.hardwareItemId, '', `${s}: no hinge picked for pull-out fronts`);
    assert.equal(d.drawerHardwareItemId, 'slide', `${s}: the runner picker is filled`);
    const reqs = E.hardwareRequirements(cab, HW);
    const fronts = E.priceCabinet(cab, WOODS, HW, []).model.plan.facades.length;
    assert.equal(reqs.find((r) => r.item.id === 'slide')?.quantity, fronts, `${s}: one set per front`);
    assert.equal(reqs.find((r) => r.item.id === 'hinge'), undefined, `${s}: no hinges`);
    const priced = E.priceCabinet(cab, WOODS, HW, []);
    assert.equal(priced.parts.some((p) => /Adjustable Internal Shelf/.test(p.partType)), false, `${s}: baskets replace fixed shelves`);
    assert.equal(G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }).boxes.some((b) => b.kind === 'shelf'), false);
    assert.equal(priced.issues.filter((i) => /PULL_OUT/.test(i.code)).length, 0, `${s}: a clean template has no pull-out warnings`);
    assert.equal(priced.hardwareCostDA, priced.hardware.reduce((sum, h) => sum + h.totalCostDA, 0));
  }
  // a normal drawers cabinet keeps its runner count; a doors-only cabinet keeps its hinges
  assert.equal(E.hardwareRequirements(cabinetOf('Deep_Drawers').cab, HW).find((r) => r.item.id === 'slide').quantity, 2);
  assert.ok(E.hardwareRequirements(cabinetOf('Standard_Wall').cab, HW).find((r) => r.item.id === 'hinge').quantity > 0);
});

test('pull-out: the frame sits inside the carcase, behind its front, between the runners', () => {
  for (const s of ['Tall_Pantry_Cargo', 'Cargo_Pull_Out']) {
    const { cab } = cabinetOf(s);
    const geo = G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
    const f = geo.facades[0];
    assert.equal(f.motion, 'PULL_OUT');
    assert.equal(f.hinge, null);
    const [w, h, d] = f.frame.sizeMm, [cx, cy, cz] = f.frame.centerMm;
    assert.ok(cx - w / 2 >= 18 && cx + w / 2 <= cab.width - 18, `${s}: frame between the sides`);
    assert.ok(cy - h / 2 >= 18 && cy + h / 2 <= f.yMm + f.heightMm, `${s}: frame within the front height`);
    assert.ok(cz + d / 2 < f.zMm - 9, `${s}: frame behind the front`);
    assert.ok(cz - d / 2 >= -cab.depth / 2, `${s}: frame inside the depth`);
    assert.equal(f.frame.levels, s === 'Cargo_Pull_Out' ? 3 : 4, `${s}: levels = shelves (3 by default for a drawers zone)`);
    const runners = buildFasteners(geo, cab, { carcaseTh: 18, frontTh: 18 }).filter((x) => x.kind === 'RUNNER');
    assert.equal(runners.length, 2);
    assert.ok(runners.every((r) => r.centerMm[0] < cx - w / 2 || r.centerMm[0] > cx + w / 2), `${s}: runners outside the frame`);
  }
});

test('pull-out: limits warn (width, depth, side-by-side fronts) once per code and never block', () => {
  const codes = (subtype, mutate) => { const { cab } = cabinetOf(subtype, mutate); return E.priceCabinet(cab, WOODS, HW, []).issues.map((i) => i.code).filter((c) => /PULL_OUT/.test(c)); };
  assert.deepEqual(codes('Cargo_Pull_Out', (d) => ({ ...d, width: 120 })), ['PULL_OUT_FRONT_WIDTH']);
  assert.deepEqual(codes('Cargo_Pull_Out', (d) => ({ ...d, width: 700 })), ['PULL_OUT_FRONT_WIDTH']);
  assert.deepEqual(codes('Cargo_Pull_Out', (d) => ({ ...d, depth: 400 })), ['PULL_OUT_DEPTH']);
  assert.deepEqual(codes('Tall_Pantry_Cargo', (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2, shelves: 4, kinematic: 'PULL_OUT_FRAME' }] })), ['PULL_OUT_SIDE_BY_SIDE']);
  assert.deepEqual(codes('Standard_Wall'), []);
});

// ---- 1 mm between two doors, modern line
const doorsOf = (width, count) => {
  const cab = { width, height: 720, depth: 350, category: 'WALL_UNIT', zones: [{ kind: 'DOORS', count }], frontConfig: { openingType: 'DOORS', elementCount: count, hasGolaProfile: false }, shelvesCount: 0 };
  return Z.planFronts(cab, Z.layoutZones(cab, 18)).facades;
};

test('doors: each door loses 0.5 mm per shared edge, so there is exactly 1 mm between neighbours', () => {
  for (const width of [300, 450, 500, 599, 600, 601, 800, 900, 1000, 1200]) {
    for (let count = 1; count <= 6; count++) {
      const f = doorsOf(width, count);
      assert.equal(f.length, count);
      f.forEach((d) => assert.ok(Number.isInteger(d.widthMm * 2), `${width}/${count}: widths are multiples of 0.5 mm`));
      for (let k = 1; k < count; k++) assert.equal(f[k].xMm - (f[k - 1].xMm + f[k - 1].widthMm), 1, `${width}/${count}: 1 mm between doors`);
      const left = f[0].xMm, right = width - (f[count - 1].xMm + f[count - 1].widthMm);
      if (count === 1) assert.deepEqual([left, right, f[0].widthMm], [0.5, 0.5, width - 1], `${width}: a lone door loses 1 mm`);
      else assert.deepEqual([left, right], [0, 0], `${width}/${count}: the row is flush with the carcase sides`);
    }
  }
  assert.deepEqual(doorsOf(600, 2).map((d) => [d.widthMm, d.xMm]), [[299.5, 0], [299.5, 300.5]]);
  assert.deepEqual(doorsOf(600, 3).map((d) => d.widthMm), [199.5, 199, 199.5], 'the middle door loses 0.5 on each side');
  assert.deepEqual(doorsOf(900, 2).map((d) => d.widthMm), [449.5, 449.5]);
  assert.deepEqual(doorsOf(600, 1).map((d) => [d.widthMm, d.xMm]), [[599, 0.5]]);
});

test('drawers: 1 mm between two drawers (0.5 mm each), the Gola channel is the gap where there is one', () => {
  const drawersOf = (count, mutate = (d) => d) => cabinetOf('Deep_Drawers', (d) => mutate({ ...d, zones: [{ kind: 'DRAWERS', count }] })).cab;
  for (let count = 1; count <= 6; count++) {
    const cab = drawersOf(count);
    const f = Z.planFronts(cab, Z.layoutZones(cab, 18)).facades.filter((x) => x.kind === 'DRAWER').sort((a, b) => a.yMm - b.yMm);
    assert.equal(f.length, count);
    for (let k = 1; k < count; k++) assert.equal(f[k].yMm - (f[k - 1].yMm + f[k - 1].heightMm), 1, `${count} drawers: 1 mm between drawers`);
    const lay = Z.layoutZones(cab, 18), plan = Z.planFronts(cab, lay);
    const total = f.reduce((sum, x) => sum + x.heightMm, 0);
    const extent = f[count - 1].yMm + f[count - 1].heightMm - f[0].yMm;
    assert.equal(extent, total + (count - 1), `${count} drawers: heights + 1 mm gaps fill the stack`);
    assert.ok(plan.facades.every((x) => Number.isInteger(x.heightMm * 2)), 'multiples of 0.5 mm');
  }
  assert.deepEqual(drawersOf(2) && (() => { const cab = drawersOf(2); return Z.planFronts(cab, Z.layoutZones(cab, 18)).facades.map((x) => x.heightMm); })(), [432.5, 432.5]);
  const g = drawersOf(3, (d) => ({ ...d, openingMode: 'GOLA', golaSlots: [2] }));
  const f = Z.planFronts(g, Z.layoutZones(g, 18)).facades.sort((a, b) => a.yMm - b.yMm);
  assert.equal(f[1].yMm - (f[0].yMm + f[0].heightMm), 45, 'the channel is the gap under the second drawer');
  assert.equal(f[2].yMm - (f[1].yMm + f[1].heightMm), 1, 'no channel there: 1 mm');
});

// ---- drawer box boards
const pricedOf = (subtype, mutate) => { const { cab } = cabinetOf(subtype, mutate); return { cab, priced: E.priceCabinet(cab, WOODS, HW, []) }; };
const rowOf = (priced, start) => priced.parts.find((p) => p.partType.startsWith(start));

test('drawer box: four BOM rows with the runner clearance, the carcase board and the HDF bottom', () => {
  const { cab, priced } = pricedOf('Deep_Drawers');            // 600 x 870 x 600, two drawers
  const fronts = priced.model.plan.facades;
  const h = fronts[0].heightMm - 70;
  const side = rowOf(priced, 'Drawer Box Side'), inner = rowOf(priced, 'Drawer Box Inner Front'), back = rowOf(priced, 'Drawer Box Back'), bottom = rowOf(priced, 'Drawer Box Bottom');
  assert.deepEqual([side.quantity, inner.quantity, back.quantity, bottom.quantity], [4, 2, 2, 2]);
  assert.deepEqual([side.widthMm, side.lengthMm, side.thicknessMm], [h, 550, 18]);              // height x runner length
  assert.deepEqual([inner.widthMm, inner.lengthMm], [h, 600 - 36 - 26 - 36]);                   // between the sides
  assert.deepEqual([bottom.widthMm, bottom.lengthMm, bottom.thicknessMm, bottom.role], [600 - 36 - 26, 550, 3, 'back']);
  assert.equal(side.role, 'carcase');
  assert.ok(side.boardCostDA > 0 && bottom.boardCostDA > 0, 'every box row is priced');
});

test('drawer box: only drawers on runners get one (not doors, not pull-out frames), one set per drawer', () => {
  for (const s of ['Standard_Wall', 'Cargo_Pull_Out', 'Tall_Pantry_Cargo', 'Pull_Out_Sink']) assert.equal(pricedOf(s).priced.parts.some((p) => /Drawer Box/.test(p.partType)), false, s);
  const { priced } = pricedOf('Built_In_Appliance');          // drawers(1) + appliances + doors
  assert.equal(rowOf(priced, 'Drawer Box Back').quantity, 1);
  const mixed = pricedOf('Deep_Drawers', (d) => ({ ...d, zones: [{ kind: 'DRAWERS', count: 3 }] }));
  assert.equal(rowOf(mixed.priced, 'Drawer Box Back').quantity, 3);
});

test('drawer box: the HDF bottom is priced from the back-panel sheet and the price still equals the rows', () => {
  const { priced } = pricedOf('Deep_Drawers');
  const bottom = rowOf(priced, 'Drawer Box Bottom');
  assert.equal(bottom.material.id, 'hdf', 'the bottom is cut from the 3 mm sheet');
  assert.equal(rowOf(priced, 'Drawer Box Side').material.id, 'mel', 'sides are cut from the carcase board');
  assert.equal(priced.totalDA, priced.woodCostDA + priced.edgeCostDA + priced.hardwareCostDA);
  assert.equal(priced.woodCostDA, priced.parts.reduce((sum, p) => sum + p.boardCostDA, 0));
});

test('drawer box: the boxes sit inside the carcase between the runners, behind their fronts, without touching each other', () => {
  for (const s of ['Deep_Drawers', 'Built_In_Appliance', 'Push_To_Open_Base']) {
    const { cab } = cabinetOf(s);
    const geo = G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
    const drawers = geo.facades.filter((f) => f.motion === 'SLIDE');
    assert.ok(drawers.length > 0 && drawers.every((f) => f.box && f.box.length === 5), s);
    drawers.forEach((f) => f.box.forEach((b) => {
      const [x, y, z] = b.centerMm, [w, h, d] = b.sizeMm;
      assert.ok(x - w / 2 >= 18 + 13 - 0.01 && x + w / 2 <= cab.width - 18 - 13 + 0.01, `${s}:${b.key} between the runners`);
      assert.ok(y - h / 2 >= f.yMm - 0.01 && y + h / 2 <= f.yMm + f.heightMm + 0.01, `${s}:${b.key} within its front`);
      assert.ok(z + d / 2 <= f.zMm - 9 + 0.01 && z - d / 2 >= -cab.depth / 2 - 0.01, `${s}:${b.key} behind the front, inside the depth`);
    }));
    const rows = drawers.map((f) => [f.yMm + 30, f.yMm + 30 + f.box[0].sizeMm[1]]).sort((a, b) => a[0] - b[0]);
    for (let i = 1; i < rows.length; i++) assert.ok(rows[i][0] >= rows[i - 1][1], `${s}: boxes overlap`);
  }
});

test('drawer box: a front too low for a box is reported once, and never blocks', () => {
  const low = pricedOf('Deep_Drawers', (d) => ({ ...d, height: 400, zones: [{ kind: 'DRAWERS', count: 6 }] }));
  assert.equal(low.priced.issues.filter((i) => i.code === 'DRAWER_BOX_TOO_LOW').length, 1);
  assert.equal(pricedOf('Deep_Drawers').priced.issues.some((i) => i.code === 'DRAWER_BOX_TOO_LOW'), false);
});

// ---- stacked zones: 1 mm between their fronts, one shared divider or two glued boards
const stacked = (boards, zones = [{ kind: 'DRAWERS', count: 2 }, { kind: 'DOORS', count: 2 }]) => cabinetOf('Deep_Drawers', (d) => ({ ...d, zones, dividerBoards: boards })).cab;

test('zones: the fronts of two stacked zones are 1 mm apart (0.5 mm each), centred on the middle of the divider, with one or two boards', () => {
  for (const boards of [1, 2]) {
    for (const zones of [[{ kind: 'DRAWERS', count: 2 }, { kind: 'DOORS', count: 2 }], [{ kind: 'DOORS', count: 2 }, { kind: 'DOORS', count: 1 }], [{ kind: 'DRAWERS', count: 1 }, { kind: 'DRAWERS', count: 3 }, { kind: 'DOORS', count: 2 }]]) {
      const cab = stacked(boards, zones);
      const lay = Z.layoutZones(cab, 18), plan = Z.planFronts(cab, lay);
      for (let i = 1; i < zones.length; i++) {
        const below = plan.facades.filter((f) => f.zoneIndex === i - 1), above = plan.facades.filter((f) => f.zoneIndex === i);
        const top = Math.max(...below.map((f) => f.yMm + f.heightMm)), bottom = Math.min(...above.map((f) => f.yMm));
        assert.equal(bottom - top, 1, `${boards} board(s), zone ${i}: 1 mm between the zones' fronts`);
        const mid = lay.bands[i].bandBottomMm;                                  // the middle of the divider
        assert.equal(mid - top, 0.5, 'half the gap under the middle');
        assert.equal(bottom - mid, 0.5, 'half the gap over the middle');
      }
    }
  }
});

test('divider boards: two glued boards cost one more board thickness per divider and shift everything above it', () => {
  const one = stacked(1), two = stacked(2);
  const l1 = Z.layoutZones(one, 18), l2 = Z.layoutZones(two, 18);
  const sumOpen = (l) => l.bands.reduce((sum, b) => sum + b.openingHeightMm, 0);
  assert.equal(sumOpen(l1) + 2 * 18 + 18, one.height, 'one shared board: 3 boards tile the height');
  assert.equal(sumOpen(l2) + 2 * 18 + 36, two.height, 'two boards: 4 boards tile the height');
  assert.equal(sumOpen(l1) - sumOpen(l2), 18);
  assert.equal(l2.bands[1].openingBottomMm - (l2.dividerBottomsMm[0]), 36, 'the upper zone starts above both boards');
  assert.equal(l2.bands[1].bandBottomMm, l2.dividerBottomsMm[0] + 18, 'the bands meet at the glue line');
  // BOM and 3D agree: twice the divider boards, stacked without a gap
  const p1 = E.priceCabinet(one, WOODS, HW, []), p2 = E.priceCabinet(two, WOODS, HW, []);
  assert.equal(rowOf(p1, 'Zone Divider Panel').quantity, 1);
  assert.equal(rowOf(p2, 'Zone Divider Panel').quantity, 2);
  const g2 = G.assemblyGeometry(two, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
  const d = g2.boxes.filter((b) => b.kind === 'divider').sort((a, b) => a.centerMm[1] - b.centerMm[1]);
  assert.equal(d.length, 2);
  assert.equal(d[1].centerMm[1] - d[0].centerMm[1], 18, 'face to face');
  const cons = buildFasteners(g2, two, { carcaseTh: 18, frontTh: 18 });
  const cons1 = buildFasteners(G.assemblyGeometry(one, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }), one, { carcaseTh: 18, frontTh: 18 });
  assert.ok(cons.length > cons1.length, 'the extra board is fixed to the sides as well');
  // the default stays one board, and a single zone never has a divider
  assert.equal(R.dividerBoardsOf({}), 1);
  assert.equal(R.dividerBoardsOf({ dividerBoards: 2 }), 2);
  assert.equal(cabinetOf('Standard_Wall', (d) => ({ ...d, dividerBoards: 2 })).cab.dividerBoards, undefined, 'one zone: no divider, so no field');
  assert.equal(P.cabinetToDraft(two).dividerBoards, 2, 'the choice survives save and reload');
});
