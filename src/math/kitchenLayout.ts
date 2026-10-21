// src/math/kitchenLayout.ts
// Pure geometry (no three.js, no React). The shape of the kitchen on the floor plan: straight (one wall), L (two) or U (three).
//
// Floor plan, millimetres: x runs along the back wall, z runs away from it towards the user (z = 0 is the back wall).
//   run A = back wall,  run B = left wall (x = 0),  run C = right wall (x = layout.widthMm).
// `positionX` of a cabinet is its distance along ITS wall: from the left end on A, and from the CORNER (the back wall) on B and C.
//
// To draw a run, the 3D scene puts a group at runFrame(layout, run) and the cabinets inside it use toFrame(cab, run).
// Inside that group everything is exactly the straight-kitchen code (x along the wall, z away from it), so worktop, accessories
// and cabinets need no special case for the side walls.
import type { CabinetCategory, CabinetObject, RunId } from '../types/flatma';

export type LayoutType = 'STRAIGHT' | 'L' | 'U';

export interface KitchenLayout {
  type: LayoutType;
  /** Length of the back wall (run A): the room width between the two side walls. */
  widthMm: number;
  /** L only: the side wall that carries the second run. */
  lSide: 'LEFT' | 'RIGHT';
}

export const DEFAULT_LAYOUT: KitchenLayout = { type: 'STRAIGHT', widthMm: 3000, lSide: 'LEFT' };

export const LAYOUT_LABELS: Record<LayoutType, string> = { STRAIGHT: 'مستقيم', L: 'شكل L', U: 'شكل U' };
export const RUN_LABELS: Record<RunId, string> = { A: 'الجدار الخلفي', B: 'الجدار الأيسر', C: 'الجدار الأيمن' };

export const WIDTH_LIMITS_MM: [number, number] = [1500, 8000];

export const runOf = (c: { run?: RunId }): RunId => c.run ?? 'A';

/** The walls that carry cabinets in this layout, in the order the user picks them. */
export function runsOf(layout: KitchenLayout): RunId[] {
  if (layout.type === 'U') return ['A', 'B', 'C'];
  if (layout.type === 'L') return layout.lSide === 'RIGHT' ? ['A', 'C'] : ['A', 'B'];
  return ['A'];
}

/** The side walls where two walls meet: one corner in an L, two in a U. */
export const cornerWalls = (layout: KitchenLayout): Array<'B' | 'C'> => runsOf(layout).filter((r): r is 'B' | 'C' => r !== 'A');

// ------------------------------------------------------------------------------------------------ run frames

export interface RunFrame {
  /** Where the group goes on the floor plan (mm). */
  xMm: number;
  zMm: number;
  /** Rotation about the vertical axis (radians, three.js convention). */
  rotY: number;
}

export function runFrame(layout: KitchenLayout, run: RunId): RunFrame {
  if (run === 'B') return { xMm: 0, zMm: 0, rotY: Math.PI / 2 };
  if (run === 'C') return { xMm: layout.widthMm, zMm: 0, rotY: -Math.PI / 2 };
  return { xMm: 0, zMm: 0, rotY: 0 };
}

/**
 * The cabinet as the run's own frame sees it. On B the frame's x axis points towards the corner (a rotation cannot mirror),
 * so a cabinet that spans p .. p + w from the corner spans -(p + w) .. -p in the frame.
 */
export function toFrame<T extends { positionX: number; width: number }>(cab: T, run: RunId): T {
  return run === 'B' ? { ...cab, positionX: -(cab.positionX + cab.width) } : cab;
}

/** A coordinate along the wall (an accessory's centre, its offset on a sink) as the run's frame sees it. */
export const alongToFrame = (v: number, run: RunId): number => (run === 'B' ? -v : v);

// ------------------------------------------------------------------------------------------------ footprints

export interface Rect { x0: number; x1: number; z0: number; z1: number }

type Placed = Pick<CabinetObject, 'run' | 'positionX' | 'positionZ' | 'width' | 'depth'>;

/** The floor area a cabinet's carcase covers (the front is not counted: two fronts at a corner never clash). */
export function footprintOf(c: Placed, layout: KitchenLayout): Rect {
  const run = runOf(c);
  const back = -c.positionZ || 0; // distance of the back from its wall (|| 0: no -0)
  if (run === 'B') return { x0: back, x1: back + c.depth, z0: c.positionX, z1: c.positionX + c.width };
  if (run === 'C') return { x0: layout.widthMm - back - c.depth, x1: layout.widthMm - back, z0: c.positionX, z1: c.positionX + c.width };
  return { x0: c.positionX, x1: c.positionX + c.width, z0: back, z1: back + c.depth };
}

const TOL_MM = 0.5;
const overlap = (a: Rect, b: Rect): boolean => a.x0 < b.x1 - TOL_MM && b.x0 < a.x1 - TOL_MM && a.z0 < b.z1 - TOL_MM && b.z0 < a.z1 - TOL_MM;

export type FitState = 'OVERLAP' | 'TOUCHING' | 'FREE';

/**
 * For every cabinet: OVERLAP when another cabinet of the same level (floor / wall) takes some of its floor area, TOUCHING when
 * it is flush against a neighbour of its own wall (no gap, no clash), FREE otherwise. Units of one group (an L corner) are
 * one thing: they are never in conflict with each other.
 */
export function fitStates(cabinets: ReadonlyArray<Placed & { id: string; category: CabinetCategory; groupId?: string }>, layout: KitchenLayout): Record<string, FitState> {
  const out: Record<string, FitState> = {};
  cabinets.forEach((a) => {
    let state: FitState = 'FREE';
    for (const b of cabinets) {
      if (a === b || a.category !== b.category) continue;
      const sameGroup = !!a.groupId && a.groupId === b.groupId;
      if (!sameGroup && overlap(footprintOf(a, layout), footprintOf(b, layout))) { state = 'OVERLAP'; break; }
      if (runOf(a) === runOf(b) && (Math.abs(a.positionX + a.width - b.positionX) < TOL_MM || Math.abs(b.positionX + b.width - a.positionX) < TOL_MM)) state = 'TOUCHING';
    }
    out[a.id] = state;
  });
  return out;
}

/** The first place along `run` where a cabinet `widthMm` wide fits between the ones already there (same level), from `fromMm`. */
export function nextFreeX(
  cabinets: ReadonlyArray<Placed & { category: CabinetCategory }>,
  run: RunId,
  category: CabinetCategory,
  widthMm: number,
  fromMm = 0,
): number {
  const same = cabinets.filter((c) => runOf(c) === run && c.category === category).slice().sort((a, b) => a.positionX - b.positionX);
  let x = fromMm;
  for (const c of same) {
    if (x + widthMm <= c.positionX + TOL_MM) break; // fits before this one
    x = Math.max(x, c.positionX + c.width);
  }
  return x;
}

/**
 * How far from the corner the first cabinet of a SIDE wall must start so that it clears what stands on the back wall in that
 * corner (the square of an L corner, or any cabinet that reaches the side wall). 0 on the back wall and in an empty corner.
 */
export function cornerClearanceMm(
  cabinets: ReadonlyArray<Placed & { category: CabinetCategory }>,
  layout: KitchenLayout,
  run: RunId,
  category: CabinetCategory,
): number {
  if (run === 'A') return 0;
  let z = 0;
  for (const c of cabinets) {
    if (runOf(c) !== 'A' || c.category !== category) continue;
    const r = footprintOf(c, layout);
    const reachesCorner = run === 'B' ? r.x0 <= TOL_MM : r.x1 >= layout.widthMm - TOL_MM;
    if (reachesCorner) z = Math.max(z, r.z1);
  }
  return z;
}
