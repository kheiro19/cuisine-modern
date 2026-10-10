// src/rules/openings.ts
// طرق الفتح: مقبض / Gola / ضغط. أين يُسمح بكل منها، وما العتاد الذي تستهلكه.
// لفتح Gola للعلوية أو الطولية: عدّل GOLA_CATEGORIES هنا (وفعّل رسمه في math/zones.ts عند الحاجة).
import type { CabinetCategory, CabinetObject, HardwareCategory, OpeningMode, ZoneKind } from '../types/flatma';
import { HARDWARE_RULES } from '../math/constants';

/** فئات الخزائن التي تقبل قنوات Gola. */
export const GOLA_CATEGORIES: CabinetCategory[] = ['BASE_UNIT'];

export const OPENING_HARDWARE = {
  PUSH: { hardwareCategory: 'Push-Open Systems' as HardwareCategory, perFacade: HARDWARE_RULES.PUSH_LATCHES_PER_FACADE },
  GOLA: { hardwareCategory: 'Gola & Handle Profiles' as HardwareCategory, perChannel: HARDWARE_RULES.GOLA_PROFILES_PER_CHANNEL },
} as const;

const isFrontZone = (z: { kind: ZoneKind }) => z.kind === 'DOORS' || z.kind === 'DRAWERS';

/** Gola: خزانة من فئة مسموحة، وقسم واحد فقط، وهو أبواب أو أدراج (لا مكدّسات مختلطة). */
export function canUseGola(category: CabinetCategory, zones: ReadonlyArray<{ kind: ZoneKind }>): boolean {
  return GOLA_CATEGORIES.includes(category) && zones.length === 1 && isFrontZone(zones[0]);
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
