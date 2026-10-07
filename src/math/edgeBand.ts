// src/math/edgeBand.ts
// Edge band (chant): which thickness applies to a cabinet, how many metres it needs and what that costs.
// The band is a ROLL picked from the workshop stock (EdgeBandRoll): thickness and price come from the roll.
import { CabinetObject, EdgeBandRoll, InjectedWoodMaterial } from '../types/flatma';

/** Thickness (mm): the chosen roll's (cached on the cabinet), else the stock board's own edgeThickness. */
export function edgeMmOf(
  cab: Pick<CabinetObject, 'carcaseEdgeMm' | 'frontEdgeMm'>,
  part: 'carcase' | 'front',
  material: InjectedWoodMaterial | undefined,
): number {
  const cached = part === 'carcase' ? cab.carcaseEdgeMm : cab.frontEdgeMm;
  const v = typeof cached === 'number' && Number.isFinite(cached) ? cached : material?.edgeThickness ?? 0;
  return Math.max(0, v);
}

export const bandPricePerMeterDA = (roll: EdgeBandRoll): number =>
  roll.totalLengthMeters > 0 ? roll.rollPriceDA / roll.totalLengthMeters : 0;

// Band lengths and costs per cabinet are computed from the real parts in partsEngine.priceCabinet().
