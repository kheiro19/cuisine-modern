// Priority 9 of test.md: the stock really goes down when a cabinet is built, and really comes back when it is edited away,
// deleted or undone. The mechanism is `applyConsumptionDelta` (math/stockDelta.ts), the one line the context calls on EVERY
// change of the cabinet list, so the same three operations are exercised here on the exact function the app uses.
//
// What this file proves, in one sentence per test:
//   1. adding a cabinet takes exactly what its BOM says;
//   2. undoing gives back exactly that, to the piece;
//   3. deleting gives back exactly that;
//   4. editing takes / gives back only the DIFFERENCE, never the whole thing twice;
//   5. ten add/undo cycles leave the stock where it started (no drift, no pieces invented);
//   6. a shortage may go negative, and undo returns the shelf to its original count, not to zero;
//   7. an item registered after the cabinets is charged retroactively, and returned when they go;
//   8. an edit that changes what a cabinet is made of (legs -> wooden frame) returns the legs.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import { applyConsumptionDelta, hardwareConsumption, registerHardwareItem, totalConsumption } from '../../src/math/stockDelta';
import type { CabinetObject, EdgeBandRoll, InjectedHardwareItem, InjectedWoodMaterial } from '../../src/types/flatma';

// ------------------------------------------------------------------------------------------------ the workshop
const wood = (id: string, th: number, qty = 100): InjectedWoodMaterial => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: qty, averagePriceDA: 15000 });
const hw = (id: string, category: any, modelType: string, qty: number): InjectedHardwareItem => ({ id, category, brand: 'B', modelType, pricePerUnitDA: 100, availableQty: qty });
const ROLLS: EdgeBandRoll[] = [{ id: 'r1', brand: 'Rehau', thickness: 0.5, width: 22, totalLengthMeters: 500, rollPriceDA: 2500 }];
const WOODS = [wood('hdf', 3), wood('mel', 18)];

const STOCK = (): InjectedHardwareItem[] => [
  hw('hinge', 'Cabinet Hinges', 'Clip Top Hinge', 100),
  hw('slide', 'Drawer Slide Systems', 'Ball Bearing Runner', 100),
  hw('cam', 'Assembly & Fixing', 'Cam Lock', 1000),
  hw('dowel', 'Assembly & Fixing', 'Wooden Dowel', 1000),
  hw('screw', 'Assembly & Fixing', 'Back Panel Screw', 1000),
  hw('pin', 'Assembly & Fixing', 'Shelf Support Pin', 1000),
  hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 100),
];
const qtyOf = (items: InjectedHardwareItem[], id: string) => items.find((i) => i.id === id)?.availableQty as number;
/** The shelf count of one item before anything happens. */
const initial = (items: InjectedHardwareItem[]) => Object.fromEntries(items.map((i) => [i.id, i.availableQty])) as Record<string, number>;

let n = 0;
/** A cabinet exactly as the app builds one (math/cabinetPresets -> partsEngine). */
const build = (over: any = {}): CabinetObject => {
  const d = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), width: 600, height: 870, depth: 600, carcaseEdgeRollId: 'r1', frontEdgeRollId: 'r1', ...over }, WOODS, STOCK(), ROLLS);
  return { ...P.draftToNewCabinet(d, { id: 'c' + n++, name: 'unit ' + n, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
};

/**
 * THE CONTEXT, in ten lines. `FurnitureProvider.commit()` does exactly this: one delta between the old list and the new one,
 * on every add / edit / delete / undo. Testing the rule here and the real provider in ui-tests/stockLifecycle.test.tsx
 * covers both the formula and its wiring.
 */
function shelf(start = STOCK()) {
  let items = start;
  return {
    items: () => items,
    qty: (id: string) => qtyOf(items, id),
    /** apply a new list of cabinets, exactly like commit() */
    go: (next: CabinetObject[], before: CabinetObject[]) => { items = applyConsumptionDelta(items, before, next); return items; },
    add: (item: InjectedHardwareItem, cabinets: CabinetObject[]) => { items = registerHardwareItem(items, item, cabinets); return items; },
  };
}

test('1. adding a cabinet takes exactly what its BOM says, item by item', () => {
  const cab = build();
  const s = shelf();
  const start = initial(s.items());
  const need = hardwareConsumption(cab, s.items());
  s.go([cab], []);

  assert.equal(need.hinge, 4, 'two doors, two hinges each');
  assert.equal(need.legs, 4, 'a floor unit on four legs');
  for (const [id, taken] of Object.entries(need)) assert.equal(s.qty(id), start[id] - taken, `${id}: ${start[id]} - ${taken}`);

  // every requirement of the BOM went down by exactly its quantity — no item is forgotten on the way
  const bom = E.priceCabinet(cab, WOODS, s.items(), ROLLS).hardware;
  for (const row of bom) assert.equal(s.qty(row.item.id), start[row.item.id] - row.quantity, `${row.item.modelType}: matches the printed BOM`);
});

test('2. undo gives back exactly what was taken, to the piece', () => {
  const cab = build();
  const s = shelf();
  const before = s.items().map((i) => ({ id: i.id, q: i.availableQty }));
  s.go([cab], []);        // the cabinet is installed
  s.go([], [cab]);        // undo
  before.forEach((b) => assert.equal(s.qty(b.id), b.q, `${b.id} is back to ${b.q}`));
});

test('3. deleting gives back exactly what was taken', () => {
  const s = shelf();
  const a = build();
  const b = build({ width: 900 });
  s.go([a, b], []);
  const afterTwo = s.items().map((i) => ({ id: i.id, q: i.availableQty }));
  s.go([a], [a, b]);      // b deleted
  assert.equal(s.qty('hinge'), afterTwo.find((i) => i.id === 'hinge')!.q + 4, 'b had two doors: four hinges back');
  s.go([], [a]);          // a deleted
  assert.equal(s.qty('hinge'), 100, 'and now everything is back');
  assert.equal(s.qty('legs'), 100);
});

test('4. editing takes or gives back only the DIFFERENCE, never the whole requirement twice', () => {
  const s = shelf();
  const one = build({ zones: [{ kind: 'DOORS', count: 2, shelves: 0 }] });
  s.go([one], []);
  assert.equal(s.qty('hinge'), 96, 'two doors: 4 taken');

  // edit: three doors instead of two -> two more hinges, the first four are NOT taken again
  const three = build({ zones: [{ kind: 'DOORS', count: 3, shelves: 0 }] });
  const edited = { ...one, zones: three.zones };
  s.go([edited], [one]);
  assert.equal(s.qty('hinge'), 94, 'only the difference: 6 - 4 = 2 more');

  // edit back: two doors -> two hinges returned
  s.go([one], [edited]);
  assert.equal(s.qty('hinge'), 96, 'the two extra are given back');
});

test('4b. an edit that removes the legs (wooden frame) gives the four legs back', () => {
  const s = shelf();
  const onLegs = build({ base: { type: 'LEGS' } });
  s.go([onLegs], []);
  const withLegs = s.qty('legs');
  const onFrame = build({ base: { type: 'WOOD' } });
  const edited = { ...onLegs, base: onFrame.base };
  s.go([edited], [onLegs]);
  assert.equal(s.qty('legs'), withLegs + 4, 'a wooden frame stands on the floor: its legs come back');
});

test('5. ten add/undo cycles leave the stock exactly where it started (no drift, no invented pieces)', () => {
  const s = shelf();
  const start = s.items().map((i) => ({ id: i.id, q: i.availableQty }));
  for (let k = 0; k < 10; k++) {
    const cab = build({ width: 400 + k * 60 });
    s.go([cab], []);
    s.go([], [cab]);
  }
  start.forEach((b) => assert.equal(s.qty(b.id), b.q, `${b.id}: still ${b.q} after twenty operations`));
});

test('6. a shortage goes negative, and undo returns the shelf to its original count (not to zero)', () => {
  const s = shelf(STOCK().map((i) => (i.id === 'hinge' ? { ...i, availableQty: 2 } : i)));
  const cab = build();
  s.go([cab], []);
  assert.equal(s.qty('hinge'), -2, 'four hinges wanted, two on the shelf: the hole is visible as a negative count');
  s.go([], [cab]);
  assert.equal(s.qty('hinge'), 2, 'undo restores two, it does not clamp the shelf at zero');
});

test('7. an item registered AFTER the cabinets is charged retroactively, and returned when they go', () => {
  const withoutLegs = STOCK().filter((i) => i.id !== 'legs');
  const s = shelf(withoutLegs);
  const a = build();
  const b = build();
  s.go([a, b], []);                                   // two cabinets drawn with no legs in stock
  assert.equal(s.qty('legs'), undefined, 'no legs yet: nothing to take');

  s.add(hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 100), [a, b]);
  assert.equal(s.qty('legs'), 92, 'eight legs are taken the moment the item exists');

  s.go([a], [a, b]);                                  // one cabinet deleted
  assert.equal(s.qty('legs'), 96, 'its four legs come back');
  s.go([], [a]);
  assert.equal(s.qty('legs'), 100, 'and the shelf is whole again');
});

test('8. the total the ledger reads is the same number the delta applies (no third arithmetic)', () => {
  const s = shelf();
  const cabs = [build(), build({ width: 900 }), build({ zones: [{ kind: 'DRAWERS', count: 3 }], frontConfig: { openingType: 'DRAWERS', elementCount: 3, hardwareItemId: 'hinge', drawerHardwareItemId: 'slide', hasGolaProfile: false } })];
  const start = initial(s.items());
  const need = totalConsumption(cabs, s.items());
  s.go(cabs, []);
  for (const [id, taken] of Object.entries(need)) assert.equal(s.qty(id), start[id] - taken, `${id} = ${start[id]} - ${taken}`);
  // and the delta is symmetric: going back to nothing restores all of it
  s.go([], cabs);
  Object.keys(need).forEach((id) => assert.equal(s.qty(id), start[id], `${id} restored`));
});
