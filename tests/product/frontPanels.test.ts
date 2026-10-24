// «بلا واجهة» is a fact of the cabinet, not a missing band.
//
// A bay that holds a washing machine or a dishwasher under the worktop is an OPEN niche (`panelFront` off): no door is cut, so
// the atomic view must not ask it for an edge band — that was the red line the client saw. And the band itself is a ROLL of
// the stock (its thickness, its metres, its price), chosen in the stock panel: the app invents no band on its own, and a board
// carries no band of its own (that field was removed at the client's request — it duplicated the roll and could shrink a
// door's cut size without pricing the band).
import test from 'node:test';
import assert from 'node:assert/strict';
import { cabinetHasFronts, frontPanelCount, zonesOf } from '../../src/math/zones';
import { priceCabinet } from '../../src/math/partsEngine';

const wood = (id: string, th: number, type = 'MDF Melamine Matt') => ({
  id, brand: id.toUpperCase(), type, thickness: th, widthSheet: 2800, heightSheet: 2070,
  edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000,
});
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm'), wood('mel', 18)] as never[];
const HW = [
  { id: 'hinge', category: 'Cabinet Hinges', brand: 'B', modelType: 'x', pricePerUnitDA: 300, availableQty: 100 },
  { id: 'slide', category: 'Drawer Slide Systems', brand: 'B', modelType: 'x', pricePerUnitDA: 400, availableQty: 100 },
] as never[];
const ROLLS = [
  { id: 'r04', brand: 'PVC', thickness: 0.4, width: 22, totalLengthMeters: 100, rollPriceDA: 2000 },
  { id: 'r2', brand: 'ABS', thickness: 2, width: 45, totalLengthMeters: 50, rollPriceDA: 4000 },
] as never[];

const cab = (zones: Array<Record<string, unknown>>, over: Record<string, unknown> = {}) => ({
  id: 'c', name: 'c', category: 'BASE_UNIT' as const, width: 600, height: 870, depth: 600,
  positionX: 0, positionY: 0, positionZ: 0, shelvesCount: 0,
  carcaseMaterialId: 'mel', frontMaterialId: 'mel', carcaseThickness: 18, frontThickness: 18,
  carcaseEdgeRollId: undefined as string | undefined, frontEdgeRollId: undefined as string | undefined,
  frontConfig: { openingType: 'NONE' as const, elementCount: 0, hardwareItemId: '', hasGolaProfile: false },
  zones: zones as never, calculatedCostDA: 0, ...over,
});

// ------------------------------------------------------------------------------------------ بلا واجهة: تجويف الغسالة
test('a washing-machine bay has no front: nothing is cut as a front, so no band can be missing', () => {
  const washer = cab([{ kind: 'APPLIANCE', appliance: 'WASHER', shelves: 0 }]);
  assert.equal(cabinetHasFronts(washer), false, 'an open appliance bay is not a front');
  const priced = priceCabinet(washer as never, WOODS, HW, ROLLS);
  assert.equal(frontPanelCount(priced.parts), 0, 'no front part is produced');
  assert.equal(priced.edgeUsage.length, 0, 'and nothing is banded');
});

test('a dishwasher bay is the same — and it is read from the ZONES, not from the opening mode', () => {
  const dish = cab([{ kind: 'APPLIANCE', appliance: 'DISHWASHER', shelves: 0 }]);
  assert.deepEqual(zonesOf(dish as never).map((z) => z.kind), ['APPLIANCE'], 'the mode alone says nothing');
  assert.equal(cabinetHasFronts(dish), false);
});

test('a panel in front of the appliance IS a front (لوح واجهة أمام الجهاز)', () => {
  const withPanel = cab([{ kind: 'APPLIANCE', appliance: 'WASHER', shelves: 0, panelFront: true }]);
  assert.equal(cabinetHasFronts(withPanel), true);
  assert.equal(frontPanelCount(priceCabinet(withPanel as never, WOODS, HW, ROLLS).parts), 1);
});

test('a door above the washing machine is cut and banded, the niche below is not', () => {
  const mixed = cab([{ kind: 'APPLIANCE', appliance: 'WASHER', shelves: 0 }, { kind: 'DOORS', count: 1, shelves: 0 }],
    { frontEdgeRollId: 'r04' });
  assert.equal(cabinetHasFronts(mixed), true);
  const priced = priceCabinet(mixed as never, WOODS, HW, ROLLS);
  assert.equal(frontPanelCount(priced.parts), 1, 'the door, and only the door');
  assert.ok(priced.edgeUsage.some((u) => u.part === 'front'), 'the chosen roll is really used');
});

test('open shelves are not a front, a fixed apron panel is', () => {
  assert.equal(cabinetHasFronts(cab([{ kind: 'OPEN', shelves: 2 }])), false);
  assert.equal(cabinetHasFronts(cab([{ kind: 'APRON', shelves: 0 }])), true, 'لوح واجهة ثابت is a panel');
  assert.equal(cabinetHasFronts(cab([{ kind: 'DRAWERS', count: 3, shelves: 0 }])), true);
});

// ------------------------------------------------------------------------------------------ الشريط من المخزن وحده
test('a board carries no band of its own: with no roll picked there is no band, no cost and no invented thickness', () => {
  const doorCab = cab([{ kind: 'DOORS', count: 2, shelves: 0 }]);
  const priced = priceCabinet(doorCab as never, WOODS, HW, ROLLS);
  const door = priced.parts.find((p) => p.partType.startsWith('Door Facade Panel'))!;
  assert.equal(door.edgeMm, 0, 'nothing is assumed');
  assert.equal(door.cutWidthMm, door.widthMm, 'the cut size equals the finished size');
  assert.equal(priced.edgeUsage.length, 0, 'no band line in the cost');
});

test('the band is the ROLL the user picked — its thickness, its metres, its price', () => {
  const doorCab = cab([{ kind: 'DOORS', count: 2, shelves: 0 }], { frontEdgeRollId: 'r2', carcaseEdgeRollId: 'r04' });
  const priced = priceCabinet(doorCab as never, WOODS, HW, ROLLS);
  const door = priced.parts.find((p) => p.partType.startsWith('Door Facade Panel'))!;
  assert.equal(door.edgeMm, 2, 'the front roll is 2 mm');
  assert.equal(door.cutWidthMm, door.widthMm - 4, 'two sides');
  const front = priced.edgeUsage.find((u) => u.part === 'front')!;
  assert.ok(front.meters > 0, 'metres of the roll are counted');
  assert.ok(front.costDA > 0, 'and priced from the roll');
});
