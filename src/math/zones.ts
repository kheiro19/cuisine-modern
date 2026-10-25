// src/math/zones.ts
// A cabinet is a vertical stack of ZONES between the bottom board and the top (see types/flatma.ts). This file turns
// that list into numbers: how tall every opening is, where the divider boards go, and where every facade and Gola
// channel sits. BOM, cost, stock and the 3D assemblies all read these numbers, so they cannot disagree.
//
// Vertical budget, bottom -> top (n zones):  th (bottom board) + sum(openings) + (n - 1) * th (dividers) + th (top)
//   = cabinet height, so the openings add up to  height - (n + 1) * th.
// A zone without `heightMm` is flexible and shares what is left; if every zone has a height the TOP one absorbs the
// difference. Cabinets saved without `zones` are ONE zone built from frontConfig + shelvesCount, and keep exactly
// the facade sizes the BOM always produced for them.
import { ApplianceKind, CabinetObject, CabinetZone } from '../types/flatma';
import { LIMITS, PANEL, PULL_OUT, SPLIT } from './constants';
import { cornerFillers } from './cornerFiller';
import { SplitLayout, ZoneColumn, frontStripOf, splitLayoutOf } from './columns';
import { golaSlotsOfZone } from './gola';
import { APPLIANCES, OPEN_BAY_APPLIANCES, nicheOf } from '../rules/appliances';
import { canUseGola } from '../rules/openings';
import { dividerBoardsOf } from '../rules/construction';
import { carcaseSidesOf } from './carcaseSides';
import { KinematicId, validKinematic } from '../rules/kinematics';

export { APPLIANCES, nicheOf } from '../rules/appliances';
export type { ApplianceSpec } from '../rules/appliances';

export const ZONE_LABELS: Record<CabinetZone['kind'], string> = {
  DOORS: 'أبواب',
  DRAWERS: 'أدراج',
  OPEN: 'مفتوح (رفوف)',
  APPLIANCE: 'جهاز مدمج',
  APRON: 'لوح واجهة ثابت',
};

type ZonedCabinet = Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount' | 'dividerBoards'>;

/** The zones of a cabinet, bottom -> top. Old data (no `zones`) is one zone made from the legacy fields. */
export function zonesOf(cab: ZonedCabinet): CabinetZone[] {
  if (cab.zones && cab.zones.length > 0) return cab.zones;
  const { openingType, elementCount } = cab.frontConfig;
  if (openingType === 'NONE') return [{ kind: 'OPEN', shelves: cab.shelvesCount }];
  return [{ kind: openingType, count: elementCount, shelves: cab.shelvesCount }];
}

/**
 * Does this cabinet cut any front panel at all? A bay holding a washing machine or a dishwasher under the worktop is an OPEN
 * niche (`panelFront` off): there is no door to cut, so nothing may ask it for an edge band either. An `APRON` zone — لوح
 * واجهة ثابت — IS a panel, and so is an appliance bay with a panel in front of it.
 */
export function cabinetHasFronts(
  cab: Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount' | 'dividerBoards'>,
): boolean {
  return zonesOf(cab).some((z) => {
    if (z.kind === 'DOORS' || z.kind === 'DRAWERS' || z.kind === 'APRON') return true;
    if (z.kind === 'APPLIANCE') return !!z.panelFront; // washer / dishwasher / fridge in an open bay: بلا واجهة
    return false;
  });
}

/** How many front panels a priced cabinet really has (0 = an open bay: nothing to band, nothing to cut). */
export const frontPanelCount = (parts: ReadonlyArray<{ role: string }>): number =>
  parts.reduce((n, p) => n + (p.role === 'front' ? 1 : 0), 0);
import { isFloorApplianceZone } from '../rules/appliances';
export { isFloorApplianceZone };

/**
 * The bottom of the cabinet is an appliance bay standing on the floor: the appliance IS the bottom, so the cabinet gets no
 * bottom board. It does not matter whether the bay is the only zone or whether doors / drawers sit above it — a plinth or a
 * bottom board would lift the appliance off the ground. (`OPEN` shelving is NOT this: it keeps its bottom.)
 */
export function isOpenCarcase(zones: CabinetZone[]): boolean {
  return isFloorApplianceZone(zones[0]);
}

/**
 * Where the back panel starts, in mm from the floor of the cabinet: 0 for a normal carcass. Behind an open bay the back is not
 * cut (hoses, ventilation, the depth the appliance needs), so the panel starts at the board above the bay — and when nothing is
 * above the bay it starts at the top of the cabinet, i.e. there is no back at all.
 */
export function backPanelBottomMm(layout: ZoneLayout): number {
  const first = layout.bands[0];
  if (!first || !isFloorApplianceZone(first.zone)) return 0;
  return layout.dividerBottomsMm[0] ?? layout.bands[layout.bands.length - 1].bandTopMm;
}

/**
 * The LOWEST zone of the cabinet is an appliance that stands on the floor (washer, dishwasher, dryer, fridge). Such a unit
 * stands on the floor whether or not the bay is alone: a plinth under it would lift the appliance off the ground, and the
 * open carcase (no bottom board) is what makes the bay reach the floor. An OPEN zone (open shelving) is NOT this.
 */
/** True when the LOWEST zone is an appliance standing on the floor (see `isOpenCarcase`: no bottom board, no base). */
export const isApplianceBayAtBottom = (zones: CabinetZone[]): boolean => isFloorApplianceZone(zones[0]);

export interface ZoneIssue {
  code: 'ZONES_TOO_TALL' | 'APPLIANCE_TOO_NARROW' | 'APPLIANCE_TOO_SHALLOW' | 'APPLIANCE_ZONE_TOO_SHORT' | 'APPLIANCE_ZONE_WIDE' | 'SPLIT_NO_ROOM' | 'SPLIT_JOIN_INVALID' | 'SHELVES_TOO_CLOSE' | 'DOORS_TOO_NARROW';
  message: string;
}

export interface ZoneBand {
  index: number;
  zone: CabinetZone;
  /** Opening (the free space inside the cabinet), measured from the cabinet bottom. */
  openingBottomMm: number;
  openingHeightMm: number;
  /** The slice of the cabinet height this zone's facade lives in: from the middle of one divider to the next. */
  bandBottomMm: number;
  bandTopMm: number;
  /** The two columns when a vertical board splits this zone (math/columns.ts); missing = one column, the whole width. */
  split?: SplitLayout;
  /**
   * The zones whose side (FILL) columns are joined into one (ZoneSplit.joinBelow), as the indices of the lowest and the highest zone
   * of the group, on every zone of the group. The lowest zone carries the vertical board, the shelves and the front of the joined column.
   */
  join?: { lowIndex: number; highIndex: number };
  /**
   * Doors zones with several swinging doors: the vertical boards the hinges hang on. A hinge needs a board behind it, so every hinge
   * that is not on a side (or on the zone's own vertical board) gets one: neighbouring doors hinged on the same edge share it.
   */
  partitions?: ZonePartition[];
}

/** One hinge board inside a doors zone: `edge` = the index of the door edge it stands behind (1 = between door 0 and door 1). */
export interface ZonePartition {
  edge: number;
  xLoMm: number;
  /** The whole stack: `boards` boards of one thickness each, back to back. */
  widthMm: number;
  /** 2 = a board for each of the two doors hinged on this edge; 1 = a single board. */
  boards: number;
}

export interface ZoneLayout {
  bands: ZoneBand[];
  /** Bottom edge of each divider board (n - 1 of them), measured from the cabinet bottom. */
  dividerBottomsMm: number[];
  issues: ZoneIssue[];
  /** Board thickness the layout was made with (the partitions and the inset fronts need it). */
  thicknessMm?: number;
}

/**
 * The hinge side of every door of a row. A zone that states a side hangs all its doors on it; otherwise they alternate
 * (door 0 on the left) so the neighbours open towards each other.
 */
export function hingeSidesOf(count: number, forced?: 'LEFT' | 'RIGHT', perDoor?: ReadonlyArray<'LEFT' | 'RIGHT' | 'AUTO' | undefined>): Array<'LEFT' | 'RIGHT'> {
  return Array.from({ length: Math.max(0, count) }, (_, k) => {
    const own = perDoor?.[k];
    return own === 'LEFT' || own === 'RIGHT' ? own : forced ?? (k % 2 === 0 ? 'LEFT' : 'RIGHT');
  });
}

/** The inner door edges on which TWO doors hang (door e-1 hinged right and door e hinged left): the edges that would share a board. */
export function sharedHingeEdgesOf(sides: ReadonlyArray<'LEFT' | 'RIGHT'>): number[] {
  const out: number[] = [];
  for (let e = 1; e < sides.length; e++) if (sides[e - 1] === 'RIGHT' && sides[e] === 'LEFT') out.push(e);
  return out;
}

/** The count + 1 edges of a row of doors, left to right: the nominal cuts of the cabinet width, or the strip of a column. All to the half millimetre. */
export function doorEdgesOf(count: number, widthMm: number, strip?: { loMm: number; hiMm: number }): number[] {
  return Array.from({ length: count + 1 }, (_, j) => (strip
    ? (j === 0 ? strip.loMm : j === count ? strip.hiMm : Math.round(2 * (strip.loMm + (j * (strip.hiMm - strip.loMm)) / count)) / 2)
    : Math.round((2 * j * widthMm) / count) / 2));
}

/**
 * A row of INSET doors between two walls [loMm, hiMm]: the hinge boards (one per entry of `boardEdges`, see hingeEdgesOf) cut the row
 * into compartments and the doors sit inside them, `g` clear of every board and of each other, all the same width. Returns the doors
 * (x, width, left to right) and the x of the left face of each board. layoutZones cuts the boards from this and insetPlan hangs the
 * doors in it, so a door never stands where a board is.
 */
export function insetRowOf(count: number, boardEdges: ReadonlyArray<number>, loMm: number, hiMm: number, boardMm: number | ReadonlyArray<number>, g: number): { doors: Array<{ xMm: number; widthMm: number }>; boards: Array<{ edge: number; xLoMm: number }> } {
  const cuts = [0, ...boardEdges, count];
  const compartments = cuts.length - 1;
  const widthOf = (i: number) => (typeof boardMm === 'number' ? boardMm : boardMm[i] ?? 0); // one width for all, or one per board (a stack of two is 2 x thickness)
  const boardsTotal = boardEdges.reduce((sum, _, i) => sum + widthOf(i), 0);
  const w = Math.max(0, Math.floor(2 * ((hiMm - loMm - boardsTotal - (count + compartments) * g) / count)) / 2);
  const doors: Array<{ xMm: number; widthMm: number }> = [];
  const boards: Array<{ edge: number; xLoMm: number }> = [];
  let x = loMm;
  for (let c = 0; c < compartments; c++) {
    x += g;
    for (let k = cuts[c]; k < cuts[c + 1]; k++) { doors.push({ xMm: x, widthMm: w }); x += w + (k < cuts[c + 1] - 1 ? g : 0); }
    x += g;
    if (c < compartments - 1) { boards.push({ edge: cuts[c + 1], xLoMm: x }); x += widthOf(c); }
  }
  return { doors, boards };
}

/** The inner door edges a hinge hangs on (0 and `count` are the carcase / column boundary, which is already a board). */
export function hingeEdgesOf(count: number, sides: ReadonlyArray<'LEFT' | 'RIGHT'>): number[] {
  const edges = new Set<number>();
  sides.forEach((side, k) => { const e = side === 'LEFT' ? k : k + 1; if (e > 0 && e < count) edges.add(e); });
  return [...edges].sort((a, b) => a - b);
}

type SizedCabinet = ZonedCabinet & Pick<CabinetObject, 'width' | 'height' | 'depth'>;

export function layoutZones(cab: SizedCabinet, thicknessMm: number, opts: { inset?: boolean } = {}): ZoneLayout {
  const zones = zonesOf(cab);
  const n = zones.length;
  const th = thicknessMm;
  const divTh = th * dividerBoardsOf(cab); // one shared board, or two glued face to face
  const issues: ZoneIssue[] = [];

  const fixed = zones.map((z) => (typeof z.heightMm === 'number' && z.heightMm > 0 ? z.heightMm : undefined));
  let flex = fixed.map((h, i) => (h === undefined ? i : -1)).filter((i) => i >= 0);
  if (flex.length === 0) flex = [n - 1];

  const openBay = isOpenCarcase(zones); // no bottom board: the appliance stands on the floor under the top rails
  const available = cab.height - (openBay ? th : 2 * th) - (n - 1) * divTh;
  const fixedSum = fixed.reduce<number>((sum, h, i) => sum + (flex.includes(i) ? 0 : (h as number)), 0);
  const left = available - fixedSum;
  if (left < LIMITS.ZONE_HEIGHT_MM[0] * flex.length) { // every flexible zone needs its minimum, not only the total
    issues.push({ code: 'ZONES_TOO_TALL', message: `الأقسام أطول من الخزانة: المتاح للأقسام المرنة ${Math.round(left)} مم فقط (${LIMITS.ZONE_HEIGHT_MM[0]} مم على الأقل لكل قسم مرن). قلّل الارتفاعات أو زد ارتفاع الخزانة.` });
  }

  const openings = fixed.map((h) => h ?? 0);
  const each = Math.floor(Math.max(left, 0) / flex.length);
  flex.forEach((i) => { openings[i] = each; });
  openings[flex[flex.length - 1]] += Math.max(left, 0) - each * flex.length; // rounding goes to the last flexible zone

  const bands: ZoneBand[] = [];
  const dividerBottomsMm: number[] = [];
  let cursor = openBay ? 0 : th; // top of the bottom board (the floor when there is none)
  for (let i = 0; i < n; i++) {
    const openingBottom = cursor;
    const openingTop = openingBottom + openings[i];
    if (i < n - 1) dividerBottomsMm.push(openingTop);
    bands.push({
      index: i,
      zone: zones[i],
      openingBottomMm: openingBottom,
      openingHeightMm: openings[i],
      bandBottomMm: i === 0 ? 0 : dividerBottomsMm[i - 1] + divTh / 2,
      bandTopMm: i === n - 1 ? cab.height : openingTop + divTh / 2,
    });
    cursor = openingTop + divTh;
  }

  const inner = cab.width - 2 * th;
  const open = isOpenCarcase(zones);
  // Shelves spread evenly in the opening: when the gap between two of them is tiny they overlap each other or the dividers.
  bands.forEach((b) => {
    const shelves = (b.zone.kind === 'DOORS' || b.zone.kind === 'OPEN') && b.zone.kinematic !== 'PULL_OUT_FRAME' ? Math.max(0, Math.round(b.zone.shelves ?? 0)) : 0;
    if (shelves === 0) return;
    const gap = b.openingHeightMm / (shelves + 1) - th;
    if (gap < PANEL.SHELF_MIN_GAP_MM) issues.push({ code: 'SHELVES_TOO_CLOSE', message: `القسم ${b.index + 1}: ${shelves} رفوف في فتحة ارتفاعها ${Math.round(b.openingHeightMm)} مم، الفراغ بين الرفين ${Math.max(0, Math.round(gap))} مم فقط. قلّل الرفوف أو ارفع القسم.` });
  });
  bands.forEach((b) => {
    // An open bay cannot be split; the zones above it are ordinary zones and can be.
    const s = splitLayoutOf(b.zone, cab, th, { open: isFloorApplianceZone(b.zone) });
    if (s.layout) b.split = s.layout;
    if (s.issue) issues.push(s.issue);
  });
  // Joined side columns (ZoneSplit.joinBelow): consecutive split zones on the same side share ONE vertical board and ONE side column.
  // The board stands at the wider of their main columns, so every appliance still fits.
  {
    const joins = (i: number) => i > 0 && !!bands[i].zone.split?.joinBelow;
    const sameSide = (i: number) => !!bands[i].split && !!bands[i - 1].split && bands[i].split!.mainSide === bands[i - 1].split!.mainSide;
    for (let i = 1; i < n; i++) {
      if (joins(i) && !sameSide(i)) issues.push({ code: 'SPLIT_JOIN_INVALID', message: `القسم ${i + 1}: لا يمكن دمج عموده الجانبي مع القسم ${i}، يجب أن يكون القسمان بلوح عمودي وعلى الجهة نفسها.` });
    }
    for (let i = 0; i < n; i++) {
      if (i > 0 && joins(i) && sameSide(i)) continue; // not the lowest of its group
      let hi = i;
      while (hi + 1 < n && joins(hi + 1) && sameSide(hi + 1)) hi++;
      if (hi === i) continue;
      const group = bands.slice(i, hi + 1);
      const mainW = Math.max(...group.map((b) => b.split!.main.innerHiMm - b.split!.main.innerLoMm));
      const redone = group.map((b) => splitLayoutOf(b.zone, cab, th, { mainWidthMm: mainW }));
      const bad = redone.find((r) => !r.layout);
      if (bad) { if (bad.issue) issues.push(bad.issue); continue; }
      group.forEach((b, k) => {
        b.split = redone[k].layout!;
        b.join = { lowIndex: i, highIndex: hi };
      });
      // One side column, one content: the lowest zone's choice rules the whole column.
      const fill = group[0].split!.fill.fill;
      group.forEach((b) => { b.split!.fill = { ...b.split!.fill, fill }; });
    }
  }
  // Hinge boards: a door can only hang on a board. With three or more doors in a row (or all hinges on one side) some hinges fall
  // between two doors, where there is nothing: a board is cut for each of those edges, and the doors hang on it.
  bands.forEach((b) => {
    const z = b.zone;
    if (z.kind !== 'DOORS' || open || z.kinematic === 'PULL_OUT_FRAME') return;
    const count = Math.max(1, Math.round(z.count ?? 1));
    if (count < 2) return;
    const sides = hingeSidesOf(count, b.split ? undefined : z.hingeSide, b.split ? undefined : z.hingeSides);
    const edgeIdx = hingeEdgesOf(count, sides);
    if (edgeIdx.length === 0) return;
    // Two doors hung on the same edge get a board each (back to back) unless the zone asks to share one: no board holds two doors' hinges.
    const shared = new Set(sharedHingeEdgesOf(sides));
    const stack = (e: number) => (shared.has(e) && !z.sharedHingeBoard ? 2 : 1);
    const widths = edgeIdx.map((e) => stack(e) * th);
    const inSides = carcaseSidesOf(cab, th);
    const inLo = b.split ? b.split.main.innerLoMm : inSides.loMm, inHi = b.split ? b.split.main.innerHiMm : inSides.hiMm;
    // Overlay doors: the board stands behind the gap between two doors. Inset doors: they sit in the compartments between the boards.
    const edges = doorEdgesOf(count, cab.width, b.split ? frontStripOf(b.split.main, cab.width) : undefined);
    const boards = opts.inset
      ? insetRowOf(count, edgeIdx, inLo, inHi, widths, PANEL.INSET_GAP_MM).boards.map((p, i) => ({ edge: p.edge, xLoMm: p.xLoMm, widthMm: widths[i], boards: stack(p.edge) }))
      : edgeIdx.map((e, i) => ({ edge: e, xLoMm: edges[e] - widths[i] / 2, widthMm: widths[i], boards: stack(e) }));
    // The boards must leave a real compartment between them and the sides: doors so narrow that a board does not fit are reported instead.
    const walls = [inLo, ...boards.flatMap((p) => [p.xLoMm, p.xLoMm + p.widthMm]), inHi];
    const room = Math.min(...Array.from({ length: boards.length + 1 }, (_, n) => walls[2 * n + 1] - walls[2 * n])); // the compartments between the walls
    if (room < SPLIT.MIN_COLUMN_MM) {
      issues.push({ code: 'DOORS_TOO_NARROW', message: `Zone ${b.index + 1}: ${count} doors are too narrow for the hinge boards they hang on (${Math.round(Math.max(0, room))} mm left between boards): use fewer doors` });
      return;
    }
    b.partitions = boards;
  });
  bands.forEach((b) => {
    if (b.zone.kind !== 'APPLIANCE' || !b.zone.appliance) return;
    const spec = APPLIANCES[b.zone.appliance];
    const n = nicheOf(b.zone)!;
    const room = b.split ? b.split.main.innerHiMm - b.split.main.innerLoMm : inner; // the appliance's own column when there is a board
    if (room < n.w) issues.push({ code: 'APPLIANCE_TOO_NARROW', message: `${spec.label}: الفتحة تحتاج ${n.w} مم والعرض الداخلي ${Math.round(room)} مم (اجعل عرض الخزانة ${n.w + 2 * th} مم على الأقل).` });
    if (!b.split && !open && inner - n.w >= SPLIT.WIDE_WARNING_MM) issues.push({ code: 'APPLIANCE_ZONE_WIDE', message: `${spec.label}: يبقى ${Math.round(inner - n.w)} مم بجانب الجهاز بلا ما يملؤه. أضف لوحًا عمودياً لتقسيم القسم إلى عمودين.` });
    if (cab.depth < n.d) issues.push({ code: 'APPLIANCE_TOO_SHALLOW', message: `${spec.label}: العمق ${cab.depth} مم أقل من المطلوب ${n.d} مم.` });
    if (b.openingHeightMm < n.h) issues.push({ code: 'APPLIANCE_ZONE_TOO_SHORT', message: `${spec.label}: ارتفاع القسم ${Math.round(b.openingHeightMm)} مم أقل من الفتحة المطلوبة ${n.h} مم.` });
  });

  return { bands, dividerBottomsMm, issues, thicknessMm: th };
}

export interface Facade {
  zoneIndex: number;
  kind: 'DOOR' | 'DRAWER' | 'APRON' | 'PANEL' | 'FILLER';
  /** Position inside its zone. For drawers 0 = the TOP drawer (the numbering Gola slots use). */
  index: number;
  count: number;
  widthMm: number;
  heightMm: number;
  /** Left edge / bottom edge measured from the cabinet's left / bottom. */
  xMm: number;
  yMm: number;
  /** Split zones: the column the facade belongs to (missing = the whole zone). `index` / `count` then count inside the column. */
  column?: 'MAIN' | 'FILL';
  /** Split zones: the free space of its column inside the carcase (a pull-out frame and a hinge plate sit in it). */
  innerLoMm?: number;
  innerHiMm?: number;
  /** Split zones: the hinge side, on the outer edge away from the vertical board. Missing = alternate by index. */
  hingeSide?: 'LEFT' | 'RIGHT';
  /** Mechanism declared on the zone (rules/kinematics.ts); set only when it is valid for that zone. */
  kinematic?: KinematicId;
  /** Pull-out frames: how many baskets the frame carries. */
  levels?: number;
  /** Real thickness of THIS facade's sheet (mm) when its zone has a front sheet of its own; missing = the cabinet's front thickness. */
  thicknessMm?: number;
  /** The joined side column of several zones: the highest zone this facade reaches up to (its own `zoneIndex` is the lowest). */
  spanToZone?: number;
}

/** Baskets in a pull-out frame: the zone's shelves, or the default when it has none (a drawers zone has no shelves). */
export const pullOutLevels = (z: Pick<CabinetZone, 'shelves'>): number => (z.shelves && z.shelves > 0 ? Math.round(z.shelves) : PULL_OUT.DEFAULT_LEVELS);

export interface GolaChannel {
  /** The doors / drawers zone this channel belongs to (a tower or a two-storey wall unit has one per zone). */
  zoneIndex: number;
  /** Slot k = the channel just above drawer k (0 = top). Doors: slot 0 = the channel above the doors. */
  slot: number;
  yMm: number;
  heightMm: number;
}

export interface FrontPlan {
  facades: Facade[];
  channels: GolaChannel[];
  /** Zones too short for a Gola channel plus fronts of a usable height: they got no channel. */
  golaSkipped?: number[];
  /** Inset fronts sit inside the opening, where a Gola channel (an overlay profile) cannot be: the channels were dropped. */
  golaDroppedByInset?: boolean;
}

export interface FrontPlanOptions {
  /** Inset hinges: the fronts sit INSIDE the carcase opening (see PANEL.INSET_GAP_MM) instead of in front of it. */
  inset?: boolean;
  /** Real thickness of the front sheet (mm); missing = the one cached on the cabinet. */
  frontThMm?: number;
  /** Per-zone front thickness (mm), by zone index: the facades of that zone carry it. A missing entry = the cabinet's thickness. */
  zoneFrontThMm?: ReadonlyArray<number | undefined>;
}

export function planFronts(cab: SizedCabinet & Pick<CabinetObject, 'category'> & Partial<Pick<CabinetObject, 'frontThickness' | 'frontSetbackSides' | 'cornerSide' | 'cornerFillerMm' | 'cornerFillerSides'>>, layout: ZoneLayout, opts: FrontPlanOptions = {}): FrontPlan {
  const facades: Facade[] = [];
  const golaSkipped: number[] = [];
  const channels: GolaChannel[] = [];
  const n = layout.bands.length;
  const x0 = PANEL.FRONT_GAP_TOTAL_MM / 2;
  const half = PANEL.FRONT_HEIGHT_CLEARANCE_MM / 2;
  const reveal = PANEL.FRONT_REVEAL_MM / 2;
  const gapHalf = PANEL.FRONT_GAP_BETWEEN_MM / 2;
  // A box whose door row stops short on a side (the arm of an L corner whose neighbour's door runs past): one front thickness + the gap.
  const frontTh = opts.frontThMm ?? (cab.frontThickness && cab.frontThickness > 0 ? cab.frontThickness : PANEL.DEFAULT_THICKNESS_MM);
  const setback = frontTh + PANEL.FRONT_GAP_BETWEEN_MM;
  const setLeft = cab.frontSetbackSides?.includes('LEFT') ? setback : 0;
  const setRight = cab.frontSetbackSides?.includes('RIGHT') ? setback : 0;
  // The FIXED filler panels of an L-corner box (math/cornerFiller.ts): one on the side that faces the other arm — needed as
  // soon as a front slides out there, or the drawer passes through the plane of the neighbour's closed door — and optionally
  // one on the far side, for looks alone. They are INSIDE the box: every front starts on the panel's edge, no seam of its own,
  // so the front never covers the filler and the box never grows. (A door keeps its own rule above: a door swings.)
  const fillers = cornerFillers(cab, layout.bands.map((b) => b.zone), frontTh);
  const drawerSetLeft = fillers.left;
  const drawerSetRight = fillers.right;
  // Doors, aprons and appliance panels start after a panel too (a door is hung on the board behind the filler edge).
  const doorSetLeft = Math.max(setLeft, fillers.left);
  const doorSetRight = Math.max(setRight, fillers.right);

  // Where Gola channels may exist is decided in rules/openings.ts (canUseGola). Each zone may choose its own opening mode
  // (zone.openingMode); a zone with no choice follows the cabinet.
  const golaOf = (z: CabinetZone) => (z.openingMode ? z.openingMode === 'GOLA' : cab.frontConfig.hasGolaProfile) && canUseGola(cab.category, [z]);
  const golaFc = { ...cab.frontConfig, hasGolaProfile: true };

  layout.bands.forEach((band, i) => {
    const z = band.zone;
    let slots = golaOf(z) ? golaSlotsOfZone(golaFc, z, n) : []; // this zone's channels
    // Half millimetres: the middle of a divider can fall on one, and the 1 mm gap between two zones is centred on it.
    const round2 = (v: number) => Math.round(2 * v) / 2;
    const yLo = round2(band.bandBottomMm + (i === 0 ? half : reveal));
    const yHi = round2(band.bandTopMm - (i === n - 1 ? half : reveal));
    const extent = Math.max(0, yHi - yLo);
    if (slots.length > 0) {
      // A channel + its fronts must fit in the zone, otherwise the fronts collapse to nothing and the channel spills into the next zone.
      const fronts = z.kind === 'DRAWERS' ? Math.max(1, Math.round(z.count ?? 1)) : 1;
      if (extent - slots.length * PANEL.GOLA_OFFSET_MM < fronts * PANEL.GOLA_MIN_FRONT_MM) { slots = []; golaSkipped.push(i); }
    }
    const fullWidth = Math.max(0, cab.width - PANEL.FRONT_GAP_TOTAL_MM);
    const mech = validKinematic(z.kinematic, z.kind, cab.category);
    const mark = mech ? { kinematic: mech, ...(mech === 'PULL_OUT_FRAME' ? { levels: pullOutLevels(z) } : {}) } : {};

    if (band.split) {
      // A vertical board makes two columns. Doors / fronts of a column share its strip; the MAIN one carries the zone's own doors
      // (or an appliance niche, with a panel when the appliance is hidden), the FILL one what the split asks for.
      const sp = band.split;
      const stack = Math.max(0, extent - slots.length * PANEL.GOLA_OFFSET_MM);
      const channelBelow = slots.length > 0 && (cab.category === 'WALL_UNIT' || yHi > PANEL.GOLA_REACH_MM);
      const y = channelBelow ? yLo + PANEL.GOLA_OFFSET_MM : yLo;
      const outer = (col: ZoneColumn): 'LEFT' | 'RIGHT' => (col.frontLoMm <= 0 ? 'LEFT' : 'RIGHT');
      const base = (col: ZoneColumn, role: 'MAIN' | 'FILL') => ({ zoneIndex: i, column: role, innerLoMm: col.innerLoMm, innerHiMm: col.innerHiMm });
      // A strip that reaches the edge of the box stops at the filler panel instead.
      const edge = PANEL.FRONT_GAP_TOTAL_MM / 2;
      const trimStrip = (strip: { loMm: number; hiMm: number }) => ({
        loMm: strip.loMm <= edge + 0.001 ? Math.max(strip.loMm, fillers.left) : strip.loMm,
        hiMm: strip.hiMm >= cab.width - edge - 0.001 ? Math.min(strip.hiMm, cab.width - fillers.right) : strip.hiMm,
      });
      const mainStrip = trimStrip(frontStripOf(sp.main, cab.width));
      if (z.kind === 'DOORS') {
        const count = Math.max(1, Math.round(z.count ?? 1));
        const edge = (j: number) => (j === 0 ? mainStrip.loMm : j === count ? mainStrip.hiMm : round2(mainStrip.loMm + (j * (mainStrip.hiMm - mainStrip.loMm)) / count));
        for (let k = 0; k < count; k++) {
          const lo = edge(k) + (k > 0 ? gapHalf : 0);
          const hi = edge(k + 1) - (k < count - 1 ? gapHalf : 0);
          facades.push({ ...base(sp.main, 'MAIN'), kind: 'DOOR', index: k, count, widthMm: hi - lo, heightMm: stack, xMm: lo, yMm: y, hingeSide: count === 1 ? outer(sp.main) : hingeSidesOf(count)[k], ...mark });
        }
        if (slots.length > 0) channels.push({ zoneIndex: i, slot: 0, yMm: channelBelow ? yLo : yLo + stack, heightMm: PANEL.GOLA_OFFSET_MM });
      } else if (z.kind === 'APPLIANCE' && z.panelFront) {
        facades.push({ ...base(sp.main, 'MAIN'), kind: 'PANEL', index: 0, count: 1, widthMm: mainStrip.hiMm - mainStrip.loMm, heightMm: extent, xMm: mainStrip.loMm, yMm: yLo });
      }
      // A joined side column (band.join) has ONE front, made by its lowest zone and as tall as all the zones it joins.
      const joined = band.join;
      if (joined && joined.lowIndex !== i) return;
      const fillStrip = trimStrip(frontStripOf(sp.fill, cab.width));
      const joinTop = joined ? layout.bands[joined.highIndex] : undefined;
      const joinHi = joinTop ? round2(joinTop.bandTopMm - (joined!.highIndex === n - 1 ? half : reveal)) : yHi;
      const fillBase = {
        ...base(sp.fill, 'FILL'), index: 0, count: 1, widthMm: fillStrip.hiMm - fillStrip.loMm,
        heightMm: joined ? Math.max(0, joinHi - yLo) : stack, xMm: fillStrip.loMm, yMm: joined ? yLo : y,
        ...(joined && joined.highIndex !== i ? { spanToZone: joined.highIndex } : {}),
      };
      if (sp.fill.fill === 'PULL_OUT') facades.push({ ...fillBase, kind: 'DOOR', kinematic: 'PULL_OUT_FRAME', levels: PULL_OUT.DEFAULT_LEVELS });
      else if (sp.fill.fill === 'DOOR') facades.push({ ...fillBase, kind: 'DOOR', hingeSide: outer(sp.fill) });
      else if (sp.fill.fill === 'PANEL') facades.push({ ...fillBase, kind: 'PANEL' });
      return;
    }

    if (z.kind === 'DOORS') {
      const count = Math.max(1, Math.round(z.count ?? 1));
      const stack = Math.max(0, extent - slots.length * PANEL.GOLA_OFFSET_MM);
      // The channel runs along the top of the doors on a floor unit; on a wall unit, and on doors above reach, along the bottom.
      const channelBelow = slots.length > 0 && (cab.category === 'WALL_UNIT' || yHi > PANEL.GOLA_REACH_MM);
      const doorsY = channelBelow ? yLo + PANEL.GOLA_OFFSET_MM : yLo;
      // Doors share the cabinet width (the nominal cuts fall on W/count, to the half millimetre) and each door loses half
      // the gap on every edge it shares with another door: 600 mm / 2 doors = 299.5 + 299.5 with 1 mm between them.
      // A lone door keeps the outer reveal on both sides (599 on a 600 cabinet); a row of several doors uses FRONT_ROW_OUTER_REVEAL_MM.
      const cut = (j: number) => Math.round((2 * j * cab.width) / count) / 2;
      const outer = count === 1 ? PANEL.FRONT_GAP_TOTAL_MM / 2 : PANEL.FRONT_ROW_OUTER_REVEAL_MM;
      const hinges = hingeSidesOf(count, z.hingeSide, z.hingeSides); // several doors always carry their side: the hinge boards (layoutZones) stand behind it
      for (let k = 0; k < count; k++) {
        const lo = Math.max(cut(k) + (k === 0 ? outer : gapHalf), k === 0 ? doorSetLeft : 0);
        const hi = Math.min(cut(k + 1) - (k === count - 1 ? outer : gapHalf), k === count - 1 ? cab.width - doorSetRight : cab.width);
        facades.push({ zoneIndex: i, kind: 'DOOR', index: k, count, widthMm: hi - lo, heightMm: stack, xMm: lo, yMm: doorsY, ...(count > 1 || z.hingeSide || (z.hingeSides?.[0] && z.hingeSides[0] !== 'AUTO') ? { hingeSide: hinges[k] } : {}), ...mark });
      }
      if (slots.length > 0) channels.push({ zoneIndex: i, slot: 0, yMm: channelBelow ? yLo : yLo + stack, heightMm: PANEL.GOLA_OFFSET_MM });
    } else if (z.kind === 'DRAWERS') {
      const count = Math.max(1, Math.round(z.count ?? 1));
      const stack = Math.max(0, extent - slots.length * PANEL.GOLA_OFFSET_MM);
      // Drawers stack on the nominal cuts (stack / count, to the half millimetre); each loses half the gap on every edge it
      // shares with another drawer. Where a Gola channel sits between two drawers the channel is the gap, so nothing more is taken.
      const cut = (j: number) => Math.round((2 * j * stack) / count) / 2;
      let channelsBelow = 0;
      for (let p = 0; p < count; p++) { // bottom drawer first
        const k = count - 1 - p;
        const touchesBelow = p > 0 && !slots.includes(k + 1);
        const touchesAbove = p < count - 1 && !slots.includes(k);
        const lo = cut(p) + (touchesBelow ? gapHalf : 0);
        const hi = cut(p + 1) - (touchesAbove ? gapHalf : 0);
        // The drawer front spans the box; on the side that faces the other arm of the corner its edge stops at exactly
        // (front thickness + CORNER.DRAWER_CLEARANCE_MM) from the box edge (19.5 mm for an 18 mm door), the usual reveal
        // on that side no longer applying — the neighbour's door is there, not the carcase edge.
        const dLo = Math.max(x0, drawerSetLeft);
        const dHi = Math.min(cab.width - x0, cab.width - drawerSetRight);
        facades.push({ zoneIndex: i, kind: 'DRAWER', index: k, count, widthMm: Math.max(0, dHi - dLo), heightMm: hi - lo, xMm: dLo, yMm: yLo + channelsBelow + lo, ...mark });
        if (slots.includes(k)) {
          channels.push({ zoneIndex: i, slot: k, yMm: yLo + channelsBelow + cut(p + 1), heightMm: PANEL.GOLA_OFFSET_MM });
          channelsBelow += PANEL.GOLA_OFFSET_MM;
        }
      }
    } else if (z.kind === 'APRON') {
      const lo = Math.max(x0, fillers.left), hi = Math.min(cab.width - x0, cab.width - fillers.right);
      facades.push({ zoneIndex: i, kind: 'APRON', index: 0, count: 1, widthMm: Math.max(0, hi - lo), heightMm: extent, xMm: lo, yMm: yLo });
    } else if (z.kind === 'APPLIANCE' && z.panelFront) {
      const lo = Math.max(x0, fillers.left), hi = Math.min(cab.width - x0, cab.width - fillers.right);
      facades.push({ zoneIndex: i, kind: 'PANEL', index: 0, count: 1, widthMm: Math.max(0, hi - lo), heightMm: extent, xMm: lo, yMm: yLo });
    }
  });

  // The fixed fillers: one flat panel per side, from the bottom of the carcase to the top, as thick and as finished as the
  // fronts. On the corner side it is what the client sees instead of the void in front of the neighbouring door; on the far
  // side it is there for looks (an end panel at the end of a run).
  const pushFiller = (side: 'LEFT' | 'RIGHT', widthMm: number) => {
    if (widthMm <= 0) return;
    facades.push({
      zoneIndex: 0, kind: 'FILLER', index: side === 'LEFT' ? 0 : 1, count: 1,
      widthMm, heightMm: cab.height,
      xMm: side === 'LEFT' ? 0 : cab.width - widthMm, yMm: 0,
    });
  };
  pushFiller('LEFT', fillers.left);
  pushFiller('RIGHT', fillers.right);

  // Zones with a front sheet of their own: their facades carry its thickness (the fixed corner fillers stay with the cabinet's).
  if (opts.zoneFrontThMm) facades.forEach((f) => { const t = f.kind === 'FILLER' ? undefined : opts.zoneFrontThMm?.[f.zoneIndex]; if (t && t > 0) f.thicknessMm = t; });

  const plan: FrontPlan = golaSkipped.length > 0 ? { facades, channels, golaSkipped } : { facades, channels };
  return opts.inset ? insetPlan(cab, layout, plan) : plan;
}

/**
 * Inset fronts: every front is laid inside the free opening of its zone (or of its column), with PANEL.INSET_GAP_MM on every edge and
 * between neighbours, instead of in front of the carcase. A front as wide as the cabinet would run through the side boards.
 * Doors share the opening left to right, drawers share it top to bottom (index 0 = the top one), a lone panel fills it.
 */
function insetPlan(cab: SizedCabinet, layout: ZoneLayout, plan: FrontPlan): FrontPlan {
  const g = PANEL.INSET_GAP_MM;
  const th = layout.thicknessMm ?? PANEL.DEFAULT_THICKNESS_MM;
  const sides = carcaseSidesOf(cab, th);
  const half = (v: number) => Math.floor(2 * v) / 2; // never round a front up into its neighbour
  const groups = new Map<string, Facade[]>();
  // A FILLER is screwed flat against the corner side, not hung in an opening: inset mode leaves it exactly where planFronts put it.
  plan.facades.filter((f) => f.kind !== 'FILLER').forEach((f) => { const k = `${f.zoneIndex}:${f.column ?? ''}:${f.kind}`; groups.set(k, [...(groups.get(k) ?? []), f]); });
  const rect = new Map<Facade, Pick<Facade, 'xMm' | 'yMm' | 'widthMm' | 'heightMm'>>();
  groups.forEach((list) => {
    const first = list[0];
    const band = layout.bands[first.zoneIndex];
    const lo = (first.innerLoMm ?? sides.loMm) + g;
    const hi = (first.innerHiMm ?? sides.hiMm) - g;
    const yLo = band.openingBottomMm + g;
    const topBand = first.spanToZone !== undefined ? layout.bands[first.spanToZone] : band; // a joined side column reaches up to its highest zone
    const yHi = topBand.openingBottomMm + topBand.openingHeightMm - g;
    const n = list.length;
    const height = Math.max(0, yHi - yLo);
    if (first.kind === 'DOOR') {
      // The doors hang between the hinge boards of this row (layoutZones), so they share the compartments, not the whole opening.
      const boardEdges = (band.partitions ?? []).map((p) => p.edge);
      const row = insetRowOf(n, boardEdges, lo - g, hi + g, (band.partitions ?? []).map((p) => p.widthMm), g);
      list.forEach((f) => rect.set(f, { xMm: row.doors[f.index].xMm, widthMm: row.doors[f.index].widthMm, yMm: yLo, heightMm: height }));
    } else if (first.kind === 'DRAWER') {
      const h = half(Math.max(0, (height - (n - 1) * g) / n));
      list.forEach((f) => rect.set(f, { xMm: lo, widthMm: Math.max(0, hi - lo), yMm: yHi - (f.index + 1) * h - f.index * g, heightMm: h }));
    } else {
      list.forEach((f) => rect.set(f, { xMm: lo, widthMm: Math.max(0, hi - lo), yMm: yLo, heightMm: height }));
    }
  });
  return {
    facades: plan.facades.map((f) => (f.kind === 'FILLER' ? f : { ...f, ...rect.get(f)! })),
    channels: [],
    ...(plan.channels.length > 0 ? { golaDroppedByInset: true } : {}),
  };
}
