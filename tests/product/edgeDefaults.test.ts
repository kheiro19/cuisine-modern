// A front leaves the workshop banded (math/edgeDefaults.ts). These are the three ways the band is decided, and the reason the
// atomic view used to shout «لا شريط محدد للواجهات» on every kitchen built from boards typed into the stockroom (which stored
// edgeThickness 0): no roll was picked, the board declared no band, and nothing filled the gap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { NO_EDGE_ROLL, cabinetHasFronts, defaultFrontEdgeRollId, frontPanelCount, withDefaultFrontEdge } from '../../src/math/edgeDefaults';

const board = (id: string, edgeThickness: number) => ({
  id, brand: id.toUpperCase(), type: 'MDF Melamine Matt', widthSheet: 2800, heightSheet: 2070,
  thickness: 18, edgeThickness, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000,
});
const roll = (id: string, thickness: number) => ({
  id, brand: id.toUpperCase(), thickness, width: 22, totalLengthMeters: 100, rollPriceDA: 2000,
}) as never;

const BOARDS = [board('bare', 0), board('banded', 1)] as never[];
const ROLLS = [roll('r2', 2), roll('r04', 0.4), roll('r1', 1)];

test('no roll and no band on the board: the stock’s own thinnest roll is used', () => {
  assert.equal(defaultFrontEdgeRollId({ frontMaterialId: 'bare' }, BOARDS, ROLLS), 'r04');
});

test('a board that declares its own band needs no roll (the band comes with the sheet)', () => {
  assert.equal(defaultFrontEdgeRollId({ frontMaterialId: 'banded' }, BOARDS, ROLLS), undefined);
});

test('a roll the user picked wins, and «بدون شريط» is a decision, not a gap', () => {
  assert.equal(defaultFrontEdgeRollId({ frontMaterialId: 'bare', frontEdgeRollId: 'r2' }, BOARDS, ROLLS), 'r2');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  assert.equal(defaultFrontEdgeRollId({ frontMaterialId: 'bare', frontEdgeRollId: (NO_EDGE_ROLL as any) }, BOARDS, ROLLS), NO_EDGE_ROLL);
});

test('an empty stock has nothing to pick: the front stays as it is, never a made-up number', () => {
  assert.equal(defaultFrontEdgeRollId({ frontMaterialId: 'bare' }, BOARDS, []), undefined);
  assert.equal(defaultFrontEdgeRollId({ frontMaterialId: 'unknown' }, BOARDS, []), undefined);
});

test('the cabinet comes back as the SAME object when nothing changes (no fake re-render, no fake undo step)', () => {
  const cab = { frontMaterialId: 'banded', frontEdgeRollId: 'r1' };
  assert.equal(withDefaultFrontEdge(cab, BOARDS, ROLLS), cab);
  assert.deepEqual(withDefaultFrontEdge({ frontMaterialId: 'bare' }, BOARDS, ROLLS), { frontMaterialId: 'bare', frontEdgeRollId: 'r04' });
});

test('the engine really cuts and prices the default band: 0.4 mm off each side of the door, band metres in the cost', async () => {
  const { priceCabinet } = await import('../../src/math/partsEngine');
  const cab = {
    id: 'c1', name: 'c1', category: 'BASE_UNIT' as const, width: 600, height: 870, depth: 600,
    positionX: 0, positionY: 0, positionZ: 0, shelvesCount: 1,
    carcaseMaterialId: 'bare', frontMaterialId: 'bare', carcaseThickness: 18, frontThickness: 18,
    carcaseEdgeRollId: 'r1', frontEdgeRollId: undefined,
    frontConfig: { openingType: 'DOORS' as const, elementCount: 2, hardwareItemId: 'hinge', hasGolaProfile: false },
    calculatedCostDA: 0,
  };
  const edged = withDefaultFrontEdge(cab, BOARDS, ROLLS) as typeof cab;
  assert.equal(edged.frontEdgeRollId, 'r04', 'the stock’s thinnest roll');
  const priced = priceCabinet(edged, BOARDS, [], ROLLS);
  const door = priced.parts.find((p) => p.partType.startsWith('Door Facade Panel'))!;
  assert.equal(door.edgeMm, 0.4);
  assert.equal(door.cutWidthMm, door.widthMm - 0.8, 'a 0.4 mm band on each side');
  assert.ok(priced.edgeUsage.some((u) => u.part === 'front'), 'the band is paid for, because it is really used');
});

// -------------------------------------------------------------------------------------------------------- بلا واجهة
// «خزانات فيها غسالة ملابس أو غسالة أواني تحت الرخام ليس فيها واجهة — كيف يطلب شريطاً وليس هناك واجهة؟»
// A bay that holds a washing machine or a dishwasher is an OPEN niche: `panelFront` off. No door is cut, so no band exists to
// be missing — and the cabinet must not be handed a default roll that would never be used.

const baseCab = (zones: Array<Record<string, unknown>>) => ({
  id: 'bay', name: 'bay', category: 'BASE_UNIT' as const, width: 600, height: 870, depth: 600,
  positionX: 0, positionY: 0, positionZ: 0, shelvesCount: 0,
  carcaseMaterialId: 'bare', frontMaterialId: 'bare', carcaseThickness: 18, frontThickness: 18,
  frontEdgeRollId: undefined as string | undefined,
  frontConfig: { openingType: 'NONE' as const, elementCount: 0, hardwareItemId: '', hasGolaProfile: false },
  zones: zones as never, calculatedCostDA: 0,
});

test('a washing-machine bay has NO front, so it is never asked for a band', async () => {
  const { priceCabinet } = await import('../../src/math/partsEngine');
  const washer = baseCab([{ kind: 'APPLIANCE', appliance: 'WASHER', shelves: 0 }]);
  assert.equal(cabinetHasFronts(washer), false, 'an open appliance bay is not a front');
  assert.equal(withDefaultFrontEdge(washer, BOARDS, ROLLS).frontEdgeRollId, undefined, 'no roll is invented for it');
  const priced = priceCabinet(withDefaultFrontEdge(washer, BOARDS, ROLLS) as never, BOARDS, [], ROLLS);
  assert.equal(frontPanelCount(priced.parts), 0, 'nothing is cut as a front');
  assert.equal(priced.edgeUsage.length, 0, 'and nothing is banded');
});

test('a dishwasher bay is the same, and a fixed front panel on the bay IS a front', () => {
  const dish = baseCab([{ kind: 'APPLIANCE', appliance: 'DISHWASHER', shelves: 0 }]);
  assert.equal(cabinetHasFronts(dish), false);
  const withPanel = baseCab([{ kind: 'APPLIANCE', appliance: 'DISHWASHER', shelves: 0, panelFront: true }]);
  assert.equal(cabinetHasFronts(withPanel), true, 'a panel in front of the appliance is a front');
});

test('doors over the bay still get their band: the cabinet has a front even when the niche does not', async () => {
  const { priceCabinet } = await import('../../src/math/partsEngine');
  const mixed = baseCab([{ kind: 'APPLIANCE', appliance: 'WASHER', shelves: 0 }, { kind: 'DOORS', count: 1, shelves: 0 }]);
  assert.equal(cabinetHasFronts(mixed), true);
  const edged = withDefaultFrontEdge(mixed, BOARDS, ROLLS) as never;
  assert.equal((edged as { frontEdgeRollId?: string }).frontEdgeRollId, 'r04');
  const priced = priceCabinet(edged, BOARDS, [], ROLLS);
  assert.equal(frontPanelCount(priced.parts), 1, 'the door above the washing machine is cut and banded');
});

test('open shelves and a plain doorless carcase are not fronts either', () => {
  assert.equal(cabinetHasFronts(baseCab([{ kind: 'OPEN', shelves: 2 }])), false);
  assert.equal(cabinetHasFronts(baseCab([{ kind: 'APRON', shelves: 0 }])), true, 'لوح واجهة ثابت is a panel');
});
