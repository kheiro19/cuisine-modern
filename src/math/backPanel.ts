// src/math/backPanel.ts
// How the back of a cabinet is closed. Three ways, chosen per cabinet by the user:
//   HDF   — a 3 mm hardboard sheet glued on the rear face (the workshop default, unchanged).
//   RAILS — no sheet at all: two battens cut from the carcase board, one at the top and one at the bottom of the back.
//   PANEL — a full board like every other carcase part: carcase thickness, cut between the sides, fitted inside the rear.
// The cutting list (partsEngine), the 3D (assemblyGeometry) and the BOM all read these numbers, so the sheet, the picture
// and the price are the same back. Numbers: BACK in constants.ts.
import { BACK, PANEL } from './constants';

export type BackPanelMode = 'HDF' | 'RAILS' | 'PANEL';

/** The order the panel shows them in. */
export const BACK_PANEL_MODES: readonly BackPanelMode[] = ['HDF', 'RAILS', 'PANEL'];

/** How the three choices are named in the panel. */
export const BACK_PANEL_LABELS: Record<BackPanelMode, string> = {
  HDF: 'HDF 3 مم',
  RAILS: 'عارضتان (أعلى وأسفل)',
  PANEL: 'لوح مثل الهيكل',
};

/** What closes the back of this cabinet. Missing / unknown = HDF, the way every saved cabinet was built. */
export function backPanelModeOf(cab: { backPanel?: BackPanelMode }): BackPanelMode {
  return cab.backPanel === 'RAILS' || cab.backPanel === 'PANEL' ? cab.backPanel : 'HDF';
}

/** Depth (height on the back) of each rail, clamped to what a batten comes in. */
export function backRailDepthOf(cab: { backRailDepthMm?: number }): number {
  const v = cab.backRailDepthMm;
  if (v === undefined || !Number.isFinite(v)) return BACK.RAIL_DEPTH_MM;
  return Math.min(BACK.RAIL_DEPTH_RANGE_MM[1], Math.max(BACK.RAIL_DEPTH_RANGE_MM[0], v));
}

/**
 * How far the back material reaches INSIDE the carcase, measured from the rear face. Nothing for the HDF sheet (it is glued on
 * the outside), the board thickness for the full panel — the dividers and the shelves have to stop there — and nothing for the
 * rails, which only take the very top and the very bottom (no shelf reaches them).
 */
export const backInsideMm = (cab: { backPanel?: BackPanelMode }, carcaseThMm: number): number =>
  backPanelModeOf(cab) === 'PANEL' ? carcaseThMm : 0;

/** What the back has to close, in body coordinates (y from the bottom of the body), all millimetres. */
export interface BackSpace {
  /** Where the closed part starts (an appliance bay below leaves the back open there). */
  bottomMm: number;
  /** How tall the closed part is. */
  closedHeightMm: number;
  /** Outer width: the HDF sheet covers the whole rear face. */
  widthMm: number;
  /** Between the side boards (the boards of the other two modes). */
  innerWidthMm: number;
  /** Middle of the interior — not the middle of the cabinet when an L corner leaves one side out. */
  centerXMm: number;
  carcaseThMm: number;
  /** The board the closed part stands on (bottom deck, or the divider above an appliance bay). 0 = none. */
  bottomBoardMm: number;
  /** The board that closes the top (a full roof). 0 = top rails, and the panel goes up to the top. */
  topBoardMm: number;
}

export interface BackPart {
  partType: string;
  /** 'back' = the thin HDF sheet (priced with the HDF sheet), 'carcase' = cut from the cabinet's own board. */
  role: 'back' | 'carcase';
  thicknessMm: number;
  /** Across, and up the back (a rail: its height on the back). */
  widthMm: number;
  lengthMm: number;
  quantity: number;
  grain: 'vertical' | 'horizontal';
  edge: 'NONE';
}

/** The clear height between the board below and the board (or top stretchers) above: what the back board fills. */
const clearHeightMm = (s: BackSpace): number => Math.max(0, s.closedHeightMm - s.bottomBoardMm - s.topBoardMm);

/** The board of the full back panel: between the bottom deck (or divider) and the roof. */
const panelHeightMm = (s: BackSpace): number => clearHeightMm(s);

/** How many rails fit: two when there is room for both (one on the board below, one under the top), one in the middle. */
const railCountOf = (s: BackSpace, railDepthMm: number): 1 | 2 =>
  clearHeightMm(s) >= 2 * railDepthMm + 1 ? 2 : 1;

/** One row per board to cut: what the cutting list and the BOM show. */
export function backPartsOf(cab: { backPanel?: BackPanelMode; backRailDepthMm?: number }, s: BackSpace): BackPart[] {
  if (s.closedHeightMm <= 0.5) return [];
  const mode = backPanelModeOf(cab);
  if (mode === 'HDF') {
    return [{ partType: 'Backwall Panel (MDF/HDF)', role: 'back', thicknessMm: PANEL.BACK_THICKNESS_MM, widthMm: s.widthMm, lengthMm: s.closedHeightMm, quantity: 1, grain: 'vertical', edge: 'NONE' }];
  }
  if (mode === 'PANEL') {
    const h = panelHeightMm(s);
    if (h <= 0.5) return [];
    return [{ partType: 'Back Panel (carcase board)', role: 'carcase', thicknessMm: s.carcaseThMm, widthMm: s.innerWidthMm, lengthMm: h, quantity: 1, grain: 'vertical', edge: 'NONE' }];
  }
  const d = Math.min(backRailDepthOf(cab), clearHeightMm(s));
  const n = railCountOf(s, d);
  return [{
    partType: n === 2 ? 'Back Rail (Top & Bottom)' : 'Back Rail',
    role: 'carcase', thicknessMm: s.carcaseThMm, widthMm: s.innerWidthMm, lengthMm: d, quantity: n, grain: 'horizontal', edge: 'NONE',
  }];
}

export interface BackBox {
  key: string;
  kind: 'back' | 'backpanel' | 'backrail';
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
}

/** Where the boards of the back stand in the body (z = 0 is the middle of the depth, the front is +z). */
export function backBoxesOf(
  cab: { backPanel?: BackPanelMode; backRailDepthMm?: number },
  s: BackSpace,
  depthMm: number,
): BackBox[] {
  if (s.closedHeightMm <= 0.5) return [];
  const mode = backPanelModeOf(cab);
  if (mode === 'HDF') {
    const t = PANEL.BACK_THICKNESS_MM;
    // Glued on the rear face, outside the carcase: the sheet covers the closed part and nothing inside loses depth.
    return [{ key: 'back', kind: 'back', sizeMm: [s.widthMm, s.closedHeightMm, t], centerMm: [s.widthMm / 2, s.bottomMm + s.closedHeightMm / 2, -depthMm / 2 - t / 2] }];
  }
  if (mode === 'PANEL') {
    const h = panelHeightMm(s);
    const t = s.carcaseThMm;
    if (h <= 0.5) return [];
    // Inside the carcase, flush with the rear face: it stands on the board below it and stops under the roof.
    return [{ key: 'back', kind: 'backpanel', sizeMm: [s.innerWidthMm, h, t], centerMm: [s.centerXMm, s.bottomMm + s.bottomBoardMm + h / 2, -depthMm / 2 + t / 2] }];
  }
  const d = Math.min(backRailDepthOf(cab), clearHeightMm(s));
  const t = s.carcaseThMm;
  const z = -depthMm / 2 + t / 2;
  const n = railCountOf(s, d);
  const lo = s.bottomMm + s.bottomBoardMm;                       // on the board below
  const hi = s.bottomMm + s.closedHeightMm - s.topBoardMm;       // under the board / stretchers above
  if (n === 1) return [{ key: 'backrail', kind: 'backrail', sizeMm: [s.innerWidthMm, d, t], centerMm: [s.centerXMm, (lo + hi) / 2, z] }];
  return [
    { key: 'backrail-bottom', kind: 'backrail', sizeMm: [s.innerWidthMm, d, t], centerMm: [s.centerXMm, lo + d / 2, z] },
    { key: 'backrail-top', kind: 'backrail', sizeMm: [s.innerWidthMm, d, t], centerMm: [s.centerXMm, hi - d / 2, z] },
  ];
}
