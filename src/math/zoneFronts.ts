// src/math/zoneFronts.ts
// What each ZONE of a cabinet chooses for its own fronts (doors / drawers / panels): the front sheet (so its thickness), the edge-band
// roll and — in rules/openings.ts — the way it opens. Everything a zone leaves empty follows the cabinet, so cabinets saved before
// this existed keep exactly the numbers they had.
import type { CabinetObject, InjectedWoodMaterial } from '../types/flatma';
import { zonesOf } from './zones';

/** What one zone chooses for its own fronts: the thickness of its sheet, the sheet and the band roll. A zone with no choice has no entry. */
export interface ZoneFrontChoice {
  thicknessMm: number;
  materialId?: string;
  edgeRollId?: string;
}

/**
 * The per-zone front choices of a cabinet, read from the stock: a zone with a sheet in stock uses its thickness; a sheet that is no
 * longer in stock falls back to the cabinet's. Missing entry = the zone follows the cabinet.
 */
export function zoneFrontChoicesOf(
  cab: Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount' | 'dividerBoards'>,
  woods: ReadonlyArray<InjectedWoodMaterial>,
  cabinetFrontTh: number,
): Array<ZoneFrontChoice | undefined> {
  return zonesOf(cab).map((z) => {
    const sheet = z.frontMaterialId ? woods.find((m) => m.id === z.frontMaterialId) : undefined;
    if (!sheet && !z.frontEdgeRollId) return undefined;
    return {
      thicknessMm: sheet ? sheet.thickness : cabinetFrontTh,
      ...(sheet ? { materialId: sheet.id } : {}),
      ...(z.frontEdgeRollId ? { edgeRollId: z.frontEdgeRollId } : {}),
    };
  });
}

/** The thickest front of the cabinet: what sticks out in front of the carcase (worktop overhang, spacing in the kitchen). */
export const maxFrontThicknessOf = (choices: ReadonlyArray<ZoneFrontChoice | undefined>, cabinetFrontTh: number): number =>
  Math.max(cabinetFrontTh, ...choices.map((c) => c?.thicknessMm ?? 0));
