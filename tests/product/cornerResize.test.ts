// Editing an L corner that is already on the wall: the corner has THREE numbers (the square and the two arms), all three can
// be changed at any time, and the three boxes are laid out again together. These rules are what stopped the boxes from
// pulling apart at the door side when an arm was made wider.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cornerDimsOf,
  cornerFitsWalls,
  cornerGroupSpan,
  lCornerBoxes,
  relayoutCornerGroup,
} from '../../src/math/lCorner';
import type { CornerRole } from '../../src/math/lCorner';

/** A box of a corner as the app stores it. */
const box = (role: CornerRole, width: number, positionX: number, run: 'A' | 'B' | 'C' = 'A', depth = 600) => ({
  id: `id_${role}`,
  width,
  depth,
  positionX,
  run,
  category: 'BASE_UNIT' as const,
  groupId: 'g1',
  cornerRole: role,
});

/** A left-hand corner, exactly as lCornerBoxes builds it: square 600, both arms 450. */
const leftCorner = () => [box('SQUARE', 600, 0), box('ARM_A', 450, 600), box('ARM_B', 450, 600, 'B')];
/** A right-hand corner in a 3000 mm room: the square sits at the far end of the back wall. */
const rightCorner = () => [box('SQUARE', 600, 2400), box('ARM_A', 450, 1950), box('ARM_B', 450, 600, 'C')];

test('the three boxes read back as the three numbers that built them', () => {
  assert.deepEqual(cornerDimsOf(leftCorner()), { wall: 'B', depthMm: 600, armAMm: 450, armBMm: 450 });
  assert.deepEqual(cornerDimsOf(rightCorner()), { wall: 'C', depthMm: 600, armAMm: 450, armBMm: 450 });
});

test('anything that is not one corner (two boxes, three boxes with no square) reads as null', () => {
  assert.equal(cornerDimsOf([]), null);
  assert.equal(cornerDimsOf(leftCorner().slice(0, 2)), null);
  const noSquare = [box('ARM_A', 450, 0), box('ARM_A', 450, 450), box('ARM_B', 450, 600, 'B')];
  assert.equal(cornerDimsOf(noSquare), null);
});

test('a wider arm lays the three boxes out again — the square does not move, the other arm does not move, nothing opens', () => {
  const placed = relayoutCornerGroup(leftCorner(), { wall: 'B', depthMm: 600, armAMm: 600, armBMm: 450 }, 2400);
  const at = (role: CornerRole) => placed.find((p) => p.role === role)!;
  assert.deepEqual({ w: at('SQUARE').width, x: at('SQUARE').positionX }, { w: 600, x: 0 }, 'the square is the corner itself');
  assert.deepEqual({ w: at('ARM_A').width, x: at('ARM_A').positionX }, { w: 600, x: 600 }, 'the arm starts where the square ends');
  assert.deepEqual({ w: at('ARM_B').width, x: at('ARM_B').positionX }, { w: 450, x: 600 }, 'the side arm is untouched');
  // the corner now reaches 1200 mm along the back wall: square + arm, with no gap between them
  assert.equal(at('SQUARE').positionX + at('SQUARE').width, at('ARM_A').positionX);
});

test('the side arm too can be resized, and the back-wall arm keeps its place', () => {
  const placed = relayoutCornerGroup(leftCorner(), { wall: 'B', depthMm: 600, armAMm: 450, armBMm: 700 }, 2400);
  const at = (role: CornerRole) => placed.find((p) => p.role === role)!;
  assert.deepEqual({ w: at('ARM_A').width, x: at('ARM_A').positionX }, { w: 450, x: 600 });
  assert.deepEqual({ w: at('ARM_B').width, x: at('ARM_B').positionX, run: at('ARM_B').run }, { w: 700, x: 600, run: 'B' });
  assert.deepEqual(cornerGroupSpan({ depthMm: 600, armAMm: 450, armBMm: 700 }), { alongA: 1050, alongSide: 1300 });
});

test('a deeper square deepens every box: the arm starts after it, on the back wall and on the side one', () => {
  const placed = relayoutCornerGroup(leftCorner(), { wall: 'B', depthMm: 650, armAMm: 450, armBMm: 450 }, 2400);
  for (const p of placed) assert.equal(p.depth, 650, `${p.role} is as deep as the corner`);
  const at = (role: CornerRole) => placed.find((p) => p.role === role)!;
  assert.deepEqual({ w: at('SQUARE').width, x: at('SQUARE').positionX }, { w: 650, x: 0 }, 'the square is its own depth wide');
  assert.deepEqual({ x: at('ARM_A').positionX }, { x: 650 });
  assert.deepEqual({ x: at('ARM_B').positionX }, { x: 650 });
});

test('a right-hand corner keeps its far end: the square stays on the wall end, the arm grows towards it', () => {
  const placed = relayoutCornerGroup(rightCorner(), { wall: 'C', depthMm: 600, armAMm: 600, armBMm: 450 }, 3000);
  const at = (role: CornerRole) => placed.find((p) => p.role === role)!;
  assert.deepEqual({ x: at('SQUARE').positionX, w: at('SQUARE').width }, { x: 2400, w: 600 }, 'the square is still at 3000');
  assert.deepEqual({ x: at('ARM_A').positionX, w: at('ARM_A').width }, { x: 1800, w: 600 }, 'the back-wall arm reaches the square');
  assert.equal(at('ARM_A').positionX + at('ARM_A').width, at('SQUARE').positionX, 'no gap at the door side');
  assert.deepEqual({ run: at('ARM_B').run, x: at('ARM_B').positionX }, { run: 'C', x: 600 });
});

test('the boxes of the corner land exactly where lCornerBoxes puts them — one rule, two callers', () => {
  const dims = { wall: 'B' as const, depthMm: 600, armAMm: 620, armBMm: 380 };
  const placed = relayoutCornerGroup(leftCorner(), dims, 2400);
  const built = lCornerBoxes({ category: 'BASE_UNIT', roomWidthMm: 2400, ...dims });
  for (const b of built) {
    const p = placed.find((x) => x.role === b.role)!;
    assert.deepEqual({ w: p.width, x: p.positionX, run: p.run }, { w: b.width, x: b.positionX, run: b.run }, b.role);
  }
});

test('a corner that would leave the room is refused, with the numbers the user needs to hear', () => {
  const span = cornerGroupSpan({ depthMm: 600, armAMm: 700, armBMm: 450 });
  assert.equal(cornerFitsWalls(span, 1300, 1050), true, 'exactly the wall counts');
  assert.equal(cornerFitsWalls(span, 1299, 1050), false, '1 mm over the back wall');
  assert.equal(cornerFitsWalls(span, 1300, 1049), false, '1 mm over the side wall');
  assert.equal(cornerFitsWalls(span, 2400, 2400), true);
});

test('the filler a box already carries stays on top of the new width (nothing is silently given back)', () => {
  const stored = leftCorner();
  stored[1] = { ...stored[1], width: 469.5 }; // 450 arm + 19.5 filler, as an older save wrote it
  const dims = cornerDimsOf(stored)!;
  assert.equal(dims.armAMm, 469.5, 'the width on the wall is the width the user sees');
  const placed = relayoutCornerGroup(stored, { ...dims, armAMm: 619.5 }, 2400);
  const armA = placed.find((p) => p.role === 'ARM_A')!;
  assert.equal(armA.width, 619.5, 'a 150 mm wider arm, filler included');
  assert.equal(armA.positionX, 600);
});
