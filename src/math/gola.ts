// src/math/gola.ts
// Single place that answers "where are the Gola channels of this cabinet?" for the 3D view, the BOM and the form.
//
// A DRAWERS cabinet can carry several horizontal Gola channels. A channel is identified by a "slot":
//   slot k (0-based, counted from the TOP) = the channel sits just ABOVE drawer k.
//   slot 0  -> top of the cabinet (above the highest drawer)
//   slot 1  -> between drawer 1 and drawer 2 ... etc.
// A DOORS cabinet can only have the single channel at the top (same as before).
import { CabinetFrontConfiguration } from '../types/flatma';

/** Valid, sorted, de-duplicated slots for the given front configuration (empty when there is no Gola). */
export function golaSlotsOf(fc: Pick<CabinetFrontConfiguration, 'openingType' | 'elementCount' | 'hasGolaProfile' | 'golaSlots'>): number[] {
  if (!fc.hasGolaProfile || fc.openingType === 'NONE') return [];
  if (fc.openingType === 'DOORS') return [0];
  const n = Math.max(0, Math.floor(fc.elementCount));
  // Older saved cabinets have hasGolaProfile but no slots: they meant "one channel at the top".
  const raw = fc.golaSlots && fc.golaSlots.length > 0 ? fc.golaSlots : [0];
  const valid = Array.from(new Set(raw.filter((k) => Number.isInteger(k) && k >= 0 && k < n))).sort((a, b) => a - b);
  return valid.length > 0 ? valid : n > 0 ? [0] : [];
}
