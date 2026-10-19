// src/rules/appliances.ts
// مقاسات فتحات الأجهزة المدمجة (مللم). الجهاز يوفره الزبون: الفتحة فقط بلا سعر.
// عدّل الأرقام هنا لتناسب مورّديك؛ الأقسام والـBOM والرسم كلها تتبعها.
import type { ApplianceKind, CabinetZone } from '../types/flatma';

export interface ApplianceSpec {
  label: string;
  /** Standard niche (mm). Editable here: these are typical European built-in sizes, check your suppliers. */
  nicheHeightMm: number;
  nicheWidthMm: number;
  nicheDepthMm: number;
  note: string;
  /**
   * Built-in appliances with a trim (oven, microwave, coffee machine): the front frame is wider and taller than the niche, so it
   * sits OVER the cabinet edges, in front of the carcase. rimX / rimY = how far it overlaps the niche on each side,
   * depth = how far it stands out in front of the carcase face. Typical values: an oven niche 560 wide has a 595 front.
   * Missing = no trim (the dishwasher and the fridge are normally hidden behind a decor panel).
   */
  frontTrim?: { rimXMm: number; rimYMm: number; depthMm: number };
}

/**
 * Appliances that stand on the floor between the two sides of their cabinet, under the worktop: the cabinet is a "half cabinet"
 * (two sides and the two top rails the worktop rests on, no bottom, no back). Their front stays visible unless the zone asks for a
 * decor panel (`panelFront`).
 */
export const OPEN_BAY_APPLIANCES: readonly ApplianceKind[] = ['DISHWASHER', 'FRIDGE', 'WASHER', 'DRYER', 'UNDER_FRIDGE'];

export const APPLIANCES: Record<ApplianceKind, ApplianceSpec> = {
  OVEN: { label: 'فرن مدمج', nicheHeightMm: 595, nicheWidthMm: 560, nicheDepthMm: 550, note: 'يلزم فتحة تهوية في الظهر', frontTrim: { rimXMm: 17.5, rimYMm: 5, depthMm: 35 } },
  MICROWAVE: { label: 'ميكروويف مدمج', nicheHeightMm: 380, nicheWidthMm: 560, nicheDepthMm: 550, note: 'ارتفاع 380 للمدمج الصغير، 450 للكبير', frontTrim: { rimXMm: 17.5, rimYMm: 5, depthMm: 30 } },
  COFFEE: { label: 'آلة قهوة / بخار', nicheHeightMm: 450, nicheWidthMm: 560, nicheDepthMm: 550, note: 'تحتاج توصيل ماء وكهرباء', frontTrim: { rimXMm: 17.5, rimYMm: 5, depthMm: 30 } },
  DISHWASHER: { label: 'غسالة صحون', nicheHeightMm: 820, nicheWidthMm: 598, nicheDepthMm: 580, note: 'تتطلب فتحات الماء والصرف' },
  FRIDGE: { label: 'ثلاجة مدمجة', nicheHeightMm: 1780, nicheWidthMm: 560, nicheDepthMm: 550, note: 'تهوية علوية وسفلية' },
  // Under-counter appliances that stand on the floor between two sides and under the worktop (see OPEN_BAY_APPLIANCES).
  WASHER: { label: 'غسالة ملابس (تحت الرخامة)', nicheHeightMm: 820, nicheWidthMm: 596, nicheDepthMm: 580, note: 'تتطلب فتحات الماء والصرف والكهرباء، وتُثبَّت بإحكام لتحمّل الاهتزاز. اترك 5 سم خلفها للخراطيم' },
  DRYER: { label: 'مجفف ملابس (تحت الرخامة)', nicheHeightMm: 820, nicheWidthMm: 596, nicheDepthMm: 580, note: 'يحتاج مخرج هواء أو مكثّفًا، وتهوية أمامية' },
  UNDER_FRIDGE: { label: 'ثلاجة صغيرة (تحت الرخامة)', nicheHeightMm: 820, nicheWidthMm: 596, nicheDepthMm: 550, note: 'تهوية أمامية وخلفية' },
};

/** The niche of an appliance zone: the standard of its kind, with the sizes the user stated (zone.applianceSizeMm) in place of it. */
export function nicheOf(zone: CabinetZone): { w: number; h: number; d: number } | undefined {
  if (zone.kind !== 'APPLIANCE' || !zone.appliance) return undefined;
  const spec = APPLIANCES[zone.appliance];
  const o = zone.applianceSizeMm ?? {};
  const pick = (v: number | undefined, std: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : std);
  return { w: pick(o.w, spec.nicheWidthMm), h: pick(o.h, spec.nicheHeightMm), d: pick(o.d, spec.nicheDepthMm) };
}
