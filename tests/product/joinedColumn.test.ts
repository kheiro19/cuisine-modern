// The "merge the other column with the zone below" button (ZoneSplit.joinBelow): two split zones on the same side
// become ONE side column — one vertical board as tall as both zones, no horizontal shelf/board crossing that
// column between them, and one front over both. These tests pin the whole promise (cutting list = drawing =
// fronts), the off state, and the two refusals, so `npm test` shouts if the merge ever silently comes apart.
import * as M from '../fixtures/matrix';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import { assemblyGeometry } from '../../src/math/assemblyGeometry';
import type { CabinetZone } from '../../src/types/flatma';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dow', 'Assembly & Fixing', 'Wooden Dowel', 2)];
const OPTS = { carcaseTh: 18, frontTh: 18, lift: false, inset: false };

/** Two door zones, each split into a 500 mm door column and a small-door filler, the upper one optionally merged down. */
const twoZones = (joinBelow: boolean, upperSide: 'LEFT' | 'RIGHT' = 'LEFT', lowerSplit = true) => {
  const zones: CabinetZone[] = [
    { kind: 'DOORS', count: 1, shelves: 0, ...(lowerSplit ? { split: { mainSide: 'LEFT', mainWidthMm: 500, fill: 'DOOR' } } : {}) },
    { kind: 'DOORS', count: 1, shelves: 0, split: { mainSide: upperSide, mainWidthMm: 500, fill: 'DOOR', ...(joinBelow ? { joinBelow: true } : {}) } },
  ];
  const d0 = M.floorUnit({ width: 900, height: 1400, zones });
  const d = P.resolveDraft(d0, WOODS, HW, []);
  const cab = { ...P.draftToNewCabinet(d, { id: 't', name: 't', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  return { d, cab, pr: E.priceCabinet(cab, WOODS, HW, []), geo: assemblyGeometry(cab, OPTS) };
};
const columnBoards = (pr) => pr.parts.filter((p) => /Zone Column Board/.test(p.partType));
const columnBoxes = (geo) => geo.boxes.filter((b) => b.kind === 'vdivider');
const dividerRow = (pr) => pr.parts.find((p) => /Zone Divider Panel/.test(p.partType));
const dividerBox = (geo) => geo.boxes.find((b) => b.kind === 'divider');
const fillFronts = (geo) => geo.facades.filter((f) => f.column === 'FILL');

test('joined column: the choice survives the draft, the save and the re-open', () => {
  const { d, cab } = twoZones(true);
  assert.equal(d.zones[1].split?.joinBelow, true, 'the resolver keeps the merge');
  assert.equal(P.cabinetToDraft(cab).zones[1].split?.joinBelow, true, 'a saved cabinet re-opens with the merge still on');
});

test('joined column: both zones carry the same join group, from the lowest to the highest zone', () => {
  const { pr } = twoZones(true);
  assert.deepEqual(pr.model.layout.bands.map((b) => b.join), [
    { lowIndex: 0, highIndex: 1 },
    { lowIndex: 0, highIndex: 1 },
  ]);
  const off = twoZones(false);
  assert.ok(off.pr.model.layout.bands.every((b) => b.join === undefined), 'the button off: no group');
});

test('joined column: ONE vertical board as tall as both zones, in the cutting list and in the drawing alike', () => {
  const { pr, geo } = twoZones(true);
  const rows = columnBoards(pr);
  assert.equal(rows.length, 1, 'one row, not one per zone');
  assert.match(rows[0].partType, /zones 1–2/, 'the row says which zones it spans');
  assert.equal(rows[0].lengthMm, 1364, '673 + the 18 mm divider + 673: it passes where the divider stops');
  const boxes = columnBoxes(geo);
  assert.equal(boxes.length, 1, 'the drawing agrees: one board');
  assert.equal(boxes[0].sizeMm[1], rows[0].lengthMm, 'drawing and cutting list are the same board');
  // the button off again: each zone gets its own board back
  const off = twoZones(false);
  assert.equal(columnBoards(off.pr).length, 2);
  assert.deepEqual(columnBoxes(off.geo).map((b) => b.sizeMm[1]), [673, 673]);
});

test('joined column: no shelf/board crosses the merged column — the divider runs across the MAIN column only', () => {
  const { pr, geo } = twoZones(true);
  assert.match(dividerRow(pr).partType, /main column only/);
  assert.equal(dividerRow(pr).lengthMm, 500, 'the divider is cut to the 500 mm door column, not the whole 864 mm inside width');
  assert.equal(dividerBox(geo).sizeMm[0], 500, 'and drawn exactly that wide: the merged side stays open from zone to zone');
  const off = twoZones(false);
  assert.equal(dividerRow(off.pr).lengthMm, 864, 'button off: the divider crosses the whole width again');
  assert.equal(dividerBox(off.geo).sizeMm[0], 864);
});

test('joined column: ONE front covers the merged column over both zones', () => {
  const { pr, geo } = twoZones(true);
  const fronts = fillFronts(geo);
  assert.equal(fronts.length, 1, 'one small door, not two stacked ones');
  assert.equal(fronts[0].zoneIndex, 0, 'the lowest zone carries it');
  assert.equal(fronts[0].spanToZone, 1, 'and it reaches up to the highest zone of the group');
  assert.equal(fronts[0].heightMm, 1396, 'the full height of the two zones');
  assert.equal(pr.model.plan.facades.filter((f) => f.column === 'FILL').length, 1, 'the pricing plan agrees');
  const off = twoZones(false);
  assert.equal(fillFronts(off.geo).length, 2, 'button off: each zone has its own front again');
});

test('joined column refusals: a different side, or no board below, merges nothing and the engine says why', () => {
  // the two splits must stand on the same side
  const mirrored = twoZones(true, 'RIGHT');
  assert.ok(mirrored.pr.model.layout.bands.every((b) => b.join === undefined));
  assert.ok(mirrored.pr.issues.some((i) => i.code === 'SPLIT_JOIN_INVALID'), 'the refusal is a named warning, not silence');
  assert.equal(columnBoards(mirrored.pr).length, 2, 'each zone keeps its own board');
  // the zone below must itself be split
  const noBoardBelow = twoZones(true, 'LEFT', false);
  assert.ok(noBoardBelow.pr.model.layout.bands.every((b) => b.join === undefined));
  assert.ok(noBoardBelow.pr.issues.some((i) => i.code === 'SPLIT_JOIN_INVALID'));
});
