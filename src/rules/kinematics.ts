// src/rules/kinematics.ts
// سجل الأنظمة الحركية: كيف تتحرك الواجهة، وأي فئة من المخزن تموّنها، وكم قطعة تلزم، وما قيودها.
// لإضافة نظام جديد: أضف مدخلًا واحدًا في KINEMATICS هنا (ثم ضع حركته في 3D عند الحاجة). لا شيء آخر.
import type { CabinetCategory, CabinetZone, HardwareCategory, ZoneKind } from '../types/flatma';
import { HARDWARE_RULES, PULL_OUT } from '../math/constants';
import { hingesPerDoor } from '../math/hinges';

/** الواجهات التي تحركها آلية: باب أو درج. (الصفائح الثابتة والأجهزة لا آلية لها.) */
export type FacadeKind = 'DOOR' | 'DRAWER';

/** الحركات التي ترسمها المعاينة ثلاثية الأبعاد اليوم. */
export type FacadeMotion = 'SWING' | 'SLIDE' | 'LIFT' | 'PULL_OUT' | 'FIXED';

export type KinematicId =
  | 'SWING' | 'LIFT' | 'SLIDE' | 'PULL_OUT_FRAME'                                 // مجسَّدة
  | 'POCKET_FOLD' | 'CORNER_TRAYS' | 'ROTARY' | 'CURVED_PULL';                      // مُعلَنة، لم تُجسَّد بعد

/** تحذيرات تنتجها قيود الآليات (تظهر في قائمة مشاكل الخزانة). */
export type KinematicIssueCode = 'PULL_OUT_FRONT_WIDTH' | 'PULL_OUT_DEPTH' | 'PULL_OUT_SIDE_BY_SIDE';
export interface KinematicIssue { code: KinematicIssueCode; message: string }

export interface KinematicContext {
  frontWidthMm: number;
  cabinetDepthMm: number;
  /** عدد الواجهات المتجاورة في القسم (أبواب جنبًا إلى جنب). */
  sideBySide: number;
}

export interface KinematicSpec {
  id: KinematicId;
  label: string;
  /** MODELLED = تُحسب في الـBOM والتكلفة والمخزون وتُرسم. PLANNED = مُعلَنة فقط (القالب الذي يحتاجها يحمل ملاحظة ظاهرة). */
  status: 'MODELLED' | 'PLANNED';
  /**
   * من يحدد الآلية؟ HARDWARE = صنف العتاد المختار للخزانة (مفصلة ← دوران، نظام رفع ← رفع، سكة ← درج): لا تُصرَّح على القسم.
   * ZONE = تُصرَّح على القسم نفسه (حقل kinematic) لأن العتاد وحده لا يحددها.
   */
  selectedBy: 'HARDWARE' | 'ZONE';
  /** أنواع الواجهات التي يمكن أن تحركها. */
  drives: FacadeKind[];
  /** أنواع الأقسام التي تقبل هذه الآلية. */
  zoneKinds: ZoneKind[];
  /** فئة المخزن التي تموّن الآلية. غير معرّفة = تحتاج فئة جديدة في المخزن قبل التجسيد. */
  hardwareCategory?: HardwareCategory;
  /** أي منتقيات العتاد في نموذج الخزانة تموّنها (أبواب أم أدراج). للآليات المُصرَّحة على القسم. */
  hardwareKind?: FacadeKind;
  /** أي فئات الخزائن تقبل هذه الآلية. */
  categories: CabinetCategory[];
  /** الحركة المقابلة في المعاينة والتركيب (المجسَّدة فقط). */
  motion?: FacadeMotion;
  /** عدد القطع لمجموعة واجهات تحركها هذه الآلية (المجسَّدة فقط). */
  quantity?: (facades: ReadonlyArray<{ heightMm: number }>) => number;
  /** قيود المقاسات: تُرجع تحذيرات (لا تمنع الحفظ). */
  constraints?: (ctx: KinematicContext) => KinematicIssue[];
}

const BOTH: CabinetCategory[] = ['BASE_UNIT', 'WALL_UNIT'];

export const KINEMATICS: Record<KinematicId, KinematicSpec> = {
  // ---- مجسَّدة: يحددها صنف العتاد
  SWING: {
    id: 'SWING', label: 'مفصلات (باب مفتوح بدوران)', status: 'MODELLED', selectedBy: 'HARDWARE', drives: ['DOOR'], zoneKinds: ['DOORS'],
    hardwareCategory: 'Cabinet Hinges', categories: BOTH, motion: 'SWING',
    quantity: (doors) => doors.reduce((sum, f) => sum + hingesPerDoor(f.heightMm), 0),
  },
  LIFT: {
    id: 'LIFT', label: 'رفع علوي (Aventos...)', status: 'MODELLED', selectedBy: 'HARDWARE', drives: ['DOOR'], zoneKinds: ['DOORS'],
    hardwareCategory: 'Overhead Lift Systems', categories: ['WALL_UNIT'], motion: 'LIFT',
    quantity: (doors) => doors.length * HARDWARE_RULES.LIFT_KITS_PER_FACADE,
  },
  SLIDE: {
    id: 'SLIDE', label: 'سكك أدراج', status: 'MODELLED', selectedBy: 'HARDWARE', drives: ['DRAWER'], zoneKinds: ['DRAWERS'],
    hardwareCategory: 'Drawer Slide Systems', categories: BOTH, motion: 'SLIDE',
    quantity: (drawers) => drawers.length,
  },
  // ---- مجسَّدة: تُصرَّح على القسم
  PULL_OUT_FRAME: {
    id: 'PULL_OUT_FRAME', label: 'إطار سلة على سكك (Tandem / Cargo)', status: 'MODELLED', selectedBy: 'ZONE',
    drives: ['DOOR', 'DRAWER'], zoneKinds: ['DOORS', 'DRAWERS'],
    // طقم واحد (سكك + إطار) لكل واجهة، من فئة سكك الأدراج؛ المنتقي هو عتاد الأدراج في نموذج الخزانة.
    hardwareCategory: 'Drawer Slide Systems', hardwareKind: 'DRAWER', categories: BOTH, motion: 'PULL_OUT',
    quantity: (fronts) => fronts.length,
    constraints: ({ frontWidthMm, cabinetDepthMm, sideBySide }) => {
      const out: KinematicIssue[] = [];
      if (frontWidthMm < PULL_OUT.MIN_FRONT_WIDTH_MM || frontWidthMm > PULL_OUT.MAX_FRONT_WIDTH_MM) {
        out.push({ code: 'PULL_OUT_FRONT_WIDTH', message: `pull-out front is ${Math.round(frontWidthMm)} mm wide: pull-out frames need ${PULL_OUT.MIN_FRONT_WIDTH_MM}\u2013${PULL_OUT.MAX_FRONT_WIDTH_MM} mm` });
      }
      if (cabinetDepthMm < PULL_OUT.MIN_CABINET_DEPTH_MM) {
        out.push({ code: 'PULL_OUT_DEPTH', message: `cabinet depth ${Math.round(cabinetDepthMm)} mm is below the ${PULL_OUT.MIN_CABINET_DEPTH_MM} mm needed for full-extension runners` });
      }
      if (sideBySide > 1) {
        out.push({ code: 'PULL_OUT_SIDE_BY_SIDE', message: `${sideBySide} pull-out fronts side by side need a vertical partition between them, which this model does not have yet: use one front per zone` });
      }
      return out;
    },
  },
  // ---- مُعلَنة (تنتظر التجسيد: حركة 3D + قاعدة كمية + فئة مخزن)
  POCKET_FOLD: { id: 'POCKET_FOLD', label: 'أبواب مطوية مخفية (Pocket)', status: 'PLANNED', selectedBy: 'ZONE', drives: ['DOOR'], zoneKinds: ['DOORS'], categories: BOTH },
  CORNER_TRAYS: { id: 'CORNER_TRAYS', label: 'سلال الزاوية (Magic Corner)', status: 'PLANNED', selectedBy: 'ZONE', drives: ['DOOR'], zoneKinds: ['DOORS'], categories: ['BASE_UNIT'] },
  ROTARY: { id: 'ROTARY', label: 'صينية دوّارة (Lazy Susan)', status: 'PLANNED', selectedBy: 'ZONE', drives: ['DOOR'], zoneKinds: ['DOORS'], categories: ['BASE_UNIT'] },
  CURVED_PULL: { id: 'CURVED_PULL', label: 'سحب منحنٍ (LeMans)', status: 'PLANNED', selectedBy: 'ZONE', drives: ['DOOR'], zoneKinds: ['DOORS'], categories: ['BASE_UNIT'] },
};

export const MODELLED_KINEMATICS = (Object.values(KINEMATICS) as KinematicSpec[]).filter((k) => k.status === 'MODELLED');
export const PLANNED_KINEMATICS = (Object.values(KINEMATICS) as KinematicSpec[]).filter((k) => k.status === 'PLANNED');

const HARDWARE_SELECTED = MODELLED_KINEMATICS.filter((k) => k.selectedBy === 'HARDWARE');

/** فئات المخزن التي يختار منها المستخدم عتاد الأبواب أو الأدراج للخزانة (مفصلات ورفع للأبواب؛ سكك للأدراج). */
export function hardwareCategoriesFor(kind: FacadeKind, category?: CabinetCategory): HardwareCategory[] {
  const out: HardwareCategory[] = [];
  for (const k of HARDWARE_SELECTED) {
    if (!k.drives.includes(kind) || !k.hardwareCategory) continue;
    if (category && !k.categories.includes(category)) continue;
    if (!out.includes(k.hardwareCategory)) out.push(k.hardwareCategory);
  }
  return out;
}

/** الآلية (التي يحددها العتاد) التي يمثلها صنف عتاد من المخزن (حسب فئته)، أو undefined. */
export function kinematicOfHardware(hw?: { category: HardwareCategory }): KinematicSpec | undefined {
  return hw ? HARDWARE_SELECTED.find((k) => k.hardwareCategory === hw.category) : undefined;
}

/** كم قطعة من هذا الصنف تلزم لهذه الواجهات (مفصلات للأبواب، أطقم رفع، أزواج سكك). */
export function frontHardwareQuantity(hw: { category: HardwareCategory } | undefined, facades: ReadonlyArray<{ heightMm: number }>): number {
  const k = kinematicOfHardware(hw);
  return k?.quantity ? k.quantity(facades) : 0;
}

// ------------------------------------------------------------------------------------------- zone declarations

/** هل تقبل هذه الآلية قسمًا من هذا النوع في خزانة من هذه الفئة؟ */
export function isKinematicAllowed(id: KinematicId, zoneKind: ZoneKind, category: CabinetCategory): boolean {
  const k = KINEMATICS[id];
  return !!k && k.zoneKinds.includes(zoneKind) && k.categories.includes(category);
}

/**
 * التصريح الصالح على القسم، أو undefined. تُصرَّح فقط الآليات التي يحددها القسم (selectedBy ZONE):
 * مفصلة أو رفع أو سكة يحددها العتاد المختار، وختمها على القسم كان سيتعارض مع تغيير العتاد.
 * القيمة الناقصة أو غير الصالحة تسقط بصمت.
 */
export function validKinematic(id: unknown, zoneKind: ZoneKind, category: CabinetCategory): KinematicId | undefined {
  if (typeof id !== 'string' || !Object.prototype.hasOwnProperty.call(KINEMATICS, id)) return undefined;
  const k = KINEMATICS[id as KinematicId];
  return k.selectedBy === 'ZONE' && isKinematicAllowed(k.id, zoneKind, category) ? k.id : undefined;
}

/** حركة القسم: المصرَّح بها، وإلا الافتراضية لنوعه (أبواب تدور أو ترفع، أدراج تنزلق). الأقسام الأخرى بلا آلية. */
export function kinematicOfZone(zone: Pick<CabinetZone, 'kind' | 'kinematic'>, opts: { lift?: boolean } = {}): KinematicId | undefined {
  if (zone.kinematic) return zone.kinematic;
  if (zone.kind === 'DOORS') return opts.lift ? 'LIFT' : 'SWING';
  if (zone.kind === 'DRAWERS') return 'SLIDE';
  return undefined;
}

/** أي منتقي عتاد في نموذج الخزانة يموّن هذا القسم: أبواب (مفصلات/رفع) أم أدراج (سكك)، أو لا شيء. */
export function hardwareKindOfZone(zone: Pick<CabinetZone, 'kind' | 'kinematic'>): FacadeKind | undefined {
  if (zone.kind !== 'DOORS' && zone.kind !== 'DRAWERS') return undefined;
  const k = zone.kinematic ? KINEMATICS[zone.kinematic] : undefined;
  if (k && k.status === 'MODELLED' && k.selectedBy === 'ZONE' && k.hardwareKind) return k.hardwareKind;
  return zone.kind === 'DOORS' ? 'DOOR' : 'DRAWER';
}

// ------------------------------------------------------------------------------------------------ facades

/** الآلية الفعلية لواجهة: التصريح المجسَّد على قسمها يغلب، وإلا الباب يدور أو يرفع (حسب عتاد الأبواب) والدرج ينزلق. */
export function effectiveKinematic(f: { kind: string; kinematic?: KinematicId }, opts: { lift?: boolean } = {}): KinematicId | undefined {
  if (f.kinematic && KINEMATICS[f.kinematic]?.status === 'MODELLED') return f.kinematic;
  if (f.kind === 'DOOR') return opts.lift ? 'LIFT' : 'SWING';
  if (f.kind === 'DRAWER') return 'SLIDE';
  return undefined;
}

/** حركة الواجهة في المعاينة: من آليتها الفعلية، والواجهات الأخرى (غطاء، لوح جهاز) ثابتة. */
export function motionOf(facadeKind: string, opts: { lift?: boolean; kinematic?: KinematicId } = {}): FacadeMotion {
  const id = effectiveKinematic({ kind: facadeKind, kinematic: opts.kinematic }, { lift: opts.lift });
  return (id && KINEMATICS[id].motion) || 'FIXED';
}
