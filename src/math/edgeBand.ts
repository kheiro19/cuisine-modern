// src/math/edgeBand.ts
// Edge band (chant): which thickness applies to a cabinet, how many metres it needs and what that costs.
// The band is a ROLL picked from the workshop stock (EdgeBandRoll): thickness and price come from the roll.
import { CabinetObject, EdgeBandRoll, InjectedWoodMaterial } from '../types/flatma';
import { EDGE } from './constants';
import { frontStackHeightMm } from './gola';

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

/** Band length (mm) glued on the carcase boards and on the fronts of one cabinet. */
export function bandLengthsMm(cab: CabinetObject): { carcase: number; front: number } {
  const th = cab.carcaseThickness;
  const inner = cab.width - 2 * th;
  // Front edge only: both sides (height), bottom, roof (wall units), shelves.
  let carcase = 2 * cab.height + inner;
  if (cab.category === 'WALL_UNIT') carcase += inner;
  if (cab.shelvesCount > 0) carcase += cab.shelvesCount * (inner - 2);

  // Fronts: all 4 edges of every door / drawer front.
  let front = 0;
  const fc = cab.frontConfig;
  if (fc.openingType !== 'NONE' && fc.elementCount > 0) {
    const stack = frontStackHeightMm(cab.height, fc);
    if (fc.openingType === 'DOORS') {
      const fw = Math.round((cab.width - 1) / fc.elementCount);
      front = fc.elementCount * 2 * (fw + stack);
    } else {
      const fh = Math.round(stack / fc.elementCount);
      front = fc.elementCount * 2 * (cab.width - 1 + fh);
    }
  }
  return { carcase: Math.max(0, carcase), front: Math.max(0, front) };
}

export interface BandUsage {
  part: 'carcase' | 'front';
  roll: EdgeBandRoll;
  meters: number;
  costDA: number;
}

export const bandPricePerMeterDA = (roll: EdgeBandRoll): number =>
  roll.totalLengthMeters > 0 ? roll.rollPriceDA / roll.totalLengthMeters : 0;

/** What the chosen rolls cost for this cabinet (empty when no roll was chosen). */
export function bandUsageOf(cab: CabinetObject, rolls: EdgeBandRoll[]): BandUsage[] {
  const lengths = bandLengthsMm(cab);
  const out: BandUsage[] = [];
  const add = (part: 'carcase' | 'front', rollId: string | undefined, mm: number) => {
    const roll = rollId ? rolls.find((r) => r.id === rollId) : undefined;
    if (!roll || mm <= 0) return;
    const meters = (mm / 1000) * EDGE.WASTE_FACTOR;
    out.push({ part, roll, meters, costDA: meters * bandPricePerMeterDA(roll) });
  };
  add('carcase', cab.carcaseEdgeRollId, lengths.carcase);
  add('front', cab.frontEdgeRollId, lengths.front);
  return out;
}
