// @ts-nocheck  (plain node:test file, run with: npm test)
// Two rules about the cabinet of an appliance: (1) a unit that carries no worktop (a fridge column, a pantry) is closed from above,
// (2) the real size of the appliance is the user's to set, and can come from the accessories library.
import * as LG from './fixtures/legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import { assemblyGeometry } from '../src/math/assemblyGeometry';
import { modelCabinet } from '../src/math/partsEngine';
import { layoutZones } from '../src/math/zones';
import { APPLIANCES, nicheOf } from '../src/rules/appliances';
import { topOf } from '../src/rules/construction';
import { LAYOUT } from '../src/math/constants';
import { applianceKindOfItem, applianceLookOf, libraryAppliances } from '../src/math/applianceModels';
import { getAccessory } from '../src/data/accessoryCatalog';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const make = (subtype, over = {}) => {
  const d = P.resolveDraft({ ...LG.draftFromPreset(subtype), ...over }, WOODS, [], []);
  return { ...P.draftToNewCabinet(d, { id: subtype, name: subtype, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const GEO = { carcaseTh: 18, frontTh: 18, lift: false, inset: false };
const names = (cab) => modelCabinet(cab, 18, 18).parts.map((p) => p.partType);

test('top: rails under a worktop, a closed roof for everything that carries none', () => {
  assert.equal(topOf({ category: 'BASE_UNIT', height: 870 }), 'RAILS');
  assert.equal(topOf({ category: 'BASE_UNIT', height: LAYOUT.COUNTERTOP_MAX_UNIT_HEIGHT_MM }), 'RAILS', 'exactly the limit still carries the worktop');
  assert.equal(topOf({ category: 'BASE_UNIT', height: LAYOUT.COUNTERTOP_MAX_UNIT_HEIGHT_MM + 1 }), 'ROOF');
  assert.equal(topOf({ category: 'BASE_UNIT', height: 2100 }), 'ROOF', 'a fridge column');
  assert.equal(topOf({ category: 'WALL_UNIT', height: 720 }), 'ROOF');
});

test('fridge column: sides and a closed roof, no rails, no bottom, no back', () => {
  const fridge = make('Washer_Bay', { height: 2100, zones: [{ kind: 'APPLIANCE', appliance: 'FRIDGE' }] });
  assert.equal(fridge.height, 2100);
  const n = names(fridge);
  assert.ok(n.some((x) => /Roof/.test(x)), `a roof: ${n.join(' | ')}`);
  assert.ok(!n.some((x) => /Stretcher Rail/.test(x)), 'no open rails: nothing rests on this top');
  ['Bottom Deck', 'Backwall'].forEach((x) => assert.ok(!n.some((y) => y.includes(x)), `no ${x}`));
  assert.equal(modelCabinet(fridge, 18, 18).parts.find((p) => /Side Panel/.test(p.partType)).quantity, 2);
  const geo = assemblyGeometry(fridge, GEO);
  assert.ok(geo.boxes.some((b) => b.key === 'roof'), 'the 3D closes it too');
  assert.ok(!geo.boxes.some((b) => b.key.startsWith('rail')));
  const under = make('Washer_Bay');
  assert.ok(names(under).some((x) => /Stretcher Rail/.test(x)) && !names(under).some((x) => /Roof/.test(x)), 'under the worktop the bay keeps its two rails');
});

test('niche: the standard of the kind, each side the user states replaces it, nonsense is ignored', () => {
  const std = APPLIANCES.WASHER;
  assert.deepEqual(nicheOf({ kind: 'APPLIANCE', appliance: 'WASHER' }), { w: std.nicheWidthMm, h: std.nicheHeightMm, d: std.nicheDepthMm });
  assert.deepEqual(nicheOf({ kind: 'APPLIANCE', appliance: 'WASHER', applianceSizeMm: { w: 560 } }), { w: 560, h: std.nicheHeightMm, d: std.nicheDepthMm });
  assert.deepEqual(nicheOf({ kind: 'APPLIANCE', appliance: 'WASHER', applianceSizeMm: { w: -5, h: NaN, d: 0 } }), { w: std.nicheWidthMm, h: std.nicheHeightMm, d: std.nicheDepthMm });
  assert.equal(nicheOf({ kind: 'DOORS' }), undefined);
});

test('draft: the stated size is kept (inside limits) and the library piece only when it fits the kind', () => {
  const z = (extra) => make('Washer_Bay', { zones: [{ kind: 'APPLIANCE', appliance: 'WASHER', ...extra }] }).zones[0];
  assert.deepEqual(z({ applianceSizeMm: { w: 560, h: 800 } }).applianceSizeMm, { w: 560, h: 800 });
  assert.deepEqual(z({ applianceSizeMm: { w: 5, d: 99999 } }).applianceSizeMm, { w: 50, d: 2700 }, 'limits 50 to 2700 mm');
  assert.equal(z({ applianceSizeMm: { w: 'abc', h: -3 } }).applianceSizeMm, undefined, 'nothing valid: the standard stays');
  assert.equal(z({ libraryApplianceId: 'washer' }).libraryApplianceId, 'washer');
  assert.equal(z({ libraryApplianceId: 'dryer' }).libraryApplianceId, undefined, 'a dryer is not a washer');
  assert.equal(z({ libraryApplianceId: 'sink-single' }).libraryApplianceId, undefined, 'a sink is not an appliance');
  assert.equal(z({ libraryApplianceId: 'nope' }).libraryApplianceId, undefined);
  const oven = make('Washer_Bay', { zones: [{ kind: 'APPLIANCE', appliance: 'OVEN', libraryApplianceId: 'washer' }] }).zones[0];
  assert.equal(oven.libraryApplianceId, undefined, 'changing the kind drops the piece of the other kind');
});

test('library appliances: the floor pieces that can stand in a niche, with the kind each one asks for', () => {
  const list = libraryAppliances();
  const kinds = Object.fromEntries(list.map(({ item, kind }) => [item.id, kind]));
  assert.equal(kinds['washer'], 'WASHER');
  assert.equal(kinds['dryer'], 'DRYER');
  assert.equal(kinds['washer-lg-thinq'], 'WASHER');
  assert.equal(kinds['dishwasher-free'], 'DISHWASHER');
  assert.equal(kinds['fridge-single'], 'FRIDGE');
  assert.equal(kinds['wine-cooler'], 'FRIDGE');
  assert.ok(!('sink-single' in kinds) && !('hob-gas-60' in kinds) && !('bar-stool' in kinds));
  assert.equal(applianceKindOfItem(getAccessory('range-60')), undefined, 'a cooker is not a niche appliance');
  const look = applianceLookOf('WASHER', 'washer-lg-thinq');
  assert.equal(look.model, 'washer');
  assert.equal(applianceLookOf('DRYER', 'dryer').opts.dryer, true);
  assert.equal(applianceLookOf('WASHER', 'dryer').opts.dryer, undefined, 'a piece of the wrong kind: the standard look of the zone');
  assert.equal(applianceLookOf('WASHER', 'nope').model, 'washer');
  assert.equal(applianceLookOf('OVEN'), undefined);
});

test('geometry: the appliance drawn has the size the user stated and the piece he chose', () => {
  const cab = make('Washer_Bay', { zones: [{ kind: 'APPLIANCE', appliance: 'WASHER', applianceSizeMm: { w: 560, h: 800, d: 540 }, libraryApplianceId: 'washer' }] });
  const a = assemblyGeometry(cab, GEO).appliances[0];
  assert.deepEqual(a.sizeMm, [560, 800, 540]);
  assert.equal(a.libraryId, 'washer');
  assert.equal(assemblyGeometry(make('Washer_Bay'), GEO).appliances[0].libraryId, undefined);
});

test('issues: an appliance too wide, too tall or too deep for its cabinet is reported with the numbers', () => {
  const issues = (size) => layoutZones(make('Washer_Bay', { zones: [{ kind: 'APPLIANCE', appliance: 'WASHER', applianceSizeMm: size }] }), 18).issues.map((i) => i.code);
  assert.deepEqual(issues(undefined), []);
  assert.ok(issues({ w: 650 }).includes('APPLIANCE_TOO_NARROW'), 'the opening is 600');
  assert.ok(issues({ h: 900 }).includes('APPLIANCE_ZONE_TOO_SHORT'), 'the opening is 852');
  assert.ok(issues({ d: 700 }).includes('APPLIANCE_TOO_SHALLOW'), 'the cabinet is 600 deep');
  assert.deepEqual(issues({ w: 560, h: 800, d: 540 }), [], 'a smaller appliance fits');
  const msg = layoutZones(make('Washer_Bay', { zones: [{ kind: 'APPLIANCE', appliance: 'WASHER', applianceSizeMm: { w: 650 } }] }), 18).issues[0].message;
  assert.match(msg, /650/); assert.match(msg, /686/, 'it says which cabinet width is needed (650 + 2 x 18)');
});

test('fit: one tap sizes the cabinet to the appliance, and the result has no issue left', () => {
  const lg = getAccessory('washer-lg-thinq').sizeMm;
  const zone = { kind: 'APPLIANCE', appliance: 'WASHER', applianceSizeMm: { w: lg.w, h: lg.h, d: lg.d }, libraryApplianceId: 'washer-lg-thinq' };
  const cab = make('Washer_Bay', { zones: [zone] });
  assert.ok(layoutZones(cab, 18).issues.length > 0, 'the tall LG washer does not fit the standard bay');
  const patch = P.fitCabinetToAppliance({ width: cab.width, height: cab.height, depth: cab.depth, zones: cab.zones }, 18);
  assert.deepEqual(patch, { width: lg.w + 4 + 36, height: lg.h + 18 + 4, depth: lg.d + 30 });
  const fitted = make('Washer_Bay', { zones: [zone], ...patch });
  assert.deepEqual(layoutZones(fitted, 18).issues, [], JSON.stringify(layoutZones(fitted, 18).issues));
  const a = assemblyGeometry(fitted, GEO).appliances[0];
  assert.deepEqual(a.sizeMm, [lg.w, lg.h, lg.d], 'it is drawn at its real size');
  assert.deepEqual(P.fitCabinetToAppliance({ width: 800, height: 900, depth: 700, zones: [{ kind: 'DOORS', count: 2 }] }, 18), {}, 'no appliance: nothing to fit');
  const two = P.fitCabinetToAppliance({ width: 900, height: 870, depth: 600, zones: [{ kind: 'APPLIANCE', appliance: 'WASHER' }, { kind: 'DRAWERS', count: 2 }] }, 18);
  assert.equal(two.width, undefined, 'with other zones the width stays the user\'s');
});
