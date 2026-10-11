// src/rules/openings.ts
// طرق الفتح: مقبض / Gola / ضغط. أين يُسمح بكل منها، وما العتاد الذي تستهلكه.
// Gola مسموحة للسفلية والعلوية، ولكل قسم أبواب/أدراج في أي مكدّس (مدمجة وطولية). أين تقع القناة: math/zones.ts (planFronts).
import type { CabinetCategory, CabinetObject, HardwareCategory, OpeningMode, ZoneKind } from '../types/flatma';
import { HARDWARE_RULES } from '../math/constants';

/** فئات الخزائن التي تقبل قنوات Gola. */
export const GOLA_CATEGORIES: CabinetCategory[] = ['BASE_UNIT', 'WALL_UNIT'];

export const OPENING_HARDWARE = {
  PUSH: { hardwareCategory: 'Push-Open Systems' as HardwareCategory, perFacade: HARDWARE_RULES.PUSH_LATCHES_PER_FACADE },
  GOLA: { hardwareCategory: 'Gola & Handle Profiles' as HardwareCategory, perChannel: HARDWARE_RULES.GOLA_PROFILES_PER_CHANNEL },
} as const;

const isFrontZone = (z: { kind: ZoneKind }) => z.kind === 'DOORS' || z.kind === 'DRAWERS';

/** Gola: خزانة من فئة مسموحة فيها قسم أبواب أو أدراج واحد على الأقل (أقسام الأجهزة والرفوف المفتوحة لا قناة لها). */
export function canUseGola(category: CabinetCategory, zones: ReadonlyArray<{ kind: ZoneKind }>): boolean {
  return GOLA_CATEGORIES.includes(category) && zones.some(isFrontZone);
}

/** طريقة الفتح الصالحة: لا شيء يُفتح بلا واجهات (مقبض)، وGola غير الممكنة تعود إلى مقبض. */
export function resolveOpeningMode(requested: OpeningMode | undefined, category: CabinetCategory, zones: ReadonlyArray<{ kind: ZoneKind }>): OpeningMode {
  if (!zones.some(isFrontZone)) return 'HANDLE';
  if (requested === 'GOLA' && !canUseGola(category, zones)) return 'HANDLE';
  return requested ?? 'HANDLE';
}

/** طريقة فتح خزانة محفوظة (الخزائن القديمة بلا openingMode تُقرأ من علم Gola). */
export const openingModeOf = (cab: Pick<CabinetObject, 'openingMode' | 'frontConfig'>): OpeningMode =>
  cab.openingMode ?? (cab.frontConfig.hasGolaProfile ? 'GOLA' : 'HANDLE');
