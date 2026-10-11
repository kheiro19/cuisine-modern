// src/math/edgeBand.ts
// Edge band (chant): the band is a ROLL picked from the workshop stock (EdgeBandRoll); its thickness and price come
// from the roll. Band lengths, cut sizes and costs per cabinet are computed from the real parts in
// partsEngine.priceCabinet().
import { EdgeBandRoll } from '../types/flatma';

export const bandPricePerMeterDA = (roll: EdgeBandRoll): number =>
  roll.totalLengthMeters > 0 ? roll.rollPriceDA / roll.totalLengthMeters : 0;
