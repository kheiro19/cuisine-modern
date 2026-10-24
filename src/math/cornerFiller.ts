// src/math/cornerFiller.ts
// The filler panels of an L-corner box: FIXED panels, same sheet as the fronts, floor to top of the carcase. Inside the box's
// own width — nothing on the wall ever moves.
//   · The CORNER side (the face that opens onto the other arm): needed whenever a front slides out there, otherwise the drawer
//     passes through the plane of the neighbour's closed door. Automatic width = that door's thickness + 1.5 mm of play.
//   · The OTHER side (or both): the user may add one for looks alone — an end / scribe panel at the far end of a run.
// `zones.ts` (the fronts) and `lCorner.ts` (the box) both take the numbers from here and cannot disagree.
import { CORNER } from './constants';
import type { CabinetZone } from '../types/flatma';

export type FillerSide = 'LEFT' | 'RIGHT';

/** A front that has to SLIDE OUT towards the user (a drawer, a pull-out frame): only those hit the neighbour's door. */
export const zoneSlidesOut = (z: CabinetZone): boolean => z.kind === 'DRAWERS' || z.split?.fill === 'PULL_OUT';

/** The box needs a corner filler only when one of its zones slides out. */
export const armSlidesOut = (zones: ReadonlyArray<CabinetZone>): boolean => zones.some(zoneSlidesOut);

/**
 * The filler width that needs no thinking, on a given side: on the corner side of a box that slides out it is one front
 * thickness (the door standing in the plane the drawer crosses) plus CORNER.DRAWER_CLEARANCE_MM of play — 18 mm door -> 19.5.
 * Anywhere else (a look-only panel) one front thickness, so the panel reads as a corner post. 0 when nothing is asked for.
 */
export function autoCornerFillerMm(
  zones: ReadonlyArray<CabinetZone>,
  frontThMm: number,
  side?: FillerSide,
  cornerSide?: FillerSide,
): number {
  // called without a side (the plain rule as it was written): how much room sliding fronts need, nothing for doors
  if (!side) return armSlidesOut(zones) ? frontThMm + CORNER.DRAWER_CLEARANCE_MM : 0;
  const onCornerSide = !cornerSide || side === cornerSide;
  return onCornerSide && armSlidesOut(zones) ? frontThMm + CORNER.DRAWER_CLEARANCE_MM : frontThMm;
}

export interface CornerFillerPicking {
  /** The face of the box that opens onto the other arm (missing = not a corner box). */
  cornerSide?: FillerSide;
  /** Sides the user asked a panel for. Missing = automatic: the corner side, when the box slides out. `[]` = none. */
  cornerFillerSides?: ReadonlyArray<FillerSide>;
  /** Width of the panel(s); missing = automatic (see autoCornerFillerMm). */
  cornerFillerMm?: number;
}

/** Which sides carry a fixed filler today. */
export function cornerFillerSidesOf(cab: CornerFillerPicking, zones: ReadonlyArray<CabinetZone>): FillerSide[] {
  if (!cab.cornerSide) return []; // a plain cabinet has no corner side to close
  if (cab.cornerFillerSides) return [...new Set(cab.cornerFillerSides)];
  return armSlidesOut(zones) ? [cab.cornerSide] : [];
}

/** The panel on each side of the box, in mm (0 = none). It is always inside the box: the fronts give it its width. */
export function cornerFillers(
  cab: CornerFillerPicking,
  zones: ReadonlyArray<CabinetZone>,
  frontThMm: number,
): { left: number; right: number } {
  const sides = cornerFillerSidesOf(cab, zones);
  const width = (side: FillerSide): number => {
    if (!sides.includes(side)) return 0;
    const auto = autoCornerFillerMm(zones, frontThMm, side, cab.cornerSide);
    const wanted = cab.cornerFillerMm;
    const mm = wanted === undefined || wanted === null || !Number.isFinite(wanted) ? auto : wanted;
    return clampCornerFillerMm(mm, frontThMm);
  };
  return { left: width('LEFT'), right: width('RIGHT') };
}

/** The bounds of a panel: the door it faces sets the floor, CORNER.FILLER_MAX_MM the ceiling. */
export function clampCornerFillerMm(mm: number, frontThMm: number): number {
  const lo = Math.min(frontThMm, CORNER.FILLER_MAX_MM);
  return Math.min(CORNER.FILLER_MAX_MM, Math.max(lo, mm));
}

/**
 * Width of the panel on the corner side (0 = none). Kept as the single number the panel writes back and the tests read;
 * `cornerFillers` is what the geometry uses, so a look-only panel on the far side never gets in the way.
 */
export function cornerFillerWidthMm(
  cab: CornerFillerPicking,
  zones: ReadonlyArray<CabinetZone>,
  frontThMm: number,
): number {
  const both = cornerFillers(cab, zones, frontThMm);
  return cab.cornerSide === 'RIGHT' ? both.right : both.left;
}
