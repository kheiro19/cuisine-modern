// @ts-nocheck  (plain node:test file, run with: npm test)
// The two blind corners (lower and upper): a door on the visible part, a fixed panel on the blind part, one vertical board between.
import * as LG from './fixtures/legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import { layoutZones, planFronts } from '../src/math/zones';
import { modelCabinet } from '../src/math/partsEngine';
import { assemblyGeometry } from '../src/math/assemblyGeometry';
import { TEMPLATES, SUBTYPES } from './fixtures/legacy';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const make = (subtype, over = {}) => {
  const d = P.resolveDraft({ ...LG.draftFromPreset(subtype), ...over }, WOODS, [], []);
  return { ...P.draftToNewCabinet(d, { id: subtype, name: subtype, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const GEO = { carcaseTh: 18, frontTh: 18, lift: false, inset: false };
const CORNERS = ['Blind_Corner', 'Wall_Blind_Corner'];

test('templates: a lower and an upper blind corner, in the corner family', () => {
  CORNERS.forEach((s) => { assert.ok(SUBTYPES.includes(s), s); assert.equal(TEMPLATES[s].family, 'CORNER'); });
  assert.equal(TEMPLATES.Blind_Corner.category, 'BASE_UNIT');
  assert.equal(TEMPLATES.Wall_Blind_Corner.category, 'WALL_UNIT');
  assert.deepEqual(TEMPLATES.Blind_Corner.dims, { width: 1050, height: 870, depth: 600 });
  assert.deepEqual(TEMPLATES.Wall_Blind_Corner.dims, { width: 900, height: 720, depth: 350 });
  CORNERS.forEach((s) => assert.equal(TEMPLATES[s].zones[0].split.fill, 'PANEL', `${s}: the blind part is closed by a fixed panel`));
});

test('blind corner: the door covers only the visible part, the blind part gets a fixed panel, no layout issue', () => {
  [['Blind_Corner', 526, 522], ['Wall_Blind_Corner', 446, 452]].forEach(([s, door, panel]) => {
    const cab = make(s);
    const layout = layoutZones(cab, 18);
    assert.deepEqual(layout.issues, [], `${s}: ${JSON.stringify(layout.issues)}`);
    const f = planFronts(cab, layout).facades;
    assert.deepEqual(f.map((x) => x.kind), ['DOOR', 'PANEL'], s);
    assert.equal(f[0].widthMm, door, `${s}: the visible door`);
    assert.equal(f[1].widthMm, panel, `${s}: the blind panel`);
    assert.ok(f[0].xMm < f[1].xMm, 'the door is on the left by default');
    assert.ok(f[0].widthMm < cab.width * 0.6, 'a door as wide as the whole cabinet would hit the neighbour of the other run');
  });
});

test('blind corner parts: one vertical board, one door, one filler, and the top the unit needs', () => {
  const low = modelCabinet(make('Blind_Corner'), 18, 18).parts.map((p) => p.partType);
  assert.ok(low.some((n) => /Zone Column Board/.test(n)), 'the board between the visible and the blind part');
  assert.ok(low.some((n) => /Door Facade Panel/.test(n)) && low.some((n) => /Fixed Filler Panel/.test(n)));
  assert.ok(low.some((n) => /Stretcher Rail/.test(n)) && !low.some((n) => /Roof/.test(n)), 'the lower one carries the worktop: rails');
  const up = modelCabinet(make('Wall_Blind_Corner'), 18, 18).parts.map((p) => p.partType);
  assert.ok(up.some((n) => /Roof/.test(n)) && !up.some((n) => /Stretcher Rail/.test(n)), 'the upper one is closed: a roof');
  assert.ok(up.some((n) => /Zone Column Board/.test(n)));
});

test('blind corner: the side of the door can be mirrored, and the 3D has the board and both fronts', () => {
  const mirrored = make('Blind_Corner', { zones: [{ kind: 'DOORS', count: 1, shelves: 1, split: { mainSide: 'RIGHT', mainWidthMm: 500, fill: 'PANEL' } }] });
  const f = planFronts(mirrored, layoutZones(mirrored, 18)).facades;
  assert.deepEqual(f.map((x) => x.kind).sort(), ['DOOR', 'PANEL']);
  const door = f.find((x) => x.kind === 'DOOR'), panel = f.find((x) => x.kind === 'PANEL');
  assert.ok(door.xMm > panel.xMm, 'the door is now at the right end');
  const geo = assemblyGeometry(make('Wall_Blind_Corner'), GEO);
  assert.equal(geo.facades.length, 2);
  assert.ok(geo.boxes.some((b) => b.key.startsWith('vdiv')), 'the vertical board is drawn');
  assert.ok(geo.boxes.some((b) => b.key === 'roof'), 'a closed top on the wall unit');
});
