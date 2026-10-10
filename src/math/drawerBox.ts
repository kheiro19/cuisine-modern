// src/math/drawerBox.ts
// The plain drawer box behind a drawer front that slides on runners: two sides, an inner front, a back and a bottom.
// The BOM (partsEngine) and the 3D / geometry (assemblyGeometry) both read these numbers, so the cutting list and the
// picture are the same box. Pull-out frames are metal sets and have no box. Numbers: DRAWER_BOX in constants.ts.
import { DRAWER_BOX, PANEL } from './constants';

/** Length of the runners: 50 mm steps, kept between 250 and 550 mm and 50 mm short of the cabinet depth. */
export const runnerLengthMm = (depthMm: number): number => Math.max(250, Math.min(550, Math.floor((depthMm - 50) / 50) * 50));

export interface DrawerBoxDims {
  /** Outside width: the carcase interior minus the runner clearance on both sides. */
  outerWidthMm: number;
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

export function drawerBoxDims(frontHeightMm: number, cab: { width: number; depth: number }, carcaseTh: number): DrawerBoxDims {
  const inner = Math.max(0, cab.width - 2 * carcaseTh);
  const outerWidthMm = Math.max(50, inner - 2 * DRAWER_BOX.SIDE_CLEARANCE_MM);
  return {
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
  o: { carcaseTh: number; frontBackZMm: number },
): DrawerBoardGeo[] {
  const d = drawerBoxDims(front.heightMm, cab, o.carcaseTh);
  const t = d.boardThMm, W = cab.width;
  const y0 = front.yMm + DRAWER_BOX.BOTTOM_OFFSET_MM;
  const zFront = o.frontBackZMm, zMid = zFront - d.depthMm / 2, zBack = zFront - d.depthMm;
  const yMid = y0 + d.heightMm / 2;
  return [
    { key: 'side-left', sizeMm: [t, d.heightMm, d.depthMm], centerMm: [W / 2 - d.outerWidthMm / 2 + t / 2, yMid, zMid] },
    { key: 'side-right', sizeMm: [t, d.heightMm, d.depthMm], centerMm: [W / 2 + d.outerWidthMm / 2 - t / 2, yMid, zMid] },
    { key: 'inner-front', sizeMm: [d.innerWidthMm, d.heightMm, t], centerMm: [W / 2, yMid, zFront - t / 2] },
    { key: 'back', sizeMm: [d.innerWidthMm, d.heightMm, t], centerMm: [W / 2, yMid, zBack + t / 2] },
    { key: 'bottom', sizeMm: [d.outerWidthMm, d.bottomThMm, d.depthMm], centerMm: [W / 2, y0 + d.bottomThMm / 2, zMid] },
  ];
}
