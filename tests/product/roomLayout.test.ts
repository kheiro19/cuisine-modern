// The room around the kitchen, and how wall units hang in it — the changes that came with the room fields of the
// layout panel: the wall length of a STRAIGHT kitchen, the room height in every kitchen shape, the standard gap
// above the worktop, and the hanging of a wall unit (standard / its own gap / from the ceiling / from the floor).
//
// These tests are the alarm bell for those features: if a future change loses one of them, `npm test` fails here
// with the name of the broken promise instead of the user finding a cabinet through the ceiling (or under the
// floor — the last test guards the 3D floor itself, see the note there).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as K from '../../src/math/kitchenLayout';

const layout = (over: Partial<K.KitchenLayout> = {}): K.KitchenLayout => ({ type: 'STRAIGHT', widthMm: 3000, lSide: 'LEFT', ...over });
/** A worktop whose top face is 910 mm from the floor (an 870 mm base unit + a 40 mm slab). */
const REF: K.WallMountRef = { counterTopMm: 910, defaultGapMm: K.DEFAULT_WALL_GAP_MM, roomHeightMm: K.DEFAULT_ROOM_HEIGHT_MM };
const wallCab = (over: Record<string, unknown> = {}) => ({
  id: 'w', name: 'Wall unit', category: 'WALL_UNIT' as const, run: 'A' as const,
  positionX: 0, positionZ: 0, width: 600, height: 700, depth: 350, ...over,
});
const baseCab = (over: Record<string, unknown> = {}) => ({
  id: 'b', name: 'Base unit', category: 'BASE_UNIT' as const, run: 'A' as const,
  positionX: 0, positionZ: 0, width: 600, height: 870, depth: 600, ...over,
});

// ------------------------------------------------------------------------------------------------ the wall of a straight kitchen

test('straight wall: the wall length IS the typed width, and it is the limit every placement obeys', () => {
  assert.equal(K.wallLengthOf(layout({ widthMm: 3000 }), 'A'), 3000);
  assert.equal(K.wallLengthOf(layout({ widthMm: 1850 }), 'A'), 1850, 'a shorter typed wall is a shorter wall');
  // a cabinet wider than that wall is refused, not placed past its end
  const wide = K.placeAlongWall([], layout({ widthMm: 1850 }), 'A', 'BASE_UNIT', 2000);
  assert.equal(wide.ok, false);
  assert.equal(wide.reason, 'TOO_WIDE');
  assert.equal(wide.wallMm, 1850);
  // dragging stops at the end of the same wall
  assert.equal(K.clampOnWall(1600, 600, K.wallLengthOf(layout({ widthMm: 1850 }), 'A')), 1250);
  assert.equal(K.fitStates([{ ...baseCab(), positionX: 1300 }], layout({ widthMm: 1850 })).b, 'OUT_OF_BOUNDS', '1300 + 600 runs past an 1850 wall');
});

// ------------------------------------------------------------------------------------------------ the room height, every kitchen shape

test('room height: it defaults to 2600 mm and a typed height is read the same in a straight, L and U kitchen', () => {
  assert.deepEqual(K.HEIGHT_LIMITS_MM, [2000, 4000]);
  assert.equal(K.DEFAULT_ROOM_HEIGHT_MM, 2600);
  for (const type of ['STRAIGHT', 'L', 'U'] as const) {
    assert.equal(K.roomHeightOf(layout({ type })), 2600, `${type}: a layout saved before the field existed`);
    assert.equal(K.roomHeightOf(layout({ type, heightMm: 2950 })), 2950, `${type}: the typed height`);
  }
});

test('room height: raising the ceiling lifts a ceiling-hung unit with it and moves nothing else', () => {
  const cab = { height: 400, wallMount: { from: 'CEILING' as const, mm: 0 } };
  const low = K.wallBottomMmOf(cab, { ...REF, roomHeightMm: 2600 });
  const high = K.wallBottomMmOf(cab, { ...REF, roomHeightMm: 3200 });
  assert.equal(low + cab.height, 2600, 'flush with the low ceiling');
  assert.equal(high + cab.height, 3200, 'flush with the raised ceiling');
  assert.equal(high - low, 600);
  // a unit hung over the worktop does not care how high the ceiling is
  const over = { height: 700 };
  assert.equal(K.wallBottomMmOf(over, { ...REF, roomHeightMm: 2600 }), K.wallBottomMmOf(over, { ...REF, roomHeightMm: 3200 }));
});

// ------------------------------------------------------------------------------------------------ the standard gap above the worktop

test('standard gap: without one of its own, a wall unit hangs the standard gap above the worktop', () => {
  assert.deepEqual(K.WALL_GAP_LIMITS_MM, [0, 1500]);
  assert.equal(K.DEFAULT_WALL_GAP_MM, 600);
  assert.equal(K.wallGapOf({}), 600, 'a layout saved before the field existed');
  assert.equal(K.wallGapOf({ wallGapMm: 450 }), 450, 'the typed gap');
  assert.equal(K.wallBottomMmOf({ height: 700 }, REF), 910 + 600, 'worktop + the standard 600');
  assert.equal(K.wallBottomMmOf({ height: 700 }, { ...REF, defaultGapMm: 450 }), 910 + 450, 'a smaller typed gap lowers every standard unit');
  assert.equal(K.wallBottomMmOf({ height: 700 }, { ...REF, defaultGapMm: 0 }), 910, 'a gap of zero sits the unit on the worktop');
});

// ------------------------------------------------------------------------------------------------ hanging a wall unit

test('hanging: a wall unit may choose its own place — its own gap, down from the ceiling, or up from the floor', () => {
  const cab = (wallMount) => ({ height: 700, wallMount });
  assert.equal(K.wallBottomMmOf(cab({ from: 'COUNTER', mm: 520 }), REF), 910 + 520, 'its own gap beats the standard one');
  assert.equal(K.wallBottomMmOf(cab({ from: 'CEILING', mm: 0 }), REF), 2600 - 700, 'touching the ceiling');
  assert.equal(K.wallBottomMmOf(cab({ from: 'CEILING', mm: 120 }), REF), 2600 - 120 - 700, '120 mm down from the ceiling');
  assert.equal(K.wallBottomMmOf(cab({ from: 'FLOOR', mm: 1480 }), REF), 1480, 'an absolute height from the floor');
  assert.equal(K.wallBottomMmOf(cab({ from: 'FLOOR', mm: -50 }), REF), 0, 'a negative typed height is clamped to the floor');
});

test('hanging warnings: through the ceiling or down into the worktop is said out loud, a good hang is silent', () => {
  // the standard hang, comfortably under the ceiling: no warning
  assert.deepEqual(K.wallMountIssues([wallCab()], REF), []);
  // too tall for the room at the standard gap: 910 + 600 + 1200 = 2710 > 2600
  const tall = K.wallMountIssues([wallCab({ height: 1200 })], REF);
  assert.deepEqual(tall.map((i) => i.code), ['ABOVE_CEILING']);
  assert.match(tall[0].message, /2600/, 'the warning names the ceiling it breaks');
  // the same unit hung from the ceiling fits again — the warning follows the hang, not the unit
  assert.deepEqual(K.wallMountIssues([wallCab({ height: 1200, wallMount: { from: 'CEILING', mm: 0 } })], REF), []);
  // hung so low that it lands in the base unit standing under it
  const low = K.wallMountIssues([baseCab(), wallCab({ wallMount: { from: 'FLOOR', mm: 500 } })], REF);
  assert.deepEqual(low.map((i) => i.code), ['BELOW_WORKTOP']);
  // ...but the same low unit over an EMPTY stretch of wall hits nothing
  assert.deepEqual(K.wallMountIssues([baseCab(), wallCab({ positionX: 700, wallMount: { from: 'FLOOR', mm: 500 } })], REF), []);
  // ...and a unit on the other wall is not over this base unit at all
  assert.deepEqual(K.wallMountIssues([baseCab(), wallCab({ run: 'B', wallMount: { from: 'FLOOR', mm: 500 } })], { ...REF }), []);
});

// ------------------------------------------------------------------------------------------------ the floor of the 3D scene (regression guard)

test('the 3D floor: cabinets stand ON the grid whatever the room height — the scene is never re-centred vertically', () => {
  // Why a source guard: jsdom/node have no WebGL, so the scene itself cannot be rendered here. The promise that
  // broke once is a one-word property, and this test stands where a screenshot cannot run: the kitchen is built
  // with its floor at y = 0 (legs, wall-unit heights, the room outline), so the <Center> that frames it must not
  // touch Y, and the floor grid must sit at y = 0. When the room outline reached the ceiling, a plain <Center>
  // sank the whole kitchen by half the room height and every cabinet stood under the floor.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/components/Kitchen3DCanvas.tsx'), 'utf8');
  assert.ok(src.includes('<Center disableY>'), 'Kitchen3DCanvas must frame the scene with <Center disableY>: a plain <Center> re-centres vertically and sinks the cabinets under the floor');
  assert.ok(!/^\s*<Center>$/m.test(src), 'a plain <Center> is back in Kitchen3DCanvas: it will sink the kitchen by half the room height');
  assert.ok(src.includes('<Grid position={[0, 0, 0]}'), 'the floor grid must sit at y = 0, where the legs end');
  assert.ok(!src.includes('[0, -0.4, 0]'), 'the floor grid was lowered below the legs again');
});

// ------------------------------------------------------------------------------------------------ stacked wall units (regression guard)

test('stacked wall units: one at the ceiling and one flush under it is a hang, not a clash — and a real overlap is named', () => {
  // A 400 mm unit flush with the 2600 ceiling (bottom 2200) over a second wall unit hung 400 down from the
  // ceiling (bottom 1800, top 2200): same wall, same stretch, edges touching — no warning may fire.
  const upper = wallCab({ id: 'up', height: 400, wallMount: { from: 'CEILING', mm: 0 } });
  const lower = wallCab({ id: 'lo', height: 400, wallMount: { from: 'CEILING', mm: 400 } });
  assert.deepEqual(K.wallMountIssues([upper, lower], REF), []);
  // the same pair pushed 100 mm into each other (lower hung only 300 down: bottom 1900, top 2300) is a clash
  const pushed = wallCab({ id: 'lo', height: 400, wallMount: { from: 'CEILING', mm: 300 } });
  const issues = K.wallMountIssues([upper, pushed], REF);
  assert.deepEqual(issues.map((i) => i.code), ['WALL_OVERLAP']);
  assert.equal(issues[0].cabinetId, 'lo');
  // beside each other (another stretch of wall), even at the same height, nothing is shared
  assert.deepEqual(K.wallMountIssues([upper, wallCab({ id: 'side', positionX: 700, height: 400, wallMount: { from: 'CEILING', mm: 0 } })], REF), []);
});

test('the 3D frame: the camera contains the whole room, so a ceiling-hung unit is inside the picture', () => {
  // The sister promise of the floor guard above: the unit is drawn by the scene, but the camera used to be
  // placed from the cabinets' width alone and aimed at the floor — a unit at the ceiling was rendered outside
  // the frame and "did not appear in the design" while the list showed it installed. The framing must be
  // derived from the room (height included), and the user must be able to ask for it again.
  const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../src/components/Kitchen3DCanvas.tsx'), 'utf8');
  assert.ok(src.includes('CameraFitter'), 'Kitchen3DCanvas must frame the scene with CameraFitter (room-derived camera + target)');
  assert.ok(src.includes('roomHM * 0.44'), 'the camera target must sit near the middle of the room height, not on the floor');
  assert.ok(src.includes('إظهار كل المطبخ'), 'the reset-view button («show the whole kitchen») must exist');
});
