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
import type { CabinetCategory, CabinetObject, RunId, WallMount } from '../types/flatma';

export type LayoutType = 'STRAIGHT' | 'L' | 'U';

export interface KitchenLayout {
  type: LayoutType;
  /** Length of the back wall (run A): the room width between the two side walls. */
  widthMm: number;
  /**
   * L and U only: how far the side walls run from the back wall towards the user (the room depth). Optional: a layout saved
   * before this field existed gets DEFAULT_ROOM_DEPTH_MM, and `wallLengthOf` is the only place that reads it.
   */
  depthMm?: number;
  /** L only: the side wall that carries the second run. */
  lSide: 'LEFT' | 'RIGHT';
  /** Height of the room (floor to ceiling), every layout. Missing = DEFAULT_ROOM_HEIGHT_MM. */
  heightMm?: number;
  /** The standard free space between the worktop and the wall units (a wall unit may choose its own, CabinetObject.wallMount). Missing = DEFAULT_WALL_GAP_MM. */
  wallGapMm?: number;
}

export const DEFAULT_LAYOUT: KitchenLayout = { type: 'STRAIGHT', widthMm: 3000, lSide: 'LEFT' };

export const LAYOUT_LABELS: Record<LayoutType, string> = { STRAIGHT: 'مستقيم', L: 'شكل L', U: 'شكل U' };
export const RUN_LABELS: Record<RunId, string> = { A: 'الجدار الخلفي', B: 'الجدار الأيسر', C: 'الجدار الأيمن' };

export const WIDTH_LIMITS_MM: [number, number] = [1500, 8000];
/** How deep the room may be: the length of the side walls (runs B and C). */
export const DEPTH_LIMITS_MM: [number, number] = [1200, 6000];
export const DEFAULT_ROOM_DEPTH_MM = 2400;
/** The height of the room, floor to ceiling. */
export const HEIGHT_LIMITS_MM: [number, number] = [2000, 4000];
export const DEFAULT_ROOM_HEIGHT_MM = 2600;
/** The standard gap between the worktop and the bottom of the wall units. */
export const WALL_GAP_LIMITS_MM: [number, number] = [0, 1500];
export const DEFAULT_WALL_GAP_MM = 600;

export const roomHeightOf = (layout: Pick<KitchenLayout, 'heightMm'>): number => layout.heightMm ?? DEFAULT_ROOM_HEIGHT_MM;
export const wallGapOf = (layout: Pick<KitchenLayout, 'wallGapMm'>): number => layout.wallGapMm ?? DEFAULT_WALL_GAP_MM;

// ------------------------------------------------------------------------------------------------ wall units: how high they hang

export interface WallMountRef {
  /** Top face of the worktop, from the floor. */
  counterTopMm: number;
  /** The standard gap above the worktop, for a wall unit that does not choose its own. */
  defaultGapMm: number;
  roomHeightMm: number;
}

/** The bottom of a wall unit, from the floor: the standard gap above the worktop, or what the unit itself chose (CabinetObject.wallMount). */
export function wallBottomMmOf(cab: { height: number; wallMount?: WallMount }, ref: WallMountRef): number {
  const m = cab.wallMount;
  if (!m) return ref.counterTopMm + ref.defaultGapMm;
  const mm = Math.max(0, m.mm);
  if (m.from === 'CEILING') return ref.roomHeightMm - mm - cab.height;
  if (m.from === 'FLOOR') return mm;
  return ref.counterTopMm + mm;
}

export interface WallMountIssue {
  cabinetId: string;
  code: 'ABOVE_CEILING' | 'BELOW_WORKTOP' | 'WALL_OVERLAP';
  message: string;
}

/**
 * Wall units that cannot hang where they were put: they poke through the ceiling, or they come down into the worktop / a base unit
 * standing under them (same wall, same stretch of it).
 */
export function wallMountIssues(
  cabinets: ReadonlyArray<Pick<CabinetObject, 'id' | 'name' | 'category' | 'run' | 'positionX' | 'width' | 'height' | 'wallMount'>>,
  ref: WallMountRef,
): WallMountIssue[] {
  const out: WallMountIssue[] = [];
  const bases = cabinets.filter((c) => c.category === 'BASE_UNIT' && c.height <= ref.counterTopMm);
  cabinets.filter((c) => c.category === 'WALL_UNIT').forEach((w) => {
    const bottom = wallBottomMmOf(w, ref);
    const top = bottom + w.height;
    if (top > ref.roomHeightMm + TOL_MM) {
      out.push({ cabinetId: w.id, code: 'ABOVE_CEILING', message: `${w.name}: أعلى الخزانة ${Math.round(top)} مم، وارتفاع الغرفة ${Math.round(ref.roomHeightMm)} مم (تتجاوز السقف بـ ${Math.round(top - ref.roomHeightMm)} مم).` });
    }
    const over = bases.some((b) => runOf(b) === runOf(w) && b.positionX < w.positionX + w.width - TOL_MM && w.positionX < b.positionX + b.width - TOL_MM);
    if (over && bottom < ref.counterTopMm - TOL_MM) {
      out.push({ cabinetId: w.id, code: 'BELOW_WORKTOP', message: `${w.name}: أسفل الخزانة على ${Math.round(bottom)} مم، أي تحت سطح العمل (${Math.round(ref.counterTopMm)} مم): تصطدم بالخزانة السفلية.` });
    }
  });
  // Two wall units on the same wall may share the same stretch of it only when one hangs wholly above the other
  // (a short unit at the ceiling over a taller one). Sharing the stretch AND the height is a real clash — the
  // floor-plan overlap alone cannot tell the two apart, so this is checked on the vertical spans.
  const walls = cabinets.filter((c) => c.category === 'WALL_UNIT');
  walls.forEach((w, i) => {
    const wLo = wallBottomMmOf(w, ref), wHi = wLo + w.height;
    walls.slice(i + 1).forEach((o) => {
      if (runOf(o) !== runOf(w)) return;
      if (!(w.positionX < o.positionX + o.width - TOL_MM && o.positionX < w.positionX + w.width - TOL_MM)) return;
      const oLo = wallBottomMmOf(o, ref), oHi = oLo + o.height;
      if (wLo < oHi - TOL_MM && oLo < wHi - TOL_MM) {
        out.push({ cabinetId: o.id, code: 'WALL_OVERLAP', message: `${o.name}: تتداخل عموديًا مع «${w.name}» على نفس الجدار (من ${Math.round(Math.max(wLo, oLo))} إلى ${Math.round(Math.min(wHi, oHi))} مم). ارفعها أو اخفضها حتى تتلامس الحواف بلا تداخل.` });
      }
    });
  });
  return out;
}

export const runOf = (c: { run?: RunId }): RunId => c.run ?? 'A';

/**
 * How long the wall a cabinet stands on is. The back wall (A) is the room width. A side wall (B, C) runs from the back wall
 * towards the user, so it is the room depth — the only thing that stops a cabinet from running out of the room.
 */
export function wallLengthOf(layout: KitchenLayout, run: RunId): number {
  return run === 'A' ? layout.widthMm : layout.depthMm ?? DEFAULT_ROOM_DEPTH_MM;
}

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

/** How far a cabinet runs past the end of its wall, in mm. 0 when it is inside, negative positions count too. */
export function offWallMm(cab: Pick<CabinetObject, 'run' | 'positionX' | 'width'>, layout: KitchenLayout): number {
  return Math.max(0, -cab.positionX, cab.positionX + cab.width - wallLengthOf(layout, runOf(cab)));
}

/** True when the whole cabinet is inside its wall (half a millimetre of tolerance, like every other comparison here). */
export const fitsOnWall = (cab: Pick<CabinetObject, 'run' | 'positionX' | 'width'>, layout: KitchenLayout): boolean =>
  offWallMm(cab, layout) <= TOL_MM;

/** A position that keeps a cabinet of `widthMm` inside a wall of `wallMm`; a cabinet wider than its wall waits at 0. */
export function clampOnWall(positionX: number, widthMm: number, wallMm: number): number {
  return Math.min(Math.max(0, positionX), Math.max(0, wallMm - widthMm));
}

export type FitState = 'OVERLAP' | 'OUT_OF_BOUNDS' | 'TOUCHING' | 'FREE';

/**
 * For every cabinet: OVERLAP when another cabinet of the same level (floor / wall) takes some of its floor area, TOUCHING when
 * it is flush against a neighbour of its own wall (no gap, no clash), FREE otherwise. Units of one group (an L corner) are
 * one thing: they are never in conflict with each other.
 */
export function fitStates(
  cabinets: ReadonlyArray<Placed & { id: string; category: CabinetCategory; groupId?: string; height?: number; wallMount?: WallMount }>,
  layout: KitchenLayout,
  ref?: WallMountRef,
): Record<string, FitState> {
  // Where wall units hang, for the vertical half of the clash test below. Without a caller-supplied reference the
  // worktop is read off the tallest base unit in the set (the same approximation the 3D view uses before any base
  // unit exists: a 900 mm unit under a 40 mm slab).
  const mountRef: WallMountRef = ref ?? {
    counterTopMm: Math.max(0, ...cabinets.filter((c) => c.category === 'BASE_UNIT').map((c) => c.height ?? 0), 900) + 40,
    defaultGapMm: wallGapOf(layout),
    roomHeightMm: roomHeightOf(layout),
  };
  const vSpan = (c: { height?: number; wallMount?: WallMount }): [number, number] | null =>
    c.height === undefined ? null : [wallBottomMmOf({ height: c.height, wallMount: c.wallMount }, mountRef), wallBottomMmOf({ height: c.height, wallMount: c.wallMount }, mountRef) + c.height];
  const out: Record<string, FitState> = {};
  cabinets.forEach((a) => {
    let clash = false;
    let touching = false;
    for (const b of cabinets) {
      if (a === b || a.category !== b.category) continue;
      const sameGroup = !!a.groupId && a.groupId === b.groupId;
      // Wall units live on the wall, not on the floor: two of them may share the same stretch of wall when one
      // hangs wholly above the other (stacked). They clash only when their heights clash too. A unit whose height
      // is unknown keeps the old floor-plan verdict.
      const stackedClear = (() => {
        if (a.category !== 'WALL_UNIT') return false;
        const sa = vSpan(a), sb = vSpan(b);
        if (!sa || !sb) return false;
        return sa[1] <= sb[0] + TOL_MM || sb[1] <= sa[0] + TOL_MM;
      })();
      if (!sameGroup && !stackedClear && overlap(footprintOf(a, layout), footprintOf(b, layout))) { clash = true; break; }
      if (runOf(a) === runOf(b) && (Math.abs(a.positionX + a.width - b.positionX) < TOL_MM || Math.abs(b.positionX + b.width - a.positionX) < TOL_MM)) touching = true;
      // Wall units stacked on the same stretch of wall (one hung wholly above the other) are neighbours too:
      // when the top edge of one sits exactly on the bottom edge of the other they are TOUCHING, like two units
      // side by side — the list shows it with the same green frame, so a deliberate stack reads as intentional.
      if (a.category === 'WALL_UNIT' && runOf(a) === runOf(b)) {
        const sa = vSpan(a), sb = vSpan(b);
        const shareStretch = a.positionX < b.positionX + b.width - TOL_MM && b.positionX < a.positionX + a.width - TOL_MM;
        if (sa && sb && shareStretch && (Math.abs(sa[1] - sb[0]) <= TOL_MM || Math.abs(sb[1] - sa[0]) <= TOL_MM)) touching = true;
      }
    }
    // Leaving the wall is the worst state: the design cannot be built there, whatever else is true of it.
    out[a.id] = !fitsOnWall(a, layout) ? 'OUT_OF_BOUNDS' : clash ? 'OVERLAP' : touching ? 'TOUCHING' : 'FREE';
  });
  return out;
}

export type Placement =
  | { ok: true; positionX: number }
  | { ok: false; reason: 'TOO_WIDE' | 'WALL_FULL'; wallMm: number; freeMm: number };

/**
 * Where a NEW cabinet `widthMm` wide may stand on `run` — or why it cannot: it is wider than the wall (TOO_WIDE), or no free
 * gap left on the wall is big enough (WALL_FULL). `nextFreeX` alone always answers with a number, even past the end of the wall,
 * which is how a cabinet used to be placed outside the room without a word.
 */
export function placeAlongWall(
  cabinets: ReadonlyArray<Placed & { category: CabinetCategory }>,
  layout: KitchenLayout,
  run: RunId,
  category: CabinetCategory,
  widthMm: number,
  fromMm = 0,
  /** Floor pieces of the accessories library standing on this wall: a new BASE cabinet must fit around them too. */
  blockers: ReadonlyArray<{ positionX: number; width: number }> = [],
): Placement {
  const wallMm = wallLengthOf(layout, run);
  const room = Math.max(0, wallMm - fromMm);
  if (widthMm > room + TOL_MM) return { ok: false, reason: 'TOO_WIDE', wallMm, freeMm: room };
  const occupied = category === 'BASE_UNIT' && blockers.length > 0
    ? [...cabinets, ...blockers.map((b) => ({ run, category: 'BASE_UNIT' as CabinetCategory, positionX: b.positionX, positionZ: 0, width: b.width, depth: 0 }))]
    : cabinets;
  const positionX = nextFreeX(occupied, run, category, widthMm, fromMm);
  if (positionX + widthMm > wallMm + TOL_MM) return { ok: false, reason: 'WALL_FULL', wallMm, freeMm: Math.max(0, wallMm - positionX) };
  return { ok: true, positionX };
}

/** A floor piece of the library, as a span on its wall (centre ± half width). */
export interface FloorPieceSpan { run?: RunId; xMm: number; w: number }

/**
 * The BASE cabinets that share floor with a library floor piece on the same wall — the clash the installed list paints
 * red, exactly like two cabinets in one place. (What stands ON the floor can only clash with what stands on it too.)
 */
export function cabinetsClashingPieces(
  cabinets: ReadonlyArray<Placed & { id: string; category: CabinetCategory }>,
  pieces: ReadonlyArray<FloorPieceSpan>,
): string[] {
  const out: string[] = [];
  cabinets.forEach((c) => {
    if (c.category !== 'BASE_UNIT') return;
    const hit = pieces.some((pc) => (pc.run ?? 'A') === runOf(c) && c.positionX < pc.xMm + pc.w / 2 - TOL_MM && pc.xMm - pc.w / 2 < c.positionX + c.width - TOL_MM);
    if (hit) out.push(c.id);
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

/**
 * "Auto arrange": every free cabinet is packed against its neighbours, from the start of its wall, keeping its current order.
 * The boxes of an L corner (a group) stay where they are: they ARE the corner, the others pack around them.
 * Returns only the new positions; the wall of a cabinet is never changed.
 */
export function autoArrange(
  cabinets: ReadonlyArray<Placed & { id: string; category: CabinetCategory; groupId?: string }>,
  layout: KitchenLayout,
): Array<{ id: string; positionX: number }> {
  const placed = cabinets.filter((c) => c.groupId).slice();
  const moves: Array<{ id: string; positionX: number }> = [];
  (['A', 'B', 'C'] as RunId[]).forEach((run) => {
    (['BASE_UNIT', 'WALL_UNIT'] as CabinetCategory[]).forEach((category) => {
      cabinets
        .filter((c) => !c.groupId && runOf(c) === run && c.category === category)
        .sort((a, b) => a.positionX - b.positionX)
        .forEach((c) => {
          const x = nextFreeX(placed, run, category, c.width, cornerClearanceMm(placed, layout, run, category));
          placed.push({ ...c, positionX: x });
          moves.push({ id: c.id, positionX: x });
        });
    });
  });
  return moves;
}
