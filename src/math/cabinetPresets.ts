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
  WallSide,
} from '../types/flatma';
import { LIMITS } from './constants';
import { clampInt } from './utils';
import { golaSlotsOf } from './gola';
import { APPLIANCES, zonesOf } from './zones';
import { openingModeOf } from './partsEngine';

export type CabinetSubtype =
  // 1. الخزائن العلوية (Wall Cabinets)
  | 'Ceiling_Height' | 'Standard_Wall' | 'Lift_Up' | 'Glass_Front' | 'Over_Fridge' | 'Open_Shelving' | 'Double_Depth'
  // 2. الخزائن السفلية (Base Cabinets)
  | 'Washer_Niche' | 'Cooktop_Base' | 'Deep_Drawers' | 'Pull_Out_Sink' | 'Cargo_Pull_Out' | 'Panel_Ready' | 'Push_To_Open_Base' | 'Hinged_Pull_Out_Trays'
  // 3. الخزائن الطولية / العمودية (Tall & Pantry Cabinets)
  | 'Tall_Pantry_Cargo' | 'Pocket_Door_Pantry' | 'Built_In_Appliance' | 'Tandem_Pantry' | 'Push_To_Open_Tall'
  // 4. خزائن الزوايا والأركان (Corner Cabinets)
  | 'Magic_Corner' | 'Lazy_Susan' | 'Corner_Drawers' | 'LeMans_Curve' | 'Blind_Corner' | 'Diagonal_Corner';

export type SubtypeGroup = 'wall' | 'base' | 'tall' | 'corner';

export const GROUP_LABELS: Record<SubtypeGroup, string> = {
  wall: '1. الخزائن العلوية والسقفية',
  base: '2. الخزائن السفلية والحركية',
  tall: '3. وحدات المؤونة الطولية',
  corner: '4. حلول الأركان والزوايا',
};

export interface SubtypePreset {
  group: SubtypeGroup;
  label: string;
  category: CabinetCategory;
  /** Interior zones, bottom -> top. */
  zones: CabinetZone[];
  openingMode?: OpeningMode;
  frontStyle?: 'SOLID' | 'GLASS';
  dims: { width: number; height: number; depth: number };
  preferLift?: boolean;
  /** What the engine (3D / BOM / cost) does NOT model for this subtype. Shown to the user, never hidden. */
  note?: string;
}

const doors = (count: number, shelves = 0, heightMm?: number): CabinetZone => ({ kind: 'DOORS', count, shelves, heightMm });
const drawers = (count: number, heightMm?: number): CabinetZone => ({ kind: 'DRAWERS', count, heightMm });
const openShelves = (shelves: number): CabinetZone => ({ kind: 'OPEN', shelves });
const appliance = (kind: ApplianceKind, heightMm?: number, panelFront = false): CabinetZone => ({ kind: 'APPLIANCE', appliance: kind, heightMm, panelFront });
const apron = (heightMm: number): CabinetZone => ({ kind: 'APRON', heightMm });

const WALL = { width: 600, height: 720, depth: 350 };
const BASE = { width: 600, height: 870, depth: 600 };
const TALL = { width: 600, height: 2200, depth: 600 };
const CORNER = { width: 1050, height: 870, depth: 600 };

export const SUBTYPE_PRESETS: Record<CabinetSubtype, SubtypePreset> = {
  // ---- wall
  Standard_Wall: { group: 'wall', label: 'خزانة علوية قياسية', category: 'WALL_UNIT', zones: [doors(2, 1)], dims: WALL },
  Ceiling_Height: { group: 'wall', label: 'الخزائن الممتدة للسقف (طابقان)', category: 'WALL_UNIT', zones: [doors(2, 1, 700), doors(2)], dims: { width: 600, height: 1100, depth: 350 }, note: 'الارتفاع 1100 مم افتراضي: عدّله حسب سقف الغرفة (الطابق العلوي يأخذ الباقي تلقائياً).' },
  Lift_Up: { group: 'wall', label: 'الخزائن الهيدروليكية (Lift-up)', category: 'WALL_UNIT', zones: [doors(1)], dims: WALL, preferLift: true },
  Glass_Front: { group: 'wall', label: 'الخزائن الزجاجية الفاخرة', category: 'WALL_UNIT', zones: [doors(2, 1)], frontStyle: 'GLASS', dims: WALL, note: 'إطار ألمنيوم ولوح زجاجي: تُسعَّر الواجهة بسعر خامة الواجهة المختارة (اختر خامة الزجاج). إضاءة LED غير مجسَّدة.' },
  Over_Fridge: { group: 'wall', label: 'الخزانة فوق الثلاجة عمق 60سم', category: 'WALL_UNIT', zones: [doors(2)], dims: { width: 900, height: 450, depth: 600 } },
  Open_Shelving: { group: 'wall', label: 'رفوف مفتوحة بدون أبواب', category: 'WALL_UNIT', zones: [openShelves(3)], dims: WALL },
  Double_Depth: { group: 'wall', label: 'خزانة علوية بعمق مزدوج', category: 'WALL_UNIT', zones: [doors(2, 1, 380), doors(2, 1)], dims: WALL, note: 'الطابق السفلي يتراجع 120 مم في 3D (عمق مزدوج)؛ قائمة القطع والتسعير بعمق واحد.' },
  // ---- base
  Deep_Drawers: { group: 'base', label: 'وحدات الأدراج العميق (Deep Drawers)', category: 'BASE_UNIT', zones: [drawers(2)], dims: BASE },
  Pull_Out_Sink: { group: 'base', label: 'خزانة الحوض بسحب أمامي', category: 'BASE_UNIT', zones: [doors(2), apron(150)], dims: { width: 800, height: 870, depth: 600 }, note: 'الدرج U حول السيفون مجسَّد في 3D، وصفيحة حماية القاع تظهر إن وُجدت في المخزن؛ كلاهما خارج قائمة القطع.' },
  Cargo_Pull_Out: { group: 'base', label: 'صيدلية التوابل العمودية', category: 'BASE_UNIT', zones: [drawers(1)], dims: { width: 300, height: 870, depth: 600 }, note: 'السلال العمودية المنزلقة مجسَّدة في 3D؛ لا تدخل قائمة القطع.' },
  Panel_Ready: { group: 'base', label: 'خزانة جاهزة لتركيب الواجهة (Panel Ready)', category: 'BASE_UNIT', zones: [appliance('DISHWASHER', undefined, true)], dims: { width: 636, height: 870, depth: 600 }, note: 'غسالة الصحون يوفرها الزبون: الفتحة بلا قاع ولا ظهر، والواجهة لوح مطابق للمطبخ.' },
  Washer_Niche: { group: 'base', label: 'خزانة الغسالة (غسالة ملابس)', category: 'BASE_UNIT', zones: [appliance('WASHER')], dims: { width: 636, height: 870, depth: 600 }, note: 'الغسالة يوفرها الزبون: الفتحة بلا قاع ولا ظهر.' },
  Cooktop_Base: { group: 'base', label: 'خزانة سفلية بموقد غاز (Hob)', category: 'BASE_UNIT', zones: [drawers(3)], dims: BASE, note: 'الموقد يُرسم فوق السطح في 3D فقط، ولا يدخل في قائمة القطع.' },
  Push_To_Open_Base: { group: 'base', label: 'خزانة سفلية بفتح بالضغط', category: 'BASE_UNIT', zones: [drawers(3)], openingMode: 'PUSH', dims: BASE, note: 'تُسعَّر آلية الضغط لكل واجهة إن وُجد في المخزن صنف من فئة Push-Open Systems.' },
  Hinged_Pull_Out_Trays: { group: 'base', label: 'الخزائن ذات الأرفف السحابة', category: 'BASE_UNIT', zones: [doors(2, 2)], dims: BASE, note: 'الأرفف السحّابة مجسَّدة كسلال منزلقة في 3D؛ قائمة القطع تحسبها رفوفاً.' },
  // ---- tall
  Tall_Pantry_Cargo: { group: 'tall', label: 'خزانة المؤونة بسحب كلي', category: 'BASE_UNIT', zones: [doors(2, 4)], dims: TALL, note: 'السلال المعدنية المنزلقة مجسَّدة في 3D؛ قائمة القطع تحسبها رفوفاً.' },
  Tandem_Pantry: { group: 'tall', label: 'خزانة المؤونة الترادفتية', category: 'BASE_UNIT', zones: [doors(2, 4)], dims: TALL, note: 'إطاران ترادفيان منزلقان مجسَّدان في 3D؛ قائمة القطع تحسبها رفوفاً.' },
  Built_In_Appliance: { group: 'tall', label: 'دولاب الأجهزة المدمجة', category: 'BASE_UNIT', zones: [drawers(1, 380), appliance('OVEN', 595), appliance('MICROWAVE', 380), doors(2, 1)], dims: TALL },
  Pocket_Door_Pantry: { group: 'tall', label: 'خزانة الأبواب المخفية المطوية', category: 'BASE_UNIT', zones: [doors(2, 4)], dims: TALL, note: 'الأبواب المطوية مجسَّدة في 3D (ورقتان لكل باب)؛ قائمة القطع تحسب بابين عاديين.' },
  Push_To_Open_Tall: { group: 'tall', label: 'الدولاب الطولي بفتح بالضغط', category: 'BASE_UNIT', zones: [doors(2, 4)], openingMode: 'PUSH', dims: TALL, note: 'تُسعَّر آلية الضغط لكل باب إن وُجد في المخزن صنف من فئة Push-Open Systems.' },
  // ---- corner
  Magic_Corner: { group: 'corner', label: 'خزانة الزاوية السحرية', category: 'BASE_UNIT', zones: [doors(2, 1)], dims: CORNER, note: 'السلال المتحركة مجسَّدة في 3D؛ لا تدخل قائمة القطع.' },
  Lazy_Susan: { group: 'corner', label: 'خزانة ليزي سوزان 360 درجة', category: 'BASE_UNIT', zones: [doors(2)], dims: CORNER, note: 'الصينيتان الدوّارتان 360° مجسَّدتان في 3D؛ لا تدخلان قائمة القطع.' },
  Corner_Drawers: { group: 'corner', label: 'أدراج الزاوية المتداخلة 90', category: 'BASE_UNIT', zones: [drawers(2)], dims: CORNER, note: 'تداخل الأدراج بزاوية 90° يُرسم كأدراج مستقيمة.' },
  LeMans_Curve: { group: 'corner', label: 'خزانة السحب المنحني LeMans', category: 'BASE_UNIT', zones: [doors(2)], dims: CORNER, note: 'الصينيات المنحنية المنزلقة مجسَّدة في 3D؛ لا تدخل قائمة القطع.' },
  Blind_Corner: { group: 'corner', label: 'خزانة الزاوية العادية الممتدة', category: 'BASE_UNIT', zones: [doors(1, 1)], dims: CORNER, note: 'الجزء الأعمى الممتد يُرسم كصندوق مستطيل.' },
  Diagonal_Corner: { group: 'corner', label: 'خزانة الزاوية المائلة 45 درجة', category: 'BASE_UNIT', zones: [doors(1, 1)], dims: CORNER, note: 'الواجهة المائلة 45° مجسَّدة في 3D؛ قائمة القطع تبقى كصندوق مستطيل.' },
};

export const SUBTYPES = Object.keys(SUBTYPE_PRESETS) as CabinetSubtype[];

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
export const doorHardwareCategories = (category: CabinetCategory): HardwareCategory[] =>
  category === 'WALL_UNIT' ? ['Cabinet Hinges', 'Overhead Lift Systems'] : ['Cabinet Hinges'];
export const drawerHardwareCategories = (): HardwareCategory[] => ['Drawer Slide Systems'];

/** Which stock categories can drive this kind of front (kept for the old single-front callers). */
export function compatibleHardwareCategories(category: CabinetCategory, openingType: FrontOpeningType): HardwareCategory[] {
  if (openingType === 'NONE') return [];
  return openingType === 'DRAWERS' ? drawerHardwareCategories() : doorHardwareCategories(category);
}

/** A sheet thick enough to be a carcase: never default to a 3 mm HDF back sheet just because it was typed first. */
function defaultSheet(woods: InjectedWoodMaterial[]): InjectedWoodMaterial | undefined {
  return woods.find((m) => m.thickness >= 15) ?? woods[0];
}

const APPLIANCE_KINDS = Object.keys(APPLIANCES) as ApplianceKind[];

function normalizeZone(z: CabinetZone, category: CabinetCategory): CabinetZone {
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

  const doorZones = zones.filter((z) => z.kind === 'DOORS');
  const drawerZones = zones.filter((z) => z.kind === 'DRAWERS');
  const hasFronts = doorZones.length + drawerZones.length > 0;

  // Opening mode: Gola needs a base unit that is one single doors / drawers zone; no fronts = nothing to open.
  const golaOk = d.category === 'BASE_UNIT' && zones.length === 1 && hasFronts;
  d.openingMode = !hasFronts ? 'HANDLE' : d.openingMode === 'GOLA' && !golaOk ? 'HANDLE' : d.openingMode ?? 'HANDLE';
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
  const drawersOnly = !d.zones.some((z) => z.kind === 'DOORS');
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
export function draftToNewCabinet(d: CabinetDraft, meta: { id: string; name: string; positionX: number; wall?: WallSide }): NewCabinetFields {
  return {
    id: meta.id,
    name: meta.name,
    subtype: d.subtype,
    category: d.category,
    width: d.width,
    height: d.height,
    depth: d.depth,
    positionX: meta.positionX,
    wall: meta.wall ?? 'BACK',
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
    frontStyle: d.frontStyle,
  };
}

/** Fields written back when an existing cabinet is edited. Position is decided by the caller. */
export function draftToCabinetPatch(d: CabinetDraft): Partial<CabinetObject> {
  const { id, name, positionX, wall, positionY, positionZ, ...patch } = draftToNewCabinet(d, { id: '', name: '', positionX: 0 });
  void id; void name; void positionX; void wall; void positionY; void positionZ;
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
export function draftToPreviewCabinet(d: CabinetDraft, woods: InjectedWoodMaterial[], edgeRolls: EdgeBandRoll[] = []): CabinetObject {
  const carcase = woods.find((m) => m.id === d.carcaseMaterialId);
  const front = woods.find((m) => m.id === d.frontMaterialId);
  return {
    ...draftToNewCabinet(d, { id: 'preview', name: 'preview', positionX: 0 }),
    carcaseThickness: carcase ? carcase.thickness : 18,
    frontThickness: front ? front.thickness : 18,
    carcaseEdgeMm: edgeRolls.find((r) => r.id === d.carcaseEdgeRollId)?.thickness,
    frontEdgeMm: edgeRolls.find((r) => r.id === d.frontEdgeRollId)?.thickness,
    calculatedCostDA: 0,
  };
}
