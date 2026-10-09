// src/math/zones.ts
// A cabinet is a vertical stack of ZONES between the bottom board and the top (see types/flatma.ts). This file turns
// that list into numbers: how tall every opening is, where the divider boards go, and where every facade and Gola
// channel sits. BOM, cost, stock and the 3D assemblies all read these numbers, so they cannot disagree.
//
// Vertical budget, bottom -> top (n zones):  th (bottom board) + sum(openings) + (n - 1) * th (dividers) + th (top)
//   = cabinet height, so the openings add up to  height - (n + 1) * th.
// A zone without `heightMm` is flexible and shares what is left; if every zone has a height the TOP one absorbs the
// difference. Cabinets saved without `zones` are ONE zone built from frontConfig + shelvesCount, and keep exactly
// the facade sizes the BOM always produced for them.
import { ApplianceKind, CabinetObject, CabinetZone } from '../types/flatma';
import { LIMITS, PANEL } from './constants';
import { golaSlotsOf } from './gola';

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
  WASHER: { label: 'غسالة ملابس', nicheHeightMm: 820, nicheWidthMm: 598, nicheDepthMm: 580, note: 'تتطلب فتحات الماء والصرف' },
  FRIDGE: { label: 'ثلاجة مدمجة', nicheHeightMm: 1780, nicheWidthMm: 560, nicheDepthMm: 550, note: 'تهوية علوية وسفلية' },
};

export const ZONE_LABELS: Record<CabinetZone['kind'], string> = {
  DOORS: 'أبواب',
  DRAWERS: 'أدراج',
  OPEN: 'مفتوح (رفوف)',
  APPLIANCE: 'جهاز مدمج',
  APRON: 'لوح واجهة ثابت',
};

type ZonedCabinet = Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount'>;

/** The zones of a cabinet, bottom -> top. Old data (no `zones`) is one zone made from the legacy fields. */
export function zonesOf(cab: ZonedCabinet): CabinetZone[] {
  if (cab.zones && cab.zones.length > 0) return cab.zones;
  const { openingType, elementCount } = cab.frontConfig;
  if (openingType === 'NONE') return [{ kind: 'OPEN', shelves: cab.shelvesCount }];
  return [{ kind: openingType, count: elementCount, shelves: cab.shelvesCount }];
}

/** A dishwasher / fridge alone in the cabinet: the appliance IS the bottom and the back, so those boards are not cut. */
export function isOpenCarcase(zones: CabinetZone[]): boolean {
  return zones.length === 1 && zones[0].kind === 'APPLIANCE' && (zones[0].appliance === 'DISHWASHER' || zones[0].appliance === 'FRIDGE' || zones[0].appliance === 'WASHER');
}

export interface ZoneIssue {
  code: 'ZONES_TOO_TALL' | 'APPLIANCE_TOO_NARROW' | 'APPLIANCE_TOO_SHALLOW' | 'APPLIANCE_ZONE_TOO_SHORT';
  message: string;
}

export interface ZoneBand {
  index: number;
  zone: CabinetZone;
  /** Opening (the free space inside the cabinet), measured from the cabinet bottom. */
  openingBottomMm: number;
  openingHeightMm: number;
  /** The slice of the cabinet height this zone's facade lives in: from the middle of one divider to the next. */
  bandBottomMm: number;
  bandTopMm: number;
}

export interface ZoneLayout {
  bands: ZoneBand[];
  /** Bottom edge of each divider board (n - 1 of them), measured from the cabinet bottom. */
  dividerBottomsMm: number[];
  issues: ZoneIssue[];
}

type SizedCabinet = ZonedCabinet & Pick<CabinetObject, 'width' | 'height' | 'depth'>;

export function layoutZones(cab: SizedCabinet, thicknessMm: number): ZoneLayout {
  const zones = zonesOf(cab);
  const n = zones.length;
  const th = thicknessMm;
  const issues: ZoneIssue[] = [];

  const fixed = zones.map((z) => (typeof z.heightMm === 'number' && z.heightMm > 0 ? z.heightMm : undefined));
  let flex = fixed.map((h, i) => (h === undefined ? i : -1)).filter((i) => i >= 0);
  if (flex.length === 0) flex = [n - 1];

  const available = cab.height - (n + 1) * th;
  const fixedSum = fixed.reduce<number>((sum, h, i) => sum + (flex.includes(i) ? 0 : (h as number)), 0);
  const left = available - fixedSum;
  if (left < LIMITS.ZONE_HEIGHT_MM[0]) {
    issues.push({ code: 'ZONES_TOO_TALL', message: `الأقسام أطول من الخزانة: المتاح للأقسام المرنة ${Math.round(left)} مم فقط. قلّل الارتفاعات أو زد ارتفاع الخزانة.` });
  }

  const openings = fixed.map((h) => h ?? 0);
  const each = Math.floor(Math.max(left, 0) / flex.length);
  flex.forEach((i) => { openings[i] = each; });
  openings[flex[flex.length - 1]] += Math.max(left, 0) - each * flex.length; // rounding goes to the last flexible zone

  const bands: ZoneBand[] = [];
  const dividerBottomsMm: number[] = [];
  let cursor = th; // top of the bottom board
  for (let i = 0; i < n; i++) {
    const openingBottom = cursor;
    const openingTop = openingBottom + openings[i];
    if (i < n - 1) dividerBottomsMm.push(openingTop);
    bands.push({
      index: i,
      zone: zones[i],
      openingBottomMm: openingBottom,
      openingHeightMm: openings[i],
      bandBottomMm: i === 0 ? 0 : dividerBottomsMm[i - 1] + th / 2,
      bandTopMm: i === n - 1 ? cab.height : openingTop + th / 2,
    });
    cursor = openingTop + th;
  }

  const inner = cab.width - 2 * th;
  bands.forEach((b) => {
    if (b.zone.kind !== 'APPLIANCE' || !b.zone.appliance) return;
    const spec = APPLIANCES[b.zone.appliance];
    if (inner < spec.nicheWidthMm) issues.push({ code: 'APPLIANCE_TOO_NARROW', message: `${spec.label}: الفتحة تحتاج ${spec.nicheWidthMm} مم والعرض الداخلي ${Math.round(inner)} مم (اجعل عرض الخزانة ${spec.nicheWidthMm + 2 * th} مم على الأقل).` });
    if (cab.depth < spec.nicheDepthMm) issues.push({ code: 'APPLIANCE_TOO_SHALLOW', message: `${spec.label}: العمق ${cab.depth} مم أقل من المطلوب ${spec.nicheDepthMm} مم.` });
    if (b.openingHeightMm < spec.nicheHeightMm) issues.push({ code: 'APPLIANCE_ZONE_TOO_SHORT', message: `${spec.label}: ارتفاع القسم ${Math.round(b.openingHeightMm)} مم أقل من الفتحة المطلوبة ${spec.nicheHeightMm} مم.` });
  });

  return { bands, dividerBottomsMm, issues };
}

export interface Facade {
  zoneIndex: number;
  kind: 'DOOR' | 'DRAWER' | 'APRON' | 'PANEL';
  /** Position inside its zone. For drawers 0 = the TOP drawer (the numbering Gola slots use). */
  index: number;
  count: number;
  widthMm: number;
  heightMm: number;
  /** Left edge / bottom edge measured from the cabinet's left / bottom. */
  xMm: number;
  yMm: number;
}

export interface GolaChannel {
  /** Slot k = the channel just above drawer k (0 = top). Doors: slot 0 = the channel above the doors. */
  slot: number;
  yMm: number;
  heightMm: number;
}

export interface FrontPlan {
  facades: Facade[];
  channels: GolaChannel[];
}

export function planFronts(cab: SizedCabinet & Pick<CabinetObject, 'category'>, layout: ZoneLayout): FrontPlan {
  const facades: Facade[] = [];
  const channels: GolaChannel[] = [];
  const n = layout.bands.length;
  const x0 = PANEL.FRONT_GAP_TOTAL_MM / 2;
  const half = PANEL.FRONT_HEIGHT_CLEARANCE_MM / 2;
  const reveal = PANEL.FRONT_REVEAL_MM / 2;

  // Gola channels only exist on a base cabinet that is one single doors / drawers zone (not on mixed stacks).
  const only = layout.bands[0]?.zone;
  const golaOn = n === 1 && cab.category === 'BASE_UNIT' && cab.frontConfig.hasGolaProfile && (only.kind === 'DOORS' || only.kind === 'DRAWERS');
  const slots = golaOn ? golaSlotsOf(cab.frontConfig) : [];

  layout.bands.forEach((band, i) => {
    const z = band.zone;
    // Whole millimetres: the middle of a divider can fall on a half millimetre and a cutting list should not.
    const yLo = Math.round(band.bandBottomMm + (i === 0 ? half : reveal));
    const yHi = Math.round(band.bandTopMm - (i === n - 1 ? half : reveal));
    const extent = Math.max(0, yHi - yLo);
    const fullWidth = Math.max(0, cab.width - PANEL.FRONT_GAP_TOTAL_MM);

    if (z.kind === 'DOORS') {
      const count = Math.max(1, Math.round(z.count ?? 1));
      const stack = Math.max(0, extent - slots.length * PANEL.GOLA_OFFSET_MM);
      const width = Math.max(0, Math.round((cab.width - PANEL.FRONT_GAP_TOTAL_MM) / count));
      for (let k = 0; k < count; k++) facades.push({ zoneIndex: i, kind: 'DOOR', index: k, count, widthMm: width, heightMm: stack, xMm: x0 + k * width, yMm: yLo });
      if (slots.length > 0) channels.push({ slot: 0, yMm: yLo + stack, heightMm: PANEL.GOLA_OFFSET_MM });
    } else if (z.kind === 'DRAWERS') {
      const count = Math.max(1, Math.round(z.count ?? 1));
      const stack = Math.max(0, extent - slots.length * PANEL.GOLA_OFFSET_MM);
      const each = Math.round(stack / count);
      let y = yLo;
      for (let k = count - 1; k >= 0; k--) { // bottom drawer first
        facades.push({ zoneIndex: i, kind: 'DRAWER', index: k, count, widthMm: fullWidth, heightMm: each, xMm: x0, yMm: y });
        y += each;
        if (slots.includes(k)) {
          channels.push({ slot: k, yMm: y, heightMm: PANEL.GOLA_OFFSET_MM });
          y += PANEL.GOLA_OFFSET_MM;
        }
      }
    } else if (z.kind === 'APRON') {
      facades.push({ zoneIndex: i, kind: 'APRON', index: 0, count: 1, widthMm: fullWidth, heightMm: extent, xMm: x0, yMm: yLo });
    } else if (z.kind === 'APPLIANCE' && z.panelFront) {
      facades.push({ zoneIndex: i, kind: 'PANEL', index: 0, count: 1, widthMm: fullWidth, heightMm: extent, xMm: x0, yMm: yLo });
    }
  });

  return { facades, channels };
}
