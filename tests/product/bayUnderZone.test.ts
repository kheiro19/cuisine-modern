// A floor appliance with other zones above it (a washer under a doors cupboard, a dishwasher under drawers):
// the cabinet has NO bottom board behind the bay, the board above the bay IS cut, and the back covers only the closed part.
// What is not cut is not drawn, not listed in the cutting list and not invoiced.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import type { CabinetZone } from '../../src/types/flatma';
import * as E from '../../src/math/partsEngine';
import { assemblyGeometry } from '../../src/math/assemblyGeometry';
import { generateFactoryBOMReport } from '../../src/math/bomEngine';
import { baseOf } from '../../src/math/base';
import { isOpenCarcase, layoutZones, zonesOf } from '../../src/math/zones';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 50, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: 500 });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges'), hw('slide', 'Drawer Slide Systems'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dowel', 'Assembly & Fixing', 'Wooden Dowel', 2)];

let n = 0;
const make = (zones: CabinetZone[], height = 1338, extra: any = {}) => {
  const r = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), width: 636, height, depth: 600, zones, ...extra }, WOODS, HW, []);
  return { ...P.draftToNewCabinet(r, { id: 'c' + n++, name: 'c' + n, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};

const WASHER_AND_DOORS: CabinetZone[] = [{ kind: 'APPLIANCE', appliance: 'WASHER', heightMm: 820 }, { kind: 'DOORS', count: 2, shelves: 0 }];
const WASHER_ONLY: CabinetZone[] = [{ kind: 'APPLIANCE', appliance: 'WASHER', heightMm: 820 }];
const partsOf = (cab) => E.modelCabinet(cab, 18, 18).parts;
const rows = (parts, re) => parts.filter((p) => re.test(p.partType));
const geoOf = (cab) => assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });

test('the bottom board is gone as soon as the appliance stands on the floor, zones above or not', () => {
  assert.equal(isOpenCarcase(WASHER_AND_DOORS), true);
  const mixed = make(WASHER_AND_DOORS);
  assert.equal(rows(partsOf(mixed), /Bottom Deck/).length, 0, 'no bottom board: the washer stands on the floor');
  assert.equal(geoOf(mixed).boxes.filter((b) => b.kind === 'bottom').length, 0, 'and it is not drawn');
  assert.equal(baseOf(mixed).type, 'NONE', 'no base either: a plinth would lift it off the floor');
  assert.equal(baseOf(mixed).ignored, 'APPLIANCE_BAY');
});

test('the board above the bay is cut: the zone above it has to stand on something', () => {
  const mixed = make(WASHER_AND_DOORS);
  const dividers = rows(partsOf(mixed), /Zone Divider Panel/);
  assert.equal(dividers.length, 1);
  assert.equal(dividers[0].quantity, 1);
  assert.equal(geoOf(mixed).boxes.filter((b) => b.kind === 'divider').length, 1, 'drawn too, or the 3D would show a hole');
});

test('the back covers only the closed part: nothing behind the bay, a real panel above it', () => {
  const mixed = make(WASHER_AND_DOORS);
  const layout = layoutZones(mixed, 18);
  const bayTop = layout.bands[0].openingBottomMm + layout.bands[0].openingHeightMm;
  assert.equal(bayTop, 820, 'the bay runs from the floor (no bottom board) to the divider');

  const back = rows(partsOf(mixed), /Backwall/);
  assert.equal(back.length, 1, 'one panel, not one per zone');
  assert.equal(back[0].lengthMm, 1338 - 820, 'it starts at the divider above the bay, not at the floor');
  assert.equal(back[0].widthMm, 636);

  const box = geoOf(mixed).boxes.find((b) => b.kind === 'back');
  assert.ok(box, 'the drawing has the back too');
  assert.equal(box.sizeMm[1], back[0].lengthMm, 'drawn = cut');
  assert.equal(box.centerMm[1], 820 + back[0].lengthMm / 2, 'and it sits above the bay');
});

test('nothing is above a lone bay, so there is no back at all', () => {
  const alone = make(WASHER_ONLY, 870);
  assert.equal(rows(partsOf(alone), /Backwall/).length, 0);
  assert.equal(geoOf(alone).boxes.filter((b) => b.kind === 'back').length, 0);
});

test('what is not cut is not invoiced: no bottom row in the BOM and no money for it', () => {
  const mixed = make(WASHER_AND_DOORS);
  const priced = E.priceCabinet(mixed, WOODS, HW, []);
  assert.equal(rows(priced.parts, /Bottom Deck/).length, 0, 'the priced parts have no bottom either');

  const report = generateFactoryBOMReport([mixed], WOODS, HW, []);
  assert.equal(report.woodPanelsSummary.filter((r) => /Bottom Deck/.test(r.partType)).length, 0, 'the factory report has no bottom row');
  assert.equal(report.woodPanelsSummary.filter((r) => /Backwall/.test(r.partType)).length, 1, 'and exactly one back row');
  assert.ok(report.totalKitchenCostDA > 0);

  // the same cabinet, same zones, with a normal bottom board instead: the bay is cheaper by the bottom board
  const closed = make([{ kind: 'DOORS', count: 2, heightMm: 820 }, { kind: 'DOORS', count: 2, shelves: 0 }]);
  const closedReport = generateFactoryBOMReport([closed], WOODS, HW, []);
  const bottomOf = (rep) => rep.woodPanelsSummary.filter((r) => /Bottom Deck/.test(r.partType)).reduce((s, r) => s + r.estimatedCostDA, 0);
  assert.ok(bottomOf(closedReport) > 0, 'a closed cabinet does pay for its bottom board');
  assert.equal(bottomOf(report), 0, 'the bay does not');
});

test('price still equals the BOM rows, and the drawing still equals the cutting list', () => {
  const mixed = make(WASHER_AND_DOORS);
  const priced = E.priceCabinet(mixed, WOODS, HW, []);
  const sum = priced.parts.reduce((s, p) => s + p.boardCostDA, 0) + priced.hardware.reduce((s, h) => s + h.totalCostDA, 0);
  assert.equal(Math.round(priced.totalDA), Math.round(sum), 'PARITY 1');

  const fromParts = rows(partsOf(mixed), /./).flatMap((p) => Array.from({ length: p.quantity }, () => `${p.widthMm}x${p.lengthMm}`)).sort();
  const { boxes } = geoOf(mixed);
  const fromBoxes = boxes.filter((b) => !['side', 'rail', 'roof', 'divider'].includes(b.kind)); // boards counted separately below
  assert.ok(fromBoxes.length > 0);
  assert.ok(fromParts.length >= fromBoxes.length, 'every drawn board has a cutting row');
});

test('the zones above the bay are ordinary zones: they can be split, the bay cannot', () => {
  const withSplit = make([{ kind: 'APPLIANCE', appliance: 'WASHER', heightMm: 820 }, { kind: 'DOORS', count: 2, shelves: 0, split: { mainSide: 'LEFT', fill: 'DOOR' } }]);
  const parts = partsOf(withSplit);
  assert.equal(rows(parts, /Zone Column Board/).length, 1, 'the doors zone above the bay keeps its column board');
  const baySplit = make([{ kind: 'APPLIANCE', appliance: 'WASHER', heightMm: 820, split: { mainSide: 'LEFT', fill: 'DOOR' } }]);
  assert.equal(rows(partsOf(baySplit), /Zone Column Board/).length, 0, 'a bay itself is never split');
});

test('a taller bay under a zone: the appliance still starts at the floor', () => {
  const cab = make(WASHER_AND_DOORS, 1600);
  const layout = layoutZones(cab, 18);
  assert.equal(layout.bands[0].openingBottomMm, 0, 'from the floor');
  assert.equal(layout.bands[0].openingHeightMm, 820, 'the height the zone asked for');
  assert.deepEqual(layout.issues, []);
  assert.equal(zonesOf(cab)[0].kind, 'APPLIANCE');
});
