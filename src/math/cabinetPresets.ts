// src/math/cabinetPresets.ts
// ONE model of a cabinet for the whole app. A subtype is only a PRESET of the real configuration: a list of ZONES
// (doors, drawers, open shelves, appliance niche, fixed apron), an opening mode and the dimensions. Everything stays
// editable and the preview renders the very same object the showcase will (see math/zones.ts).
import {
  ApplianceKind,
  CabinetCategory,
  CabinetObject,
  CabinetZone,
  EdgeBandRoll,
  FrontOpeningType,
  HardwareCategory,
  InjectedHardwareItem,
  InjectedWoodMaterial,
  OpeningMode,
} from '../types/flatma';
import { LIMITS } from './constants';
import { clampInt } from './utils';
import { golaSlotsOf } from './gola';
import { APPLIANCES, zonesOf } from './zones';
import { CabinetSubtype, SUBTYPES, TEMPLATES, TemplateDef } from '../rules/templates';
import { hardwareCategoriesFor, hardwareKindOfZone, validKinematic } from '../rules/kinematics';
import { openingModeOf, resolveOpeningMode } from '../rules/openings';
import { dividerBoardsOf } from '../rules/construction';

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
}

export function draftFromPreset(
  subtype: CabinetSubtype,
  keep?: Partial<Pick<CabinetDraft, 'carcaseMaterialId' | 'frontMaterialId' | 'carcaseEdgeRollId' | 'frontEdgeRollId'>>,
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
  return kinematic ? { ...n, kinematic } : n;
}

function normalizeZoneShape(z: CabinetZone, category: CabinetCategory): CabinetZone {
  let kind = z.kind;
  if (kind === 'DRAWERS' && category === 'WALL_UNIT') kind = 'DOORS'; // no drawers in a wall unit
  const height = typeof z.heightMm === 'number' && Number.isFinite(z.heightMm) && z.heightMm > 0
    ? clampInt(z.heightMm, LIMITS.ZONE_HEIGHT_MM[0], LIMITS.ZONE_HEIGHT_MM[1], LIMITS.ZONE_HEIGHT_MM[0])
    : undefined;
  if (kind === 'DOORS') return { kind, heightMm: height, count: clampInt(z.count, LIMITS.FRONT_ELEMENTS[0], LIMITS.FRONT_ELEMENTS[1], 2), shelves: clampInt(z.shelves, LIMITS.SHELVES[0], LIMITS.SHELVES[1], 0) };
  if (kind === 'DRAWERS') return { kind, heightMm: height, count: clampInt(z.count, LIMITS.FRONT_ELEMENTS[0], LIMITS.FRONT_ELEMENTS[1], 2) };
  if (kind === 'OPEN') return { kind, heightMm: height, shelves: clampInt(z.shelves, LIMITS.SHELVES[0], LIMITS.SHELVES[1], 0) };
  if (kind === 'APRON') return { kind, heightMm: height };
  const appliance = z.appliance && APPLIANCE_KINDS.includes(z.appliance) ? z.appliance : 'OVEN';
  return { kind: 'APPLIANCE', heightMm: height, appliance, panelFront: !!z.panelFront && (appliance === 'DISHWASHER' || appliance === 'FRIDGE') };
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
  d.zones = zones;

  // Which hardware pickers the cabinet needs follows each zone's mechanism: hinged / lifting doors want hinges or a lift,
  // drawers and pull-out frames (doors or drawers) want runners.
  const doorZones = zones.filter((z) => hardwareKindOfZone(z) === 'DOOR');
  const drawerZones = zones.filter((z) => hardwareKindOfZone(z) === 'DRAWER');

  // Opening mode: the rules live in rules/openings.ts (Gola only where canUseGola; no fronts = nothing to open).
  d.openingMode = resolveOpeningMode(d.openingMode, d.category, zones);
  d.dividerBoards = zones.length > 1 && d.dividerBoards === 2 ? 2 : 1; // a divider needs two zones
  d.golaSlots = d.openingMode === 'GOLA'
    ? golaSlotsOf({ openingType: zones[0].kind as FrontOpeningType, elementCount: zones[0].count ?? 1, hasGolaProfile: true, golaSlots: raw.golaSlots })
    : [];

  // Hardware: hinges / lift for the doors, runners for the drawers.
  const preferLift = !!SUBTYPE_PRESETS[d.subtype]?.preferLift;
  const doorOptions = hardware.filter((h) => doorHardwareCategories(d.category).includes(h.category));
  const drawerOptions = hardware.filter((h) => drawerHardwareCategories().includes(h.category));
  d.hardwareItemId = doorZones.length === 0 ? ''
    : (doorOptions.find((h) => h.id === d.hardwareItemId)
      ?? (preferLift ? doorOptions.find((h) => h.category === 'Overhead Lift Systems') : undefined)
      ?? doorOptions[0])?.id ?? '';
  d.drawerHardwareItemId = drawerZones.length === 0 ? '' : (drawerOptions.find((h) => h.id === d.drawerHardwareItemId) ?? drawerOptions[0])?.id ?? '';
  d.frontStyle = doorZones.length > 0 && d.frontStyle === 'GLASS' ? 'GLASS' : 'SOLID';

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

function frontConfigOf(d: CabinetDraft): CabinetObject['frontConfig'] {
  const { openingType, elementCount } = primaryFront(d.zones);
  const drawersOnly = !d.zones.some((z) => hardwareKindOfZone(z) === 'DOOR');
  return {
    openingType,
    elementCount,
    // Old callers read ONE hardware id for the first facade group: runners on a drawers-only cabinet, hinges / lift otherwise.
    hardwareItemId: drawersOnly ? d.drawerHardwareItemId : d.hardwareItemId,
    drawerHardwareItemId: d.drawerHardwareItemId || undefined,
    hasGolaProfile: d.openingMode === 'GOLA',
    golaSlots: d.openingMode === 'GOLA' && openingType === 'DRAWERS' ? d.golaSlots : undefined,
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
    zones: d.zones.map((z) => ({ ...z })),
    openingMode: d.openingMode,
    dividerBoards: d.dividerBoards === 2 ? 2 : undefined,
    frontStyle: d.frontStyle,
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
  const zones = zonesOf(c).map((z) => ({ ...z }));
  const hasDoors = zones.some((z) => z.kind === 'DOORS');
  const hasDrawers = zones.some((z) => z.kind === 'DRAWERS');
  return {
    subtype: known ?? (c.category === 'WALL_UNIT' ? 'Standard_Wall' : 'Deep_Drawers'),
    category: c.category,
    width: c.width,
    height: c.height,
    depth: c.depth,
    zones,
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
  };
}

/** The throw-away cabinet the preview renders: same object, same assembly components as the showcase. */
export function draftToPreviewCabinet(d: CabinetDraft, woods: InjectedWoodMaterial[]): CabinetObject {
  const carcase = woods.find((m) => m.id === d.carcaseMaterialId);
  const front = woods.find((m) => m.id === d.frontMaterialId);
  return {
    ...draftToNewCabinet(d, { id: 'preview', name: 'preview', positionX: 0 }),
    carcaseThickness: carcase ? carcase.thickness : 18,
    frontThickness: front ? front.thickness : 18,
    calculatedCostDA: 0,
  };
}
