// src/math/drawerBox.ts
// The plain drawer box behind a drawer front that slides on runners: two sides, an inner front, a back and a bottom.
// The BOM (partsEngine) and the 3D / geometry (assemblyGeometry) both read these numbers, so the cutting list and the
// picture are the same box. Pull-out frames are metal sets and have no box. Numbers: DRAWER_BOX in constants.ts.
import { DRAWER_BOX, PANEL } from './constants';

/** Length of the runners: 50 mm steps, kept between 250 and 550 mm and 50 mm short of the cabinet depth. */
export const runnerLengthMm = (depthMm: number): number => Math.max(250, Math.min(550, Math.floor((depthMm - 50) / 50) * 50));

export interface DrawerBoxDims {
  /** Outside width: the room the box really has, minus the runner clearance on both sides. */
  outerWidthMm: number;
  /** Where that room starts and ends (x), so the box sits where the front and the carcase leave it. */
  loMm: number;
  hiMm: number;
  /** Middle of the box across the cabinet — not necessarily the cabinet's own middle (an L corner has one side open). */
  centerXMm: number;
  /** Width between the two sides (length of the inner front and of the back). */
  innerWidthMm: number;
  /** As long as the runners. */
  depthMm: number;
  heightMm: number;
  /** Sides, inner front and back are cut from the carcase board. */
  boardThMm: number;
  /** The bottom is a thin sheet (the same HDF as the back panels). */
  bottomThMm: number;
}

/**
 * The box of a drawer. `spanMm` is the room it may use, in x: the carcase between its sides (default) — or, in an L corner
 * arm, the part of that room which the drawer front really covers. A box wider than its front would stick out beside the
 * filler and be seen from the open side of the corner; that is what this span prevents.
 */
export function drawerBoxDims(frontHeightMm: number, cab: { width: number; depth: number }, carcaseTh: number, spanMm?: { loMm: number; hiMm: number }): DrawerBoxDims {
  const lo = spanMm ? Math.max(0, spanMm.loMm) : carcaseTh;
  const hi = spanMm ? Math.min(cab.width, spanMm.hiMm) : cab.width - carcaseTh;
  const inner = Math.max(0, hi - lo);
  const outerWidthMm = Math.max(50, inner - 2 * DRAWER_BOX.SIDE_CLEARANCE_MM);
  return {
    loMm: lo,
    hiMm: hi,
    centerXMm: (lo + hi) / 2,
    outerWidthMm,
    innerWidthMm: Math.max(0, outerWidthMm - 2 * carcaseTh),
    depthMm: runnerLengthMm(cab.depth),
    heightMm: Math.max(DRAWER_BOX.MIN_HEIGHT_MM, frontHeightMm - DRAWER_BOX.HEIGHT_MARGIN_MM),
    boardThMm: carcaseTh,
    bottomThMm: PANEL.BACK_THICKNESS_MM,
  };
}

/** The lowest drawer front that still holds a box (the box rises BOTTOM_OFFSET above the front's lower edge). */
export const minDrawerFrontMm = (): number => DRAWER_BOX.MIN_HEIGHT_MM + DRAWER_BOX.BOTTOM_OFFSET_MM;

export interface DrawerBoardGeo {
  key: 'side-left' | 'side-right' | 'inner-front' | 'back' | 'bottom';
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
}

/**
 * The five boards of the box in cabinet coordinates (closed position): its front board touches the back of the
 * drawer front and it runs `depthMm` toward the back of the cabinet.
 */
export function drawerBoxBoards(
  front: { yMm: number; heightMm: number },
  cab: { width: number; depth: number },
  o: { carcaseTh: number; frontBackZMm: number; spanMm?: { loMm: number; hiMm: number } },
): DrawerBoardGeo[] {
  const d = drawerBoxDims(front.heightMm, cab, o.carcaseTh, o.spanMm);
  const t = d.boardThMm, C = d.centerXMm;
  const y0 = front.yMm + DRAWER_BOX.BOTTOM_OFFSET_MM;
  const zFront = o.frontBackZMm, zMid = zFront - d.depthMm / 2, zBack = zFront - d.depthMm;
  const yMid = y0 + d.heightMm / 2;
  return [
    { key: 'side-left', sizeMm: [t, d.heightMm, d.depthMm], centerMm: [C - d.outerWidthMm / 2 + t / 2, yMid, zMid] },
    { key: 'side-right', sizeMm: [t, d.heightMm, d.depthMm], centerMm: [C + d.outerWidthMm / 2 - t / 2, yMid, zMid] },
    { key: 'inner-front', sizeMm: [d.innerWidthMm, d.heightMm, t], centerMm: [C, yMid, zFront - t / 2] },
    { key: 'back', sizeMm: [d.innerWidthMm, d.heightMm, t], centerMm: [C, yMid, zBack + t / 2] },
    { key: 'bottom', sizeMm: [d.outerWidthMm, d.bottomThMm, d.depthMm], centerMm: [C, y0 + d.bottomThMm / 2, zMid] },
  ];
}
