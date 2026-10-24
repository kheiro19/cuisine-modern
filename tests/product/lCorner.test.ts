// The real L corner: three boxes, one continuous interior, the doors on the far ends, every engine still agreeing.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import * as G from '../../src/math/assemblyGeometry';
import * as K from '../../src/math/kitchenLayout';
import { cornerDeckOf, lCornerBoxes, lCornerCabinets, lCornerSpan } from '../../src/math/lCorner';
import type { LCornerParams } from '../../src/math/lCorner';
import { buildFasteners, fastenerCounts } from '../../src/math/fasteners';
import { facadeKey } from '../../src/math/assemblyGeometry';
import { carcaseSidesOf } from '../../src/math/carcaseSides';
import { computeCabinetTotalCost } from '../../src/math/costEngine';
import { drawerBoxBoards } from '../../src/math/drawerBox';
import { autoCornerFillerMm, clampCornerFillerMm as clampCornerFiller, withCornerExtension } from '../../src/math/lCorner';

const wood = (id, th, price = 15000) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 50, averagePriceDA: price });
const hw = (id, category, modelType, price = 300) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: 500 });
const WOODS = [wood('hdf', 3, 4000), wood('mel', 18)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dowel', 'Assembly & Fixing', 'Wooden Dowel', 2), hw('screw', 'Assembly & Fixing', 'Back Panel Screw', 2)];
const ROLLS = [];
const BASE: LCornerParams = { category: 'BASE_UNIT', wall: 'B', depthMm: 600, armAMm: 450, armBMm: 450, roomWidthMm: 3000 };
const build = (over: Partial<LCornerParams> = {}) => {
  let n = 0;
  const p: LCornerParams = { ...BASE, wall: 'B', ...over };
  const list = lCornerCabinets(p, { draft: P.draftFromPreset('L_Corner_Base'), woods: WOODS, hardware: HW, edgeRolls: ROLLS, groupId: 'g1', newId: () => `c${++n}`, name: 'L' });
  return { p, boxes: lCornerBoxes(p), cabs: list.map((c) => ({ ...c, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 })) };
};
const geoOf = (cab) => G.assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
const LAYOUT: K.KitchenLayout = { type: 'L', widthMm: 3000, lSide: 'LEFT' };

test('L corner: on the left wall the square is at the corner, the arms next to it, both arms 450 + 600 from the corner', () => {
  const { boxes } = build();
  assert.deepEqual(boxes.map((b) => [b.role, b.run, b.positionX, b.width]), [['SQUARE', 'A', 0, 600], ['ARM_A', 'A', 600, 450], ['ARM_B', 'B', 600, 450]]);
  assert.deepEqual(lCornerSpan(BASE), { alongA: 1050, alongSide: 1050 });
});

test('L corner: on the right wall everything is mirrored (measured from the back wall length)', () => {
  const { boxes } = build({ wall: 'C' });
  assert.deepEqual(boxes.map((b) => [b.role, b.run, b.positionX, b.width]), [['SQUARE', 'A', 2400, 600], ['ARM_A', 'A', 1950, 450], ['ARM_B', 'C', 600, 450]]);
});

test('L corner: the three boxes cover exactly an L on the floor, with no clash and no hole', () => {
  ([['B', LAYOUT], ['C', { ...LAYOUT, lSide: 'RIGHT' }]] as Array<[string, K.KitchenLayout]>).forEach(([wall, layout]) => {
    const { cabs } = build({ wall: wall as LCornerParams['wall'] });
    assert.equal(cabs.length, 3);
    cabs.forEach((c) => assert.equal(c.groupId, 'g1'));
    const area = cabs.map((c) => K.footprintOf(c, layout)).reduce((s, r) => s + (r.x1 - r.x0) * (r.z1 - r.z0), 0);
    assert.equal(area, 600 * 600 + 450 * 600 + 450 * 600, `${wall}: square + two arms`);
    assert.ok(Object.values(K.fitStates(cabs, layout)).every((s) => s !== 'OVERLAP'), `${wall}: the group does not clash with itself`);
    // a plain cabinet next to the arm of the back wall is flush with it, and one after the side arm too
    const next = { id: 'n', run: 'A' as const, positionX: wall === 'B' ? 1050 : 1350, positionZ: 0, width: 600, depth: 600, category: 'BASE_UNIT' as const };
    assert.notEqual(K.fitStates([...cabs, next], layout).n, 'OVERLAP');
  });
});

test('L corner: the sides that face a neighbour are not cut, the others are', () => {
  const { cabs } = build();
  const [sq, a, b] = cabs;
  assert.deepEqual([sq.omitSides, a.omitSides, b.omitSides], [['RIGHT'], ['LEFT'], ['RIGHT']]);
  const sideQty = (c) => E.modelCabinet(c, 18, 18).parts.find((p) => p.partType.startsWith('Side Panel'))?.quantity ?? 0;
  assert.deepEqual(cabs.map(sideQty), [1, 1, 1], 'each box keeps one side: the other face is the open join');
  cabs.forEach((c) => assert.equal(geoOf(c).boxes.filter((x) => x.kind === 'side').length, 1));
  // the boards between the sides run up to the open face: 600 - 18 = 582 for the square and 450 - 18 for an arm
  assert.equal(carcaseSidesOf(sq, 18).innerMm, 582);
  assert.equal(carcaseSidesOf(a, 18).innerMm, 432);
  assert.equal(carcaseSidesOf({ width: 600 }, 18).innerMm, 564, 'a normal cabinet is unchanged');
  const bottom = geoOf(a).boxes.find((x) => x.kind === 'bottom');
  assert.equal(bottom.sizeMm[0], 432);
  assert.equal(bottom.centerMm[0], 216, 'the board runs from the open face (x = 0) to the inner face of the right side (x = 432)');
});

test('L corner: the three boxes stand on ONE bottom cut in an L — the square cuts it, the arms cut none', () => {
  const { cabs } = build();
  const [sq, a, b] = cabs;
  const decks = (c) => E.modelCabinet(c, 18, 18).parts.filter((p) => /Deck/.test(p.partType));
  // one row for the whole corner, on the square only
  const rows = decks(sq);
  assert.equal(rows.length, 1);
  assert.equal(decks(a).length + decks(b).length, 0, 'no second board under an arm');
  // 600 deep, and as long as the three runs round the corner: (600-18) + (450-18) + (450-18)
  assert.deepEqual([rows[0].widthMm, rows[0].lengthMm, rows[0].thicknessMm, rows[0].quantity], [600, 1446, 18, 1]);
  assert.match(rows[0].partType, /Corner L Bottom Deck \(one piece/);
  // the outline the shop cuts: an L 1014 x 1014 with a 432 x 432 corner to take out
  assert.match(rows[0].partType, /L 1014×1014 outside/);
  assert.match(rows[0].partType, /offcut 432×432/);
  // and the band runs along the two fronts only: 432 + 432, not the seam inside the corner
  assert.equal(rows[0].edgeLengthMm, 864);
  // the same value is written on the three boxes, so no engine has to look at a neighbour
  cabs.forEach((c) => assert.deepEqual(c.cornerGroupDeckMm, { armAMm: 450, armBMm: 450 }));
  assert.deepEqual(cabs.map((c) => c.cornerRole), ['SQUARE', 'ARM_A', 'ARM_B']);
});

test('L corner: the one L bottom is drawn as the three portions it covers — continuous, no overlap, no double board', () => {
  const { cabs } = build();
  const bottoms = cabs.map((c) => geoOf(c).boxes.filter((x) => x.kind === 'bottom'));
  assert.deepEqual(bottoms.map((bs) => bs.length), [1, 1, 1], 'each box still shows its own run of the board');
  const area = bottoms.flat().reduce((s, x) => s + x.sizeMm[0] * x.sizeMm[2], 0);
  const piece = E.modelCabinet(cabs[0], 18, 18).parts.find((p) => /Deck/.test(p.partType));
  assert.equal(area, piece.widthMm * piece.lengthMm, 'the three runs are exactly the one piece: same area, nothing twice');
  // the same thickness and height everywhere: it is one plane, not three steps
  const y = bottoms.flat().map((x) => x.centerMm[1]);
  assert.ok(y.every((v) => Math.abs(v - y[0]) < 0.01));
  assert.ok(bottoms.flat().every((x) => x.sizeMm[1] === 18));
});

test('L corner: the L bottom follows an arm that is made wider or narrower', () => {
  const wide = build({ armAMm: 600 });
  const [sqWide] = wide.cabs;
  const piece = E.modelCabinet(sqWide, 18, 18).parts.find((p) => /Deck/.test(p.partType));
  assert.equal(piece.lengthMm, 582 + 582 + 432, 'the wider arm lengthens the piece by exactly its own gain');
  assert.deepEqual(sqWide.cornerGroupDeckMm, { armAMm: 600, armBMm: 450 });
});

test('L corner: when the three boxes cannot share one board they each cut their own — no wrong piece', () => {
  const { cabs } = build();
  const odd = cabs.map((c, i) => (i === 1 ? { ...c, depth: 580 } : c));
  assert.equal(cornerDeckOf(odd), null, 'an arm with another depth');
  assert.equal(cornerDeckOf(cabs.slice(0, 2)), null, 'not three boxes');
  const thick = cabs.map((c, i) => (i === 2 ? { ...c, carcaseThickness: 16 } : c));
  assert.equal(cornerDeckOf(thick), null, 'another carcase board');
  // and with no shared value the engine falls back to one deck per box, exactly as before
  const alone = { ...cabs[1], cornerGroupDeckMm: undefined, cornerRole: undefined };
  assert.equal(E.modelCabinet(alone, 18, 18).parts.filter((p) => /Bottom Deck/.test(p.partType)).length, 1);
});

test('L corner: the square has no front, each arm one door hinged on its FAR end (away from the corner)', () => {
  const { cabs } = build();
  const [sq, a, b] = cabs;
  assert.equal(geoOf(sq).facades.length, 0);
  const hinge = (c) => geoOf(c).facades.map((f) => f.hinge);
  assert.deepEqual([hinge(a), hinge(b)], [['RIGHT'], ['LEFT']]);
  const c = build({ wall: 'C' }).cabs;
  assert.deepEqual([hinge(c[1]), hinge(c[2])], [['LEFT'], ['RIGHT']]);
  // the door covers the arm; the arm is 450 wide, the door 449 (the usual 1 mm reveal)
  assert.equal(geoOf(a).facades[0].widthMm, 449);
});

test('L corner PARITY: for every box the 3D boards are exactly the BOM parts, and the price is the sum of the BOM rows', () => {
  const r2 = (n) => Math.round(n * 100) / 100;
  const key = (t, x, y) => [t, x, y].map(r2).sort((m, n) => m - n).join('x');
  (['B', 'C'] as const).forEach((wall) => build({ wall }).cabs.forEach((cab) => {
    const pr = E.priceCabinet(cab, WOODS, HW, ROLLS);
    const geo = geoOf(cab);
    // One board is deliberately shared, not per box: the three boxes stand on ONE L bottom (math/lCorner.ts), cut once by the
    // square and drawn as each box's own portion of it. So the bottoms leave this comparison — the test right below checks
    // that the three drawn bottoms really are the one piece (same area, same outline, no second board).
    const fromParts = [];
    pr.parts.filter((p) => p.role !== 'front' && !/Bottom Deck/.test(p.partType)).forEach((p) => { for (let q = 0; q < p.quantity; q++) fromParts.push(key(p.thicknessMm, p.widthMm, p.lengthMm)); });
    assert.deepEqual(geo.boxes.filter((b) => b.kind !== 'bottom').map((b) => key(...b.sizeMm)).sort(), fromParts.sort(), `${wall} ${cab.name}: boards`);
    const front = pr.parts.filter((p) => p.role === 'front').flatMap((p) => Array.from({ length: p.quantity }, () => key(18, p.widthMm, p.lengthMm)));
    assert.deepEqual(geo.facades.map((f) => key(18, f.widthMm, f.heightMm)).sort(), front.sort(), `${wall} ${cab.name}: fronts`);
    // `pr.total` never existed: the old `??` fallback made this line compare the price with itself. Now it compares the two prices.
    assert.equal(r2(computeCabinetTotalCost(cab, WOODS, HW, ROLLS)), r2(pr.totalDA), 'priced');
    assert.ok(computeCabinetTotalCost(cab, WOODS, HW, ROLLS) > 0);
  }));
});

test('L corner: no connector hangs on a board that is not cut, and the hinge cups equal the BOM hinges', () => {
  build().cabs.forEach((cab) => {
    const geo = geoOf(cab);
    const fasteners = buildFasteners(geo, cab, { carcaseTh: 18, frontTh: 18 });
    const keys = new Set([...geo.boxes.map((b) => b.key), ...geo.facades.map(facadeKey)]);
    fasteners.forEach((f) => assert.ok(keys.has(f.parent), `${cab.name}: ${f.kind} is on the missing ${f.parent}`));
    const hinges = E.hardwareRequirements(cab, HW).find((r) => r.item.id === 'hinge')?.quantity ?? 0;
    assert.equal(fastenerCounts(fasteners).HINGE_CUP, hinges, `${cab.name}: hinges`);
  });
});

test('L corner: a wall corner is the same shape with the wall unit depth, and hinges / sides follow the same rules', () => {
  const { cabs, boxes } = build({ category: 'WALL_UNIT', depthMm: 350 });
  assert.deepEqual(boxes.map((b) => [b.positionX, b.width]), [[0, 350], [350, 450], [350, 450]]);
  cabs.forEach((c) => { assert.equal(c.category, 'WALL_UNIT'); assert.equal(c.depth, 350); assert.equal(c.height, 720); });
  assert.deepEqual(cabs.map((c) => c.omitSides), [['RIGHT'], ['LEFT'], ['RIGHT']]);
  const roof = (c) => geoOf(c).boxes.some((b) => b.kind === 'roof');
  assert.ok(cabs.every(roof), 'a wall unit is closed on top');
});

test('hinge side: a zone can choose it, and it survives the form normalisation', () => {
  const d = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), category: 'BASE_UNIT', zones: [{ kind: 'DOORS', count: 1, shelves: 0, hingeSide: 'RIGHT' }] }, WOODS, HW, ROLLS);
  assert.equal(d.zones[0].hingeSide, 'RIGHT');
  const cab = { ...P.draftToNewCabinet(d, { id: 'x', name: 'x', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  assert.deepEqual(geoOf(cab).facades.map((f) => f.hinge), ['RIGHT']);
  const auto = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), zones: [{ kind: 'DOORS', count: 1, shelves: 0 }] }, WOODS, HW, ROLLS);
  assert.equal(auto.zones[0].hingeSide, undefined, 'unset = the old automatic behaviour');
});

// ---- drawers next to a door: the drawer side of the arm is WIDENED, not narrowed -------------------------------
// The arms of an L corner meet at a right angle. The closed door of one arm lies in the plane the other arm's drawers slide
// through, so a drawer front that reaches the corner cannot be pulled out until that door is opened. The rule (constants.ts
// CORNER): the drawer side of the arm grows by (front thickness + 1.5 mm), and its drawer fronts stop short by the same amount
// — the drawers keep their full width while a 1.5 mm gap is left in front of the neighbouring door.

const withZones = (cab, zones) => ({ ...cab, zones });
const frontsOf = (cab, kind) => geoOf(cab).facades.filter((f) => f.kind === kind);
const EXTENSION = 18 + 1.5; // front thickness + CORNER.DRAWER_CLEARANCE_MM

/** What the panel does when the arm is saved: widen on the corner side, keep the width the arm was designed with. */
const widen = (cab) => ({ ...cab, ...withCornerExtension(cab, cab.zones, 18) });

test('L corner: every box records the side that faces the other arm (the side it does not close)', () => {
  (['B', 'C'] as const).forEach((wall) => {
    build({ wall }).cabs.forEach((cab) => {
      assert.equal(cab.cornerSide, cab.omitSides[0], `${wall} ${cab.name}: cornerSide is the open face`);
    });
  });
  const [sq, a, b] = build().cabs;
  assert.deepEqual([sq.cornerSide, a.cornerSide, b.cornerSide], ['RIGHT', 'LEFT', 'RIGHT'], 'left wall');
});

test('L corner rule: the filler is the front thickness + 1.5 mm, and a doors-only arm has none', () => {
  const [, armA] = build().cabs;
  assert.equal(autoCornerFillerMm([{ kind: 'DOORS', count: 1 }], 18), 0, 'doors: no filler');
  assert.equal(autoCornerFillerMm([{ kind: 'DRAWERS', count: 3 }], 18), EXTENSION, 'drawers: 19.5');
  assert.equal(autoCornerFillerMm([{ kind: 'DOORS', count: 1 }, { kind: 'DRAWERS', count: 2 }], 18), EXTENSION, 'one drawer zone is enough');
  assert.equal(autoCornerFillerMm([{ kind: 'OPEN', split: { mainSide: 'LEFT', mainWidthMm: 300, fill: 'PULL_OUT' } }], 18), EXTENSION, 'a pull-out frame slides out too');
  assert.equal(autoCornerFillerMm([{ kind: 'OPEN', split: { mainSide: 'LEFT', mainWidthMm: 300, fill: 'PANEL' } }], 18), 0);
  // THE ARM NEVER GROWS: it keeps the 450 it was designed with, so nothing on the wall moves
  const done = withCornerExtension(armA, [{ kind: 'DRAWERS', count: 2 }], 18);
  assert.equal(done.width, 450, 'the arm keeps its width');
  assert.equal(done.positionX, 600, 'and its place on the wall');
  assert.deepEqual(done.cornerFillers, { left: EXTENSION, right: 0 }, 'the corner side (LEFT here) carries it');
});

test('L corner: the filler sits inside the arm — 450 = 19.5 filler + 430 drawer front + 0.5 reveal', () => {
  const [, armA] = build().cabs;
  const cab = withZones(armA, [{ kind: 'DRAWERS', count: 3 }]);
  const drawn = { ...cab, ...withCornerExtension(cab, cab.zones, 18) };
  assert.equal(drawn.width, 450, 'nothing is added to the arm');
  const filler = frontsOf(drawn, 'FILLER');
  assert.equal(filler.length, 1, 'exactly one filler panel');
  assert.deepEqual([filler[0].xMm, filler[0].widthMm, filler[0].yMm, filler[0].heightMm], [0, EXTENSION, 0, 770], 'corner side, floor to top');
  const fronts = frontsOf(drawn, 'DRAWER');
  assert.equal(fronts.length, 3);
  fronts.forEach((f) => {
    assert.equal(f.xMm, EXTENSION, 'the front starts exactly on the filler edge — it never covers it');
    assert.equal(f.widthMm, 430, '19.5 + 430 + 0.5 = 450: the front pays for the filler out of the arm width');
  });
  // 19.5 mm of the front sits where the neighbour's 18 mm door stands, so nothing can touch it
  assert.equal(fronts[0].xMm - 18, 1.5, 'the clearance the panel buys');
});

test('L corner: the filler is a real BOM part — same sheet and thickness as the fronts, banded on all four edges', () => {
  const [, armA] = build().cabs;
  const cab = withZones(armA, [{ kind: 'DRAWERS', count: 3 }]);
  const drawn = { ...cab, ...withCornerExtension(cab, cab.zones, 18) };
  const pr = E.priceCabinet(drawn, WOODS, HW, ROLLS);
  const filler = pr.parts.filter((p) => p.partType.startsWith('Corner Filler Panel'));
  assert.equal(filler.length, 1, 'one row in the cutting list');
  assert.equal(filler[0].role, 'front');
  assert.equal(filler[0].edge, 'ALL', 'four edges, like every front');
  assert.equal(filler[0].thicknessMm, 18, 'the front sheet, not the carcase');
  assert.deepEqual([filler[0].widthMm, filler[0].lengthMm, filler[0].quantity], [EXTENSION, 770, 1]);
});

test('L corner: the door thickness sets the filler — 18 mm leaves 19.5, 16 mm leaves 17.5', () => {
  assert.equal(autoCornerFillerMm([{ kind: 'DRAWERS', count: 3 }], 16), 17.5, 'the user\'s own example: 16 + 1.5');
  const [, armA] = build().cabs;
  const thin = { ...armA, cornerSide: 'LEFT' as const, frontThickness: 16, zones: [{ kind: 'DRAWERS' as const, count: 3 }] };
  const thinGeo = G.assemblyGeometry({ ...thin, cornerFillerMm: 17.5 }, { carcaseTh: 18, frontTh: 16, lift: false, inset: false });
  const filler = thinGeo.facades.filter((f) => f.kind === 'FILLER')[0];
  assert.equal(filler.widthMm, 17.5);
  const drawer = thinGeo.facades.filter((f) => f.kind === 'DRAWER')[0];
  assert.equal(drawer.xMm, 17.5, 'the front starts on the filler edge');
  assert.equal(filler.xMm + filler.widthMm - 16, 1.5, 'play between the closed 16 mm door and the filler');
});

test('L corner: the filler runs from the facing door thickness up to 50 mm; the arm stays 450', () => {
  const [, armA] = build().cabs;
  const withFiller = (mm) => { const cab = { ...withZones(armA, [{ kind: 'DRAWERS', count: 2 }]), cornerFillerMm: mm }; return { ...cab, ...withCornerExtension(cab, cab.zones, 18) }; };
  // the floor is the door it faces: 18 mm with an 18 mm door — a narrower panel would not reach the door
  const least = withFiller(5);
  assert.deepEqual([least.width, least.cornerFillers.left], [450, 18], 'below the door thickness it stops at the door');
  assert.deepEqual([frontsOf(least, 'FILLER')[0].widthMm, frontsOf(least, 'DRAWER')[0].xMm], [18, 18]);
  assert.equal(frontsOf(least, 'DRAWER')[0].widthMm, 431.5, '450 − 18 − 0.5');
  // exactly the door: the drawer passes with 0 play, touching the door on the way out — the user's own call
  assert.equal(withFiller(18).cornerFillers.left, 18);
  // a wider corner post: the front gives up exactly what the panel takes
  const wide = withFiller(35);
  assert.equal(wide.width, 450, 'the arm never grows');
  assert.deepEqual([frontsOf(wide, 'FILLER')[0].widthMm, frontsOf(wide, 'DRAWER')[0].xMm, frontsOf(wide, 'DRAWER')[0].widthMm], [35, 35, 414.5]);
  // above the ceiling it stops at 50
  assert.equal(frontsOf(withFiller(90), 'FILLER')[0].widthMm, 50);
  // automatic when the user has not chosen one
  assert.deepEqual([withFiller(undefined).cornerFillers.left, frontsOf(withFiller(undefined), 'DRAWER')[0].widthMm], [EXTENSION, 430]);
  // a 16 mm door moves the floor with it: 16 … 50, automatic 17.5
  assert.equal(clampCornerFiller(4, 16), 16);
  assert.equal(clampCornerFiller(70, 16), 50);
});

test('L corner: the filler can go on EITHER side or on both — the far side is for looks', () => {
  const [, armA] = build().cabs; // cornerSide = LEFT
  const drawn = (extra) => { const cab = { ...withZones(armA, [{ kind: 'DRAWERS', count: 2 }]), ...extra }; return { ...cab, ...withCornerExtension(cab, cab.zones, 18) }; };
  // the corner side only (automatic): the far side stays open
  assert.deepEqual(drawn({}).cornerFillers, { left: EXTENSION, right: 0 });
  // the far side only: the drawer keeps the corner edge, the panel closes the other end
  const right = drawn({ cornerFillerSides: ['RIGHT'] });
  assert.deepEqual(right.cornerFillers, { left: 0, right: 18 }, 'a look-only panel is one front thickness');
  assert.deepEqual(frontsOf(right, 'FILLER').map((f) => [f.xMm, f.widthMm]), [[450 - 18, 18]], 'it stands at the far end');
  assert.deepEqual([frontsOf(right, 'DRAWER')[0].xMm, frontsOf(right, 'DRAWER')[0].widthMm], [0.5, 431.5]);
  // both sides, the same chosen width: the front pays for the two panels
  const both = drawn({ cornerFillerSides: ['LEFT', 'RIGHT'], cornerFillerMm: 30 });
  assert.deepEqual(both.cornerFillers, { left: 30, right: 30 });
  assert.deepEqual(frontsOf(both, 'FILLER').map((f) => [f.xMm, f.widthMm]), [[0, 30], [420, 30]]);
  assert.deepEqual([frontsOf(both, 'DRAWER')[0].xMm, frontsOf(both, 'DRAWER')[0].widthMm], [30, 390], '450 − 30 − 30: the outer reveal makes way for the panel');
  // `[]` turns every panel off
  const none = drawn({ cornerFillerSides: [] });
  assert.deepEqual(none.cornerFillers, { left: 0, right: 0 });
  assert.equal(frontsOf(none, 'FILLER').length, 0);
});

test('L corner: a doors-only arm can take a filler too — looks, not clearance', () => {
  const [, armA] = build().cabs;
  const cab = { ...withZones(armA, [{ kind: 'DOORS', count: 1 }]), cornerFillerSides: ['LEFT'] };
  const drawn = { ...cab, ...withCornerExtension(cab, cab.zones, 18) };
  assert.equal(drawn.width, 450);
  const filler = frontsOf(drawn, 'FILLER');
  assert.deepEqual(filler.map((f) => [f.xMm, f.widthMm]), [[0, 18]], 'no sliding front: one front thickness is enough');
  const door = frontsOf(drawn, 'DOOR')[0];
  assert.deepEqual([door.xMm, door.widthMm], [18, 431.5], 'the door starts on the panel edge');
  // and it is priced / cut like every other front
  const pr = E.priceCabinet(drawn, WOODS, HW, ROLLS);
  const part = pr.parts.find((p) => p.partType.startsWith('Corner Filler Panel'));
  assert.ok(part, 'the panel is in the cutting list');
  assert.deepEqual([part.widthMm, part.thicknessMm], [18, 18]);
});

test('L corner: idempotent — saving twice changes nothing, doors leave no filler, an older widened arm comes back to 450', () => {
  const [, armA] = build().cabs;
  const once = (() => { const cab = { ...withZones(armA, [{ kind: 'DRAWERS', count: 2 }]), cornerFillerMm: 25 }; return { ...cab, ...withCornerExtension(cab, cab.zones, 18) }; })();
  const twice = (() => { const cab = withZones(once, [{ kind: 'DRAWERS', count: 3 }]); return { ...cab, ...withCornerExtension(cab, cab.zones, 18) }; })();
  assert.deepEqual([twice.width, twice.cornerFillers.left], [450, 25], 'still the designed arm');
  const back = (() => { const cab = withZones(twice, [{ kind: 'DOORS', count: 2 }]); return { ...cab, ...withCornerExtension(cab, cab.zones, 18) }; })();
  assert.equal(frontsOf(back, 'FILLER').length, 0, 'doors: the arm needs no filler');
  // a cabinet an older version saved widened is given its designed width back, on both walls
  const legacy = { ...armA, zones: [{ kind: 'DRAWERS' as const, count: 3 }], width: 469.5, cornerExtensionMm: 19.5 };
  assert.deepEqual(withCornerExtension(legacy, legacy.zones, 18), { width: 450, positionX: 600, cornerExtensionMm: 0, cornerFillers: { left: EXTENSION, right: 0 } });
  const legacyC = { ...legacy, run: 'A' as const, cornerSide: 'RIGHT' as const, positionX: 1930.5 };
  assert.deepEqual(withCornerExtension(legacyC, legacyC.zones, 18), { width: 450, positionX: 1950, cornerExtensionMm: 0, cornerFillers: { left: 0, right: EXTENSION } }, 'the leftward growth is given back');
});

test('L corner on the RIGHT wall: the filler is on the right, against the other arm', () => {
  const [, armA] = build({ wall: 'C' }).cabs;
  const cab = withZones(armA, [{ kind: 'DRAWERS', count: 2 }]);
  const drawn = { ...cab, ...withCornerExtension(cab, cab.zones, 18) };
  assert.equal(drawn.positionX, 1950, 'the arm never moves');
  assert.equal(drawn.width, 450);
  const filler = frontsOf(drawn, 'FILLER')[0];
  assert.deepEqual([filler.xMm, filler.xMm + filler.widthMm], [450 - EXTENSION, 450]);
  const drawer = frontsOf(drawn, 'DRAWER')[0];
  assert.deepEqual([drawer.xMm, drawer.widthMm], [0.5, 430], 'the front ends on the filler edge');
});

test('a cabinet in a plain wall has no corner side, so its drawers are untouched (no regression)', () => {
  const d = P.resolveDraft({ ...P.draftFromPreset('Standard_Base'), width: 450, depth: 600, zones: [{ kind: 'DRAWERS', count: 3 }] }, WOODS, HW, ROLLS);
  const cab = { ...P.draftToNewCabinet(d, { id: 'p', name: 'p', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  assert.equal(cab.cornerSide, undefined);
  assert.deepEqual(withCornerExtension(cab, cab.zones, 18), { width: cab.width, positionX: 0, cornerExtensionMm: 0, cornerFillers: { left: 0, right: 0 } });
  assert.equal(frontsOf(cab, 'FILLER').length, 0, 'no filler outside a corner');
  frontsOf(cab, 'DRAWER').forEach((f) => {
    assert.equal(f.xMm, 0.5);
    assert.equal(f.widthMm, 449, 'the whole box width, as before');
  });
});

test('L corner: editing an arm in the panel keeps the corner side, the filler and the arm width (the real save path)', () => {
  const [, armA] = build().cabs;
  // exactly what App does: resolve the edited draft, take the patch, then apply the corner rule on the stored cabinet
  const edited = P.resolveDraft({ ...P.cabinetToDraft(armA), zones: [{ kind: 'DRAWERS', count: 2 }] }, WOODS, HW, ROLLS);
  const frontTh = WOODS.find((m) => m.id === edited.frontMaterialId).thickness;
  const corner = withCornerExtension(armA, edited.zones, frontTh);
  const saved = { ...armA, ...P.draftToCabinetPatch(edited), width: corner.width, positionX: corner.positionX, cornerExtensionMm: 0 };
  assert.equal(saved.cornerSide, 'LEFT', 'the panel patch never clears the corner side');
  assert.equal(saved.groupId, 'g1', 'nor the group');
  assert.equal(saved.omitSides?.[0], 'LEFT');
  assert.equal(saved.width, 450, 'the arm is not widened');
  assert.equal(frontsOf(saved, 'FILLER')[0].widthMm, EXTENSION, 'the filler is there after the edit');
  assert.equal(frontsOf(saved, 'DRAWER')[0].widthMm, 430);
});

test('L corner: the drawer front covers its box on BOTH sides — the filler side included', () => {
  const [, armA] = build().cabs;
  const cab = withZones(armA, [{ kind: 'DRAWERS', count: 3 }]);
  const drawn = { ...cab, ...withCornerExtension(cab, cab.zones, 18) };
  const geo = geoOf(drawn);
  const front = geo.facades.find((f) => f.kind === 'DRAWER');
  const box = front.box;
  const x0 = (b) => b.centerMm[0] - b.sizeMm[0] / 2;
  const x1 = (b) => b.centerMm[0] + b.sizeMm[0] / 2;
  // the front spans 19.5 … 449.5; the box must sit strictly inside that span
  assert.ok(Math.abs(front.xMm - 19.5) < 0.01);
  box.forEach((b) => {
    assert.ok(x0(b) >= front.xMm - 0.01, `${b.key} starts under the front, not beside the filler`);
    assert.ok(x1(b) <= front.xMm + front.widthMm - 0.5, `${b.key} ends under the front`);
  });
  // and it is symmetric: 13 mm of runner clearance on each side of the room it has
  const roomLo = 19.5, roomHi = 432;
  assert.ok(Math.abs(x0(box.find((b) => b.key === 'side-left')) - (roomLo + 13)) < 0.01, '13 mm off the filler');
  assert.ok(Math.abs(x1(box.find((b) => b.key === 'side-right')) - (roomHi - 13)) < 0.01, '13 mm off the carcase side');
});

test('L corner: the filler has a small return behind it on the drawer side — cut, drawn and priced', () => {
  const [, armA] = build().cabs;
  const cab = withZones(armA, [{ kind: 'DRAWERS', count: 3 }]);
  const drawn = { ...cab, ...withCornerExtension(cab, cab.zones, 18) };
  const parts = E.modelCabinet(drawn, 18, 18).parts;
  const ret = parts.filter((p) => p.partType === 'Corner Filler Return');
  assert.equal(ret.length, 1, 'one return per filler');
  assert.deepEqual([ret[0].widthMm, ret[0].lengthMm, ret[0].thicknessMm, ret[0].role], [100, 734, 18, 'carcase'], '100 deep, between the bottom board and the top');
  const box = geoOf(drawn).boxes.find((b) => b.kind === 'fillerreturn');
  assert.ok(box, 'and the 3D draws it');
  // flush with the filler's inner face (19.5), from the cabinet's own board, 100 mm deep behind the front
  const inner = box.centerMm[0] + box.sizeMm[0] / 2;
  assert.ok(Math.abs(inner - 19.5) < 0.01, 'its inner face is the filler edge: the drawer starts there');
  assert.equal(box.sizeMm[2], 100);
  const front = geoOf(drawn).facades.find((f) => f.kind === 'DRAWER');
  assert.ok(box.centerMm[2] + box.sizeMm[2] / 2 <= front.zMm - 9 + 0.01, 'behind the front, not through it');
  // no filler, no return
  const plain = withZones(armA, [{ kind: 'DOORS', count: 1 }]);
  assert.equal(E.modelCabinet(plain, 18, 18).parts.filter((p) => p.partType === 'Corner Filler Return').length, 0);
});

test('L corner: a plain cabinet keeps the box it always had', () => {
  const cab = { ...withZones(build().cabs[1], [{ kind: 'DRAWERS', count: 3 }]), omitSides: undefined, cornerSide: undefined };
  const geo = geoOf(cab);
  const front = geo.facades[0];
  const box = front.box;
  assert.equal(box.find((b) => b.key === 'bottom').sizeMm[0], 450 - 2 * 18 - 2 * 13, 'still centred on the width');
});

test('L corner PARITY holds for a drawer arm too, and the filler is cut like every other front', () => {
  const [, armA] = build().cabs;
  const cab = withZones(armA, [{ kind: 'DRAWERS', count: 3 }]);
  const drawn = { ...cab, ...withCornerExtension(cab, cab.zones, 18) };
  const r2 = (n) => Math.round(n * 100) / 100;
  const key = (t, x, y) => [t, x, y].map(r2).sort((m, n) => m - n).join('x');
  const pr = E.priceCabinet(drawn, WOODS, HW, ROLLS);
  const geo = geoOf(drawn);
  // the carcase boards are the ones drawn; the drawer BOX is not part of the carcase geometry (it is drawn by its own boards)
  const fromParts = [];
  pr.parts.filter((p) => p.role !== 'front' && !p.partType.startsWith('Drawer Box') && !/Bottom Deck/.test(p.partType)).forEach((p) => { for (let q = 0; q < p.quantity; q++) fromParts.push(key(p.thicknessMm, p.widthMm, p.lengthMm)); });
  assert.deepEqual(geo.boxes.filter((b) => b.kind !== 'bottom').map((b) => key(...b.sizeMm)).sort(), fromParts.sort(), 'carcase boards (the shared L bottom is checked apart)');
  // every front the 3D draws is a priced part, the filler included
  const front = pr.parts.filter((p) => p.role === 'front').flatMap((p) => Array.from({ length: p.quantity }, () => key(18, p.widthMm, p.lengthMm)));
  assert.deepEqual(geo.facades.map((f) => key(18, f.widthMm, f.heightMm)).sort(), front.sort(), 'fronts + filler');
  // The box now lives exactly BEHIND its front instead of being centred on the closed arm: the front starts at 19.5 (the
  // filler), the carcase ends at 432, so the room is 412.5 and the box 412.5 - 2 x 13 = 386.5. Before this fix the box was
  // centred on the full width (388 wide, 31 … 419), i.e. 9 mm off, and its near side was seen from the open corner.
  const bottoms = pr.parts.filter((p) => p.partType.startsWith('Drawer Box Bottom'));
  assert.ok(bottoms.length > 0);
  bottoms.forEach((p) => assert.equal(p.widthMm, 386.5, 'the box follows the front, filler included'));
  assert.ok(pr.totalDA > 0);
});
