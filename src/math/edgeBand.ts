// src/math/edgeBand.ts
// Which edge band thickness (mm) applies to a cabinet's carcase / fronts.
import { CabinetObject, InjectedWoodMaterial } from '../types/flatma';
import { EDGE } from './constants';

export function edgeMmOf(
  cab: Pick<CabinetObject, 'carcaseEdgeMm' | 'frontEdgeMm'>,
  part: 'carcase' | 'front',
  material: InjectedWoodMaterial | undefined,
): number {
  const chosen = part === 'carcase' ? cab.carcaseEdgeMm : cab.frontEdgeMm;
  const v = typeof chosen === 'number' && Number.isFinite(chosen) ? chosen : material?.edgeThickness ?? 0;
  return Math.min(EDGE.MAX_MM, Math.max(0, v));
}
