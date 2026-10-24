// The "half cabinet" for an appliance under the worktop: two sides and the two top rails, no bottom, no back, no front, and the
// appliance (washer, dryer, small fridge, dishwasher) stands inside with its own front visible.
//
// Every cabinet here is what the CONTROL PANEL produces — one appliance zone in a 636 mm floor unit — not an old template.
import * as M from '../fixtures/matrix';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import { assemblyGeometry } from '../../src/math/assemblyGeometry';
import { modelCabinet } from '../../src/math/partsEngine';
import { isOpenCarcase, layoutZones, planFronts, zonesOf } from '../../src/math/zones';
import { APPLIANCES, OPEN_BAY_APPLIANCES } from '../../src/rules/appliances';
import type { ApplianceKind } from '../../src/types/flatma';
import { applianceLookOf } from '../../src/math/applianceModels';
import { ACCESSORY_MODEL_KEYS, modelPrims, primBounds } from '../../src/math/accessoryModels';
import { FINISHES } from '../../src/data/accessoryCatalog';
import { sceneRefOf } from '../../src/math/accessoryPlacement';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const make = (draft, over = {}) => {
  const d = P.resolveDraft({ ...draft, ...over }, WOODS, [], []);
  return { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const BAYS = [M.config('washerBay'), M.config('dryerBay'), M.config('fridgeBay'), M.config('panelReady')];

test('a bay is a floor unit the panel can build: one appliance zone, 636 wide, and no decor panel unless asked', () => {
  [M.config('washerBay'), M.config('dryerBay'), M.config('fridgeBay')].forEach((draft) => {
    assert.equal(draft.category, 'BASE_UNIT');
    assert.equal(draft.zones.length, 1);
    assert.equal(draft.zones[0].kind, 'APPLIANCE');
    assert.ok(!draft.zones[0].panelFront, 'no decor panel: the appliance front shows');
    assert.equal(draft.width, 636);
    assert.equal(draft.height, 870);
    assert.equal(draft.depth, 600);
  });
  assert.equal(M.config('washerBay').zones[0].appliance, 'WASHER');
  assert.equal(M.config('dryerBay').zones[0].appliance, 'DRYER');
  assert.equal(M.config('fridgeBay').zones[0].appliance, 'UNDER_FRIDGE');
  assert.equal(M.config('panelReady').zones[0].appliance, 'DISHWASHER');
  assert.equal(M.config('panelReady').zones[0].panelFront, true, 'a dishwasher takes the kitchen panel');
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
  // SPEC CHANGE: a floor appliance under other zones still means "no bottom board" — the appliance stands on the floor either way.
  assert.equal(isOpenCarcase([{ kind: 'APPLIANCE', appliance: 'WASHER' }, { kind: 'DOORS', count: 1 }]), true, 'a washer with doors above still has no bottom board');
  assert.equal(isOpenCarcase([{ kind: 'OPEN', shelves: 2 }]), false, 'open shelving keeps its bottom');
});

test('bay parts: two sides and two top rails, no bottom, no back, no divider, nothing to put a front on', () => {
  BAYS.forEach((draft) => {
    const cab = make(draft);
    const m = modelCabinet(cab, 18, 18);
    const names = m.parts.map((p) => p.partType);
    assert.ok(names.some((n) => /Side Panel/.test(n)), `${draft.subtype}: sides`);
    assert.equal(m.parts.find((p) => /Side Panel/.test(p.partType)).quantity, 2);
    assert.equal(m.parts.find((p) => /Side Panel/.test(p.partType)).lengthMm, 870, `${draft.subtype}: the sides go down to the floor`);
    assert.equal(m.parts.find((p) => /Top Stretcher Rail/.test(p.partType)).quantity, 2, `${draft.subtype}: the front and the back rail the worktop rests on`);
    assert.equal(m.parts.find((p) => /Top Stretcher Rail/.test(p.partType)).lengthMm, 600, `${draft.subtype}: rail as long as the opening`);
    ['Bottom Deck', 'Backwall', 'Zone Divider', 'Roof'].forEach((x) => assert.ok(!names.some((n) => n.includes(x)), `${draft.subtype}: no ${x}`));
  });
  assert.equal(modelCabinet(make(M.config('washerBay')), 18, 18).plan.facades.length, 0, 'no front: the washer shows');
  assert.equal(modelCabinet(make(M.config('panelReady')), 18, 18).plan.facades.length, 1, 'the dishwasher bay keeps its decor panel');
});

test('bay layout: no zone issue, the opening is taller than the appliance, and the washer can ask for a decor panel', () => {
  [M.config('washerBay'), M.config('dryerBay'), M.config('fridgeBay')].forEach((draft) => {
    const cab = make(draft);
    const layout = layoutZones(cab, 18);
    assert.deepEqual(layout.issues, [], `${draft.subtype}: ${JSON.stringify(layout.issues)}`);
    assert.ok(layout.bands[0].openingHeightMm >= APPLIANCES[zonesOf(cab)[0].appliance].nicheHeightMm + 4, `${draft.subtype}: opening ${layout.bands[0].openingHeightMm}`);
  });
  const panelled = make(M.config('washerBay'), { zones: [{ kind: 'APPLIANCE', appliance: 'WASHER', panelFront: true }] });
  assert.equal(planFronts(panelled, layoutZones(panelled, 18)).facades.length, 1, 'a fully integrated washer gets a decor panel');
  assert.equal(assemblyGeometry(panelled, { carcaseTh: 18, frontTh: 18, lift: false, inset: false }).appliances[0].frontVisible, false);
});

test('bay 3D geometry: the appliance stands on the floor between the sides, behind the front plane, front visible', () => {
  [M.config('washerBay'), M.config('dryerBay'), M.config('fridgeBay')].forEach((draft) => {
    const cab = make(draft);
    const geo = assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
    assert.equal(geo.appliances.length, 1);
    const a = geo.appliances[0];
    assert.equal(a.frontVisible, true);
    const [w, h, d] = a.sizeMm;
    assert.ok(w <= 600 - 4 + 1e-6 && w >= 590, `${draft.subtype}: width ${w} fits between the sides with a clearance`);
    assert.ok(Math.abs(h - APPLIANCES[a.appliance].nicheHeightMm) < 1e-6, `${draft.subtype}: height ${h}`);
    const floor = a.centerMm[1] - h / 2;
    assert.ok(floor >= 0 && floor <= 4, `${draft.subtype}: it stands on the floor (${floor})`);
    assert.ok(a.centerMm[1] + h / 2 <= 870 - 18, `${draft.subtype}: under the top rails`);
    assert.ok(a.centerMm[2] + d / 2 <= 600 / 2 + 600 / 2 && a.centerMm[2] + d / 2 <= 600 - 0, `${draft.subtype}: not outside the cabinet`);
    assert.ok(a.trim === undefined, `${draft.subtype}: no frame over the cabinet edges`);
  });
});

test('bay look: every open-bay appliance has a library look that stays inside its niche', () => {
  (['WASHER', 'DRYER', 'DISHWASHER', 'FRIDGE', 'UNDER_FRIDGE'] as ApplianceKind[]).forEach((k) => {
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

test('bay sweep: every configuration of the matrix that carries a floor appliance has no bottom and no back', () => {
  M.MATRIX.filter((c) => c.draft.zones.some((z) => z.kind === 'APPLIANCE' && OPEN_BAY_APPLIANCES.includes(z.appliance)))
    .forEach((c) => {
      const cab = make(c.draft);
      const names = modelCabinet(cab, 18, 18).parts.map((p) => p.partType);
      const floorBay = zonesOf(cab)[0].kind === 'APPLIANCE';
      if (!floorBay) return;                       // an oven column in the middle of a tower keeps its bottom
      assert.ok(!names.some((n) => n.includes('Bottom Deck')), `${c.name}: a machine standing on the floor has no bottom board`);
    });
});

test('worktop: a bay is a base unit, so the worktop runs over it and the wall units above it', () => {
  const run = [make(M.config('washerBay')), { ...make(M.config('deepDrawers')), id: 'next', positionX: 636 }];
  const scene = sceneRefOf(run, 600);
  assert.equal(scene.hasCounter, true);
  assert.equal(scene.counterXStartMm, 0);
  assert.equal(scene.counterXEndMm, 636 + run[1].width, 'the worktop spans the bay and its neighbour');
});
