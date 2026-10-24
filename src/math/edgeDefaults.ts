// src/math/edgeDefaults.ts
// A front leaves the workshop banded. Every door and drawer front is edged on four sides; a worktop or a bare board is not,
// but a front without a band shows its raw core and the cut size is wrong by 2 × the band.
//
// The stock form used to store `edgeThickness: 0` on every board the user added, and a cabinet whose front names no roll
// therefore had no band at all: the atomic view printed «⚠ لا شريط محدد للواجهات … وسيكبر الباب عند لصق الشريط» in red on
// every kitchen, and the cut list was 2 × band too big. Two ways out, and the app takes both:
//
//   1. a board that declares its own band (`edgeThickness > 0`) keeps it — nothing is added;
//   2. a front that names no roll and whose board declares none gets the DEFAULT ROLL OF THE STOCK: the thinnest band the
//      workshop really has. It is a real roll, with its real thickness, so the cut size and the price are the true ones;
//   3. `NONE` is a choice, not a gap: the user who wants a painted / bare front picks «بدون شريط حافة» and gets no band,
//      and the view says so in amber instead of shouting.
import type { CabinetObject, EdgeBandRoll, InjectedWoodMaterial } from '../types/flatma';
import { zonesOf } from './zones';

/**
 * Does this cabinet cut any front panel at all? A bay that holds a washing machine or a dishwasher under the worktop has NO
 * front — it is an open niche, `panelFront` off — so there is no band to ask for and no front to cut. Asking for one was the
 * other half of the red warning: the line said «لا شريط محدد للواجهات» on a cabinet that has no door.
 * (An `APRON` zone — لوح واجهة ثابت — IS a panel; an appliance bay with `panelFront` is one too.)
 */
export function cabinetHasFronts(
  cab: Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount' | 'dividerBoards'>,
): boolean {
  return zonesOf(cab).some((z) => {
    if (z.kind === 'DOORS' || z.kind === 'DRAWERS' || z.kind === 'APRON') return true;
    if (z.kind === 'APPLIANCE') return !!z.panelFront; // washer / dishwasher / fridge à niche ouverte: بلا واجهة
    return false;
  });
}

/** How many front panels a priced cabinet really has (0 = an open bay: nothing to band, nothing to cut). */
export const frontPanelCount = (parts: ReadonlyArray<{ role: string }>): number =>
  parts.reduce((n, p) => n + (p.role === 'front' ? 1 : 0), 0);

/** The value the front-roll picker writes when the user really wants no band ('' / undefined = "use the default"). */
export const NO_EDGE_ROLL = 'NONE';

/** Only fronts are defaulted here: a carcase keeps whatever the user chose (its visible edge is the front one). */
export function defaultFrontEdgeRollId(
  cab: Pick<CabinetObject, 'frontEdgeRollId' | 'frontMaterialId'>,
  woods: ReadonlyArray<InjectedWoodMaterial>,
  rolls: ReadonlyArray<EdgeBandRoll>,
): string | undefined {
  if (cab.frontEdgeRollId !== undefined) return cab.frontEdgeRollId; // a roll, or NO_EDGE_ROLL: the user has spoken
  const board = woods.find((m) => m.id === cab.frontMaterialId);
  if (board && board.edgeThickness > 0) return undefined; // the band is part of the board
  // The stock's default: the thinnest roll (0.4 mm is a front band; a 2 mm one would eat 4 mm off every door).
  let thinnest: EdgeBandRoll | undefined;
  for (const r of rolls) {
    if (!(r.thickness > 0)) continue;
    if (!thinnest || r.thickness < thinnest.thickness) thinnest = r;
  }
  return thinnest?.id;
}

/** The cabinet as it will be cut and priced: same object when nothing changes, so React sees no fake update. */
export function withDefaultFrontEdge<
  T extends Pick<CabinetObject, 'frontEdgeRollId' | 'frontMaterialId'> &
    Partial<Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount' | 'dividerBoards'>>,
>(cab: T, woods: ReadonlyArray<InjectedWoodMaterial>, rolls: ReadonlyArray<EdgeBandRoll>): T {
  // No front, no band: an appliance bay (washer / dishwasher under the worktop) is an open niche — a roll assigned to it
  // would never be cut, and it made the view claim a band was missing on a cabinet that has no door.
  if (cab.frontConfig && !cabinetHasFronts(cab as Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount' | 'dividerBoards'>)) return cab;
  const id = defaultFrontEdgeRollId(cab, woods, rolls);
  return id === cab.frontEdgeRollId ? cab : { ...cab, frontEdgeRollId: id };
}
