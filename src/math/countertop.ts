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

// ---------------------------------------------------------------------------------------------- the slab the user sets

import { COUNTERTOP, LAYOUT } from './constants';
import type { CabinetObject } from '../types/flatma';

/** What the showcase keeps for the worktop: drawn, dimensioned, never priced (the customer buys it). */
export interface CountertopSettings {
  visible: boolean;
  thicknessMm: number;
  depthMm: number;
  /**
   * The finish picked for the slab (a file of public/textures, the same shelf the fronts use). Look only: the worktop is
   * not stock, not priced, not cut. Empty / missing = the plain stone the slab is drawn with.
   */
  texturePath?: string;
}

export const COUNTERTOP_DEFAULT: CountertopSettings = {
  visible: true,
  thicknessMm: COUNTERTOP.DEFAULT_THICKNESS_MM,
  depthMm: COUNTERTOP.DEFAULT_DEPTH_MM,
  texturePath: undefined,
};

const whole = (v: unknown, range: readonly [number, number], fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : NaN;
  return Number.isFinite(n) ? Math.min(range[1], Math.max(range[0], n)) : fallback;
};

/** The form's numbers, clamped: thickness 20–40 mm, depth 580–650 mm. A missing / NaN value keeps the default. */
export function clampCountertopSettings(raw: Partial<CountertopSettings> | undefined): CountertopSettings {
  const path = typeof raw?.texturePath === 'string' && raw.texturePath.trim() !== '' ? raw.texturePath : undefined;
  return {
    visible: raw?.visible !== false,
    thicknessMm: whole(raw?.thicknessMm, COUNTERTOP.THICKNESS_MM, COUNTERTOP.DEFAULT_THICKNESS_MM),
    depthMm: whole(raw?.depthMm, COUNTERTOP.DEPTH_MM, COUNTERTOP.DEFAULT_DEPTH_MM),
    texturePath: path,
  };
}

/**
 * The depth really drawn — ALWAYS the one typed. The slab used to be stretched, silently and for ever, to the front it
 * covers: a 600 mm number drew 648 and typing 611, 620 or 640 changed nothing at all, which read as a locked field. The
 * width belongs to the user now, and a slab that stops before the front is reported (how many mm it lacks) so they can
 * decide, with one click, to cover it. `neededMm` is how far the run reaches from the wall (carcase + door + overhang).
 */
export function countertopDepthMm(requestedMm: number, neededMm: number): { depthMm: number; shortByMm: number } {
  if (!(neededMm > 0)) return { depthMm: requestedMm, shortByMm: 0 };
  return { depthMm: requestedMm, shortByMm: Math.max(0, Math.round(neededMm - requestedMm)) };
}

/** Floor units that carry a worktop: tall / pantry units go through it. */
export function carriesCountertop(cab: Pick<CabinetObject, 'category' | 'height'>): boolean {
  return cab.category === 'BASE_UNIT' && cab.height <= LAYOUT.COUNTERTOP_MAX_UNIT_HEIGHT_MM;
}
