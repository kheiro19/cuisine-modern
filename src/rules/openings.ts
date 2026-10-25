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

/**
 * How the fronts of ONE zone open: the zone's own choice, else the cabinet's. Gola needs a doors / drawers zone in a category that
 * accepts it (a zone that cannot carry a channel opens by handle). Cabinets with no per-zone choice behave exactly as before.
 */
export function zoneOpeningModeOf(
  zone: { kind: ZoneKind; openingMode?: OpeningMode },
  cab: Pick<CabinetObject, 'openingMode' | 'frontConfig' | 'category'>,
): OpeningMode {
  const mode = zone.openingMode ?? openingModeOf(cab);
  if (mode === 'GOLA') return canUseGola(cab.category, [zone]) ? 'GOLA' : 'HANDLE';
  return mode;
}

/** The zone's own opening mode made valid for the category (Gola only where a channel can go; no fronts = nothing to open). */
export function resolveZoneOpeningMode(requested: OpeningMode | undefined, category: CabinetCategory, zone: { kind: ZoneKind }): OpeningMode | undefined {
  if (!requested || !isFrontZone(zone)) return undefined;
  if (requested === 'GOLA' && !canUseGola(category, [zone])) return 'HANDLE';
  return requested;
}

/**
 * An overhead lift swings its door UP through everything above it, so it only fits when the doors are in the top zone and in no other
 * (a lower lift door would sweep through the zone above; hinged doors below need a second hardware item). A zone also carries a door
 * when it is split and its filler column is, or may become (AUTO), a small door beside an appliance.
 */
export function liftZoneIsTop(zones: ReadonlyArray<{ kind: ZoneKind; split?: { fill?: string } }>): boolean {
  const bearing = zones.map((z, i) => (z.kind === 'DOORS' || (!!z.split && (z.split.fill === undefined || z.split.fill === 'DOOR' || z.split.fill === 'AUTO')) ? i : -1)).filter((i) => i >= 0);
  return bearing.length === 0 || (bearing.length === 1 && bearing[0] === zones.length - 1);
}
