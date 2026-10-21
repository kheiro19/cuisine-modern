// @ts-nocheck  (plain node:test file, run with: npm test)
// The "half cabinet" for an appliance under the worktop: two sides and the two top rails, no bottom, no back, no front, and the
// appliance (washer, dryer, small fridge, dishwasher) stands inside with its own front visible.
import * as LG from './fixtures/legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import { assemblyGeometry } from '../src/math/assemblyGeometry';
import { modelCabinet } from '../src/math/partsEngine';
import { isOpenCarcase, layoutZones, planFronts, zonesOf } from '../src/math/zones';
import { APPLIANCES, OPEN_BAY_APPLIANCES } from '../src/rules/appliances';
import { SUBTYPES, TEMPLATES } from './fixtures/legacy';
import { applianceLookOf } from '../src/math/applianceModels';
import { ACCESSORY_MODEL_KEYS, modelPrims, primBounds } from '../src/math/accessoryModels';
import { FINISHES } from '../src/data/accessoryCatalog';
import { sceneRefOf } from '../src/math/accessoryPlacement';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const make = (subtype, over = {}) => {
  const d = P.resolveDraft({ ...LG.draftFromPreset(subtype), ...over }, WOODS, [], []);
  return { ...P.draftToNewCabinet(d, { id: subtype, name: subtype, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const BAYS = ['Washer_Bay', 'Dryer_Bay', 'Under_Counter_Fridge_Bay', 'Panel_Ready'];

test('bay templates: washer, dryer and small fridge are base units with one appliance zone and a visible front', () => {
  ['Washer_Bay', 'Dryer_Bay', 'Under_Counter_Fridge_Bay'].forEach((s) => {
    assert.ok(SUBTYPES.includes(s), s);
    const t = TEMPLATES[s];
    assert.equal(t.category, 'BASE_UNIT');
    assert.equal(t.zones.length, 1);
    assert.equal(t.zones[0].kind, 'APPLIANCE');
    assert.ok(!t.zones[0].panelFront, 'no decor panel: the appliance front shows');
    assert.deepEqual(t.dims, { width: 636, height: 870, depth: 600 });
  });
  assert.equal(TEMPLATES.Washer_Bay.zones[0].appliance, 'WASHER');
  assert.equal(TEMPLATES.Dryer_Bay.zones[0].appliance, 'DRYER');
  assert.equal(TEMPLATES.Under_Counter_Fridge_Bay.zones[0].appliance, 'UNDER_FRIDGE');
});

test('bay: every open-bay appliance has a niche that fits a 636 cabinet and stays under the worktop', () => {
  assert.deepEqual([...OPEN_BAY_APPLIANCES].sort(), ['DISHWASHER', 'DRYER', 'FRIDGE', 'UNDER_FRIDGE', 'WASHER']);
  ['WASHER', 'DRYER', 'UNDER_FRIDGE'].forEach((k) => {
    const s = APPLIANCES[k];
    assert.ok(s.nicheWidthMm + 4 <= 636 - 2 * 18, `${k}: ${s.nicheWidthMm} + 4 mm clearance must fit the 600 mm opening`);
    assert.ok(s.nicheHeightMm + 18 + 4 <= 870, `${k}: under the top rails of a 870 mm base unit`);
    assert.ok(s.nicheDepthMm <= 600 - 20);
    assert.equal(s.frontTrim, undefined, 'a washer has no trim over the cabinet edges');
  });
  assert.equal(isOpenCarcase([{ kind: 'APPLIANCE', appliance: 'WASHER' }]), true);
  assert.equal(isOpenCarcase([{ kind: 'APPLIANCE', appliance: 'OVEN' }]), false);
  assert.equal(isOpenCarcase([{ kind: 'APPLIANCE', appliance: 'WASHER' }, { kind: 'DOORS', count: 1 }]), false, 'a washer with drawers above is a normal cabinet');
});

test('bay parts: two sides and two top rails, no bottom, no back, no divider, nothing to put a front on', () => {
  BAYS.forEach((s) => {
    const cab = make(s);
    const m = modelCabinet(cab, 18, 18);
    const names = m.parts.map((p) => p.partType);
    assert.ok(names.some((n) => /Side Panel/.test(n)), `${s}: sides`);
    assert.equal(m.parts.find((p) => /Side Panel/.test(p.partType)).quantity, 2);
    assert.equal(m.parts.find((p) => /Side Panel/.test(p.partType)).lengthMm, 870, `${s}: the sides go down to the floor`);
    assert.equal(m.parts.find((p) => /Top Stretcher Rail/.test(p.partType)).quantity, 2, `${s}: the front and the back rail the worktop rests on`);
    assert.equal(m.parts.find((p) => /Top Stretcher Rail/.test(p.partType)).lengthMm, 600, `${s}: rail as long as the opening`);
    ['Bottom Deck', 'Backwall', 'Zone Divider', 'Roof'].forEach((x) => assert.ok(!names.some((n) => n.includes(x)), `${s}: no ${x}`));
  });
  assert.equal(modelCabinet(make('Washer_Bay'), 18, 18).plan.facades.length, 0, 'no front: the washer shows');
  assert.equal(modelCabinet(make('Panel_Ready'), 18, 18).plan.facades.length, 1, 'the dishwasher bay keeps its decor panel');
});

test('bay layout: no zone issue, the opening is taller than the appliance, and the washer can ask for a decor panel', () => {
  ['Washer_Bay', 'Dryer_Bay', 'Under_Counter_Fridge_Bay'].forEach((s) => {
    const cab = make(s);
    const layout = layoutZones(cab, 18);
    assert.deepEqual(layout.issues, [], `${s}: ${JSON.stringify(layout.issues)}`);
    assert.ok(layout.bands[0].openingHeightMm >= APPLIANCES[zonesOf(cab)[0].appliance].nicheHeightMm + 4, `${s}: opening ${layout.bands[0].openingHeightMm}`);
  });
  const panelled = make('Washer_Bay', { zones: [{ kind: 'APPLIANCE', appliance: 'WASHER', panelFront: true }] });
  assert.equal(planFronts(panelled, layoutZones(panelled, 18)).facades.length, 1, 'a fully integrated washer gets a decor panel');
  assert.equal(assemblyGeometry(panelled, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }).appliances[0].frontVisible, false);
});

test('bay 3D geometry: the appliance stands on the floor between the sides, behind the front plane, front visible', () => {
  ['Washer_Bay', 'Dryer_Bay', 'Under_Counter_Fridge_Bay'].forEach((s) => {
    const cab = make(s);
    const geo = assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
    assert.equal(geo.appliances.length, 1);
    const a = geo.appliances[0];
    assert.equal(a.frontVisible, true);
    const [w, h, d] = a.sizeMm;
    assert.ok(w <= 600 - 4 + 1e-6 && w >= 590, `${s}: width ${w} fits between the sides with a clearance`);
    assert.ok(Math.abs(h - APPLIANCES[a.appliance].nicheHeightMm) < 1e-6, `${s}: height ${h}`);
    const floor = a.centerMm[1] - h / 2;
    assert.ok(floor >= 0 && floor <= 4, `${s}: it stands on the floor (${floor})`);
    assert.ok(a.centerMm[1] + h / 2 <= 870 - 18, `${s}: under the top rails`);
    assert.ok(a.centerMm[2] + d / 2 <= 600 / 2 + 600 / 2 && a.centerMm[2] + d / 2 <= 600 - 0, `${s}: not outside the cabinet`);
    assert.ok(a.trim === undefined, `${s}: no frame over the cabinet edges`);
  });
});

test('bay look: every open-bay appliance has a library look that stays inside its niche', () => {
  ['WASHER', 'DRYER', 'DISHWASHER', 'FRIDGE', 'UNDER_FRIDGE'].forEach((k) => {
    const look = applianceLookOf(k);
    assert.ok(look, `${k}: no look`);
    assert.ok(ACCESSORY_MODEL_KEYS.includes(look.model));
    assert.ok(FINISHES[look.finish]);
    const { nicheWidthMm: w, nicheHeightMm: h, nicheDepthMm: d } = APPLIANCES[k];
    modelPrims(look.model, w, h, d, look.opts, FINISHES[look.finish]).forEach((p, i) => {
      const [x0, x1, y0, y1, z0, z1] = primBounds(p);
      assert.ok(x0 >= -w / 2 - 1.5 && x1 <= w / 2 + 1.5 && y0 >= -1.5 && y1 <= h + 1.5 && z0 >= -d / 2 - 1.5 && z1 <= d / 2 + 1.5, `${k}#${i} out of the niche`);
    });
  });
  assert.equal(applianceLookOf('OVEN'), undefined, 'a built-in oven keeps its frame');
  assert.equal(applianceLookOf('WASHER').opts.dryer, undefined);
  assert.equal(applianceLookOf('DRYER').opts.dryer, true, 'the dryer is the washer without its detergent drawer');
});

test('worktop: a bay is a base unit, so the worktop runs over it and the wall units above it', () => {
  const run = [make('Washer_Bay'), { ...make('Deep_Drawers'), id: 'next', positionX: 636 }];
  const scene = sceneRefOf(run, 600);
  assert.equal(scene.hasCounter, true);
  assert.equal(scene.counterXStartMm, 0);
  assert.equal(scene.counterXEndMm, 636 + run[1].width, 'the worktop spans the bay and its neighbour');
});
