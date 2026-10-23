// The back of the cabinet is the user's choice (math/backPanel.ts): a 3 mm HDF sheet on the rear face (the old way),
// two battens cut from the carcase board (one at the bottom, one at the top), or a full carcase board fitted inside the
// rear. What is chosen is what is cut, drawn, counted and priced — and the cutting list and the 3D never disagree.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import type { CabinetObject, CabinetZone } from '../../src/types/flatma';
import { assemblyGeometry } from '../../src/math/assemblyGeometry';
import { buildFasteners, fastenerCounts } from '../../src/math/fasteners';
import { BACK } from '../../src/math/constants';
import { backPanelModeOf, backRailDepthOf } from '../../src/math/backPanel';
import { generateFactoryBOMReport } from '../../src/math/bomEngine';

const wood = (id: string, th: number, type = 'MDF Melamine Matt', price = 15000) =>
  ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 50, averagePriceDA: price } as any);
const hw = (id: string, category: string, modelType = 'x', price = 300) =>
  ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: 500 } as any);
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges'), hw('slide', 'Drawer Slide Systems'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120)];

let n = 0;
/** What these tests vary: the way the back is closed (and the height, for the short-rail case). */
type BackChoice = Partial<Pick<CabinetObject, 'backPanel' | 'backRailDepthMm'>> & { height?: number };
/** A 600 x 870 x 600 floor unit. `base: NONE` keeps the whole 870 as the body, so the back is 870 mm tall. */
const make = (zones: CabinetZone[], extra: BackChoice = {}) => {
  const r = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), base: { type: 'NONE' }, width: 600, height: 870, depth: 600, zones, ...extra } as P.CabinetDraft, WOODS, HW, []);
  return { ...P.draftToNewCabinet(r, { id: 'b' + n++, name: 'b' + n, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 } as CabinetObject;
};
const DOORS: CabinetZone[] = [{ kind: 'DOORS', count: 2, shelves: 1 }];
const partsOf = (cab: CabinetObject) => E.modelCabinet(cab, 18, 18).parts;
const rows = (cab: CabinetObject, re: RegExp) => partsOf(cab).filter((p) => re.test(p.partType));
const geoOf = (cab: CabinetObject) => assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });

test('the back is HDF unless the user says otherwise: the old cabinet is untouched', () => {
  const plain = make(DOORS);
  assert.equal(backPanelModeOf(plain), 'HDF');
  const [back] = rows(plain, /Backwall/);
  assert.deepEqual([back.thicknessMm, back.widthMm, back.lengthMm, back.role], [3, 600, 870, 'back']);
  // nothing inside the carcase shrank: the dividers and the shelves still use the whole depth
  assert.equal(rows(plain, /Adjustable Internal Shelf/)[0].widthMm, 600 - 20);
  const box = geoOf(plain).boxes.find((b) => b.kind === 'back');
  assert.deepEqual([box.sizeMm[0], box.sizeMm[2]], [600, 3], 'a sheet on the rear face');
  assert.ok(box.centerMm[2] < -300, 'outside the carcase');
});

test('two rails instead of a sheet: cut from the carcase board, one on the deck and one under the top', () => {
  const rails = make(DOORS, { backPanel: 'RAILS' });
  const [row] = rows(rails, /Back Rail/);
  assert.equal(rows(rails, /Back Rail/).length, 1, 'one cutting row, two identical pieces');
  assert.deepEqual([row.partType, row.quantity, row.widthMm, row.lengthMm, row.thicknessMm, row.role], ['Back Rail (Top & Bottom)', 2, 600 - 36, 100, 18, 'carcase']);
  assert.equal(rows(rails, /Backwall/).length, 0, 'no sheet at all');
  // the 3D: one rail on the bottom board, one under the top
  const boxes = geoOf(rails).boxes.filter((b) => b.kind === 'backrail');
  assert.equal(boxes.length, 2);
  const [low, high] = boxes.sort((a, b) => a.centerMm[1] - b.centerMm[1]);
  assert.deepEqual([low.centerMm[1] - 50, low.centerMm[1] + 50], [18, 118], 'standing on the 18 mm bottom board');
  assert.deepEqual([high.centerMm[1] - 50, high.centerMm[1] + 50], [870 - 18 - 100, 870 - 18], 'under the top');
  assert.ok(boxes.every((b) => b.centerMm[2] > -300 && b.centerMm[2] < 0), 'inside the rear, not glued outside');
});

test('the rail depth is the user\'s: clamped to what a batten comes in', () => {
  assert.equal(backRailDepthOf({}), BACK.RAIL_DEPTH_MM);
  assert.equal(backRailDepthOf({ backRailDepthMm: 150 }), 150);
  assert.equal(backRailDepthOf({ backRailDepthMm: 40 }), BACK.RAIL_DEPTH_RANGE_MM[0], 'below 50 it is raised to 50');
  assert.equal(backRailDepthOf({ backRailDepthMm: 500 }), BACK.RAIL_DEPTH_RANGE_MM[1], 'above 200 it is cut to 200');
  const fat = make(DOORS, { backPanel: 'RAILS', backRailDepthMm: 500 });
  assert.equal(rows(fat, /Back Rail/)[0].lengthMm, 200);
});

test('a short closed part takes one rail in the middle, not two that would touch', () => {
  // a wall unit 300 mm tall: 300 - 18 bottom - 18 top = 264 of clear height < 2 x 200 + 1
  const short = make([{ kind: 'DOORS', count: 1, shelves: 0 }], { height: 300, backPanel: 'RAILS', backRailDepthMm: 150 });
  const [row] = rows(short, /Back Rail/);
  assert.deepEqual([row.partType, row.quantity, row.lengthMm], ['Back Rail', 1, 150]);
  assert.equal(geoOf(short).boxes.filter((b) => b.kind === 'backrail').length, 1);
});

test('a full panel like the other carcase parts: its own board, inside the rear, and the inside makes room for it', () => {
  const panel = make(DOORS, { backPanel: 'PANEL' });
  const [row] = rows(panel, /Back Panel/);
  assert.deepEqual([row.partType, row.thicknessMm, row.widthMm, row.lengthMm, row.role], ['Back Panel (carcase board)', 18, 600 - 36, 870 - 36, 'carcase']);
  assert.equal(rows(panel, /Backwall/).length, 0);
  // everything that runs from the back to the front stops at the panel: shelves and the vertical boards lose its thickness
  assert.equal(rows(panel, /Adjustable Internal Shelf/)[0].widthMm, 600 - 20 - 18);
  const box = geoOf(panel).boxes.find((b) => b.kind === 'backpanel');
  assert.deepEqual([box.sizeMm[0], box.sizeMm[2]], [600 - 36, 18]);
  assert.ok(Math.abs(box.centerMm[2] - (-300 + 9)) < 0.01, 'flush with the rear face, inside');
  const shelf = geoOf(panel).boxes.find((b) => b.kind === 'shelf')!;
  assert.ok(shelf.centerMm[2] - shelf.sizeMm[2] / 2 >= -300 + 18 - 0.01, 'no shelf goes through the panel');
});

test('the divider between two zones stops at the full back panel, and only there', () => {
  const zones: CabinetZone[] = [{ kind: 'DOORS', count: 2, shelves: 0, heightMm: 400 }, { kind: 'DRAWERS', count: 3 }];
  const hdf = rows(make(zones), /Zone Divider Panel/)[0];
  const panel = rows(make(zones, { backPanel: 'PANEL' }), /Zone Divider Panel/)[0];
  assert.equal(hdf.widthMm, 600, 'the whole depth as before');
  assert.equal(panel.widthMm, 600 - 18, 'less the back panel');
  assert.equal(geoOf(make(zones, { backPanel: 'PANEL' })).boxes.find((b) => b.kind === 'divider')!.centerMm[2], 9, 'moved forward by its half');
});

test('every way of closing the back is screwed: no back screw is lost', () => {
  const count = (extra: BackChoice) => {
    const cab = make(DOORS, extra);
    const list = buildFasteners(geoOf(cab), cab, { carcaseTh: 18, frontTh: 18 });
    return fastenerCounts(list).BACK_SCREW;
  };
  const hdf = count({});
  const rails = count({ backPanel: 'RAILS' });
  const panel = count({ backPanel: 'PANEL' });
  assert.ok(hdf > 0 && rails > 0 && panel > 0);
  assert.ok(rails < hdf, 'two rails take fewer screws than a whole sheet');
});

test('the choice survives a round trip through the form, and HDF writes nothing', () => {
  assert.equal(P.draftToCabinetPatch({ ...P.cabinetToDraft(make(DOORS, { backPanel: 'PANEL' })) }).backPanel, 'PANEL');
  const rails = P.draftToCabinetPatch({ ...P.cabinetToDraft(make(DOORS, { backPanel: 'RAILS', backRailDepthMm: 140 })) });
  assert.deepEqual([rails.backPanel, rails.backRailDepthMm], ['RAILS', 140]);
  const hdf = P.draftToCabinetPatch({ ...P.cabinetToDraft(make(DOORS)) });
  assert.equal(hdf.backPanel, undefined, 'the default is not written: an old cabinet keeps its shape');
  assert.equal(P.cabinetToDraft(make(DOORS)).backPanel, 'HDF', 'but the form shows it as HDF');
});

test('the BOM prices the back from the sheet the user chose', () => {
  const report = (extra: BackChoice) => generateFactoryBOMReport([make(DOORS, extra)], WOODS as any, HW as any, []);
  const hdfRows = report({}).woodPanelsSummary.filter((r: any) => /Backwall/.test(r.partType));
  const panelRows = report({ backPanel: 'PANEL' }).woodPanelsSummary.filter((r: any) => /Back Panel|Backwall/.test(r.partType));
  assert.equal(hdfRows.length, 1);
  assert.equal(panelRows.length, 1);
  assert.equal(hdfRows[0].materialType, 'HDF Standard 3mm');
  assert.notEqual(panelRows[0].materialType, 'HDF Standard 3mm', 'the full panel is the cabinet\'s own board');
});

test('an appliance bay keeps its open back whatever the choice', () => {
  const bay: CabinetZone[] = [{ kind: 'APPLIANCE', appliance: 'WASHER', heightMm: 820 }, { kind: 'DOORS', count: 2, shelves: 0 }];
  for (const mode of ['HDF', 'PANEL'] as const) {
    const cab = make(bay, { backPanel: mode });
    const [back] = rows(cab, /Backwall|Back Panel/);
    assert.ok(back.lengthMm < 870 - 820 + 40, `${mode}: only the closed part above the bay is cut`);
    assert.ok(geoOf(cab).boxes.every((b) => b.kind !== 'back' && b.kind !== 'backpanel') === false);
  }
  // a bay alone has no back at all
  const alone = make([{ kind: 'APPLIANCE', appliance: 'WASHER', heightMm: 820 }], { backPanel: 'RAILS' });
  assert.equal(rows(alone, /Backwl|Back Rail|Back Panel/).length, 0);
});
