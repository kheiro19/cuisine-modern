// src/math/carcaseSides.ts
// Which side boards a cabinet really has. Almost always both; the boxes of an L corner (math/lCorner.ts) leave out the side
// that faces their neighbour, so the interior of the corner is one continuous space and the boards are not cut twice.
// The boards between the sides (bottom, dividers, rails, roof) run up to the missing side, i.e. up to the neighbour's face.
import type { CabinetObject } from '../types/flatma';

export interface CarcaseSides {
  left: boolean;
  right: boolean;
  /** x of the inner face of the left / right side (the cabinet edge when that side is missing). */
  loMm: number;
  hiMm: number;
  /** Width between the two inner faces: what the horizontal boards span. */
  innerMm: number;
  /** x of the middle of that span. */
  centerMm: number;
}

export function carcaseSidesOf(cab: Pick<CabinetObject, 'width' | 'omitSides' | 'lCornerSpacer'>, thicknessMm: number): CarcaseSides {
  const left = !cab.omitSides?.includes('LEFT');
  const right = !cab.omitSides?.includes('RIGHT');
  const spacer = cab.lCornerSpacer;
  const loMm = left ? thicknessMm : spacer?.side === 'LEFT' ? Math.max(0, spacer.offsetMm) + spacer.thicknessMm : 0;
  const hiMm = right ? cab.width - thicknessMm : spacer?.side === 'RIGHT' ? cab.width - Math.max(0, spacer.offsetMm) - spacer.thicknessMm : cab.width;
  const innerMm = Math.max(0, hiMm - loMm);
  return { left, right, loMm, hiMm, innerMm, centerMm: (loMm + hiMm) / 2 };
}
