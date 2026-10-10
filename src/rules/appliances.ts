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
}

export const APPLIANCES: Record<ApplianceKind, ApplianceSpec> = {
  OVEN: { label: 'فرن مدمج', nicheHeightMm: 595, nicheWidthMm: 560, nicheDepthMm: 550, note: 'يلزم فتحة تهوية في الظهر' },
  MICROWAVE: { label: 'ميكروويف مدمج', nicheHeightMm: 380, nicheWidthMm: 560, nicheDepthMm: 550, note: 'ارتفاع 380 للمدمج الصغير، 450 للكبير' },
  COFFEE: { label: 'آلة قهوة / بخار', nicheHeightMm: 450, nicheWidthMm: 560, nicheDepthMm: 550, note: 'تحتاج توصيل ماء وكهرباء' },
  DISHWASHER: { label: 'غسالة صحون', nicheHeightMm: 820, nicheWidthMm: 598, nicheDepthMm: 580, note: 'تتطلب فتحات الماء والصرف' },
  FRIDGE: { label: 'ثلاجة مدمجة', nicheHeightMm: 1780, nicheWidthMm: 560, nicheDepthMm: 550, note: 'تهوية علوية وسفلية' },
};
