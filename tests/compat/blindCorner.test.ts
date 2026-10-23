// The blind corner: a door on the visible part, a fixed panel on the blind part, one vertical board between.
// It is no longer a template — it is a SPLIT the panel sets on a doors zone (math/columns.ts), so these tests build it the way a
// user does: 1050 wide, one door, one shelf, split LEFT 500 with the blind column filled by a fixed PANEL.
import * as M from '../fixtures/matrix';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import { layoutZones, planFronts } from '../../src/math/zones';
import { modelCabinet } from '../../src/math/partsEngine';
import { assemblyGeometry } from '../../src/math/assemblyGeometry';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const make = (draft, over: any = {}) => {
  const d = P.resolveDraft({ ...draft, ...over }, WOODS, [], []);
  return { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const GEO = { carcaseTh: 18, frontTh: 18, lift: false, inset: false };

test('a blind corner is a split the panel can set: a door column and a blind column closed by a fixed panel', () => {
  const low = M.config('blindBase');
  assert.equal(low.category, 'BASE_UNIT');
  assert.deepEqual([low.width, low.height, low.depth], [1050, 870, 600]);
  const up = M.config('blindWall');
  assert.equal(up.category, 'WALL_UNIT');
  assert.deepEqual([up.width, up.height, up.depth], [900, 720, 350]);
  [low, up].forEach((d) => {
    assert.equal(d.zones.length, 1);
    assert.equal(d.zones[0].kind, 'DOORS');
    assert.equal(d.zones[0].split.fill, 'PANEL', 'the blind part is closed by a fixed panel');
  });
});

test('blind corner: the door covers only the visible part, the blind part gets a fixed panel, no layout issue', () => {
  ([[M.config('blindBase'), 526, 522], [M.config('blindWall'), 446, 452]] as Array<[any, number, number]>).forEach(([draft, door, panel]) => {
    const cab = make(draft);
    const layout = layoutZones(cab, 18);
    assert.deepEqual(layout.issues, [], `${draft.subtype}: ${JSON.stringify(layout.issues)}`);
    const f = planFronts(cab, layout).facades;
    assert.deepEqual(f.map((x) => x.kind), ['DOOR', 'PANEL'], draft.subtype);
    assert.equal(f[0].widthMm, door, `${draft.subtype}: the visible door`);
    assert.equal(f[1].widthMm, panel, `${draft.subtype}: the blind panel`);
    assert.ok(f[0].xMm < f[1].xMm, 'the door is on the left by default');
    assert.ok(f[0].widthMm < cab.width * 0.6, 'a door as wide as the whole cabinet would hit the neighbour of the other run');
  });
});

test('blind corner parts: one vertical board, one door, one filler, and the top the unit needs', () => {
  const low = modelCabinet(make(M.config('blindBase')), 18, 18).parts.map((p) => p.partType);
  assert.ok(low.some((n) => /Zone Column Board/.test(n)), 'the board between the visible and the blind part');
  assert.ok(low.some((n) => /Door Facade Panel/.test(n)) && low.some((n) => /Fixed Filler Panel/.test(n)));
  assert.ok(low.some((n) => /Stretcher Rail/.test(n)) && !low.some((n) => /Roof/.test(n)), 'the lower one carries the worktop: rails');
  const up = modelCabinet(make(M.config('blindWall')), 18, 18).parts.map((p) => p.partType);
  assert.ok(up.some((n) => /Roof/.test(n)) && !up.some((n) => /Stretcher Rail/.test(n)), 'the upper one is closed: a roof');
  assert.ok(up.some((n) => /Zone Column Board/.test(n)));
});

test('blind sweep: every configuration of the matrix with a split shows a door and a panel, never two doors', () => {
  const splitOnes = M.MATRIX.filter((c) => c.draft.zones.some((z) => z.split));
  assert.ok(splitOnes.length >= 2, 'the matrix must exercise the split column');
  splitOnes.forEach((c) => {
    const cab = make(c.draft);
    const f = planFronts(cab, layoutZones(cab, 18)).facades;
    assert.ok(f.some((x) => x.kind === 'PANEL'), `${c.name}: the blind column is a fixed panel`);
    f.filter((x) => x.kind === 'PANEL').forEach((x) => assert.ok(x.widthMm > 0, `${c.name}: a panel with no width`));
  });
});

test('blind corner: the side of the door can be mirrored, and the 3D has the board and both fronts', () => {
  const mirrored = make(M.config('blindMirrored'));
  const f = planFronts(mirrored, layoutZones(mirrored, 18)).facades;
  assert.deepEqual(f.map((x) => x.kind).sort(), ['DOOR', 'PANEL']);
  const door = f.find((x) => x.kind === 'DOOR'), panel = f.find((x) => x.kind === 'PANEL');
  assert.ok(door.xMm > panel.xMm, 'the door is now at the right end');
  const geo = assemblyGeometry(make(M.config('blindWall')), GEO);
  assert.equal(geo.facades.length, 2);
  assert.ok(geo.boxes.some((b) => b.key.startsWith('vdiv')), 'the vertical board is drawn');
  assert.ok(geo.boxes.some((b) => b.key === 'roof'), 'a closed top on the wall unit');
});
