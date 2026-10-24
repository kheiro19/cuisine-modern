// L and U kitchens: which walls a layout uses, how a run's frame maps to the floor plan, who overlaps whom.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as K from '../../src/math/kitchenLayout';
import type { RunId } from '../../src/types/flatma';

const L = (over: Partial<K.KitchenLayout> = {}): K.KitchenLayout => ({ type: 'L', widthMm: 3000, lSide: 'LEFT', ...over });
const U: K.KitchenLayout = { type: 'U', widthMm: 3000, lSide: 'LEFT' };
const cab = (id: string, run: RunId, positionX: number, width: number, over: any = {}) => ({ id, run, positionX, positionZ: 0, width, depth: 600, category: 'BASE_UNIT' as const, ...over });

// What the three.js group does: rotate about y by theta, then translate. x' = x cos + z sin ; z' = -x sin + z cos.
const world = (layout, run, xFrame, zFrame) => {
  const f = K.runFrame(layout, run);
  return { x: f.xMm + xFrame * Math.cos(f.rotY) + zFrame * Math.sin(f.rotY), z: f.zMm - xFrame * Math.sin(f.rotY) + zFrame * Math.cos(f.rotY) };
};
const near = (a, b) => Math.abs(a - b) < 1e-6;

test('layout: a straight kitchen has one wall, an L two (left or right), a U three', () => {
  assert.deepEqual(K.runsOf(K.DEFAULT_LAYOUT), ['A']);
  assert.deepEqual(K.runsOf(L()), ['A', 'B']);
  assert.deepEqual(K.runsOf(L({ lSide: 'RIGHT' })), ['A', 'C']);
  assert.deepEqual(K.runsOf(U), ['A', 'B', 'C']);
  assert.deepEqual(K.cornerWalls(U), ['B', 'C']);
  assert.deepEqual(K.cornerWalls(K.DEFAULT_LAYOUT), []);
  assert.equal(K.runOf({}), 'A', 'older cabinets without a run stand on the back wall');
});

test('frames: a cabinet at distance p..p+w from the corner lands at z = p..p+w on BOTH side walls, fronts facing the room', () => {
  const w = 450, p = 600, depth = 600;
  // left wall (B): the frame is turned +90 degrees, x runs towards the corner
  const b = K.toFrame({ positionX: p, width: w }, 'B');
  assert.equal(b.positionX, -(p + w));
  const bLo = world(U, 'B', b.positionX, 0), bHi = world(U, 'B', b.positionX + w, 0);
  assert.ok(near(bLo.z, p + w) && near(bHi.z, p), 'B: spans p..p+w from the corner');
  assert.ok(near(world(U, 'B', 0, depth).x, depth) && near(world(U, 'B', 0, 0).x, 0), 'B: the back is on the wall x = 0, the front towards +x');
  // right wall (C): turned -90 degrees, x runs away from the corner
  const c = K.toFrame({ positionX: p, width: w }, 'C');
  assert.equal(c.positionX, p);
  assert.ok(near(world(U, 'C', c.positionX, 0).z, p) && near(world(U, 'C', c.positionX + w, 0).z, p + w), 'C: spans p..p+w from the corner');
  assert.ok(near(world(U, 'C', 0, 0).x, 3000) && near(world(U, 'C', 0, depth).x, 3000 - depth), 'C: the back is on the wall x = 3000, the front towards -x');
  // the back wall is untouched
  assert.deepEqual(K.runFrame(U, 'A'), { xMm: 0, zMm: 0, rotY: 0 });
  assert.equal(K.alongToFrame(700, 'B'), -700);
  assert.equal(K.alongToFrame(700, 'C'), 700);
});

test('footprints: the same floor plan whichever way the wall runs', () => {
  const r = (c) => K.footprintOf(c, U);
  assert.deepEqual(r(cab('a', 'A', 100, 600)), { x0: 100, x1: 700, z0: 0, z1: 600 });
  assert.deepEqual(r(cab('b', 'B', 600, 450)), { x0: 0, x1: 600, z0: 600, z1: 1050 });
  assert.deepEqual(r(cab('c', 'C', 600, 450)), { x0: 2400, x1: 3000, z0: 600, z1: 1050 });
});

test('fit: overlaps are found along a wall and across the corner; flush neighbours are only touching', () => {
  const ok = [cab('a1', 'A', 0, 600), cab('a2', 'A', 600, 600), cab('b1', 'B', 600, 600), cab('c1', 'C', 600, 600)];
  const s = K.fitStates(ok, U);
  assert.deepEqual(Object.values(s), ['TOUCHING', 'TOUCHING', 'FREE', 'FREE']);
  const clash = K.fitStates([cab('a1', 'A', 0, 600), cab('a2', 'A', 500, 600)], U);
  assert.deepEqual(Object.values(clash), ['OVERLAP', 'OVERLAP']);
  // a left-wall cabinet that starts at the corner sits inside the back-wall cabinet of the corner square
  const corner = K.fitStates([cab('a', 'A', 0, 600), cab('b', 'B', 0, 600)], U);
  assert.deepEqual(Object.values(corner), ['OVERLAP', 'OVERLAP']);
  // a wall unit above a base unit is another level: never a clash
  assert.deepEqual(Object.values(K.fitStates([cab('f', 'A', 0, 600), cab('w', 'A', 0, 600, { category: 'WALL_UNIT', depth: 350 })], U)), ['FREE', 'FREE']);
  // units of one group (an L corner) share their faces on purpose
  const g = K.fitStates([cab('x', 'A', 0, 600, { groupId: 'g' }), cab('y', 'B', 0, 600, { groupId: 'g' })], U);
  assert.deepEqual(Object.values(g), ['FREE', 'FREE']);
});

test('next free place: appended after the last one, or into a gap that is big enough', () => {
  const row = [cab('a', 'A', 0, 600), cab('b', 'A', 1200, 600), cab('c', 'B', 0, 600)];
  assert.equal(K.nextFreeX(row, 'A', 'BASE_UNIT', 600), 600, 'the gap between the two');
  assert.equal(K.nextFreeX(row, 'A', 'BASE_UNIT', 700), 1800, 'too wide for the gap: after the last');
  assert.equal(K.nextFreeX(row, 'B', 'BASE_UNIT', 600), 600);
  assert.equal(K.nextFreeX(row, 'C', 'BASE_UNIT', 600), 0, 'an empty wall');
  assert.equal(K.nextFreeX(row, 'A', 'WALL_UNIT', 600), 0, 'wall units are a separate row');
  assert.equal(K.nextFreeX(row, 'B', 'BASE_UNIT', 450, 600), 600, 'starting after the corner');
});

test('auto arrange: gaps close, order is kept, an L corner stays and the others pack around it', () => {
  const row = [cab('b', 'A', 900, 600), cab('a', 'A', 100, 450), cab('c', 'A', 2000, 300)];
  const m = Object.fromEntries(K.autoArrange(row, K.DEFAULT_LAYOUT).map((x) => [x.id, x.positionX]));
  assert.deepEqual(m, { a: 0, b: 450, c: 1050 }, 'ordered by position, packed from 0');
  // with the corner on the left wall: square 0..600 and arm 600..1050 on the back wall, arm 600..1050 on the left wall
  const corner = [
    cab('sq', 'A', 0, 600, { groupId: 'g' }), cab('ar', 'A', 600, 450, { groupId: 'g' }), cab('br', 'B', 600, 450, { groupId: 'g' }),
    cab('x', 'A', 1700, 600), cab('y', 'B', 1500, 600),
  ];
  const r = Object.fromEntries(K.autoArrange(corner, L()).map((x) => [x.id, x.positionX]));
  assert.deepEqual(r, { x: 1050, y: 1050 }, 'the free ones start where the corner ends, on each wall');
  assert.ok(Object.values(K.fitStates([...corner.map((c) => ({ ...c, positionX: r[c.id] ?? c.positionX }))], L())).every((s) => s !== 'OVERLAP'));
  assert.equal(K.cornerClearanceMm(corner, L(), 'B', 'BASE_UNIT'), 600, 'a side wall starts after the square');
  assert.equal(K.cornerClearanceMm([], L(), 'B', 'BASE_UNIT'), 0);
  assert.equal(K.cornerClearanceMm(corner, L(), 'A', 'BASE_UNIT'), 0);
});

// ------------------------------------------------------------------------------------------------ wall limits
// test.md #2: nothing checked that a cabinet stays inside its wall. These are the tests that should have existed.

test('walls: the back wall is the room width, a side wall is the room depth', () => {
  assert.equal(K.wallLengthOf({ type: 'STRAIGHT', widthMm: 3000, lSide: 'LEFT' }, 'A'), 3000);
  assert.equal(K.wallLengthOf({ type: 'L', widthMm: 3000, lSide: 'LEFT' }, 'B'), K.DEFAULT_ROOM_DEPTH_MM);
  assert.equal(K.wallLengthOf({ type: 'L', widthMm: 3000, lSide: 'RIGHT', depthMm: 2000 }, 'C'), 2000);
});

test('bounds: a cabinet that runs past the end of its wall is OUT_OF_BOUNDS, on every wall', () => {
  const layout: K.KitchenLayout = { type: 'L', widthMm: 3000, lSide: 'LEFT', depthMm: 2400 };
  assert.equal(K.fitStates([cab('a', 'A', 2400, 600)], layout).a, 'FREE', 'exactly at the end');
  assert.equal(K.fitStates([cab('b', 'A', 2400.4, 600)], layout).b, 'FREE', 'inside the half-millimetre tolerance');
  assert.equal(K.fitStates([cab('c', 'A', 2401, 600)], layout).c, 'OUT_OF_BOUNDS');
  assert.equal(K.offWallMm(cab('c', 'A', 2401, 600), layout), 1, 'one millimetre past the end');
  // a side wall ends at the room depth
  assert.equal(K.fitStates([cab('d', 'B', 1800, 600)], layout).d, 'FREE');
  assert.equal(K.fitStates([cab('e', 'B', 1900, 600)], layout).e, 'OUT_OF_BOUNDS');
  assert.equal(K.fitStates([cab('f', 'C', 1900, 600)], layout).f, 'OUT_OF_BOUNDS');
  // negative positions are out too
  assert.equal(K.fitStates([cab('g', 'A', -50, 600)], layout).g, 'OUT_OF_BOUNDS');
});

test('placement: a full wall or a cabinet wider than the wall is REFUSED, never silently placed past the end', () => {
  const layout = K.DEFAULT_LAYOUT; // back wall 3000
  const full = [cab('a', 'A', 0, 1500), cab('b', 'A', 1500, 1500)];
  const r = K.placeAlongWall(full, layout, 'A', 'BASE_UNIT', 600);
  assert.equal(r.ok, false, 'the wall is full');
  assert.equal(r.reason, 'WALL_FULL');
  assert.equal(r.wallMm, 3000);
  assert.equal(r.freeMm, 0);

  const wide = K.placeAlongWall([], layout, 'A', 'BASE_UNIT', 3200);
  assert.equal(wide.ok, false);
  assert.equal(wide.reason, 'TOO_WIDE');

  assert.deepEqual(K.placeAlongWall([cab('a', 'A', 0, 600)], layout, 'A', 'BASE_UNIT', 600), { ok: true, positionX: 600 });
  // a gap that is big enough is used
  const gap = K.placeAlongWall([cab('a', 'A', 0, 600), cab('b', 'A', 1800, 600)], layout, 'A', 'BASE_UNIT', 1200);
  assert.deepEqual(gap, { ok: true, positionX: 600 });
  // the leftover at the end of a wall is too small: refused, not glued past the end
  assert.equal(K.placeAlongWall([cab('a', 'A', 0, 2500)], layout, 'A', 'BASE_UNIT', 600).ok, false);
  // a side wall uses the room depth
  assert.equal(K.placeAlongWall([], { type: 'L', widthMm: 3000, lSide: 'LEFT', depthMm: 2000 }, 'B', 'BASE_UNIT', 2100).ok, false);
});

test('moving: a cabinet is clamped inside its wall, never pushed past either end', () => {
  assert.equal(K.clampOnWall(-200, 600, 3000), 0);
  assert.equal(K.clampOnWall(2600, 600, 3000), 2400);
  assert.equal(K.clampOnWall(1000, 600, 3000), 1000);
  assert.equal(K.clampOnWall(100, 4000, 3000), 0, 'a cabinet wider than the wall sits at the start');
});
