// src/engine/wallGeometry.ts
//
// Pure, dependency-free geometry engine for multi-wall room layouts.
// Convention: angles in degrees, measured CCW from the +X axis.
// Positive turnDeg = left turn = INSIDE corner. Negative turnDeg = right turn = OUTSIDE corner.
// "norm" (perpendicular, into-the-room direction) = (-dir.z, dir.x) where dir is the wall's unit direction vector.

export interface Point2D {
  x: number;
  z: number;
}

/** One authoring segment: a wall of `length` mm, followed by a turn of `turnDeg` before the next segment. */
export interface RoomSegmentInput {
  length: number;
  turnDeg: number;
}

/** Authoring-friendly description of a room: a starting point/heading, then a chain of segments. */
export interface RoomShape {
  origin: Point2D;
  initialAngleDeg: number;
  segments: RoomSegmentInput[];
}

export interface WallSegment {
  id: string;
  index: number;
  startPoint: Point2D;
  endPoint: Point2D;
  angleDeg: number;
  length: number;
}

export type WallJointKind = 'INSIDE' | 'OUTSIDE' | 'STRAIGHT';

export interface WallJoint {
  id: string;
  wallAId: string;
  wallBId: string;
  cornerPoint: Point2D;
  interiorAngleDeg: number;
  turnDeg: number;
  kind: WallJointKind;
}

export interface ResolvedRoom {
  walls: WallSegment[];
  joints: WallJoint[];
}

function normalizeDeg(deg: number): number {
  let d = deg % 360;
  if (d < 0) d += 360;
  return d;
}

function degToRadLocal(deg: number): number {
  return (deg * Math.PI) / 180;
}

/** Interior angle of the room at a joint, given the turn applied there. */
export function computeInteriorAngle(turnDeg: number): number {
  return normalizeDeg(180 - turnDeg);
}

export function classifyJoint(turnDeg: number): WallJointKind {
  if (Math.abs(turnDeg) < 1e-6) return 'STRAIGHT';
  return turnDeg > 0 ? 'INSIDE' : 'OUTSIDE';
}

/**
 * Converts an authoring-friendly RoomShape into absolute wall segments + joints.
 * Throws on zero/negative-length segments (a wall must have a physical length).
 */
export function resolveWalls(room: RoomShape): ResolvedRoom {
  const walls: WallSegment[] = [];
  const joints: WallJoint[] = [];

  let currentPoint: Point2D = { ...room.origin };
  let currentAngleDeg = room.initialAngleDeg;

  room.segments.forEach((segment, index) => {
    if (!(segment.length > 0)) {
      throw new Error(`resolveWalls: segment at index ${index} has invalid length (${segment.length}); length must be > 0`);
    }

    const rad = degToRadLocal(currentAngleDeg);
    const dir: Point2D = { x: Math.cos(rad), z: Math.sin(rad) };
    const endPoint: Point2D = {
      x: currentPoint.x + dir.x * segment.length,
      z: currentPoint.z + dir.z * segment.length
    };

    const wall: WallSegment = {
      id: `wall-${index}`,
      index,
      startPoint: currentPoint,
      endPoint,
      angleDeg: normalizeDeg(currentAngleDeg),
      length: segment.length
    };
    walls.push(wall);

    const isLastSegment = index === room.segments.length - 1;
    if (!isLastSegment || Math.abs(segment.turnDeg) > 1e-6) {
      const nextWallId = `wall-${index + 1}`;
      joints.push({
        id: `joint-${index}`,
        wallAId: wall.id,
        wallBId: nextWallId,
        cornerPoint: endPoint,
        interiorAngleDeg: computeInteriorAngle(segment.turnDeg),
        turnDeg: segment.turnDeg,
        kind: classifyJoint(segment.turnDeg)
      });
    }

    currentPoint = endPoint;
    currentAngleDeg = normalizeDeg(currentAngleDeg + segment.turnDeg);
  });

  return { walls, joints };
}

/**
 * THE single authorized coordinate transform: converts a position along a wall (positionOnWall, mm from
 * wall.startPoint) and a depth perpendicular into the room (depthIntoRoom, mm) into absolute world coordinates
 * plus the world-space Y rotation (degrees) that a cabinet facing "into the room" along this wall should use.
 */
export function wallLocalToWorld(
  wall: WallSegment,
  positionOnWall: number,
  depthIntoRoom: number
): { x: number; z: number; rotationYDeg: number } {
  const rad = degToRadLocal(wall.angleDeg);
  const dir: Point2D = { x: Math.cos(rad), z: Math.sin(rad) };
  const norm: Point2D = { x: -dir.z, z: dir.x };

  const x = wall.startPoint.x + dir.x * positionOnWall + norm.x * depthIntoRoom;
  const z = wall.startPoint.z + dir.z * positionOnWall + norm.z * depthIntoRoom;

  return { x, z, rotationYDeg: wall.angleDeg };
}

/** Wraps today's single straight-wall assumption as a RoomShape, for safe migration/fallback. */
export function legacySingleWallRoom(lengthMm: number): RoomShape {
  return {
    origin: { x: 0, z: 0 },
    initialAngleDeg: 0,
    segments: [{ length: lengthMm, turnDeg: 0 }]
  };
}

/** For drag/snap interactions: finds the nearest wall to a world point, within toleranceMm. */
export function findNearestWallPoint(
  walls: WallSegment[],
  world: Point2D,
  toleranceMm: number = 50
): { wallId: string; positionOnWall: number; distanceMm: number } | null {
  let best: { wallId: string; positionOnWall: number; distanceMm: number } | null = null;

  walls.forEach((wall) => {
    const rad = degToRadLocal(wall.angleDeg);
    const dir: Point2D = { x: Math.cos(rad), z: Math.sin(rad) };

    const relX = world.x - wall.startPoint.x;
    const relZ = world.z - wall.startPoint.z;

    const positionOnWall = relX * dir.x + relZ * dir.z;
    const perpDistance = Math.abs(-relX * dir.z + relZ * dir.x);

    const clampedPos = Math.max(0, Math.min(wall.length, positionOnWall));
    const isWithinSpan = clampedPos === positionOnWall;
    const distanceMm = isWithinSpan
      ? perpDistance
      : Math.hypot(relX - dir.x * clampedPos, relZ - dir.z * clampedPos);

    if (distanceMm <= toleranceMm && (!best || distanceMm < best.distanceMm)) {
      best = { wallId: wall.id, positionOnWall: clampedPos, distanceMm };
    }
  });

  return best;
}