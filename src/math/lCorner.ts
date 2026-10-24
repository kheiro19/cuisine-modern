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
import { cornerFillers } from './cornerFiller';

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

// ---- the drawer side of an arm: a fixed filler, the arm keeps its width ------------------------------------------
//
// The rule itself lives in math/cornerFiller.ts (zones.ts reads it too, for the fronts). The arm is NOT widened: 19.5 mm more
// would push its far end into the neighbour on the same wall, or past the end of a short wall. The filler takes its width out
// of the arm's own 450, which leaves the drawer front 430 — the same place it had before, now behind a flat panel instead of
// a visible void.

export { autoCornerFillerMm, clampCornerFillerMm, cornerFillerWidthMm, cornerFillers, zoneSlidesOut } from './cornerFiller';

// ---- the one L bottom of a corner -------------------------------------------------------------------------------
//
// A real corner does not set three little decks side by side: the three boxes stand on ONE board cut in an L, so the bottom
// is continuous through the corner, with no seam and no second thickness where two boxes meet. The piece belongs to the
// group, not to a box: `cornerDeckOf` works out whether the three boxes can share it, and the square (the box where the two
// walls meet) is the one that cuts it — the two arms cut no deck at all (math/partsEngine.ts).

export interface CornerDeckFit {
  /** Width of each arm (mm); with the square's own depth they give the piece: an L (depth + arm − 2 × board) at both ends. */
  armAMm: number;
  armBMm: number;
}

type DeckBox = {
  width: number;
  depth: number;
  category: CabinetCategory;
  carcaseThickness?: number;
  cornerRole?: 'SQUARE' | 'ARM_A' | 'ARM_B';
};

/** The square is the box whose width is the corner itself; a saved corner says so, an older one is read from its size. */
const roleOf = (c: DeckBox): 'SQUARE' | 'ARM_A' | 'ARM_B' => c.cornerRole ?? (Math.abs(c.width - c.depth) < 0.5 ? 'SQUARE' : 'ARM_A');

/**
 * The L bottom of a corner group: the two arm widths, or `null` when the three boxes cannot share one board (they are not
 * three, they have different depths, different carcase boards, or an arm is not wider than the board). Everything the piece
 * needs is in this answer, and the same value is written on all three boxes, so no engine has to look at a neighbour.
 */
export function cornerDeckOf(cabs: ReadonlyArray<DeckBox>): CornerDeckFit | null {
  if (cabs.length !== 3) return null;
  const squares = cabs.filter((c) => roleOf(c) === 'SQUARE');
  if (squares.length !== 1) return null;
  const depth = squares[0].depth;
  const board = squares[0].carcaseThickness ?? 18;
  if (cabs.some((c) => Math.abs(c.depth - depth) > 0.5)) return null;
  if (cabs.some((c) => Math.abs((c.carcaseThickness ?? 18) - board) > 0.5)) return null;
  const arms = cabs.filter((c) => roleOf(c) !== 'SQUARE');
  if (arms.length !== 2) return null;
  if (arms.some((a) => a.width <= board + 1)) return null;
  return { armAMm: Math.round(arms[0].width * 10) / 10, armBMm: Math.round(arms[1].width * 10) / 10 };
}

export interface CornerExtension {
  /** The arm's width: the one it was designed with. A filler never widens it. */
  width: number;
  /** The arm's own start; the stored one, unless an older save had widened it leftwards. */
  positionX: number;
  /** Always 0: kept so a cabinet saved by an earlier version is un-widened on its next save. */
  cornerExtensionMm: number;
  /** The fixed filler panel on each side of the box, in mm (0 = none). Either side, or both. */
  cornerFillers: { left: number; right: number };
}

/**
 * The arm worth of the zones it holds today: its designed width, with the corner side closed by a FIXED filler
 * (`cab.cornerFillerMm`, 0 … CORNER.FILLER_MAX_MM, automatic = front thickness + 1.5 mm). Idempotent: a width that an older
 * version had widened is given back (`width − cornerExtensionMm`), so the arm returns to what was designed once and stays
 * there, and going back to doors leaves no filler at all.
 */
export function withCornerExtension(
  cab: { width: number; positionX: number; run?: RunId; cornerSide?: 'LEFT' | 'RIGHT'; cornerExtensionMm?: number; cornerFillerMm?: number; cornerFillerSides?: Array<'LEFT' | 'RIGHT'> },
  zones: ReadonlyArray<CabinetZone>,
  frontThMm: number,
): CornerExtension {
  const added = cab.cornerExtensionMm ?? 0;
  const width = cab.width - added; // the width the arm was designed with, whatever an older save did to it
  // Only a box of a corner has a corner side to close: a cabinet on a plain wall keeps its fronts, filler and all, out of it.
  if (!cab.cornerSide) return { width, positionX: cab.positionX, cornerExtensionMm: 0, cornerFillers: { left: 0, right: 0 } };
  // An older save grew the arm of a right-hand corner leftwards; give that start back.
  const grewLeft = (cab.run ?? 'A') === 'A' && cab.cornerSide === 'RIGHT';
  const positionX = grewLeft ? cab.positionX + added : cab.positionX;
  return { width, positionX, cornerExtensionMm: 0, cornerFillers: cornerFillers(cab, zones, frontThMm) };
}

// ---- editing a corner that is already on the wall ---------------------------------------------------------------
//
// The three boxes are ONE unit, but they live as three cabinets. Their sizes used to be frozen at the moment the corner
// was added: the form could change a box's zones and its material, never its width, and a width typed there was silently
// given back. Worse, changing one box did nothing to the other two, so the boxes pulled apart on the wall (the client saw
// two cabinets with a gap at the door side). These two functions close that: read the corner's own numbers, then lay all
// three boxes out again from them — so any of the three widths can be edited, for ever, and the group never opens.

export interface CornerGroupDims {
  /** The side wall of the corner (B = left, C = right). */
  wall: 'B' | 'C';
  /** The square: the depth of every box and the side of the corner. */
  depthMm: number;
  armAMm: number;
  armBMm: number;
}

type CornerBox = {
  id: string;
  width: number;
  depth: number;
  positionX: number;
  run?: RunId;
  category: CabinetCategory;
  groupId?: string;
  cornerRole?: CornerRole;
};

/** The three boxes of one corner, read back as the numbers that built them. `null` for anything that is not a corner. */
export function cornerDimsOf(cabs: ReadonlyArray<CornerBox>): CornerGroupDims | null {
  if (cabs.length !== 3) return null;
  const byRole = (role: CornerRole) => cabs.find((c) => (c.cornerRole ?? (Math.abs(c.width - c.depth) < 0.5 ? 'SQUARE' : 'ARM_A')) === role);
  const square = byRole('SQUARE');
  const armA = byRole('ARM_A');
  const armB = byRole('ARM_B');
  if (!square || !armA || !armB) return null;
  // The square sits at the left end of the back wall for a left corner, at the right end for a right one.
  const wall: 'B' | 'C' = square.positionX < 0.5 ? 'B' : 'C';
  return { wall, depthMm: square.depth, armAMm: armA.width, armBMm: armB.width };
}

/**
 * Where the three boxes stand for these numbers — width, depth, run and position along the wall. `roomWidthMm` is the
 * length of the back wall: a right-hand corner is measured back from its far end. One array, in the order the group is
 * stored, so the caller can write it in ONE undo step.
 */
export function relayoutCornerGroup(
  cabs: ReadonlyArray<CornerBox>,
  dims: CornerGroupDims,
  roomWidthMm: number,
): Array<{ id: string; role: CornerRole; width: number; depth: number; positionX: number; run: RunId }> {
  const boxes = lCornerBoxes({
    category: cabs[0]?.category ?? 'BASE_UNIT',
    wall: dims.wall,
    roomWidthMm,
    depthMm: dims.depthMm,
    armAMm: dims.armAMm,
    armBMm: dims.armBMm,
  });
  return cabs.map((c) => {
    const role: CornerRole = c.cornerRole ?? (Math.abs(c.width - c.depth) < 0.5 ? 'SQUARE' : 'ARM_A');
    const box = boxes.find((b) => b.role === role) ?? boxes[0];
    return { id: c.id, role, width: box.width, depth: dims.depthMm, positionX: box.positionX, run: box.run };
  });
}

/**
 * Does a corner of this reach still stand inside the two walls it leans on? The back wall holds the square and the arm
 * along it; the side wall holds the square and the other arm. Refusing here is what stops a resize from pushing a box
 * through the end of the room — the three boxes are moved as one, so one of them past the wall means all three are.
 */
export function cornerFitsWalls(
  span: { alongA: number; alongSide: number },
  backWallMm: number,
  sideWallMm: number,
): boolean {
  return span.alongA <= backWallMm + 0.5 && span.alongSide <= sideWallMm + 0.5;
}

/** How far a corner reaches along each wall with these numbers (the panel shows it while the user types). */
export const cornerGroupSpan = (dims: Pick<CornerGroupDims, 'depthMm' | 'armAMm' | 'armBMm'>) => lCornerSpan(dims);

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
  const made = lCornerBoxes(p).map((box) => {
    const zones: CabinetZone[] = box.role === 'SQUARE'
      ? [{ kind: 'OPEN', shelves: 0 }]
      : [{ kind: 'DOORS', count: 1, shelves: 0, ...(box.hingeSide ? { hingeSide: box.hingeSide } : {}) }];
    const resolved = resolveDraft({
      ...b.draft,
      subtype: p.category === 'WALL_UNIT' ? 'L_Corner_Wall' : 'L_Corner_Base',
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
    const front = b.woods.find((m) => m.id === resolved.frontMaterialId);
    const cornerSide = box.omitSides[0];
    // The corner is built with doors, so this adds nothing today; the moment a template (or a preset) opens an arm with
    // drawers, the arm is born already wide enough and the two rules can never disagree.
    const ext = withCornerExtension(
      { width: base.width, positionX: base.positionX, run: box.run, cornerSide },
      resolved.zones,
      front ? front.thickness : 18,
    );
    // The arm along the side wall stops its door short at the corner, so the door of the arm along the back wall runs past it
    // instead of the two doors (each stands one front thickness in front of its box) going through each other.
    // Every box also records WHICH side faces the other arm: a drawers zone on that side has to stop short of the neighbour's
    // door (front thickness + 1.5 mm), otherwise the drawer cannot be pulled out while that door is shut. The side is the one
    // the box does not close (omitSides) — the same face the two arms share.
    const built = {
      ...base,
      width: ext.width,
      positionX: ext.positionX,
      ...(Math.max(ext.cornerFillers.left, ext.cornerFillers.right) > 0 ? { cornerFillerMm: Math.max(ext.cornerFillers.left, ext.cornerFillers.right) } : {}),
      run: box.run,
      groupId: b.groupId,
      omitSides: box.omitSides,
      cornerSide,
      ...(box.role === 'ARM_B' ? { frontSetbackSides: box.omitSides } : {}),
      cornerRole: box.role,
    };
    return built;
  });
  // The three boxes stand on ONE L bottom: the same value on all of them, so the square cuts the piece and the arms skip
  // theirs (math/partsEngine.ts). It is worked out from the boxes that were just built, so an edit made later is re-read.
  const deck = cornerDeckOf(made);
  return deck ? made.map((c) => ({ ...c, cornerGroupDeckMm: deck })) : made;
}
