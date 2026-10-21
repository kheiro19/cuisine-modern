// src/math/lCorner.ts
// A real L corner: the two arms along the two walls and the square where they meet, with ONE continuous interior.
// It is built as three ordinary boxes of one group (so the BOM, the price, the stock and the drawing stay the engines' own),
// but the sides that face a neighbour are not cut (math/carcaseSides.ts), so nothing divides the inside:
//
//        wall B (left)                    corner on the LEFT wall (B), seen from above:
//        |  S  | ARM_B  <- door, hinged on the far end          back wall (A)
//        |  Q  |                                       ┌─────────┬──────────────┐
//        |─────┘                                       │ SQUARE  │    ARM_A     │
//        |  SQUARE  | ARM_A  ... back wall               │(no front)│ door,hinged │
//                                                        │         │ on the far end
//   SQUARE  = D x D, no front: the doors of both arms open onto it.
//   ARM_A   = door width x D along the back wall;   ARM_B = door width x D along the side wall.
import type { CabinetCategory, CabinetObject, CabinetZone, RunId } from '../types/flatma';
import { FAMILIES } from '../rules/families';
import { CabinetDraft, draftToNewCabinet, resolveDraft } from './cabinetPresets';
import type { EdgeBandRoll, InjectedHardwareItem, InjectedWoodMaterial } from '../types/flatma';

export type CornerRole = 'SQUARE' | 'ARM_A' | 'ARM_B';

export interface LCornerParams {
  category: CabinetCategory;
  /** The side wall of the corner: B (left) or C (right). */
  wall: 'B' | 'C';
  /** Length of the back wall: the right-hand corner is measured from it. */
  roomWidthMm: number;
  /** The square is depthMm x depthMm. */
  depthMm: number;
  /** Width of the box (and of its door) along the back wall / along the side wall. */
  armAMm: number;
  armBMm: number;
}

export interface LCornerBox {
  role: CornerRole;
  run: RunId;
  /** Along its wall: from the left end on A, from the corner on B and C. */
  positionX: number;
  width: number;
  omitSides: Array<'LEFT' | 'RIGHT'>;
  hingeSide?: 'LEFT' | 'RIGHT';
}

export const L_CORNER_LIMITS = { ARM_MM: [300, 700] as [number, number] };

/** What the corner takes along each wall, from the corner: the square plus the arm. */
export const lCornerSpan = (p: Pick<LCornerParams, 'depthMm' | 'armAMm' | 'armBMm'>) => ({ alongA: p.depthMm + p.armAMm, alongSide: p.depthMm + p.armBMm });

export function lCornerBoxes(p: LCornerParams): LCornerBox[] {
  const D = p.depthMm;
  const left = p.wall === 'B';
  // Run A: the corner is at the left end (wall B) or at the right end (wall C).
  const squareX = left ? 0 : p.roomWidthMm - D;
  const armAX = left ? D : p.roomWidthMm - D - p.armAMm;
  return [
    // The square has no front: it is open towards both arms. Its other sides stay (the one at the side wall is the back of that wall).
    { role: 'SQUARE', run: 'A', positionX: squareX, width: D, omitSides: [left ? 'RIGHT' : 'LEFT'] },
    // Arm along the back wall: open towards the square, door hinged on the far end.
    { role: 'ARM_A', run: 'A', positionX: armAX, width: p.armAMm, omitSides: [left ? 'LEFT' : 'RIGHT'], hingeSide: left ? 'RIGHT' : 'LEFT' },
    // Arm along the side wall: on B the frame's x axis points to the corner (math/kitchenLayout.ts), on C it points away from it.
    { role: 'ARM_B', run: p.wall, positionX: D, width: p.armBMm, omitSides: [left ? 'RIGHT' : 'LEFT'], hingeSide: left ? 'LEFT' : 'RIGHT' },
  ];
}

export const CORNER_ROLE_LABELS: Record<CornerRole, string> = { SQUARE: 'مربع الزاوية', ARM_A: 'ذراع الجدار الخلفي', ARM_B: 'ذراع الجدار الجانبي' };

export interface LCornerBuild {
  /** The draft the form holds: materials, edge bands and the hinge picked are taken from it. */
  draft: CabinetDraft;
  woods: InjectedWoodMaterial[];
  hardware: InjectedHardwareItem[];
  edgeRolls: EdgeBandRoll[];
  groupId: string;
  newId: () => string;
  name: string;
}

type NewCabinet = Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>;

/** The three boxes ready to add, one after the other, with the same materials and hinges as the draft. */
export function lCornerCabinets(p: LCornerParams, b: LCornerBuild): NewCabinet[] {
  const family = p.category === 'WALL_UNIT' ? FAMILIES.WALL : FAMILIES.BASE;
  return lCornerBoxes(p).map((box) => {
    const zones: CabinetZone[] = box.role === 'SQUARE'
      ? [{ kind: 'OPEN', shelves: 0 }]
      : [{ kind: 'DOORS', count: 1, shelves: 0, ...(box.hingeSide ? { hingeSide: box.hingeSide } : {}) }];
    const resolved = resolveDraft({
      ...b.draft,
      subtype: p.category === 'WALL_UNIT' ? 'Wall_Blind_Corner' : 'Blind_Corner',
      category: p.category,
      width: box.width,
      height: family.dims.height,
      depth: p.depthMm,
      zones,
      openingMode: 'HANDLE',
      dividerBoards: 1,
      frontStyle: 'SOLID',
      golaSlots: [],
    }, b.woods, b.hardware, b.edgeRolls);
    const base = draftToNewCabinet(resolved, { id: b.newId(), name: `${b.name} — ${CORNER_ROLE_LABELS[box.role]}`, positionX: box.positionX });
    return { ...base, run: box.run, groupId: b.groupId, omitSides: box.omitSides };
  });
}
