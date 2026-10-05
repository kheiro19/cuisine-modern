// src/math/cabinetPresets.ts
// ONE model of a cabinet for the whole app. The 24 subtypes used to feed a separate board generator that only
// drew flat rectangles (the "atomic workspace"), while the showcase drew the real CabinetObject: the two never
// matched, and the inject button forgot the category and the doors/drawers choice. Now a subtype is only a
// PRESET of the real configuration; everything is editable and the preview renders the very same object.
import {
  CabinetCategory,
  CabinetObject,
  EdgeBandRoll,
  FrontOpeningType,
  HardwareCategory,
  InjectedHardwareItem,
  InjectedWoodMaterial,
} from '../types/flatma';
import { LIMITS } from './constants';
import { clampInt } from './utils';
import { golaSlotsOf } from './gola';

export type CabinetSubtype =
  // 1. الخزائن العلوية (Wall Cabinets)
  | 'Ceiling_Height' | 'Standard_Wall' | 'Lift_Up' | 'Glass_Front' | 'Over_Fridge' | 'Open_Shelving' | 'Double_Depth'
  // 2. الخزائن السفلية (Base Cabinets)
  | 'Deep_Drawers' | 'Pull_Out_Sink' | 'Cargo_Pull_Out' | 'Panel_Ready' | 'Push_To_Open_Base' | 'Hinged_Pull_Out_Trays'
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
  openingType: FrontOpeningType;
  elementCount: number; // 0 when there are no fronts
  shelvesCount: number;
  hasGola: boolean;
  dims: { width: number; height: number; depth: number };
  preferLift?: boolean;
  /** What the engine (3D / BOM / cost) does NOT model for this subtype. Shown to the user, never hidden. */
  note?: string;
}

const WALL = { width: 600, height: 720, depth: 350 };
const BASE = { width: 600, height: 870, depth: 600 };
const TALL = { width: 600, height: 2200, depth: 600 };
const CORNER = { width: 1050, height: 870, depth: 600 };

export const SUBTYPE_PRESETS: Record<CabinetSubtype, SubtypePreset> = {
  // ---- wall
  Standard_Wall: { group: 'wall', label: 'خزانة علوية قياسية', category: 'WALL_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 1, hasGola: false, dims: WALL },
  Ceiling_Height: { group: 'wall', label: 'الخزائن الممتدة للسقف', category: 'WALL_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 2, hasGola: false, dims: WALL },
  Lift_Up: { group: 'wall', label: 'الخزائن الهيدروليكية (Lift-up)', category: 'WALL_UNIT', openingType: 'DOORS', elementCount: 1, shelvesCount: 0, hasGola: false, dims: WALL, preferLift: true },
  Glass_Front: { group: 'wall', label: 'الخزائن الزجاجية الفاخرة', category: 'WALL_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 1, hasGola: false, dims: WALL, note: 'الزجاج وإضاءة LED غير مجسَّدين: تُرسم وتُسعَّر الواجهة كلوح خشبي.' },
  Over_Fridge: { group: 'wall', label: 'الخزانة فوق الثلاجة عمق 60سم', category: 'WALL_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 0, hasGola: false, dims: { width: 900, height: 450, depth: 600 } },
  Open_Shelving: { group: 'wall', label: 'رفوف مفتوحة بدون أبواب', category: 'WALL_UNIT', openingType: 'NONE', elementCount: 0, shelvesCount: 3, hasGola: false, dims: WALL },
  Double_Depth: { group: 'wall', label: 'خزانة علوية بعمق مزدوج', category: 'WALL_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 1, hasGola: false, dims: WALL, note: 'تدرّج العمق المزدوج غير مجسَّد: تُرسم كصندوق بعمق واحد.' },
  // ---- base
  Deep_Drawers: { group: 'base', label: 'وحدات الأدراج العميق (Deep Drawers)', category: 'BASE_UNIT', openingType: 'DRAWERS', elementCount: 2, shelvesCount: 0, hasGola: false, dims: BASE },
  Pull_Out_Sink: { group: 'base', label: 'خزانة الحوض بسحب أمامي', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 0, hasGola: false, dims: BASE, note: 'إطار سحب الحوض والعارضة المقلوبة غير مجسَّدين.' },
  Cargo_Pull_Out: { group: 'base', label: 'صيدلية التوابل العمودية', category: 'BASE_UNIT', openingType: 'DRAWERS', elementCount: 1, shelvesCount: 0, hasGola: false, dims: BASE, note: 'السلة العمودية تُرسم كدرج واحد.' },
  Panel_Ready: { group: 'base', label: 'خزانة جاهزة لتركيب الواجهة (Panel Ready)', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 1, hasGola: false, dims: BASE },
  Push_To_Open_Base: { group: 'base', label: 'خزانة سفلية بفتح بالضغط', category: 'BASE_UNIT', openingType: 'DRAWERS', elementCount: 3, shelvesCount: 0, hasGola: false, dims: BASE, note: 'آلية الفتح بالضغط غير مجسَّدة ولا مسعَّرة.' },
  Hinged_Pull_Out_Trays: { group: 'base', label: 'الخزائن ذات الأرفف السحابة', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 2, hasGola: false, dims: BASE, note: 'الأرفف السحّابة تُرسم كرفوف ثابتة.' },
  // ---- tall
  Tall_Pantry_Cargo: { group: 'tall', label: 'خزانة المؤونة بسحب كلي', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 4, hasGola: false, dims: TALL, note: 'السلة العمودية المعدنية غير مجسَّدة.' },
  Tandem_Pantry: { group: 'tall', label: 'خزانة المؤونة الترادفتية', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 4, hasGola: false, dims: TALL, note: 'آلية Tandem غير مجسَّدة.' },
  Built_In_Appliance: { group: 'tall', label: 'دولاب الأجهزة المدمجة', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 1, hasGola: false, dims: TALL, note: 'فتحة الجهاز المدمج غير مجسَّدة.' },
  Pocket_Door_Pantry: { group: 'tall', label: 'خزانة الأبواب المخفية المطوية', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 4, hasGola: false, dims: TALL, note: 'نظام الأبواب المخفية المطوية غير مجسَّد.' },
  Push_To_Open_Tall: { group: 'tall', label: 'الدولاب الطولي بفتح بالضغط', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 4, hasGola: false, dims: TALL, note: 'آلية الفتح بالضغط غير مجسَّدة ولا مسعَّرة.' },
  // ---- corner
  Magic_Corner: { group: 'corner', label: 'خزانة الزاوية السحرية', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 1, hasGola: false, dims: CORNER, note: 'السلال المتحركة غير مجسَّدة.' },
  Lazy_Susan: { group: 'corner', label: 'خزانة ليزي سوزان 360 درجة', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 0, hasGola: false, dims: CORNER, note: 'الصينية الدوّارة 360° غير مجسَّدة.' },
  Corner_Drawers: { group: 'corner', label: 'أدراج الزاوية المتداخلة 90', category: 'BASE_UNIT', openingType: 'DRAWERS', elementCount: 2, shelvesCount: 0, hasGola: false, dims: CORNER, note: 'تداخل الأدراج بزاوية 90° يُرسم كأدراج مستقيمة.' },
  LeMans_Curve: { group: 'corner', label: 'خزانة السحب المنحني LeMans', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 2, shelvesCount: 0, hasGola: false, dims: CORNER, note: 'السحب المنحني غير مجسَّد.' },
  Blind_Corner: { group: 'corner', label: 'خزانة الزاوية العادية الممتدة', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 1, shelvesCount: 1, hasGola: false, dims: CORNER, note: 'الجزء الأعمى الممتد يُرسم كصندوق مستطيل.' },
  Diagonal_Corner: { group: 'corner', label: 'خزانة الزاوية المائلة 45 درجة', category: 'BASE_UNIT', openingType: 'DOORS', elementCount: 1, shelvesCount: 1, hasGola: false, dims: CORNER, note: 'الواجهة المائلة 45° تُرسم مستقيمة.' },
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
  openingType: FrontOpeningType;
  elementCount: number;
  shelvesCount: number;
  hasGola: boolean;
  /** Drawers only: channel above drawer k (k counted from the top). See math/gola.ts. */
  golaSlots: number[];
  carcaseMaterialId: string;
  frontMaterialId: string;
  /** EdgeBandRoll id from the stock ('' = none chosen) */
  carcaseEdgeRollId: string;
  frontEdgeRollId: string;
  hardwareItemId: string;
}

export function draftFromPreset(
  subtype: CabinetSubtype,
  keep?: Pick<CabinetDraft, 'carcaseMaterialId' | 'frontMaterialId'> & Partial<Pick<CabinetDraft, 'carcaseEdgeRollId' | 'frontEdgeRollId'>>,
): CabinetDraft {
  const p = SUBTYPE_PRESETS[subtype];
  return {
    subtype,
    category: p.category,
    width: p.dims.width,
    height: p.dims.height,
    depth: p.dims.depth,
    openingType: p.openingType,
    elementCount: p.elementCount,
    shelvesCount: p.shelvesCount,
    hasGola: p.hasGola,
    golaSlots: [],
    carcaseMaterialId: keep?.carcaseMaterialId ?? '',
    frontMaterialId: keep?.frontMaterialId ?? '',
    carcaseEdgeRollId: keep?.carcaseEdgeRollId ?? '',
    frontEdgeRollId: keep?.frontEdgeRollId ?? '',
    hardwareItemId: '', // re-picked automatically for the new kind of front
  };
}

/** Which stock categories can drive this kind of front (same rule CabinetConfigurator used). */
export function compatibleHardwareCategories(category: CabinetCategory, openingType: FrontOpeningType): HardwareCategory[] {
  if (openingType === 'NONE') return [];
  if (openingType === 'DRAWERS') return ['Drawer Slide Systems'];
  return category === 'WALL_UNIT' ? ['Cabinet Hinges', 'Overhead Lift Systems'] : ['Cabinet Hinges'];
}

/** A sheet thick enough to be a carcase: never default to a 3 mm HDF back sheet just because it was typed first. */
function defaultSheet(woods: InjectedWoodMaterial[]): InjectedWoodMaterial | undefined {
  return woods.find((m) => m.thickness >= 15) ?? woods[0];
}

/**
 * Makes a draft consistent: numbers clamped to the engine's limits, impossible combinations corrected
 * (no drawers in a wall unit, no count without fronts, a lift is a single facade, Gola only on base units)
 * and the material / hardware choices filled from the stock. Pure: the form keeps the raw values so typing
 * is never fought, and this is applied for the preview and for saving.
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
  d.shelvesCount = clampInt(d.shelvesCount, LIMITS.SHELVES[0], LIMITS.SHELVES[1], 0);

  if (d.category === 'WALL_UNIT' && d.openingType === 'DRAWERS') d.openingType = 'DOORS';

  const compatible = compatibleHardwareCategories(d.category, d.openingType);
  const options = hardware.filter((h) => compatible.includes(h.category));
  const preferLift = !!SUBTYPE_PRESETS[d.subtype]?.preferLift;
  const chosen =
    options.find((h) => h.id === d.hardwareItemId) ??
    (preferLift ? options.find((h) => h.category === 'Overhead Lift Systems') : undefined) ??
    options[0];
  d.hardwareItemId = chosen?.id ?? '';

  if (d.openingType === 'NONE') {
    d.elementCount = 0;
    d.hardwareItemId = '';
    d.hasGola = false;
    d.golaSlots = [];
  } else {
    d.elementCount = clampInt(d.elementCount, LIMITS.FRONT_ELEMENTS[0], LIMITS.FRONT_ELEMENTS[1], 2);
    if (chosen?.category === 'Overhead Lift Systems') d.elementCount = 1;
    d.hasGola = d.hasGola && d.category === 'BASE_UNIT';
    // Doors keep a single top channel; drawers keep the slots the user picked (clamped to the drawer count).
    d.golaSlots = d.hasGola ? golaSlotsOf({ openingType: d.openingType, elementCount: d.elementCount, hasGolaProfile: true, golaSlots: d.golaSlots }) : [];
  }

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

function frontConfigOf(d: CabinetDraft): CabinetObject['frontConfig'] {
  return {
    openingType: d.openingType,
    elementCount: d.elementCount,
    hardwareItemId: d.hardwareItemId,
    hasGolaProfile: d.hasGola,
    golaSlots: d.openingType === 'DRAWERS' && d.hasGola ? d.golaSlots : undefined,
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
    shelvesCount: d.shelvesCount,
    carcaseMaterialId: d.carcaseMaterialId,
    frontMaterialId: d.frontMaterialId,
    carcaseEdgeRollId: d.carcaseEdgeRollId || undefined,
    frontEdgeRollId: d.frontEdgeRollId || undefined,
    frontConfig: frontConfigOf(d),
  };
}

/** Fields written back when an existing cabinet is edited. Position is decided by the caller. */
export function draftToCabinetPatch(d: CabinetDraft): Partial<CabinetObject> {
  return {
    subtype: d.subtype,
    category: d.category,
    width: d.width,
    height: d.height,
    depth: d.depth,
    shelvesCount: d.shelvesCount,
    carcaseMaterialId: d.carcaseMaterialId,
    frontMaterialId: d.frontMaterialId,
    carcaseEdgeRollId: d.carcaseEdgeRollId || undefined,
    frontEdgeRollId: d.frontEdgeRollId || undefined,
    frontConfig: frontConfigOf(d),
  };
}

export function cabinetToDraft(c: CabinetObject): CabinetDraft {
  const known = c.subtype && c.subtype in SUBTYPE_PRESETS ? (c.subtype as CabinetSubtype) : undefined;
  return {
    subtype: known ?? (c.category === 'WALL_UNIT' ? 'Standard_Wall' : 'Deep_Drawers'),
    category: c.category,
    width: c.width,
    height: c.height,
    depth: c.depth,
    openingType: c.frontConfig.openingType,
    elementCount: c.frontConfig.elementCount,
    shelvesCount: c.shelvesCount,
    hasGola: c.frontConfig.hasGolaProfile,
    golaSlots: c.frontConfig.golaSlots ?? [],
    carcaseMaterialId: c.carcaseMaterialId,
    frontMaterialId: c.frontMaterialId,
    carcaseEdgeRollId: c.carcaseEdgeRollId ?? '',
    frontEdgeRollId: c.frontEdgeRollId ?? '',
    hardwareItemId: c.frontConfig.hardwareItemId,
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
