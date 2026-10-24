// test.md #4: does the workshop really have the boards, the edge-band metres and the pieces a kitchen needs?
// The numbers come from partsEngine.priceCabinet (the same source as the BOM), so a shortage can never contradict the cutting list.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import { generateFactoryBOMReport, convertBOMToCSVString } from '../../src/math/bomEngine';
import { checkStock, checkStockFromPricing, demandOf, remainingBandMeters, shortageMessage } from '../../src/math/stockCheck';
import { applyConsumptionDelta } from '../../src/math/stockDelta';
import type { CabinetZone } from '../../src/types/flatma';

const wood = (id, th, type, price, qty) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: qty, averagePriceDA: price });
const hw = (id, category, modelType, price, qty) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const ROLL = (over = {}) => ({ id: 'r1', brand: 'Rehau', thickness: 0.5, width: 22, totalLengthMeters: 5, rollPriceDA: 2500, ...over });

let n = 0;
/** One 600 x 870 x 600 floor unit with two doors, unless the test says otherwise. */
const make = ({ width = 600, zones = [{ kind: 'DOORS', count: 2, shelves: 0 }] as CabinetZone[], extra = {}, woods, items, rolls }) => {
  const r = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), width, height: 870, depth: 600, zones, carcaseEdgeRollId: 'r1', frontEdgeRollId: 'r1', ...extra }, woods, items, rolls);
  return { ...P.draftToNewCabinet(r, { id: 'c' + n++, name: 'unit ' + n, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
/** A roll long enough that the edge band is never the subject of a test about boards. */
const BIG_ROLL = (over = {}) => ROLL({ totalLengthMeters: 500, ...over });

const STOCK_HW = () => [
  hw('hinge', 'Cabinet Hinges', 'Clip Top Hinge', 300, 500),
  hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120, 500),
  hw('cam', 'Assembly & Fixing', 'Cam Lock', 10, 500),
  hw('dowel', 'Assembly & Fixing', 'Wooden Dowel', 2, 500),
];

test('sheets: a kitchen that needs more boards than the stock holds is reported with the numbers', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 0)];
  const items = STOCK_HW(), rolls = [BIG_ROLL()];
  const cab = make({ woods, items, rolls });

  const short = checkStock([cab], woods, items, rolls);
  assert.equal(short.length, 1, JSON.stringify(short));
  const s = short[0];
  assert.equal(s.kind, 'SHEET');
  assert.equal(s.itemId, 'mel');
  assert.equal(s.unit, 'sheet');
  assert.equal(s.available, 0);
  assert.ok(s.required > 0.1 && s.required < 2, `required ${s.required}`);
  assert.equal(s.shortfall, s.required, 'nothing in stock: everything is missing');
  assert.match(shortageMessage(s), /^SHORTAGE: MDF Melamine Matt 18 mm — the project needs .* sheet\(s\), the stock has 0/);
});

test('sheets: enough stock, or a second material with its own stock, gives no false alarm', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 10)];
  const items = STOCK_HW(), rolls = [BIG_ROLL()];
  assert.deepEqual(checkStock([make({ woods, items, rolls })], woods, items, rolls), []);
});

test('sheets: ten identical cabinets need ten times the boards, and the shortage follows', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 0.2)];
  const items = STOCK_HW(), rolls = [BIG_ROLL()];
  const one = make({ woods, items, rolls });
  const ten = Array.from({ length: 10 }, (_, k) => ({ ...one, id: one.id + k }));
  const perCabinet = checkStock([one], woods, items, rolls)[0];
  assert.ok(perCabinet, 'one cabinet already needs more than 0.2 sheets: ' + JSON.stringify(perCabinet));
  const forTen = checkStock(ten, woods, items, rolls)[0];
  assert.ok(forTen.required > perCabinet.required * 9, `${forTen.required} vs ${perCabinet.required}`);
});

test('edge band: the same roll used for carcase and fronts adds up as ONE draw', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 50)];
  const items = STOCK_HW();
  const rolls = [ROLL({ id: 'r1', totalLengthMeters: 5 })];
  const cab = make({ woods, items, rolls });

  const pricing = E.priceCabinet(cab, woods, items, rolls);
  const rows = pricing.edgeUsage.filter((u) => u.roll.id === 'r1');
  assert.equal(rows.length, 2, 'carcase and fronts are priced separately');
  const totalMetres = rows.reduce((s, u) => s + u.meters, 0);
  assert.ok(totalMetres > 5, `this cabinet draws ${totalMetres} m from a 5 m roll`);

  const band = checkStock([cab], woods, items, rolls).filter((s) => s.kind === 'EDGE_BAND');
  assert.equal(band.length, 1, 'one shortage for one roll, not one per row');
  assert.equal(band[0].unit, 'meter');
  assert.equal(band[0].available, 5);
  assert.ok(Math.abs(band[0].required - Math.round(totalMetres * 10) / 10) < 0.11, `${band[0].required} vs ${totalMetres}`);
});

test('edge band: a partly used roll is read from remainingLengthMeters, a roll without it is whole', () => {
  assert.equal(remainingBandMeters(ROLL({ totalLengthMeters: 5 })), 5, 'old roll = whole roll');
  assert.equal(remainingBandMeters(ROLL({ totalLengthMeters: 5, remainingLengthMeters: 1.2 })), 1.2);
  assert.equal(remainingBandMeters(ROLL({ totalLengthMeters: 5, remainingLengthMeters: -3 })), 0, 'never negative');

  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 50)];
  const items = STOCK_HW();
  const full = [ROLL({ id: 'r1', totalLengthMeters: 500 })];
  const cab = make({ woods, items, rolls: full });
  assert.deepEqual(checkStock([cab], woods, items, full).filter((s) => s.kind === 'EDGE_BAND'), [], 'a big roll is enough');

  const nearlyEmpty = [ROLL({ id: 'r1', totalLengthMeters: 500, remainingLengthMeters: 0.5 })];
  const short = checkStock([cab], woods, items, nearlyEmpty).filter((s) => s.kind === 'EDGE_BAND');
  assert.equal(short.length, 1);
  assert.equal(short[0].available, 0.5);
  assert.ok(short[0].shortfall > 0);
});

test('hardware: two hinges in the workshop for a four-hinge kitchen is a shortage of two', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 50)];
  const rolls = [BIG_ROLL()];
  const items = STOCK_HW().map((h) => (h.id === 'hinge' ? { ...h, availableQty: 2 } : h));
  const cab = make({ woods, items, rolls });

  const need = E.hardwareRequirements(cab, items).find((r) => r.item.id === 'hinge')!.quantity;
  assert.equal(need, 4, 'two doors, two hinges each');

  // The shelf is ALSO relieved as the cabinet is added (stockDelta). The check reads the untouched BASELINE instead, so the
  // same pieces are never counted twice — and a caller that passed the shelf would read 6 missing instead of 2.
  const after = applyConsumptionDelta(items, [], [cab]);
  assert.equal(after.find((h) => h.id === 'hinge')!.availableQty, -2, 'the shelf already shows the hole');

  const short = checkStock([cab], woods, items, rolls).filter((s) => s.kind === 'HARDWARE');
  assert.equal(short.length, 1);
  assert.deepEqual([short[0].required, short[0].available, short[0].shortfall, short[0].unit], [4, 2, 2, 'piece']);
  assert.match(shortageMessage(short[0]), /the project needs 4 piece\(s\), the stock has 2: missing 2/);
});

test('hardware: plenty of stock is not a shortage, and a negative item this kitchen never uses stays out of the report', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 50)];
  const rolls = [BIG_ROLL()];
  const plenty = STOCK_HW();
  const cab = make({ woods, items: plenty, rolls });
  assert.deepEqual(checkStock([cab], woods, plenty, rolls).filter((s) => s.kind === 'HARDWARE'), [], '500 hinges for 4');

  // an item the kitchen does not use, with a negative count of its own (an old shortage): not this project's business
  const spare = [...plenty, hw('spare', 'Assembly & Fixing', 'Spare Thing', 5, -99)];
  assert.deepEqual(checkStock([cab], woods, spare, rolls).filter((s) => s.itemId === 'spare'), []);
  // ...while an empty kitchen needs nothing at all
  assert.deepEqual(checkStock([], woods, spare, rolls), []);
});

test('no false alarm about an item that is missing from the stock: partsEngine already reports that', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 50)];
  const rolls = [ROLL({ totalLengthMeters: 500 })];
  const items = STOCK_HW().filter((h) => h.id !== 'hinge');
  const cab = make({ woods, items, rolls });
  const pricing = E.priceCabinet(cab, woods, items, rolls);
  assert.ok(pricing.issues.some((i) => i.code === 'NO_FRONT_HARDWARE'), 'the missing hinge is already an issue');
  assert.deepEqual(checkStock([cab], woods, items, rolls).filter((s) => s.kind === 'HARDWARE'), [], 'and not a shortage too');
});

test('the factory report carries the shortages, and the CSV prints them before cutting', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 0)];
  const items = STOCK_HW();
  const rolls = [ROLL({ totalLengthMeters: 0.5 })]; // too short on purpose
  const cab = make({ woods, items, rolls });

  const report = generateFactoryBOMReport([cab], woods, items, rolls);
  assert.equal(report.shortages.length, 2, JSON.stringify(report.shortages.map((s) => s.kind)));
  assert.deepEqual(report.shortages.map((s) => s.kind).sort(), ['EDGE_BAND', 'SHEET']);
  assert.ok(report.issues.some((m) => m.startsWith('SHORTAGE: MDF Melamine Matt 18 mm')));
  assert.ok(report.issues.some((m) => m.startsWith('SHORTAGE: Edge band')));

  const csv = convertBOMToCSVString(report);
  assert.ok(csv.includes('--- WARNINGS (read before cutting) ---'));
  assert.ok(csv.includes('SHORTAGE: MDF Melamine Matt 18 mm'));
  assert.ok(csv.includes('SHORTAGE: Edge band'));

  // no shortage in a healthy workshop, and then no shortage line in the CSV
  const okWoods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 50)];
  const okRolls = [ROLL({ totalLengthMeters: 500 })];
  const okReport = generateFactoryBOMReport([cab], okWoods, STOCK_HW(), okRolls);
  assert.deepEqual(okReport.shortages, []);
  assert.ok(!convertBOMToCSVString(okReport).includes('SHORTAGE:'));
});

test('demandOf reads the pricing and nothing else: same parts, same numbers, at no extra price', () => {
  const woods = [wood('hdf', 3, 'HDF Standard 3mm', 4000, 50), wood('mel', 18, 'MDF Melamine Matt', 15000, 50)];
  const items = STOCK_HW(), rolls = [ROLL({ totalLengthMeters: 500 })];
  const cab = make({ woods, items, rolls });
  const pricing = E.priceCabinet(cab, woods, items, rolls);

  const { sheets, band, hardware } = demandOf([pricing]);
  const sumSheets = pricing.parts.reduce((s, p) => s + (p.material?.id === 'mel' ? p.sheets : 0), 0);
  assert.ok(Math.abs(sheets.mel - sumSheets) < 1e-9);
  assert.ok(Math.abs(band.r1 - pricing.edgeUsage.reduce((s, u) => s + u.meters, 0)) < 1e-9);
  assert.equal(hardware.hinge, pricing.hardware.find((h) => h.item.id === 'hinge')!.quantity);

  // checkStockFromPricing is exactly what the report uses: same input, same output
  assert.deepEqual(checkStockFromPricing([pricing], woods, items, rolls), checkStock([cab], woods, items, rolls));
});
