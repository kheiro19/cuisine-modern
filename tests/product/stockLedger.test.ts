// "The whole stock, not only the boards and the rolls."
// The ledger must hold ONE line per item the workshop owns — board, roll, box of hinges — and must never lose an item the
// kitchen consumes. These tests prove that by construction, then prove the shortage list is exactly the negative lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import { priceCabinet } from '../../src/math/partsEngine';
import { generateFactoryBOMReport, convertBOMToCSVString } from '../../src/math/bomEngine';
import { checkStock, demandOf, stockLedger, stockLedgerFromPricing } from '../../src/math/stockCheck';

const wood = (id, th, type, qty) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: qty, averagePriceDA: 15000 });
const hw = (id, category, modelType, qty = 1000) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: 100, availableQty: qty });
const roll = (qty = 1000) => ({ id: 'r1', brand: 'Rehau', thickness: 0.5, width: 22, totalLengthMeters: qty, rollPriceDA: 2500 });

/** One stock item of every kind the app can consume: doors, drawers, push, gola, fittings, legs, a PVC plinth. */
const ITEMS = () => [
  hw('hinge', 'Cabinet Hinges', 'Clip Top Hinge'),
  hw('runner', 'Drawer Slide Systems', 'Ball Bearing Runner'),
  hw('push', 'Push-Open Systems', 'Push Latch'),
  hw('gola', 'Gola & Handle Profiles', 'Gola Alu Profile'),
  hw('cam', 'Assembly & Fixing', 'Cam Lock'),
  hw('dowel', 'Assembly & Fixing', 'Wooden Dowel'),
  hw('screw', 'Assembly & Fixing', 'Back Panel Screw'),
  hw('pin', 'Assembly & Fixing', 'Shelf Support Pin'),
  hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs'),
  hw('plinth', 'Assembly & Fixing', 'PVC Plinth Board'),
];
const WOODS = (qty = 1000) => [wood('hdf', 3, 'HDF', qty), wood('mel', 18, 'MDF Melamine Matt', qty), wood('white', 18, 'MDF White', qty)];

let n = 0;
const mk = (woods, items, rolls, zones, extra = {}) => {
  const r = P.resolveDraft({
    ...P.draftFromPreset('Standard_Base'), width: 600, height: 870, depth: 600, zones,
    carcaseMaterialId: 'mel', frontMaterialId: 'white', carcaseEdgeRollId: 'r1', frontEdgeRollId: 'r1', ...extra,
  }, woods, items, rolls);
  return { ...P.draftToNewCabinet(r, { id: 'c' + n++, name: 'unit ' + n, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};

/** A kitchen that touches EVERY kind of stock the app can draw from. Returns cabinets + the stock they were built on. */
const richKitchen = (qty = 1000) => {
  const woods = WOODS(qty), items = ITEMS(), rolls = [roll(qty)];
  const cabinets = [
    mk(woods, items, rolls, [{ kind: 'DOORS', count: 2, shelves: 1 }]), // hinges + shelf pins
    mk(woods, items, rolls, [{ kind: 'DRAWERS', count: 3 }], { frontConfig: { openingType: 'DRAWERS', elementCount: 3, hardwareItemId: 'hinge', drawerHardwareItemId: 'runner', hasGolaProfile: false } }),
    mk(woods, items, rolls, [{ kind: 'DOORS', count: 2 }], { openingMode: 'PUSH' }),
    mk(woods, items, rolls, [{ kind: 'DOORS', count: 2 }], { openingMode: 'GOLA' }),
    mk(woods, items, rolls, [{ kind: 'DOORS', count: 1 }], { base: { type: 'PLINTH', plinthMaterial: 'PVC' } }),
  ];
  return { woods, items, rolls, cabinets };
};

test('the ledger holds ONE line per stock item: every board, every roll, every box of hardware', () => {
  const { woods, items, rolls, cabinets } = richKitchen();
  const ledger = stockLedger(cabinets, woods, items, rolls);
  assert.equal(ledger.length, woods.length + rolls.length + items.length, 'no stock item is left out');
  const ids = ledger.map((l) => `${l.kind}:${l.itemId}`);
  assert.equal(new Set(ids).size, ids.length, 'no item is listed twice');
  for (const m of woods) assert.ok(ids.includes(`SHEET:${m.id}`), m.id);
  for (const r of rolls) assert.ok(ids.includes(`EDGE_BAND:${r.id}`), r.id);
  for (const h of items) assert.ok(ids.includes(`HARDWARE:${h.id}`), h.id);
});

test('nothing the kitchen consumes can hide: every priced part, metre and piece has a line, with the same number', () => {
  const { woods, items, rolls, cabinets } = richKitchen();
  const pricing = cabinets.map((c) => priceCabinet(c, woods, items, rolls));
  const { sheets, band, hardware } = demandOf(pricing);
  const ledger = stockLedgerFromPricing(pricing, woods, items, rolls);
  const line = (kind, id) => ledger.find((l) => l.kind === kind && l.itemId === id);

  // every material the pricing used
  assert.ok(Object.keys(sheets).length >= 2, 'the kitchen uses more than one board');
  for (const [id, need] of Object.entries(sheets)) {
    const l = line('SHEET', id);
    assert.ok(l, `material ${id} has no ledger line`);
    assert.ok(Math.abs(l.required - need) < 0.011, `${id}: ${l.required} vs ${need}`);
  }
  // the roll, with carcase + fronts added up
  for (const [id, need] of Object.entries(band)) {
    const l = line('EDGE_BAND', id);
    assert.ok(l, `roll ${id} has no ledger line`);
    assert.ok(Math.abs(l.required - need) < 0.11, `${id}: ${l.required} vs ${need}`);
  }
  // every piece, category by category — all six categories of the app are really reached by this kitchen
  for (const [id, need] of Object.entries(hardware)) {
    const l = line('HARDWARE', id);
    assert.ok(l, `hardware ${id} has no ledger line`);
    assert.equal(l.required, Math.round(need), id);
  }
  const categories = new Set(pricing.flatMap((p) => p.hardware.map((h) => h.item.category)));
  assert.deepEqual(
    [...categories].sort(),
    ['Assembly & Fixing', 'Cabinet Hinges', 'Drawer Slide Systems', 'Gola & Handle Profiles', 'Push-Open Systems'],
    'the test kitchen must reach hinges, runners, push, gola and fittings',
  );
  assert.ok(hardware.legs > 0 && hardware.plinth > 0, 'legs and a PVC plinth are part of the stock too');
});

test('every line adds up: left = in stock - reserved, and a shortage is exactly a negative left', () => {
  const { woods, items, rolls, cabinets } = richKitchen();
  for (const l of stockLedger(cabinets, woods, items, rolls)) {
    if (l.kind === 'HARDWARE' && l.required === 0) continue; // an unused negative item is not this project's doing
    const left = Math.round((l.inStock - l.required) * 100) / 100;
    assert.ok(Math.abs(l.left - left) < 0.011, `${l.label}: left ${l.left} vs ${left}`);
    assert.equal(l.shortfall > 0, l.left < 0, `${l.label}: shortfall and left disagree`);
    assert.ok(l.shortfall >= 0);
  }
});

test('an item the kitchen does not use is listed with 0 reserved and is never a shortage', () => {
  const { woods, items, rolls, cabinets } = richKitchen();
  const spare = [...items, hw('spare', 'Assembly & Fixing', 'Spare Thing', 0)];
  const ledger = stockLedger(cabinets, woods, spare, rolls);
  const l = ledger.find((x) => x.itemId === 'spare');
  assert.ok(l, 'it is still in the ledger: the workshop owns it');
  assert.equal(l.required, 0);
  assert.equal(l.left, 0);
  assert.equal(l.shortfall, 0);
  assert.deepEqual(checkStock(cabinets, woods, spare, rolls).filter((s) => s.itemId === 'spare'), []);
});

test('an EMPTY workshop: every single thing the kitchen needs is reported, of every kind', () => {
  const { cabinets } = richKitchen();
  const zeroWoods = WOODS(0), zeroItems = ITEMS().map((h) => ({ ...h, availableQty: 0 })), zeroRolls = [roll(0)];
  const shortages = checkStock(cabinets, zeroWoods, zeroItems, zeroRolls);
  const pricing = cabinets.map((c) => priceCabinet(c, zeroWoods, zeroItems, zeroRolls));
  const { sheets, band, hardware } = demandOf(pricing);
  const expected = Object.keys(sheets).length + Object.keys(band).length + Object.keys(hardware).length;
  assert.equal(shortages.length, expected, 'one shortage per consumed item, no more, no less');
  assert.ok(shortages.some((s) => s.kind === 'SHEET'));
  assert.ok(shortages.some((s) => s.kind === 'EDGE_BAND'));
  assert.ok(shortages.filter((s) => s.kind === 'HARDWARE').length >= 8, 'all the hardware, not only the hinges');
});

test('the shortage list IS the negative side of the ledger — same items, same numbers, same order', () => {
  const { woods, items, rolls, cabinets } = richKitchen();
  const broken = { woods: WOODS(0), items: ITEMS().map((h, i) => ({ ...h, availableQty: i % 3 })), rolls: [roll(2)] };
  const ledger = stockLedger(cabinets, broken.woods, broken.items, broken.rolls);
  const fromLedger = ledger.filter((l) => l.shortfall > 0).map((l) => [l.kind, l.itemId, l.required, l.inStock, l.shortfall]);
  const fromCheck = checkStock(cabinets, broken.woods, broken.items, broken.rolls).map((s) => [s.kind, s.itemId, s.required, s.available, s.shortfall]);
  assert.deepEqual(fromCheck, fromLedger);
  assert.ok(fromCheck.length > 5, 'the fixture really is short of several things');
});

test('the factory report carries the whole ledger, and the CSV prints it as its own section', () => {
  const { woods, items, rolls, cabinets } = richKitchen();
  const report = generateFactoryBOMReport(cabinets, woods, items, rolls);
  assert.equal(report.stockLedger.length, woods.length + rolls.length + items.length);
  assert.deepEqual(report.shortages, []);

  const csv = convertBOMToCSVString(report);
  assert.ok(csv.includes('--- SECTION 4: STOCK LEDGER'), 'the ledger is part of the export');
  assert.ok(csv.includes('In Stock,Reserved By This Project,Left After Project,Shortage'));
  assert.ok(csv.includes('Clip Top Hinge'));
  assert.ok(csv.includes('Adjustable Kitchen Legs'));
  assert.ok(csv.includes('PVC Plinth Board'));
  assert.ok(csv.includes('Edge band 0.5 x 22 mm (Rehau)'));
});

test('a short workshop: the ledger and the CSV both name the number that is missing, in every kind', () => {
  const { cabinets } = richKitchen();
  const shortWoods = WOODS(0), shortItems = ITEMS().map((h) => ({ ...h, availableQty: 0 })), shortRolls = [roll(0)];
  const report = generateFactoryBOMReport(cabinets, shortWoods, shortItems, shortRolls);
  const kinds = new Set(report.shortages.map((s) => s.kind));
  assert.deepEqual([...kinds].sort(), ['EDGE_BAND', 'HARDWARE', 'SHEET'], 'all three stocks are checked');
  report.shortages.forEach((s) => { assert.ok(s.required > 0 && s.shortfall > 0, s.label); });

  const csv = convertBOMToCSVString(report);
  const ledgerRows = csv.split('\n').filter((l) => /^"(SHEET|EDGE_BAND|HARDWARE)",/.test(l));
  assert.equal(ledgerRows.length, report.stockLedger.length, 'one CSV row per stock item');
  assert.ok(ledgerRows.every((r) => r.split(',').length >= 7), 'every row carries in stock / reserved / left / shortage');
});

test('no false alarm when the stock is enough — the ledger still shows the reservation', () => {
  const { woods, items, rolls, cabinets } = richKitchen();
  assert.deepEqual(checkStock(cabinets, woods, items, rolls), []);
  const used = stockLedger(cabinets, woods, items, rolls).filter((l) => l.required > 0);
  assert.ok(used.length >= 12, 'boards, roll, hinges, runners, push, gola, fittings, legs, plinth');
  used.forEach((l) => {
    assert.ok(l.left >= 0, `${l.label} is not short`);
    assert.equal(l.shortfall, 0);
  });
});
