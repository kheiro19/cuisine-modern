// src/math/cabinetPresets.ts
// ONE model of a cabinet for the whole app. A subtype is only a PRESET of the real configuration: a list of ZONES
// (doors, drawers, open shelves, appliance niche, fixed apron), an opening mode and the dimensions. Everything stays
// editable and the preview renders the very same object the showcase will (see math/zones.ts).
import {
  ApplianceKind,
  CabinetCategory,
  CabinetBase,
  CabinetObject,
  CabinetZone,
  EdgeBandRoll,
  FrontOpeningType,
  HardwareCategory,
  InjectedHardwareItem,
  InjectedWoodMaterial,
  OpeningMode,
  WallMount,
  ZoneSplit,
} from '../types/flatma';
import { LIMITS, PANEL, SPLIT } from './constants';
import { clampInt } from './utils';
import { golaSlotsOf } from './gola';
import { APPLIANCES, isOpenCarcase, zonesOf } from './zones';
import { BackPanelMode, backPanelModeOf } from './backPanel';
import { COLUMN_FILLS, canSplitZone, frontHardwareNeeds } from './columns';
import { CabinetSubtype, SUBTYPES, TEMPLATES, TemplateDef } from '../rules/templates';
import { hardwareCategoriesFor, hardwareKindOfZone, validKinematic } from '../rules/kinematics';
import { liftZoneIsTop, openingModeOf, resolveOpeningMode, resolveZoneOpeningMode } from '../rules/openings';
import { maxFrontThicknessOf, zoneFrontChoicesOf } from './zoneFronts';
import { dividerBoardsOf } from '../rules/construction';
import { OPEN_BAY_APPLIANCES, nicheOf } from '../rules/appliances';
import { getAccessory } from '../data/accessoryCatalog';
import { applianceKindOfItem } from './applianceModels';

// القوالب نفسها (البيانات) في src/rules/templates/<family>.ts، ولكل عائلة ملفها. هنا فقط المسودة (draft) والتحويلات.
export { SUBTYPES };
export type { CabinetSubtype };
export type SubtypePreset = TemplateDef;
export const SUBTYPE_PRESETS: Record<CabinetSubtype, TemplateDef> = TEMPLATES;

// ------------------------------------------------------------------------------------------------ draft

/** Everything the form edits. Same fields as the real cabinet, nothing more. */
export interface CabinetDraft {
  subtype: CabinetSubtype;
  category: CabinetCategory;
  width: number;
  height: number;
  depth: number;
  /** Interior zones, bottom -> top (the form shows them top -> bottom). */
  zones: CabinetZone[];
  /** Wall units only: where the unit hangs (missing = the standard gap above the worktop). */
  wallMount?: WallMount;
  openingMode: OpeningMode;
  /** Boards between two zones: 1 shared board, or 2 glued face to face. */
  dividerBoards: 1 | 2;
  frontStyle: 'SOLID' | 'GLASS';
  /** Gola, single doors / drawers zone only: channel above drawer k (k counted from the top). See math/gola.ts. */
  golaSlots: number[];
  carcaseMaterialId: string;
  frontMaterialId: string;
  /** EdgeBandRoll id from the stock ('' = none chosen) */
  carcaseEdgeRollId: string;
  frontEdgeRollId: string;
  /** Hinges or lift, for the DOORS zones. */
  hardwareItemId: string;
  /** Runners, for the DRAWERS zones. */
  drawerHardwareItemId: string;
  /** A template may ask for an overhead lift instead of hinges when none is picked (the old lift-up unit). Missing = hinges. */
  preferLift?: boolean;
  /** What a floor unit stands on (math/base.ts). Missing = a legacy cabinet: nothing drawn, 4 legs counted as before. */
  base?: CabinetBase;
  /** What closes the back (math/backPanel.ts): HDF sheet, two carcase rails, or a full carcase board. Missing = HDF. */
  backPanel?: BackPanelMode;
  /** RAILS only: depth of each rail up the back (mm). Missing = the default. */
  backRailDepthMm?: number;
}

/** The base as the form keeps it: a known type, numbers as whole millimetres. The limits themselves are applied by math/base.ts. */
function normalizeBase(b: CabinetBase | undefined): CabinetBase | undefined {
  if (!b || !['NONE', 'LEGS', 'PLINTH', 'WOOD'].includes(b.type)) return undefined;
  const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : undefined);
  const out: CabinetBase = { type: b.type };
  const h = num(b.heightMm), f = num(b.frontSetbackMm), k = num(b.backSetbackMm), n = num(b.legCount);
  if (h !== undefined) out.heightMm = h;
  if (f !== undefined) out.frontSetbackMm = f;
  if (k !== undefined) out.backSetbackMm = k;
  if (n !== undefined && n > 0) out.legCount = n;
  if (b.plinthMaterial === 'BOARD' || b.plinthMaterial === 'PVC') out.plinthMaterial = b.plinthMaterial;
  return out;
}

export function draftFromPreset(
  subtype: CabinetSubtype,
  keep?: Partial<Pick<CabinetDraft, 'carcaseMaterialId' | 'frontMaterialId' | 'carcaseEdgeRollId' | 'frontEdgeRollId' | 'base'>>,
): CabinetDraft {
  const p = SUBTYPE_PRESETS[subtype];
  return {
    subtype,
    category: p.category,
    width: p.dims.width,
    height: p.dims.height,
    depth: p.dims.depth,
    zones: p.zones.map((z) => ({ ...z })),
    openingMode: p.openingMode ?? 'HANDLE',
    dividerBoards: 1,
    frontStyle: p.frontStyle ?? 'SOLID',
    golaSlots: [],
    carcaseMaterialId: keep?.carcaseMaterialId ?? '',
    frontMaterialId: keep?.frontMaterialId ?? '',
    carcaseEdgeRollId: keep?.carcaseEdgeRollId ?? '',
    frontEdgeRollId: keep?.frontEdgeRollId ?? '',
    hardwareItemId: '', // re-picked automatically for the kind of fronts
    drawerHardwareItemId: '',
    ...(p.preferLift ? { preferLift: true } : {}),
    // A floor unit stands on adjustable legs (100 mm) unless the user chooses otherwise; a wall unit hangs.
    ...(p.category === 'BASE_UNIT' ? { base: keep?.base ?? { type: 'LEGS' as const } } : {}), // the base chosen so far survives a change of template
  };
}

/** Stock categories that can drive DOORS (hinges; a wall unit may also take a lift) and DRAWERS (runners). */
export const doorHardwareCategories = (category: CabinetCategory): HardwareCategory[] => hardwareCategoriesFor('DOOR', category);
export const drawerHardwareCategories = (category?: CabinetCategory): HardwareCategory[] => hardwareCategoriesFor('DRAWER', category);

/** A sheet thick enough to be a carcase: never default to a 3 mm HDF back sheet just because it was typed first. */
function defaultSheet(woods: InjectedWoodMaterial[]): InjectedWoodMaterial | undefined {
  return woods.find((m) => m.thickness >= 15) ?? woods[0];
}

const APPLIANCE_KINDS = Object.keys(APPLIANCES) as ApplianceKind[];

/** Shape + limits of a zone, then its mechanism: kept only if that mechanism can move this kind of zone in this category. */
function normalizeZone(z: CabinetZone, category: CabinetCategory): CabinetZone {
  const n = normalizeZoneShape(z, category);
  const kinematic = validKinematic(z.kinematic, n.kind, category);
  const split = normalizeSplit(z, n);
  const own = normalizeZoneFronts(z, n, category);
  return kinematic || split || own ? { ...n, ...(kinematic ? { kinematic } : {}), ...(split ? { split } : {}), ...own } : n;
}

/**
 * What the zone chooses for its own fronts (front sheet, band roll, opening mode): kept only on a zone that has fronts, and the
 * opening mode only where it can work (Gola needs a doors / drawers zone in a category that takes it). Stock ids are checked in resolveDraft.
 */
function normalizeZoneFronts(z: CabinetZone, n: CabinetZone, category: CabinetCategory): Pick<CabinetZone, 'frontMaterialId' | 'frontEdgeRollId' | 'openingMode' | 'grainDirection' | 'grainFlip'> | undefined {
  const hasFronts = n.kind === 'DOORS' || n.kind === 'DRAWERS' || n.kind === 'APRON' || (n.kind === 'APPLIANCE' && !!n.panelFront);
  if (!hasFronts) return undefined;
  const openingMode = resolveZoneOpeningMode(z.openingMode, category, n);
  const out = {
    ...(z.frontMaterialId ? { frontMaterialId: z.frontMaterialId } : {}),
    ...(z.frontEdgeRollId ? { frontEdgeRollId: z.frontEdgeRollId } : {}),
    ...(openingMode ? { openingMode } : {}),
    ...(z.grainDirection ? { grainDirection: z.grainDirection } : {}),
    ...(z.grainFlip ? { grainFlip: true } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

/** A vertical board only splits a doors / appliance zone; a bad side, width or fill falls back to the default. */
function normalizeSplit(z: CabinetZone, n: CabinetZone): ZoneSplit | undefined {
  if (!z.split || !canSplitZone(n)) return undefined;
  const w = z.split.mainWidthMm;
  const mainWidthMm = typeof w === 'number' && Number.isFinite(w) && w > 0 ? clampInt(w, SPLIT.MIN_COLUMN_MM, LIMITS.WIDTH_MM[1], SPLIT.MIN_COLUMN_MM) : undefined;
  const fill = z.split.fill && (z.split.fill === 'AUTO' || COLUMN_FILLS.includes(z.split.fill as never)) ? z.split.fill : 'AUTO';
  return { mainSide: z.split.mainSide === 'RIGHT' ? 'RIGHT' : 'LEFT', ...(mainWidthMm !== undefined ? { mainWidthMm } : {}), fill, ...(z.split.joinBelow ? { joinBelow: true } : {}) };
}

/** Which hinge / runner pickers a draft needs, a split's small door or spice rack included. `d` must be resolved. */
export function frontHardwareNeedsOf(d: Pick<CabinetDraft, 'zones' | 'width'>, woods: InjectedWoodMaterial[], carcaseMaterialId?: string) {
  const sheet = woods.find((m) => m.id === carcaseMaterialId) ?? defaultSheet(woods);
  return frontHardwareNeeds(d.zones, { width: d.width }, sheet?.thickness ?? PANEL.DEFAULT_THICKNESS_MM, isOpenCarcase(d.zones));
}

/** Per-door hinge sides and the shared-board flag of a doors zone: cut to the number of doors, and dropped when they say nothing. */
function doorOpeningFields(z: CabinetZone): Pick<CabinetZone, 'hingeSides' | 'sharedHingeBoard'> {
  const count = clampInt(z.count, LIMITS.FRONT_ELEMENTS[0], LIMITS.FRONT_ELEMENTS[1], 2);
  const sides = Array.from({ length: count }, (_, k): 'LEFT' | 'RIGHT' | 'AUTO' => (z.hingeSides?.[k] === 'LEFT' || z.hingeSides?.[k] === 'RIGHT' ? z.hingeSides[k] : 'AUTO'));
  return { ...(sides.some((x) => x !== 'AUTO') ? { hingeSides: sides } : {}), ...(z.sharedHingeBoard ? { sharedHingeBoard: true } : {}) };
}

function normalizeZoneShape(z: CabinetZone, category: CabinetCategory): CabinetZone {
  let kind = z.kind;
  if (kind === 'DRAWERS' && category === 'WALL_UNIT') kind = 'DOORS'; // no drawers in a wall unit
  const height = typeof z.heightMm === 'number' && Number.isFinite(z.heightMm) && z.heightMm > 0
    ? clampInt(z.heightMm, LIMITS.ZONE_HEIGHT_MM[0], LIMITS.ZONE_HEIGHT_MM[1], LIMITS.ZONE_HEIGHT_MM[0])
    : undefined;
  if (kind === 'DOORS') return { kind, heightMm: height, count: clampInt(z.count, LIMITS.FRONT_ELEMENTS[0], LIMITS.FRONT_ELEMENTS[1], 2), shelves: clampInt(z.shelves, LIMITS.SHELVES[0], LIMITS.SHELVES[1], 0), ...(z.hingeSide === 'LEFT' || z.hingeSide === 'RIGHT' ? { hingeSide: z.hingeSide } : {}), ...doorOpeningFields(z) };
  if (kind === 'DRAWERS') return { kind, heightMm: height, count: clampInt(z.count, LIMITS.FRONT_ELEMENTS[0], LIMITS.FRONT_ELEMENTS[1], 2) };
  if (kind === 'OPEN') return { kind, heightMm: height, shelves: clampInt(z.shelves, LIMITS.SHELVES[0], LIMITS.SHELVES[1], 0) };
  if (kind === 'APRON') return { kind, heightMm: height };
  const appliance = z.appliance && APPLIANCE_KINDS.includes(z.appliance) ? z.appliance : 'OVEN';
  // The real size of the appliance (each side the user left empty stays the standard of its kind) and the piece of the library drawn in the niche.
  const size: { w?: number; h?: number; d?: number } = {};
  for (const k of ['w', 'h', 'd'] as const) {
    const v = z.applianceSizeMm?.[k];
    if (typeof v === 'number' && Number.isFinite(v) && v > 0) size[k] = clampInt(v, 50, 2700, v);
  }
  const item = z.libraryApplianceId ? getAccessory(z.libraryApplianceId) : undefined;
  return {
    kind: 'APPLIANCE',
    heightMm: height,
    appliance,
    panelFront: !!z.panelFront && OPEN_BAY_APPLIANCES.includes(appliance),
    ...(Object.keys(size).length > 0 ? { applianceSizeMm: size } : {}),
    ...(item && applianceKindOfItem(item) === appliance ? { libraryApplianceId: item.id } : {}),
  };
}

/**
 * The cabinet that fits the appliance of its niche: the width of a cabinet holding only the appliance (niche + 4 mm clearance + the two
 * sides), and the height and the depth when they are too small. Returns only what must change; the user decides to apply it.
 */
export function fitCabinetToAppliance(
  d: Pick<CabinetDraft, 'width' | 'height' | 'depth' | 'zones'>,
  th: number,
): Partial<Pick<CabinetDraft, 'width' | 'height' | 'depth'>> {
  const zone = d.zones.find((z) => z.kind === 'APPLIANCE' && z.appliance);
  const n = zone ? nicheOf(zone) : undefined;
  if (!n) return {};
  const out: Partial<Pick<CabinetDraft, 'width' | 'height' | 'depth'>> = {};
  if (d.zones.length === 1) out.width = Math.ceil(n.w + SPLIT.NICHE_CLEARANCE_MM + 2 * th);
  if (isOpenCarcase(d.zones) && n.h + th + 4 > d.height) out.height = Math.ceil(n.h + th + 4); // the opening runs from the floor to the top rails
  if (n.d + 30 > d.depth) out.depth = Math.ceil(n.d + 30);
  return out;
}

/**
 * Makes a draft consistent: numbers clamped to the engine's limits, impossible combinations corrected (no drawers in
 * a wall unit, Gola only on a base unit with a single doors / drawers zone, at least one flexible zone...) and the
 * material / hardware choices filled from the stock. Pure: the form keeps the raw values so typing is never fought,
 * and this is applied for the preview and for saving.
 */
export function resolveDraft(
  raw: CabinetDraft,
  woods: InjectedWoodMaterial[],
  hardware: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
): CabinetDraft {
  const d: CabinetDraft = { ...raw };
  d.width = clampInt(d.width, LIMITS.WIDTH_MM[0], LIMITS.WIDTH_MM[1], LIMITS.WIDTH_MM[0]);
  d.height = clampInt(d.height, LIMITS.HEIGHT_MM[0], LIMITS.HEIGHT_MM[1], LIMITS.HEIGHT_MM[0]);
  d.depth = clampInt(d.depth, LIMITS.DEPTH_MM[0], LIMITS.DEPTH_MM[1], LIMITS.DEPTH_MM[0]);

  let zones = (raw.zones ?? []).slice(0, LIMITS.ZONES[1]).map((z) => normalizeZone(z, d.category));
  if (zones.length === 0) zones = [{ kind: 'DOORS', count: 2, shelves: 0 }];
  if (zones.every((z) => z.heightMm !== undefined)) zones[zones.length - 1] = { ...zones[zones.length - 1], heightMm: undefined }; // the top zone absorbs the rest
  // A zone's own front sheet / band roll that is no longer in stock goes back to "follow the cabinet" ('NONE' = no band stays).
  zones = zones.map((z) => {
    if (!z.frontMaterialId && !z.frontEdgeRollId) return z;
    const { frontMaterialId, frontEdgeRollId, ...rest } = z;
    return {
      ...rest,
      ...(frontMaterialId && woods.some((m) => m.id === frontMaterialId) ? { frontMaterialId } : {}),
      ...(frontEdgeRollId && (frontEdgeRollId === 'NONE' || edgeRolls.some((r) => r.id === frontEdgeRollId)) ? { frontEdgeRollId } : {}),
    };
  });
  d.zones = zones;

  // Which hardware pickers the cabinet needs follows each zone's mechanism: hinged / lifting doors want hinges or a lift,
  // drawers and pull-out frames (doors or drawers) want runners.
  const needs = frontHardwareNeedsOf({ zones, width: d.width }, woods, d.carcaseMaterialId);

  // Opening mode: the rules live in rules/openings.ts (Gola only where canUseGola; no fronts = nothing to open).
  d.openingMode = resolveOpeningMode(d.openingMode, d.category, zones);
  // Only a wall unit hangs; the number is a distance in mm (a ceiling gap, a gap above the worktop or a height above the floor).
  d.wallMount = d.category === 'WALL_UNIT' && raw.wallMount
    ? { from: raw.wallMount.from === 'CEILING' || raw.wallMount.from === 'FLOOR' ? raw.wallMount.from : 'COUNTER', mm: clampInt(raw.wallMount.mm, 0, 4000, 0) }
    : undefined;
  d.dividerBoards = zones.length > 1 && d.dividerBoards === 2 ? 2 : 1; // a divider needs two zones
  d.golaSlots = soleZoneGola(zones, d.openingMode) // slots are chosen on a single drawers zone; a stack gets one channel per zone
    ? golaSlotsOf({ openingType: zones[0].kind as FrontOpeningType, elementCount: zones[0].count ?? 1, hasGolaProfile: true, golaSlots: raw.golaSlots })
    : [];

  // Hardware: hinges / lift for the doors, runners for the drawers.
  const preferLift = !!(d.preferLift ?? SUBTYPE_PRESETS[d.subtype]?.preferLift);
  // An overhead lift only fits a doors zone that is the top (and only) one: otherwise its door would sweep through the zone above.
  const liftFits = liftZoneIsTop(zones);
  const doorOptions = hardware.filter((h) => doorHardwareCategories(d.category).includes(h.category) && (liftFits || h.category !== 'Overhead Lift Systems'));
  const drawerOptions = hardware.filter((h) => drawerHardwareCategories().includes(h.category));
  d.hardwareItemId = !needs.doors ? ''
    : (doorOptions.find((h) => h.id === d.hardwareItemId)
      ?? (preferLift ? doorOptions.find((h) => h.category === 'Overhead Lift Systems') : undefined)
      ?? doorOptions[0])?.id ?? '';
  d.drawerHardwareItemId = !needs.drawers ? '' : (drawerOptions.find((h) => h.id === d.drawerHardwareItemId) ?? drawerOptions[0])?.id ?? '';
  d.frontStyle = needs.doors && d.frontStyle === 'GLASS' ? 'GLASS' : 'SOLID';
  d.base = d.category === 'BASE_UNIT' ? normalizeBase(raw.base) : undefined; // only a floor unit has a base

  const fallback = defaultSheet(woods)?.id ?? '';
  d.carcaseMaterialId = woods.some((m) => m.id === d.carcaseMaterialId) ? d.carcaseMaterialId : fallback;
  d.frontMaterialId = woods.some((m) => m.id === d.frontMaterialId) ? d.frontMaterialId : fallback;
  // A roll that is no longer in stock is dropped (the choice goes back to "none").
  d.carcaseEdgeRollId = edgeRolls.some((r) => r.id === d.carcaseEdgeRollId) ? d.carcaseEdgeRollId : '';
  d.frontEdgeRollId = edgeRolls.some((r) => r.id === d.frontEdgeRollId) ? d.frontEdgeRollId : '';
  return d;
}

// ------------------------------------------------------------------------------- draft <-> cabinet

type NewCabinetFields = Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>;

/** The legacy "first facade group": what old code (stock, list summary, CabinetConfigurator) still reads. */
export function primaryFront(zones: CabinetZone[]): { openingType: FrontOpeningType; elementCount: number } {
  const z = zones.find((x) => x.kind === 'DOORS' || x.kind === 'DRAWERS');
  return z ? { openingType: z.kind as FrontOpeningType, elementCount: z.count ?? 1 } : { openingType: 'NONE', elementCount: 0 };
}

export const totalShelves = (zones: CabinetZone[]): number =>
  zones.reduce((sum, z) => sum + (z.kind === 'DOORS' || z.kind === 'OPEN' ? z.shelves ?? 0 : 0), 0);

/** A cabinet with ONE zone whose fronts open with Gola (its own choice, else the cabinet's): the one place where the user picks the channel slots. */
export const soleZoneGola = (zones: ReadonlyArray<CabinetZone>, cabinetMode: OpeningMode | undefined): boolean =>
  zones.length === 1 && (zones[0].openingMode ?? cabinetMode) === 'GOLA';

function frontConfigOf(d: CabinetDraft): CabinetObject['frontConfig'] {
  const { openingType, elementCount } = primaryFront(d.zones);
  // Hinges are stored first when the cabinet has door fronts; a small door beside an appliance counts (its hinge id is set).
  const drawersOnly = !d.zones.some((z) => hardwareKindOfZone(z) === 'DOOR') && !d.hardwareItemId;
  return {
    openingType,
    elementCount,
    // Old callers read ONE hardware id for the first facade group: runners on a drawers-only cabinet, hinges / lift otherwise.
    hardwareItemId: drawersOnly ? d.drawerHardwareItemId : d.hardwareItemId,
    drawerHardwareItemId: d.drawerHardwareItemId || undefined,
    hasGolaProfile: d.openingMode === 'GOLA',
    golaSlots: soleZoneGola(d.zones, d.openingMode) && openingType === 'DRAWERS' ? d.golaSlots : undefined,
  };
}

/** `d` must already be resolved (resolveDraft). */
export function draftToNewCabinet(d: CabinetDraft, meta: { id: string; name: string; positionX: number }): NewCabinetFields {
  return {
    id: meta.id,
    name: meta.name,
    subtype: d.subtype,
    category: d.category,
    width: d.width,
    height: d.height,
    depth: d.depth,
    positionX: meta.positionX,
    positionY: 0,
    positionZ: 0,
    shelvesCount: totalShelves(d.zones),
    carcaseMaterialId: d.carcaseMaterialId,
    frontMaterialId: d.frontMaterialId,
    carcaseEdgeRollId: d.carcaseEdgeRollId || undefined,
    frontEdgeRollId: d.frontEdgeRollId || undefined,
    frontConfig: frontConfigOf(d),
    zones: d.zones.map((z) => (z.split ? { ...z, split: { ...z.split } } : { ...z })),
    wallMount: d.category === 'WALL_UNIT' && d.wallMount ? { ...d.wallMount } : undefined,
    openingMode: d.openingMode,
    dividerBoards: d.dividerBoards === 2 ? 2 : undefined,
    frontStyle: d.frontStyle,
    ...(d.base ? { base: { ...d.base } } : {}),
    ...(d.backPanel && d.backPanel !== 'HDF' ? { backPanel: d.backPanel } : {}),
    ...(d.backPanel === 'RAILS' && d.backRailDepthMm !== undefined ? { backRailDepthMm: d.backRailDepthMm } : {}),
  };
}

/** Fields written back when an existing cabinet is edited. Position is decided by the caller. */
export function draftToCabinetPatch(d: CabinetDraft): Partial<CabinetObject> {
  const { id, name, positionX, positionY, positionZ, ...patch } = draftToNewCabinet(d, { id: '', name: '', positionX: 0 });
  void id; void name; void positionX; void positionY; void positionZ;
  return patch;
}

export function cabinetToDraft(c: CabinetObject): CabinetDraft {
  const known = c.subtype && c.subtype in SUBTYPE_PRESETS ? (c.subtype as CabinetSubtype) : undefined;
  const zones = zonesOf(c).map((z) => (z.split ? { ...z, split: { ...z.split } } : { ...z }));
  const needs = frontHardwareNeeds(zones, c, c.carcaseThickness > 0 ? c.carcaseThickness : PANEL.DEFAULT_THICKNESS_MM, isOpenCarcase(zones));
  const hasDoors = zones.some((z) => z.kind === 'DOORS') || needs.doors;
  const hasDrawers = zones.some((z) => z.kind === 'DRAWERS') || needs.drawers;
  return {
    subtype: known ?? (c.category === 'WALL_UNIT' ? 'Standard_Wall' : 'Standard_Base'),
    category: c.category,
    width: c.width,
    height: c.height,
    depth: c.depth,
    zones,
    ...(c.category === 'WALL_UNIT' && c.wallMount ? { wallMount: { ...c.wallMount } } : {}),
    openingMode: openingModeOf(c),
    dividerBoards: dividerBoardsOf(c),
    frontStyle: c.frontStyle ?? 'SOLID',
    golaSlots: c.frontConfig.golaSlots ?? [],
    carcaseMaterialId: c.carcaseMaterialId,
    frontMaterialId: c.frontMaterialId,
    carcaseEdgeRollId: c.carcaseEdgeRollId ?? '',
    frontEdgeRollId: c.frontEdgeRollId ?? '',
    hardwareItemId: hasDoors ? c.frontConfig.hardwareItemId : '',
    drawerHardwareItemId: hasDrawers ? c.frontConfig.drawerHardwareItemId ?? (hasDoors ? '' : c.frontConfig.hardwareItemId) : '',
    ...(c.base ? { base: { ...c.base } } : {}),
    backPanel: backPanelModeOf(c),
    ...(c.backRailDepthMm !== undefined ? { backRailDepthMm: c.backRailDepthMm } : {}),
  };
}

/** The throw-away cabinet the preview renders: same object, same assembly components as the showcase. */
export function draftToPreviewCabinet(d: CabinetDraft, woods: InjectedWoodMaterial[]): CabinetObject {
  const carcase = woods.find((m) => m.id === d.carcaseMaterialId);
  const front = woods.find((m) => m.id === d.frontMaterialId);
  const frontTh = front ? front.thickness : 18;
  const cabinet = draftToNewCabinet(d, { id: 'preview', name: 'preview', positionX: 0 });
  return {
    ...cabinet,
    carcaseThickness: carcase ? carcase.thickness : 18,
    frontThickness: maxFrontThicknessOf(zoneFrontChoicesOf(cabinet, woods, frontTh), frontTh), // the thickest front sticks out the most
    calculatedCostDA: 0,
  };
}
