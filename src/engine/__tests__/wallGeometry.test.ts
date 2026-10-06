// src/engine/__tests__/wallGeometry.test.ts
//
// Manual assertion-based tests (no test framework dependency). Run with: node/ts-node this file directly,
// or wire into your existing test runner. Each failure throws immediately with a descriptive message.

import {
  resolveWalls,
  legacySingleWallRoom,
  wallLocalToWorld,
  findNearestWallPoint,
  RoomShape
} from '../wallGeometry';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`❌ FAILED: ${message}`);
}

function approxEqual(a: number, b: number, epsilon = 1e-6): boolean {
  return Math.abs(a - b) < epsilon;
}

// Test 1 — legacy single wall non-regression
(function testLegacySingleWall() {
  const room = legacySingleWallRoom(3000);
  const resolved = resolveWalls(room);
  assert(resolved.walls.length === 1, 'Test1: expected exactly 1 wall');
  assert(resolved.walls[0].length === 3000, 'Test1: wall length should be 3000');
  assert(approxEqual(resolved.walls[0].angleDeg, 0), 'Test1: angle should be 0');
  assert(resolved.joints.length === 0, 'Test1: no joints expected for a single straight wall');
  console.log('✅ Test1 passed: legacy single wall');
})();

// Test 2 — 90° square corner geometry + INSIDE classification
(function testSquareCorner() {
  const room: RoomShape = {
    origin: { x: 0, z: 0 },
    initialAngleDeg: 0,
    segments: [
      { length: 3000, turnDeg: 90 },
      { length: 2400, turnDeg: 0 }
    ]
  };
  const resolved = resolveWalls(room);
  assert(resolved.walls.length === 2, 'Test2: expected 2 walls');
  assert(approxEqual(resolved.walls[0].endPoint.x, 3000) && approxEqual(resolved.walls[0].endPoint.z, 0), 'Test2: wall0 endpoint');
  assert(approxEqual(resolved.walls[1].angleDeg, 90), 'Test2: wall1 angle should be 90');
  assert(approxEqual(resolved.walls[1].endPoint.x, 3000) && approxEqual(resolved.walls[1].endPoint.z, 2400), 'Test2: wall1 endpoint');
  assert(resolved.joints.length === 1, 'Test2: expected 1 joint');
  assert(resolved.joints[0].kind === 'INSIDE', 'Test2: joint should be INSIDE');
  assert(approxEqual(resolved.joints[0].interiorAngleDeg, 90), 'Test2: interior angle should be 90');
  console.log('✅ Test2 passed: square corner');
})();

// Test 3 — straight continuation (turnDeg=0) classified STRAIGHT, not an error
(function testStraightContinuation() {
  const room: RoomShape = {
    origin: { x: 0, z: 0 },
    initialAngleDeg: 0,
    segments: [
      { length: 1200, turnDeg: 0 },
      { length: 1800, turnDeg: 0 }
    ]
  };
  const resolved = resolveWalls(room);
  assert(resolved.joints.length === 1, 'Test3: expected 1 joint (split wall)');
  assert(resolved.joints[0].kind === 'STRAIGHT', 'Test3: joint should be STRAIGHT');
  console.log('✅ Test3 passed: straight continuation');
})();

// Test 4 — outside corner (negative turn) classified OUTSIDE, interiorAngleDeg=270
(function testOutsideCorner() {
  const room: RoomShape = {
    origin: { x: 0, z: 0 },
    initialAngleDeg: 0,
    segments: [
      { length: 2000, turnDeg: -90 },
      { length: 1500, turnDeg: 0 }
    ]
  };
  const resolved = resolveWalls(room);
  assert(resolved.joints[0].kind === 'OUTSIDE', 'Test4: joint should be OUTSIDE');
  assert(approxEqual(resolved.joints[0].interiorAngleDeg, 270), 'Test4: interior angle should be 270');
  console.log('✅ Test4 passed: outside corner');
})();

// Test 5 — zero-length wall rejected
(function testZeroLengthRejected() {
  const room: RoomShape = {
    origin: { x: 0, z: 0 },
    initialAngleDeg: 0,
    segments: [{ length: 0, turnDeg: 0 }]
  };
  let threw = false;
  try {
    resolveWalls(room);
  } catch {
    threw = true;
  }
  assert(threw, 'Test5: expected resolveWalls to throw on zero-length segment');
  console.log('✅ Test5 passed: zero-length rejected');
})();

// Test 6 — findNearestWallPoint snaps correctly among multiple walls
(function testNearestWallPoint() {
  const room: RoomShape = {
    origin: { x: 0, z: 0 },
    initialAngleDeg: 0,
    segments: [
      { length: 3000, turnDeg: 90 },
      { length: 2400, turnDeg: 0 }
    ]
  };
  const resolved = resolveWalls(room);
  const hit = findNearestWallPoint(resolved.walls, { x: 1500, z: 10 }, 50);
  assert(hit !== null, 'Test6: expected a hit near wall0');
  assert(hit!.wallId === resolved.walls[0].id, 'Test6: should snap to wall0');
  assert(approxEqual(hit!.positionOnWall, 1500), 'Test6: positionOnWall should be ~1500');

  const miss = findNearestWallPoint(resolved.walls, { x: 1500, z: 500 }, 50);
  assert(miss === null, 'Test6: expected no hit when too far from any wall');
  console.log('✅ Test6 passed: findNearestWallPoint');
})();

console.log('🎉 All wallGeometry tests passed.');