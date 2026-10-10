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
const wood = (id, th) => ({ id, brand: id, type: 'MDF', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
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
