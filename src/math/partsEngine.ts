// src/math/partsEngine.ts
// SINGLE SOURCE OF TRUTH for a cabinet: its parts, the hardware it needs, the edge band it consumes and what all that
// costs. costEngine, bomEngine, stockDelta and the 3D assemblies all read this, so the price, the cutting list, the
// stock and the picture cannot disagree (before, the BOM total and the sum of its own rows differed by 32-44 %).
//
// Conventions kept from the old BOM so existing cabinets keep their numbers:
//  - carcase boards (sides, bottom, roof, dividers, shelves): edge band on the FRONT edge only -> cut depth = depth - e
//  - top rails of base units: no band
//  - facades: band on all 4 edges -> cut width and height each - 2e
//  - board cost is prorated on the FINISHED area; edge band is priced apart, by the metre.
import {
  CabinetObject,
  EdgeBandRoll,
  InjectedHardwareItem,
  InjectedWoodMaterial,
} from '../types/flatma';
import { BASE, CORNER, EDGE, FASTENER_STOCK, PANEL } from './constants';
import { drawerBoxDims, minDrawerFrontMm } from './drawerBox';
import { KINEMATICS, KinematicId, KinematicIssueCode, OPENING_HARDWARE, constructionOf, topOf, dividerBoardsOf, effectiveKinematic, hardwareCategoriesFor, kinematicOfHardware, liftZoneIsTop, openingModeOf } from '../rules';
import { zoneOpeningModeOf } from '../rules/openings';
import { ZoneFrontChoice, zoneFrontChoicesOf } from './zoneFronts';
import { APPLIANCES, Facade, FrontPlan, ZoneLayout, backPanelBottomMm, isOpenCarcase, layoutZones, nicheOf, planFronts, zonesOf } from './zones';
import { backInsideMm, backPanelModeOf, backPartsOf } from './backPanel';
import { cornerDeckPieceOf } from './cornerDeck';
import { bandPricePerMeterDA } from './edgeBand';
import { frontHardwareNeeds, shelfSpansOf } from './columns';
import { hingesPerDoor } from './hinges';
import { assemblyGeometry } from './assemblyGeometry';
import { carcaseSidesOf } from './carcaseSides';
import { baseHardwareOf, basePartsOf, bodyView } from './base';
import { buildFasteners, fastenerCounts } from './fasteners';

export type PartRole = 'carcase' | 'back' | 'front';
export type GrainDirection = 'vertical' | 'horizontal' | 'none';
export type EdgeBanding = 'NONE' | 'FRONT' | 'ALL';

export interface CabinetPart {
  partType: string;
  role: PartRole;
  thicknessMm: number;
  /** FINISHED size (edge band included). */
  widthMm: number;
  lengthMm: number;
  quantity: number;
  grain: GrainDirection;
  edge: EdgeBanding;
  /**
   * FRONT edge only: the length of the edge that really gets the band when it is not the whole `lengthMm`. An L-shaped corner
   * deck is one piece with TWO front edges (one per arm); its lengthMm is the developed length round the corner.
   */
  edgeLengthMm?: number;
  /** Fronts of a zone with a sheet / band roll of its own: the stock ids chosen on that zone (missing = the cabinet's). 'NONE' = no band. */
  materialId?: string;
  edgeRollId?: string;
}

export type HardwareGroup = 'Front Hardware' | 'Gola Profile' | 'Push-Open' | 'Assembly Fixings' | 'Base Fixing System' | 'Wall Fixing System';

export interface HardwareRequirement {
  item: InjectedHardwareItem;
  quantity: number;
  group: HardwareGroup;
}

export interface CabinetIssue {
  code:
    | 'INVALID_DIMENSIONS'
    | 'NO_CARCASE_MATERIAL'
    | 'NO_FRONT_MATERIAL'
    | 'NO_FRONT_HARDWARE'
    | 'NO_GOLA_ITEM'
    | 'NO_PUSH_ITEM'
    | 'NO_LEGS_IN_STOCK'
    | 'NO_PLINTH_IN_STOCK'
    | 'NO_HANGERS_IN_STOCK'
    | 'BACK_PRICED_AS_CARCASE'
    | 'ZONES_TOO_TALL'
    | KinematicIssueCode
    | 'DRAWER_BOX_TOO_LOW'
    | 'APPLIANCE_TOO_NARROW'
    | 'APPLIANCE_TOO_SHALLOW'
    | 'APPLIANCE_ZONE_TOO_SHORT'
    | 'APPLIANCE_ZONE_WIDE'
    | 'SPLIT_NO_ROOM'
    | 'SPLIT_JOIN_INVALID'
    | 'DOORS_TOO_NARROW'
    | 'SHELVES_TOO_CLOSE'
    | 'GOLA_ZONE_TOO_SHORT'
    | 'GOLA_NOT_WITH_INSET'
    | 'LIFT_ZONE_NOT_TOP';
  severity: 'error' | 'warning';
  message: string;
}

// ------------------------------------------------------------------------------------------------ helpers

export const isGlassFront = (cab: Pick<CabinetObject, 'frontStyle'>, frontMat?: InjectedWoodMaterial): boolean =>
  cab.frontStyle === 'GLASS' || (!!frontMat && /glass/i.test(frontMat.type));

export function isLiftItem(hw?: InjectedHardwareItem): boolean {
  return kinematicOfHardware(hw)?.id === 'LIFT';
}

export { hingesPerDoor, openingModeOf };

/** Hardware that opens DOORS (hinges / lift) or DRAWERS (runners). Looks at both ids stored on the cabinet. */
export function pickFrontHardware(cab: CabinetObject, kind: 'DOORS' | 'DRAWERS', items: InjectedHardwareItem[]): InjectedHardwareItem | undefined {
  const ids = kind === 'DOORS'
    ? [cab.frontConfig.hardwareItemId, cab.frontConfig.drawerHardwareItemId]
    : [cab.frontConfig.drawerHardwareItemId, cab.frontConfig.hardwareItemId];
  const categories = hardwareCategoriesFor(kind === 'DOORS' ? 'DOOR' : 'DRAWER');
  const ok = (h: InjectedHardwareItem) => categories.includes(h.category);
  for (const id of ids) {
    const found = id ? items.find((h) => h.id === id) : undefined;
    if (found && ok(found)) return found;
  }
  return undefined;
}

// -------------------------------------------------------------------------------------------------- parts

export interface CabinetModel {
  layout: ZoneLayout;
  plan: FrontPlan;
  parts: CabinetPart[];
}

/** Layout + fronts + the list of parts, from the cabinet and the two board thicknesses. Pure geometry. */
export function modelCabinet(cabIn: CabinetObject, carcaseTh: number, frontTh: number, opts: { glass?: boolean; lift?: boolean; inset?: boolean; zoneFront?: ReadonlyArray<ZoneFrontChoice | undefined> } = {}): CabinetModel {
  const cab = bodyView(cabIn); // the body above the base (math/base.ts): the boards are cut for it, the base is cut apart below
  const zones = zonesOf(cab);
  const layout = layoutZones(cab, carcaseTh, { inset: opts.inset });
  const plan = planFronts(cab, layout, { inset: opts.inset, frontThMm: frontTh, zoneFrontThMm: opts.zoneFront?.map((c) => c?.thicknessMm) });
  const sides = carcaseSidesOf(cab, carcaseTh);
  const inner = sides.innerMm;
  const open = isOpenCarcase(zones);
  // A full back panel is fitted INSIDE the rear (math/backPanel.ts): every board that runs from the back to the front — dividers,
  // vertical boards and shelves — stops at it by its thickness, so nothing overlaps it in the cut list or in the picture.
  const backInside = backInsideMm(cab, carcaseTh);
  const innerDepth = Math.max(0, cab.depth - backInside);
  const parts: CabinetPart[] = [];

  const carcase = (partType: string, widthMm: number, lengthMm: number, quantity: number, grain: GrainDirection, edge: EdgeBanding): CabinetPart =>
    ({ partType, role: 'carcase', thicknessMm: carcaseTh, widthMm: Math.max(0, widthMm), lengthMm: Math.max(0, lengthMm), quantity, grain, edge });

  const sideCount = Number(sides.left) + Number(sides.right); // 2, unless a neighbouring box of an L corner replaces one
  if (sideCount > 0) parts.push(carcase('Side Panel (Left/Right)', cab.depth, cab.height, sideCount, 'vertical', 'FRONT'));
  // The bottom (math/lCorner.ts): an L corner stands its three boxes on ONE board cut in an L. The square cuts the whole piece
  // here — outside size, legs and the inner cut-out, all in the description — and the two arms skip their own deck, because a
  // second board under them would be the same board. No L (a plain cabinet, or a group that cannot share) = one deck per box.
  const sharedDeck = cab.cornerGroupDeckMm;
  const deckCarrier = !!sharedDeck && (cab.cornerRole ? cab.cornerRole === 'SQUARE' : cab.width === cab.depth);
  if (!open) {
    if (sharedDeck && !deckCarrier) {
      // the arm of a corner: its bottom is part of the square's L piece
    } else if (sharedDeck && deckCarrier) {
      // Numbers: math/cornerDeck.ts (the same ones the panel shows). One row, one board, one cut.
      const piece = cornerDeckPieceOf({ depthMm: cab.depth, armAMm: sharedDeck.armAMm, armBMm: sharedDeck.armBMm, boardMm: carcaseTh });
      parts.push({
        partType: `Corner L Bottom Deck (one piece: L ${piece.spanXMm}×${piece.spanYMm} outside, legs ${piece.legsMm}, corner offcut ${piece.cutOutXMm}×${piece.cutOutYMm})`,
        role: 'carcase', thicknessMm: carcaseTh, widthMm: piece.legsMm, lengthMm: piece.developedMm, quantity: 1,
        // The band runs along the two FRONTS only: the square's own front edge is the seam where the two arms meet.
        grain: 'horizontal', edge: 'FRONT', edgeLengthMm: piece.frontRunMm,
      });
    } else {
      parts.push(carcase('Bottom Deck Panel', cab.depth, inner, 1, 'horizontal', 'FRONT'));
    }
  }
  // The board between two zones is always cut — including above an open bay: the zone above it has to stand on something.
  // Where two zones' side columns are joined the board crosses the main column only (its length is that column's width).
  if (zones.length > 1) {
    const boardsPer = dividerBoardsOf(cab);
    let whole = 0;
    const narrow = new Map<number, number>();
    for (let i = 0; i < zones.length - 1; i++) {
      const joined = layout.bands[i + 1].join && layout.bands[i + 1].join!.lowIndex <= i ? layout.bands[i].split : undefined;
      if (!joined) { whole += boardsPer; continue; }
      const w = Math.round((joined.main.innerHiMm - joined.main.innerLoMm) * 10) / 10;
      narrow.set(w, (narrow.get(w) ?? 0) + boardsPer);
    }
    if (whole > 0) parts.push(carcase('Zone Divider Panel', innerDepth, inner, whole, 'horizontal', 'FRONT'));
    narrow.forEach((qty, w) => parts.push(carcase('Zone Divider Panel (main column only)', innerDepth, w, qty, 'horizontal', 'FRONT')));
  }
  // A vertical board inside a zone (math/columns.ts): as deep as the cabinet, as tall as the zone's opening — or, for joined side
  // columns, one board as tall as all the zones it joins.
  layout.bands.forEach((band) => {
    if (!band.split) return;
    if (band.join && band.join.lowIndex !== band.index) return;
    const top = band.join ? layout.bands[band.join.highIndex] : band;
    const height = top.openingBottomMm + top.openingHeightMm - band.openingBottomMm;
    const tag = band.join ? ` [zones ${band.join.lowIndex + 1}–${band.join.highIndex + 1}]` : zones.length > 1 ? ` [zone ${band.index + 1}]` : '';
    parts.push(carcase(`Zone Column Board${tag}`, innerDepth, height, 1, 'vertical', 'FRONT'));
  });

  // Hinge boards of a row of several doors (zones.ts partitions): as deep as the cabinet, as tall as the zone's opening.
  layout.bands.forEach((band) => {
    const n = (band.partitions ?? []).reduce((sum, p) => sum + p.boards, 0);
    if (n > 0) parts.push(carcase(`Door Hinge Board${zones.length > 1 ? ` [zone ${band.index + 1}]` : ''}`, innerDepth, band.openingHeightMm, n, 'vertical', 'FRONT'));
  });

  if (topOf(cab) === 'RAILS') {
    parts.push(carcase('Top Stretcher Rail (Traverse)', PANEL.TRAVERSE_DEPTH_MM, inner, 2, 'horizontal', 'NONE'));
  } else {
    parts.push(carcase('Top Roof Panel', cab.depth, inner, 1, 'horizontal', 'FRONT'));
  }

  // The back covers the closed part only: behind an open bay it is not cut at all (hoses, ventilation, depth), so the back
  // starts at the board above the bay, and disappears when nothing stands above it. A board not cut is not priced either.
  // WHAT closes it is the user's choice (math/backPanel.ts): HDF sheet, two carcase rails, or a full carcase board.
  const backBottomMm = backPanelBottomMm(layout);
  parts.push(...backPartsOf(cab, {
    bottomMm: backBottomMm,
    closedHeightMm: cab.height - backBottomMm,
    widthMm: cab.width,
    innerWidthMm: inner,
    centerXMm: sides.centerMm,
    carcaseThMm: carcaseTh,
    bottomBoardMm: backBottomMm > 0 || !open ? carcaseTh : 0,
    // The top always has a board or the two top stretchers at its very top (thick): what closes the back stops under them.
    topBoardMm: carcaseTh,
  }));

  // A column with pull-out frames carries baskets (its "shelves" are the basket levels), not fixed shelves. One row per shelf
  // width: a split zone has a narrower run in each column (math/columns.ts), an unsplit cabinet has a single row as always.
  const shelfRows = new Map<number, number>();
  layout.bands.forEach((band) => {
    const n = Math.max(0, Math.round(band.zone.shelves ?? 0));
    if (n === 0) return;
    const mainHasBaskets = plan.facades.some((f) => f.zoneIndex === band.index && f.column !== 'FILL' && f.kinematic === 'PULL_OUT_FRAME');
    shelfSpansOf(band.zone, band.split, carcaseTh, cab.width, mainHasBaskets, band.partitions).forEach((s) => {
      if (s.column === 'FILL' && band.join && band.join.lowIndex !== band.index) return; // a joined side column is shelved once, by its lowest zone
      const w = s.hiMm - s.loMm - PANEL.SHELF_WIDTH_CLEARANCE_MM;
      shelfRows.set(w, (shelfRows.get(w) ?? 0) + n);
    });
  });
  shelfRows.forEach((qty, w) => parts.push(carcase('Adjustable Internal Shelf', innerDepth - PANEL.SHELF_DEPTH_INSET_MM, w, qty, 'horizontal', 'FRONT')));

  // Facades: one row per zone, or per column of a split zone; EQUAL facades inside it share the row. Equality includes the
  // size, because a stack of drawers is not always equal (834 mm in four: 183 / 182.5 / 182.5 / 182) and a cutting list that
  // says 183 for all four cuts 1 mm off three fronts.
  const byZone = new Map<string, Facade[]>();
  const rowKey = (f: Facade) => `${f.zoneIndex}:${f.column ?? ''}:${f.kind}:${Math.round(f.widthMm * 10)}x${Math.round(f.heightMm * 10)}`;
  plan.facades.forEach((f) => { const k = rowKey(f); byZone.set(k, [...(byZone.get(k) ?? []), f]); });
  const multi = zones.length > 1;
  byZone.forEach((list) => {
    const f = list[0];
    const zoneIndex = f.zoneIndex;
    const colTag = f.column === 'FILL' ? ' filler' : f.column === 'MAIN' ? ' main' : '';
    const tag = multi || f.column ? ` [zone ${zoneIndex + 1}${colTag}]` : '';
    let partType: string;
    let grain: GrainDirection = 'vertical';
    if (f.kind === 'DOOR') partType = `${opts.glass ? 'Glass Door Panel' : opts.lift ? 'Lift Facade Panel' : 'Door Facade Panel'} (1 of ${f.count})${tag}`;
    else if (f.kind === 'DRAWER') { partType = `Drawer Front Facade (1 of ${f.count})${tag}`; grain = 'horizontal'; }
    else if (f.kind === 'APRON') { partType = `Fixed Apron Panel${tag}`; grain = 'horizontal'; }
    else if (f.kind === 'FILLER') partType = `Corner Filler Panel${tag}`;
    else partType = f.column === 'FILL' ? `Fixed Filler Panel${tag}` : `Appliance Front Panel${tag}`;
    const zf = f.kind === 'FILLER' ? undefined : opts.zoneFront?.[zoneIndex]; // the corner fillers belong to the cabinet, not to a zone
    parts.push({ partType, role: 'front', thicknessMm: zf?.thicknessMm ?? frontTh, widthMm: f.widthMm, lengthMm: f.heightMm, quantity: list.length, grain, edge: 'ALL', ...(zf?.materialId ? { materialId: zf.materialId } : {}), ...(zf?.edgeRollId ? { edgeRollId: zf.edgeRollId } : {}) });
    // The corner filler is an L, not a flap: the return leg behind it is cut apart, from the cabinet's own board (the same
    // board and the same place as the box assemblyGeometry draws). It is what the drawer runners are fixed to.
    if (f.kind === 'FILLER') {
      // Between the bottom board (absent on an appliance bay) and the top, like every other vertical board of the carcase.
      const retH = Math.max(0, cab.height - (open ? 0 : carcaseTh) - carcaseTh);
      parts.push(carcase('Corner Filler Return', Math.min(CORNER.FILLER_RETURN_MM, cab.depth), retH, 1, 'vertical', 'NONE'));
    }
  });

  // Drawer boxes: one per drawer that slides on runners (a pull-out frame is a metal set, it has no box). Equal drawers of a
  // zone share the rows; the boards are banded on their top edge (the long edge of the width x length rectangle).
  const boxRows = new Map<number, Facade[]>();
  plan.facades.filter((f) => f.kind === 'DRAWER' && f.kinematic !== 'PULL_OUT_FRAME').forEach((f) => boxRows.set(f.zoneIndex, [...(boxRows.get(f.zoneIndex) ?? []), f]));
  boxRows.forEach((list, zoneIndex) => {
    const tag = multi ? ` [zone ${zoneIndex + 1}]` : '';
    // The drawers of one zone are NOT always the same height: the remainder of the division lands on the last fronts
    // (four drawers in an 834 mm stack: 183 / 182.5 / 182.5 / 182). Group by box height so the cutting list is exactly
    // the box the 3D draws — rounding every box to the first drawer's height would cut 0.5 mm off two boxes.
    const groups = new Map<number, { frontHeightMm: number; n: number; spanMm: { loMm: number; hiMm: number } }>();
    // The room the box really has: the carcase interior AND the width the front covers (an L corner arm is open on one side
    // and a fixed filler takes the first 19.5 mm; the same span as assemblyGeometry, so the cut box is the drawn box).
    const spanOf = (f: Facade) => ({
      loMm: Math.max(sides.loMm, f.innerLoMm ?? sides.loMm, f.xMm),
      hiMm: Math.min(sides.hiMm, f.innerHiMm ?? sides.hiMm, f.xMm + f.widthMm),
    });
    list.forEach((f) => {
      const spanMm = spanOf(f);
      const h = drawerBoxDims(f.heightMm, cab, carcaseTh, spanMm).heightMm;
      const g = groups.get(h);
      if (g) g.n += 1; else groups.set(h, { frontHeightMm: f.heightMm, n: 1, spanMm });
    });
    groups.forEach(({ frontHeightMm, n, spanMm }) => {
      const b = drawerBoxDims(frontHeightMm, cab, carcaseTh, spanMm);
      parts.push(carcase(`Drawer Box Side (Left/Right)${tag}`, b.heightMm, b.depthMm, 2 * n, 'horizontal', 'FRONT'));
      parts.push(carcase(`Drawer Box Inner Front${tag}`, b.heightMm, b.innerWidthMm, n, 'horizontal', 'FRONT'));
      parts.push(carcase(`Drawer Box Back${tag}`, b.heightMm, b.innerWidthMm, n, 'horizontal', 'FRONT'));
      parts.push({ partType: `Drawer Box Bottom (HDF)${tag}`, role: 'back', thicknessMm: b.bottomThMm, widthMm: b.outerWidthMm, lengthMm: b.depthMm, quantity: n, grain: 'horizontal', edge: 'NONE' });
    });
  });

  // The base: the wooden frame, or a plinth board cut from the same sheet (a PVC plinth is hardware, see hardwareRequirements).
  basePartsOf(cabIn, carcaseTh).forEach((p) => parts.push(carcase(p.partType, p.widthMm, p.lengthMm, p.quantity, 'vertical', p.partType === 'Plinth Board' ? 'ALL' : 'NONE')));

  return { layout, plan, parts };
}

// ---------------------------------------------------------------------------------------------- hardware

export function hardwareRequirements(
  cabIn: CabinetObject,
  items: InjectedHardwareItem[],
  plan?: FrontPlan,
  dims?: { carcaseTh: number; frontTh: number; zoneFrontTh?: ReadonlyArray<number | undefined> },
): HardwareRequirement[] {
  const cab = bodyView(cabIn); // fronts, connectors and runners belong to the body; the legs and the plinth to the base (below)
  const th = dims?.carcaseTh ?? (cab.carcaseThickness > 0 ? cab.carcaseThickness : PANEL.DEFAULT_THICKNESS_MM);
  const fTh = dims?.frontTh ?? (cab.frontThickness > 0 ? cab.frontThickness : PANEL.DEFAULT_THICKNESS_MM);
  const doorHwForPlan = pickFrontHardware(cab, 'DOORS', items);
  const insetHw = !!doorHwForPlan && doorHwForPlan.modelType.includes('Inset Hinge');
  const frontPlan = plan ?? planFronts(cab, layoutZones(cab, th, { inset: insetHw }), { inset: insetHw, frontThMm: fTh, zoneFrontThMm: dims?.zoneFrontTh });
  const out: HardwareRequirement[] = [];
  const add = (item: InjectedHardwareItem | undefined, quantity: number, group: HardwareGroup) => {
    if (!item || quantity <= 0) return;
    const same = out.find((r) => r.item.id === item.id);
    if (same) same.quantity += quantity;
    else out.push({ item, quantity, group });
  };

  const doors = frontPlan.facades.filter((f) => f.kind === 'DOOR');
  const drawers = frontPlan.facades.filter((f) => f.kind === 'DRAWER');

  // Front mechanisms: each facade has an effective mechanism (rules/kinematics.ts) that says which stock item
  // supplies it (hinges / lift for doors, runners for drawers and pull-out frames) and how many pieces it needs.
  const doorHw = pickFrontHardware(cab, 'DOORS', items);
  const drawerHw = pickFrontHardware(cab, 'DRAWERS', items);
  const byMechanism = new Map<KinematicId, Facade[]>();
  frontPlan.facades.forEach((f) => {
    const id = effectiveKinematic(f, { lift: isLiftItem(doorHw) });
    if (id && (f.kind === 'DOOR' || f.kind === 'DRAWER')) byMechanism.set(id, [...(byMechanism.get(id) ?? []), f]);
  });
  // Door hardware rows first, then runners: the order the BOM has always listed them in.
  const hardwareKindOf = (id: KinematicId) => KINEMATICS[id].hardwareKind ?? KINEMATICS[id].drives[0];
  [...byMechanism.entries()]
    .sort(([a], [b]) => Number(hardwareKindOf(a) !== 'DOOR') - Number(hardwareKindOf(b) !== 'DOOR'))
    .forEach(([id, list]) => {
      const spec = KINEMATICS[id];
      if (spec.quantity) add(hardwareKindOf(id) === 'DOOR' ? doorHw : drawerHw, spec.quantity(list), 'Front Hardware');
    });

  // Opening mode extras (rules/openings.ts).
  // Each zone opens its own way (zone.openingMode, else the cabinet's): a latch for every door / drawer of a zone that opens by push.
  const zoneList = zonesOf(cab);
  const pushFacades = [...doors, ...drawers].filter((f) => zoneOpeningModeOf(zoneList[f.zoneIndex] ?? { kind: 'DOORS' }, cab) === 'PUSH').length;
  if (pushFacades > 0) {
    add(items.find((h) => h.category === OPENING_HARDWARE.PUSH.hardwareCategory), pushFacades * OPENING_HARDWARE.PUSH.perFacade, 'Push-Open');
  }
  if (frontPlan.channels.length > 0) {
    const gola = items.find((h) => h.id === cab.frontConfig.golaProfileItemId) ?? items.find((h) => h.category === OPENING_HARDWARE.GOLA.hardwareCategory);
    add(gola, frontPlan.channels.length * OPENING_HARDWARE.GOLA.perChannel, 'Gola Profile');
  }

  // Connectors: the very ones the atomic workspace draws (cams, dowels, back screws, shelf pins).
  const geo = assemblyGeometry(cab, { carcaseTh: th, frontTh: fTh, zoneFrontTh: dims?.zoneFrontTh, lift: isLiftItem(doorHw), inset: !!doorHw && doorHw.modelType.includes('Inset Hinge') });
  const counts = fastenerCounts(buildFasteners(geo, cab, { carcaseTh: th, frontTh: fTh }));
  FASTENER_STOCK.forEach((rule) => add(items.find((h) => h.modelType.includes(rule.keyword)), counts[rule.kind], 'Assembly Fixings'));

  // Legs (base) or hanger plates (wall): rules/construction.ts. A floor unit with a base of its own (math/base.ts) takes the legs that base
  // asks for (none under a wooden frame or on the floor) and, for a PVC plinth, one board; a legacy cabinet keeps its 4 legs.
  const fixing = constructionOf(cab.category).fixing;
  const bh = baseHardwareOf(cabIn);
  if (cab.category !== 'BASE_UNIT' || bh.legacy) add(items.find((h) => h.modelType.includes(fixing.keyword)), fixing.perUnit, fixing.group);
  else {
    add(items.find((h) => h.modelType.includes(fixing.keyword)), bh.legs, fixing.group);
    if (bh.pvcPlinth) add(items.find((h) => h.modelType.includes(BASE.PVC_KEYWORD)), 1, fixing.group);
  }
  return out;
}

// ----------------------------------------------------------------------------------------------- pricing

export interface PricedPart extends CabinetPart {
  material?: InjectedWoodMaterial;
  /** The band roll glued on this part (missing = none). */
  edgeRoll?: EdgeBandRoll;
  /** Thickness (mm) of the band glued on this part (0 = none). */
  edgeMm: number;
  /** Size to CUT: finished size minus the band that is glued on. */
  cutWidthMm: number;
  cutLengthMm: number;
  /** Cost of all `quantity` pieces: the CUT board area prorated on the sheet price, whole DA. */
  boardCostDA: number;
  /** Metres of band for all `quantity` pieces (0 when no roll is chosen). */
  edgeMeters: number;
  /** CUT area of all `quantity` pieces. */
  areaM2: number;
  /** Sheet-equivalents consumed by all `quantity` pieces. */
  sheets: number;
}

export interface PricedHardware extends HardwareRequirement {
  totalCostDA: number;
}

export interface EdgeUsage {
  part: 'carcase' | 'front';
  roll: EdgeBandRoll;
  meters: number;
  costDA: number;
}

export interface ApplianceNote {
  cabinetName: string;
  label: string;
  nicheWidthMm: number;
  nicheHeightMm: number;
  nicheDepthMm: number;
  note: string;
}

export interface CabinetPricing {
  cabinetId: string;
  cabinetName: string;
  model: CabinetModel;
  parts: PricedPart[];
  hardware: PricedHardware[];
  edgeUsage: EdgeUsage[];
  appliances: ApplianceNote[];
  woodCostDA: number;
  edgeCostDA: number;
  hardwareCostDA: number;
  totalDA: number;
  issues: CabinetIssue[];
}

/** Area-prorated cost of ONE piece, whole DA. */
export function panelCostDA(widthMm: number, lengthMm: number, mat: InjectedWoodMaterial | undefined): number {
  if (!mat) return 0;
  const sheetArea = (mat.widthSheet * mat.heightSheet) / 1_000_000;
  if (!(sheetArea > 0)) return 0;
  return Math.round(((widthMm * lengthMm) / 1_000_000 / sheetArea) * mat.averagePriceDA * PANEL.WASTE_FACTOR);
}

export function priceCabinet(
  cab: CabinetObject,
  woods: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
): CabinetPricing {
  const issues: CabinetIssue[] = [];
  const name = cab.name;
  const carcaseMat = woods.find((m) => m.id === cab.carcaseMaterialId);
  const frontMat = woods.find((m) => m.id === cab.frontMaterialId);
  const hdfMat = woods.find((m) => /hdf/i.test(m.type) && m.thickness === PANEL.BACK_THICKNESS_MM);
  const carcaseTh = carcaseMat ? carcaseMat.thickness : cab.carcaseThickness > 0 ? cab.carcaseThickness : PANEL.DEFAULT_THICKNESS_MM;
  const frontTh = frontMat ? frontMat.thickness : cab.frontThickness > 0 ? cab.frontThickness : PANEL.DEFAULT_THICKNESS_MM;
  // A zone may have its own front sheet (its thickness), band roll and opening mode: what it chooses wins, the rest follows the cabinet.
  const zoneFront = zoneFrontChoicesOf(cab, woods, frontTh);

  const dimsOk = [cab.width, cab.height, cab.depth].every((v) => Number.isFinite(v) && v > 0);
  const zones = zonesOf(cab);
  const hasFacades = zones.some((z) => z.kind === 'DOORS' || z.kind === 'DRAWERS' || z.kind === 'APRON' || (z.kind === 'APPLIANCE' && z.panelFront));

  if (!dimsOk) {
    issues.push({ code: 'INVALID_DIMENSIONS', severity: 'error', message: `Cabinet "${name}": width/height/depth must be positive numbers` });
    const empty = { layout: { bands: [], dividerBottomsMm: [], issues: [] }, plan: { facades: [], channels: [] }, parts: [] };
    return { cabinetId: cab.id, cabinetName: name, model: empty, parts: [], hardware: [], edgeUsage: [], appliances: [], woodCostDA: 0, edgeCostDA: 0, hardwareCostDA: 0, totalDA: 0, issues };
  }

  const doorHw = pickFrontHardware(cab, 'DOORS', hardwareItems);
  const inset = !!doorHw && doorHw.modelType.includes('Inset Hinge');
  const model = modelCabinet(cab, carcaseTh, frontTh, { glass: isGlassFront(cab, frontMat), lift: isLiftItem(doorHw), inset, zoneFront });

  model.layout.issues.forEach((i) => issues.push({ code: i.code, severity: i.code === 'ZONES_TOO_TALL' ? 'error' : 'warning', message: `Cabinet "${name}": ${i.message}` }));
  if (!carcaseMat) issues.push({ code: 'NO_CARCASE_MATERIAL', severity: 'error', message: `Cabinet "${name}": carcase material is not in stock — carcase not priced` });
  const needs = frontHardwareNeeds(zones, cab, carcaseTh, isOpenCarcase(zones));
  if (needs.doors && !doorHw) issues.push({ code: 'NO_FRONT_HARDWARE', severity: 'warning', message: `Cabinet "${name}": no hinge / lift selected for the doors — not priced` });
  if (needs.drawers && !pickFrontHardware(cab, 'DRAWERS', hardwareItems)) issues.push({ code: 'NO_FRONT_HARDWARE', severity: 'warning', message: `Cabinet "${name}": no drawer runners selected — not priced` });
  if (zones.some((z) => zoneOpeningModeOf(z, cab) === 'PUSH' && (z.kind === 'DOORS' || z.kind === 'DRAWERS' || !!z.split)) && !hardwareItems.some((h) => h.category === OPENING_HARDWARE.PUSH.hardwareCategory)) issues.push({ code: 'NO_PUSH_ITEM', severity: 'warning', message: `Cabinet "${name}": push-to-open selected but no "Push-Open Systems" item in stock — not priced` });
  if (model.plan.golaSkipped?.length) issues.push({ code: 'GOLA_ZONE_TOO_SHORT', severity: 'warning', message: `Cabinet "${name}": zone ${model.plan.golaSkipped.map((i) => i + 1).join(', ')} too short for a Gola channel plus fronts of at least ${PANEL.GOLA_MIN_FRONT_MM} mm: no channel there` });
  if (model.plan.golaDroppedByInset) issues.push({ code: 'GOLA_NOT_WITH_INSET', severity: 'warning', message: `Cabinet "${name}": inset hinges put the fronts inside the carcase, where a Gola channel cannot go: no channel is drawn or priced` });
  if (isLiftItem(doorHw) && !liftZoneIsTop(zones)) issues.push({ code: 'LIFT_ZONE_NOT_TOP', severity: 'error', message: `Cabinet "${name}": an overhead lift opens upward through everything above it, so it only fits the doors zone that is the top one and the only one with doors: use hinges here` });
  if (model.plan.channels.length > 0 && !hardwareItems.some((h) => h.id === cab.frontConfig.golaProfileItemId || h.category === OPENING_HARDWARE.GOLA.hardwareCategory)) issues.push({ code: 'NO_GOLA_ITEM', severity: 'warning', message: `Cabinet "${name}": Gola channels but no "Gola & Handle Profiles" item in stock — profile not priced` });
  if (model.plan.facades.some((f) => f.kind === 'DRAWER' && f.kinematic !== 'PULL_OUT_FRAME' && f.heightMm < minDrawerFrontMm())) {
    issues.push({ code: 'DRAWER_BOX_TOO_LOW', severity: 'warning', message: `Cabinet "${name}": a drawer front is lower than ${minDrawerFrontMm()} mm, too low for a drawer box: use fewer drawers or a taller cabinet` });
  }
  // Mechanism limits (rules/kinematics.ts): one warning per code, however many fronts break it.
  const limitCodes = new Set<string>();
  model.plan.facades.forEach((f) => {
    const spec = f.kinematic ? KINEMATICS[f.kinematic] : undefined;
    spec?.constraints?.({ frontWidthMm: f.widthMm, cabinetDepthMm: cab.depth, sideBySide: f.kind === 'DOOR' ? f.count : 1 }).forEach((c) => {
      if (limitCodes.has(c.code)) return;
      limitCodes.add(c.code);
      issues.push({ code: c.code, severity: 'warning', message: `Cabinet "${name}": ${c.message}` });
    });
  });
  if (!hdfMat && (backPanelModeOf(cab) === 'HDF' || model.parts.some((p) => p.role === 'back' && p.partType.startsWith('Drawer Box Bottom')))) {
    issues.push({ code: 'BACK_PRICED_AS_CARCASE', severity: 'warning', message: 'No "HDF 3 mm" sheet in stock — back panels and drawer bottoms are priced with the carcase sheet' });
  }

  const carcaseRoll = cab.carcaseEdgeRollId ? edgeRolls.find((r) => r.id === cab.carcaseEdgeRollId) : undefined;
  const frontRoll = cab.frontEdgeRollId ? edgeRolls.find((r) => r.id === cab.frontEdgeRollId) : undefined;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const parts: PricedPart[] = model.parts.map((p) => {
    // A front of a zone with its own sheet / band roll uses them ('NONE' = no band); every other front follows the cabinet.
    const material = p.role === 'front' ? (p.materialId ? woods.find((m) => m.id === p.materialId) ?? frontMat : frontMat) : p.role === 'back' ? hdfMat ?? carcaseMat : carcaseMat;
    const roll = p.role === 'front' ? (p.edgeRollId ? (p.edgeRollId === 'NONE' ? undefined : edgeRolls.find((r) => r.id === p.edgeRollId)) : frontRoll) : p.role === 'carcase' ? carcaseRoll : undefined;
    const edgeMm = p.edge === 'NONE' ? 0 : Math.max(0, roll ? roll.thickness : material?.edgeThickness ?? 0);
    const cutWidth = p.edge === 'ALL' ? p.widthMm - 2 * edgeMm : p.edge === 'FRONT' ? p.widthMm - edgeMm : p.widthMm;
    const cutLength = p.edge === 'ALL' ? p.lengthMm - 2 * edgeMm : p.lengthMm;
    const perPieceMm = !roll ? 0 : p.edge === 'ALL' ? 2 * (p.widthMm + p.lengthMm) : p.edge === 'FRONT' ? (p.edgeLengthMm ?? p.lengthMm) : 0;
    const cutW = round2(Math.max(0, cutWidth));
    const cutL = round2(Math.max(0, cutLength));
    // The board consumed from the sheet is the CUT piece (the band adds thickness, not board). The old BOM priced the
    // facades this way but the carcase boards on the finished size; now every part is priced on what is really cut.
    const areaM2 = (cutW * cutL * p.quantity) / 1_000_000;
    const sheetArea = material ? (material.widthSheet * material.heightSheet) / 1_000_000 : 0;
    return {
      ...p,
      material,
      edgeRoll: roll,
      edgeMm,
      cutWidthMm: cutW,
      cutLengthMm: cutL,
      boardCostDA: panelCostDA(cutW, cutL, material) * p.quantity,
      edgeMeters: (perPieceMm / 1000) * p.quantity * EDGE.WASTE_FACTOR,
      areaM2,
      sheets: sheetArea > 0 ? (areaM2 / sheetArea) * PANEL.WASTE_FACTOR : 0,
    };
  });

  if (hasFacades && parts.some((p) => p.role === 'front' && !p.material)) issues.push({ code: 'NO_FRONT_MATERIAL', severity: 'error', message: `Cabinet "${name}": front material is not in stock — fronts not priced` });
  zones.forEach((z, i) => {
    if (z.frontMaterialId && !woods.some((m) => m.id === z.frontMaterialId)) issues.push({ code: 'NO_FRONT_MATERIAL', severity: 'warning', message: `Cabinet "${name}": the front sheet chosen for zone ${i + 1} is not in stock — the cabinet's front sheet is used there` });
  });

  // One row per roll: the carcase band first, then the band of each front roll (a zone may choose a roll of its own).
  const edgeUsage: EdgeUsage[] = [];
  const usage = (part: 'carcase' | 'front', roll: EdgeBandRoll | undefined) => {
    if (!roll) return;
    const meters = parts.filter((p) => (part === 'front' ? p.role === 'front' : p.role === 'carcase') && p.edgeRoll?.id === roll.id).reduce((s, p) => s + p.edgeMeters, 0);
    if (meters > 0) edgeUsage.push({ part, roll, meters, costDA: Math.round(meters * bandPricePerMeterDA(roll)) });
  };
  usage('carcase', carcaseRoll);
  const frontRolls = new Map<string, EdgeBandRoll>();
  parts.forEach((p) => { if (p.role === 'front' && p.edgeRoll) frontRolls.set(p.edgeRoll.id, p.edgeRoll); });
  frontRolls.forEach((roll) => usage('front', roll));

  const requirements = hardwareRequirements(cab, hardwareItems, model.plan, { carcaseTh, frontTh, zoneFrontTh: zoneFront.map((c) => c?.thicknessMm) });
  const fixing = constructionOf(cab.category).fixing;
  const baseHw = baseHardwareOf(cab);
  const needsFixing = cab.category !== 'BASE_UNIT' || baseHw.legacy || baseHw.legs > 0; // a wooden frame or the floor needs no legs
  if (needsFixing && !requirements.some((r) => r.item.modelType.includes(fixing.keyword))) issues.push({ code: fixing.missingCode, severity: 'warning', message: `No "${fixing.keyword}" item in stock — ${fixing.noun} are not priced` });
  if (baseHw.pvcPlinth && !hardwareItems.some((h) => h.modelType.includes(BASE.PVC_KEYWORD))) issues.push({ code: 'NO_PLINTH_IN_STOCK', severity: 'warning', message: `Cabinet "${name}": no "${BASE.PVC_KEYWORD}" board in stock — the PVC plinth is not priced (or choose a plinth cut from the sheet)` });
  const hardware: PricedHardware[] = requirements.map((r) => ({ ...r, totalCostDA: Math.round(r.quantity * r.item.pricePerUnitDA) }));

  const appliances: ApplianceNote[] = zones.flatMap((z) => {
    if (z.kind !== 'APPLIANCE' || !z.appliance) return [];
    const s = APPLIANCES[z.appliance];
    const n = nicheOf(z)!;
    return [{ cabinetName: name, label: s.label, nicheWidthMm: n.w, nicheHeightMm: n.h, nicheDepthMm: n.d, note: s.note }];
  });

  const woodCostDA = parts.reduce((s, p) => s + p.boardCostDA, 0);
  const edgeCostDA = edgeUsage.reduce((s, u) => s + u.costDA, 0);
  const hardwareCostDA = hardware.reduce((s, h) => s + h.totalCostDA, 0);
  return { cabinetId: cab.id, cabinetName: name, model, parts, hardware, edgeUsage, appliances, woodCostDA, edgeCostDA, hardwareCostDA, totalDA: woodCostDA + edgeCostDA + hardwareCostDA, issues };
}
