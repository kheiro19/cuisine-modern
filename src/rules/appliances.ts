// src/rules/appliances.ts
// مقاسات فتحات الأجهزة المدمجة (مللم). الجهاز يوفره الزبون: الفتحة فقط بلا سعر.
// عدّل الأرقام هنا لتناسب مورّديك؛ الأقسام والـBOM والرسم كلها تتبعها.
import type { ApplianceKind } from '../types/flatma';

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

export const APPLIANCES: Record<ApplianceKind, ApplianceSpec> = {
  OVEN: { label: 'فرن مدمج', nicheHeightMm: 595, nicheWidthMm: 560, nicheDepthMm: 550, note: 'يلزم فتحة تهوية في الظهر', frontTrim: { rimXMm: 17.5, rimYMm: 5, depthMm: 35 } },
  MICROWAVE: { label: 'ميكروويف مدمج', nicheHeightMm: 380, nicheWidthMm: 560, nicheDepthMm: 550, note: 'ارتفاع 380 للمدمج الصغير، 450 للكبير', frontTrim: { rimXMm: 17.5, rimYMm: 5, depthMm: 30 } },
  COFFEE: { label: 'آلة قهوة / بخار', nicheHeightMm: 450, nicheWidthMm: 560, nicheDepthMm: 550, note: 'تحتاج توصيل ماء وكهرباء', frontTrim: { rimXMm: 17.5, rimYMm: 5, depthMm: 30 } },
  DISHWASHER: { label: 'غسالة صحون', nicheHeightMm: 820, nicheWidthMm: 598, nicheDepthMm: 580, note: 'تتطلب فتحات الماء والصرف' },
  FRIDGE: { label: 'ثلاجة مدمجة', nicheHeightMm: 1780, nicheWidthMm: 560, nicheDepthMm: 550, note: 'تهوية علوية وسفلية' },
};
