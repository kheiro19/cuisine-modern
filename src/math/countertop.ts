// src/math/countertop.ts
// Pure geometry (no three.js). Coordinates are millimetres on the floor plan:
// x runs along the wall, z runs away from the wall towards the user (z = 0 is the wall plane).

export interface PathPoint {
  x: number;
  zOffset: number; // offset of the FRONT edge relative to the straight front line (positive = towards the user)
}

const MIN_DEPTH_MM = 50;

/**
 * Closed outline of the countertop: back-left -> back-right -> front edge from right to left.
 * (The old code built this shape in the XY plane and extruded it along Z, which produced a thin VERTICAL
 * slab instead of a horizontal worktop, and offset it by half the scene width.)
 */
export function computeCountertopOutline(
  path: ReadonlyArray<PathPoint>,
  xStartMm: number,
  xEndMm: number,
  zBackMm: number,
  zFrontMm: number,
): Array<[number, number]> {
  if (!(xEndMm > xStartMm)) return [];
  const clampZ = (offset: number) => Math.max(zBackMm + MIN_DEPTH_MM, zFrontMm + offset);
  const pts = path
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.zOffset))
    .slice()
    .sort((a, b) => a.x - b.x);

  const front: Array<[number, number]> = [];
  if (pts.length < 2) {
    const z = clampZ(pts[0]?.zOffset ?? 0);
    front.push([xStartMm, z], [xEndMm, z]);
  } else {
    front.push([xStartMm, clampZ(pts[0].zOffset)]);
    for (const p of pts) front.push([Math.min(xEndMm, Math.max(xStartMm, p.x)), clampZ(p.zOffset)]);
    front.push([xEndMm, clampZ(pts[pts.length - 1].zOffset)]);
  }

  const ring: Array<[number, number]> = [[xStartMm, zBackMm], [xEndMm, zBackMm], ...front.reverse()];
  return ring.filter((pt, i) => i === 0 || pt[0] !== ring[i - 1][0] || pt[1] !== ring[i - 1][1]);
}
