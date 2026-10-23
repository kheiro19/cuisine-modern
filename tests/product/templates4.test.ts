// The app offers FOUR starting points: a plain floor unit, a plain wall unit and the two L corners. Everything else is a choice
// inside the cabinet (zones, appliance, opening mode, split, base...). The engines are swept on that vocabulary in
// tests/fixtures/matrix.ts — there is no old catalogue any more.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import * as G from '../../src/math/assemblyGeometry';
import { SUBTYPES, TEMPLATES, templatesOf } from '../../src/rules/templates';
import { FAMILIES, FAMILY_ORDER } from '../../src/rules/families';
import { LIMITS } from '../../src/math/constants';
import { KINEMATICS } from '../../src/rules/kinematics';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 50, averagePriceDA: 15000 });
const hw = (id, category, modelType, price = 300) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: 500 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200)];

test('templates: exactly four - floor, wall, and one real L corner of each level', () => {
  assert.deepEqual(SUBTYPES.slice().sort(), ['L_Corner_Base', 'L_Corner_Wall', 'Standard_Base', 'Standard_Wall']);
  assert.deepEqual(FAMILY_ORDER, ['BASE', 'WALL', 'CORNER']);
  assert.deepEqual(Object.keys(FAMILIES).sort(), ['BASE', 'CORNER', 'WALL']);
  assert.deepEqual(templatesOf('BASE'), ['Standard_Base']);
  assert.deepEqual(templatesOf('WALL'), ['Standard_Wall']);
  assert.deepEqual(templatesOf('CORNER').slice().sort(), ['L_Corner_Base', 'L_Corner_Wall']);
  assert.deepEqual(TEMPLATES.Standard_Base.dims, { width: 600, height: 870, depth: 600 });
  assert.deepEqual(TEMPLATES.Standard_Wall.dims, { width: 600, height: 720, depth: 350 });
  assert.equal(TEMPLATES.Standard_Base.category, 'BASE_UNIT');
  assert.equal(TEMPLATES.Standard_Wall.category, 'WALL_UNIT');
  assert.equal(TEMPLATES.L_Corner_Base.lCorner, true);
  assert.equal(TEMPLATES.L_Corner_Wall.lCorner, true);
  assert.equal(TEMPLATES.L_Corner_Wall.category, 'WALL_UNIT');
  assert.ok(!TEMPLATES.Standard_Base.lCorner && !TEMPLATES.Standard_Wall.lCorner, 'only the two corners are built as an L unit');
});

test('templates: each of the four builds a real cabinet - priced, no design issue, drawing = cutting list', () => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const key = (t, x, y) => [t, x, y].map(r2).sort((m, n) => m - n).join('x');
  SUBTYPES.forEach((s) => {
    const d = P.resolveDraft(P.draftFromPreset(s), WOODS, HW, []);
    const cab = { ...P.draftToNewCabinet(d, { id: s, name: s, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
    const pr = E.priceCabinet(cab, WOODS, HW, []);
    assert.ok(pr.totalDA > 0, `${s}: priced`);
    assert.deepEqual(pr.issues.filter((i) => i.severity === 'error'), [], `${s}: no error`);
    const geo = G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
    const fromParts = pr.parts.filter((p) => p.role !== 'front').flatMap((p) => Array.from({ length: p.quantity }, () => key(p.thicknessMm, p.widthMm, p.lengthMm)));
    assert.deepEqual(geo.boxes.map((b) => key(...b.sizeMm)).sort(), fromParts.sort(), `${s}: boards`);
  });
});

test('templates: a saved cabinet comes back to the form as itself, an unknown old subtype falls back to a plain unit', () => {
  const d = P.resolveDraft(P.draftFromPreset('Standard_Wall'), WOODS, HW, []);
  const cab = { ...P.draftToNewCabinet(d, { id: 'w', name: 'w', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  assert.equal(P.cabinetToDraft(cab).subtype, 'Standard_Wall');
  assert.equal(P.cabinetToDraft({ ...cab, subtype: 'Washer_Bay', category: 'BASE_UNIT' }).subtype, 'Standard_Base', 'a cabinet saved with a removed template still opens');
  assert.equal(P.cabinetToDraft({ ...cab, subtype: 'Washer_Bay', category: 'WALL_UNIT' }).subtype, 'Standard_Wall');
});

test('templates: every starting point stays inside the limits, and a wall unit never starts with drawers under the worktop', () => {
  Object.entries(TEMPLATES).forEach(([key, t]) => {
    assert.ok(t.dims.width >= LIMITS.WIDTH_MM[0] && t.dims.width <= LIMITS.WIDTH_MM[1], `${key}: width`);
    assert.ok(t.dims.height >= LIMITS.HEIGHT_MM[0] && t.dims.height <= LIMITS.HEIGHT_MM[1], `${key}: height`);
    assert.ok(t.dims.depth >= LIMITS.DEPTH_MM[0] && t.dims.depth <= LIMITS.DEPTH_MM[1], `${key}: depth`);
    assert.ok(t.zones.length >= 1 && t.zones.length <= LIMITS.ZONES[1], `${key}: zones count`);
    if (t.category === 'WALL_UNIT') assert.ok(!t.zones.some((z) => z.kind === 'DRAWERS'), `${key}: drawers in a wall unit`);
    // A starting point that waits for a mechanism the engine cannot build must say so, never hide it.
    if (t.kinematic) {
      assert.ok(KINEMATICS[t.kinematic], `${key}: unknown kinematic`);
      if (KINEMATICS[t.kinematic].status === 'PLANNED') assert.ok(t.note && t.note.length > 0, `${key}: waits for ${t.kinematic} but has no note`);
    }
  });
});
