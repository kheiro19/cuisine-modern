// src/math/cornerDeck.ts
// The ONE bottom board of an L corner, as a board to cut (math/lCorner.ts groups the three boxes, math/partsEngine.ts cuts).
// The three boxes stand on a single L-shaped piece: it runs the square's depth along one wall and along the other, with the
// inner corner of the L removed (that square is the offcut). Numbers here, one place, so the cutting list, the price and the
// line the panel shows can never say different things.
import type { CabinetObject } from '../types/flatma';

export interface CornerDeckPiece {
  /** Depth of each leg: the corners' depth (front to back). */
  legsMm: number;
  /** The L's outside size, between the outer side boards: depth + arm − board at both ends. */
  spanXMm: number;
  spanYMm: number;
  /** The square taken out of the inside corner — a usable offcut, not a second board. */
  cutOutXMm: number;
  cutOutYMm: number;
  /** Length of board to pull for the piece (the three runs round the corner, before the L is formed). */
  developedMm: number;
  /** The edges that get the band: the two fronts only. */
  frontRunMm: number;
}

const r1 = (n: number) => Math.round(n * 10) / 10;

/**
 * The piece for a corner of the given depth and arm widths, cut from `boardMm` boards. The square's own run is
 * `depth − board` (one side is the open join), and each arm's run is `arm − board` for the same reason.
 */
export function cornerDeckPieceOf(o: { depthMm: number; armAMm: number; armBMm: number; boardMm: number }): CornerDeckPiece {
  const board = o.boardMm;
  const squareRun = Math.max(0, o.depthMm - board);
  const armA = Math.max(0, o.armAMm - board);
  const armB = Math.max(0, o.armBMm - board);
  return {
    legsMm: r1(o.depthMm),
    spanXMm: r1(squareRun + armA),
    spanYMm: r1(squareRun + armB),
    cutOutXMm: r1(armA),
    cutOutYMm: r1(armB),
    developedMm: r1(squareRun + armA + armB),
    frontRunMm: r1(armA + armB),
  };
}

/** The piece of a corner box that carries one (the square), or `null` for a plain cabinet and for an arm. */
export function cornerDeckPieceOfCabinet(cab: Pick<CabinetObject, 'width' | 'depth' | 'cornerRole' | 'cornerGroupDeckMm'>, boardMm: number): CornerDeckPiece | null {
  const shared = cab.cornerGroupDeckMm;
  if (!shared) return null;
  const carrier = cab.cornerRole ? cab.cornerRole === 'SQUARE' : Math.abs(cab.width - cab.depth) < 0.5;
  if (!carrier) return null;
  return cornerDeckPieceOf({ depthMm: cab.depth, armAMm: shared.armAMm, armBMm: shared.armBMm, boardMm });
}
