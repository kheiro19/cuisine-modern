// The regression guards that do not depend on the old catalogue: phantom stock, invoice rounding, degenerate zones.
// These are promises of the PRODUCT, so they live here and read the panel's configurations (tests/fixtures/matrix.ts).
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import * as M from '../fixtures/matrix';
import { applyConsumptionDelta, registerHardwareItem, hardwareConsumption } from '../../src/math/stockDelta';
import { generateFactoryBOMReport } from '../../src/math/bomEngine';
import { generateCustomerInvoice } from '../../src/math/invoiceEngine';

const wood = (id: string, th: number, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id: string, category: any, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18), wood('mel16', 16), wood('glass', 4, 'Glass Door with Aluminum Profile', 30000)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('lift', 'Overhead Lift Systems', 'Aventos HK', 2500), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200), hw('push', 'Push-Open Systems', 'Tip-On', 450), hw('gola', 'Gola & Handle Profiles', 'Gola C', 1800), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dow', 'Assembly & Fixing', 'Wooden Dowel', 2), hw('scr', 'Assembly & Fixing', 'Back Panel Screw', 1), hw('pin', 'Assembly & Fixing', 'Shelf Support Pin', 1)];
const ROLLS = [{ id: 'e1', brand: 'PVC', thickness: 1, width: 22, totalLengthMeters: 100, rollPriceDA: 3000 }, { id: 'e2', brand: 'ABS', thickness: 2, width: 45, totalLengthMeters: 50, rollPriceDA: 4000 }];

// ------------------------------------------------------------------------------------------------ stock
const cabinetOf = (draft: any, items: any[], woods: any[] = WOODS) => {
  const d = P.resolveDraft(draft, woods, items, ROLLS);
  return { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};
const BASE_ITEMS = HW.filter((h) => h.id !== 'legs' && h.id !== 'hang');
const LEGS = hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120, 100);

// ------------------------------------------------------------------------------------------------ stock

test('stock: legs registered AFTER the cabinet are charged to it, so deleting it gives back exactly what was taken', () => {
  const cab = cabinetOf(M.config('legsBase'), BASE_ITEMS);
  let items = applyConsumptionDelta(BASE_ITEMS, [], [cab]);              // cabinet drawn: no legs in stock yet
  items = registerHardwareItem(items, LEGS, [cab]);                      // legs registered afterwards
  const need = hardwareConsumption(cab, items).legs;
  assert.ok(need > 0, 'the cabinet needs legs now that they exist');
  assert.equal(items.find((i) => i.id === 'legs').availableQty, 100 - need, 'the pieces it needs are taken at registration');
  items = applyConsumptionDelta(items, [cab], []);                        // delete it
  assert.equal(items.find((i) => i.id === 'legs').availableQty, 100, 'no stock invented: 100 registered, 100 after add + delete');
});

test('stock: registering an item no cabinet needs leaves its quantity untouched, and the list order is kept', () => {
  const cab = cabinetOf(M.config('deepDrawers'), BASE_ITEMS);
  const spare = hw('spare', 'Assembly & Fixing', 'Something Else', 5, 7);
  const items = registerHardwareItem(BASE_ITEMS, spare, [cab]);
  assert.equal(items.at(-1).availableQty, 7);
  assert.deepEqual(items.map((i) => i.id), [...BASE_ITEMS.map((i) => i.id), 'spare']);
  assert.equal(registerHardwareItem(BASE_ITEMS, spare, []).at(-1).availableQty, 7);
});

// ------------------------------------------------------------------------------------------------ invoice
test('invoice: the printed lines add up to the grand total to the dinar, whatever the rounding', () => {
  const items = [...BASE_ITEMS, LEGS, hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 203)];
  const woods = [...WOODS, wood('acr', 18, 'Acrylic High Gloss', 23000)];
  let checked = 0;
  for (let i = 0; i < 120; i++) {
    const picks = M.MATRIX.slice(i % 7).filter((_, k) => k % 5 === 0).slice(0, 1 + (i % 5));
    const cabs = picks.map((c, k) => {
      const d = P.resolveDraft({ ...c.draft, carcaseEdgeRollId: 'e1', frontEdgeRollId: 'e1', frontMaterialId: k % 2 ? 'acr' : 'mel' }, woods, items, ROLLS);
      return { ...P.draftToNewCabinet(d, { id: c.name + k, name: c.name + k, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
    });
    const inv = generateCustomerInvoice(generateFactoryBOMReport(cabs, woods, items, ROLLS), 20 + (i % 3) * 3.5, 30 - (i % 4) * 2.5);
    assert.equal(inv.itemizedSummary.reduce((s, l) => s + l.totalPriceDA, 0), inv.grandTotalCustomerPriceDA);
    inv.itemizedSummary.forEach((l) => assert.ok(Number.isFinite(l.unitPriceDA) && Number.isFinite(l.totalPriceDA)));
    checked++;
  }
  assert.ok(checked > 0);
});

test('invoice: a line with a zero quantity does not produce NaN / Infinity', () => {
  const report = { projectTimestamp: 'x', totalKitchenCostDA: 1000, woodPanelsSummary: [], appliancesSummary: [], issues: [], shortages: [], stockLedger: [], hardwareAccessoriesSummary: [{ cabinetName: 'g', category: 'c', brand: 'b', modelType: 'm', quantityRequired: 0, unitPriceDA: 0, totalHardwareCostDA: 1000 }] };
  const inv = generateCustomerInvoice(report);
  assert.ok(inv.itemizedSummary.every((l) => Number.isFinite(l.unitPriceDA)));
  assert.equal(inv.itemizedSummary.reduce((s, l) => s + l.totalPriceDA, 0), inv.grandTotalCustomerPriceDA);
});

// ------------------------------------------------------------------------------------------------ degenerate zones (found by the fuzz)
const cabOf = (zones: any[], over: any = {}) => {
  const d0 = { ...M.config('deepDrawers'), height: 720, ...over, zones };
  const d = P.resolveDraft(d0, WOODS, HW, ROLLS);
  const cab = { ...P.draftToNewCabinet(d, { id: 'z', name: 'z', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  return { cab, pr: E.priceCabinet(cab, WOODS, HW, ROLLS) };
};

test('zones: every flexible zone needs its minimum height, not just the total', () => {
  const { pr } = cabOf([{ kind: 'DRAWERS', count: 5, heightMm: 443 }, ...Array.from({ length: 4 }, () => ({ kind: 'DRAWERS', count: 3 }))], { height: 669 });
  assert.ok(pr.issues.some((i) => i.code === 'ZONES_TOO_TALL' && i.severity === 'error'), '118 mm shared by 4 zones is 29 mm each');
  assert.ok(!cabOf([{ kind: 'DRAWERS', count: 3 }, { kind: 'DOORS', count: 2 }]).pr.issues.some((i) => i.code === 'ZONES_TOO_TALL'));
});

test('gola: a zone too short for a channel plus usable fronts gets no channel, and the engine says so', () => {
  const { pr } = cabOf([{ kind: 'DRAWERS', count: 3, heightMm: 60 }, { kind: 'DOORS', count: 2 }], { openingMode: 'GOLA' });
  const { facades, channels } = pr.model.plan;
  assert.deepEqual(pr.model.plan.golaSkipped, [0]);
  assert.ok(pr.issues.some((i) => i.code === 'GOLA_ZONE_TOO_SHORT'));
  assert.deepEqual(channels.map((c) => c.zoneIndex), [1], 'the tall zone keeps its channel');
  assert.ok(facades.every((f) => f.heightMm > 0), 'no collapsed front');
});

test('shelves: too many shelves for the opening are flagged instead of overlapping silently', () => {
  assert.ok(cabOf([{ kind: 'OPEN', shelves: 4, heightMm: 120 }, { kind: 'DOORS', count: 2 }]).pr.issues.some((i) => i.code === 'SHELVES_TOO_CLOSE'));
  assert.ok(!cabOf([{ kind: 'DOORS', count: 2, shelves: 3 }]).pr.issues.some((i) => i.code === 'SHELVES_TOO_CLOSE'));
});
