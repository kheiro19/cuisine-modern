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
import { LIMITS, PANEL, PULL_OUT } from './constants';
import { golaSlotsOf } from './gola';
import { APPLIANCES } from '../rules/appliances';
import { canUseGola } from '../rules/openings';
import { dividerBoardsOf } from '../rules/construction';
import { KinematicId, validKinematic } from '../rules/kinematics';

export { APPLIANCES } from '../rules/appliances';
export type { ApplianceSpec } from '../rules/appliances';

export const ZONE_LABELS: Record<CabinetZone['kind'], string> = {
  DOORS: 'أبواب',
  DRAWERS: 'أدراج',
  OPEN: 'مفتوح (رفوف)',
  APPLIANCE: 'جهاز مدمج',
  APRON: 'لوح واجهة ثابت',
};

type ZonedCabinet = Pick<CabinetObject, 'zones' | 'frontConfig' | 'shelvesCount' | 'dividerBoards'>;

/** The zones of a cabinet, bottom -> top. Old data (no `zones`) is one zone made from the legacy fields. */
export function zonesOf(cab: ZonedCabinet): CabinetZone[] {
  if (cab.zones && cab.zones.length > 0) return cab.zones;
  const { openingType, elementCount } = cab.frontConfig;
  if (openingType === 'NONE') return [{ kind: 'OPEN', shelves: cab.shelvesCount }];
  return [{ kind: openingType, count: elementCount, shelves: cab.shelvesCount }];
}

/** A dishwasher / fridge alone in the cabinet: the appliance IS the bottom and the back, so those boards are not cut. */
export function isOpenCarcase(zones: CabinetZone[]): boolean {
  return zones.length === 1 && zones[0].kind === 'APPLIANCE' && (zones[0].appliance === 'DISHWASHER' || zones[0].appliance === 'FRIDGE');
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
  const divTh = th * dividerBoardsOf(cab); // one shared board, or two glued face to face
  const issues: ZoneIssue[] = [];

  const fixed = zones.map((z) => (typeof z.heightMm === 'number' && z.heightMm > 0 ? z.heightMm : undefined));
  let flex = fixed.map((h, i) => (h === undefined ? i : -1)).filter((i) => i >= 0);
  if (flex.length === 0) flex = [n - 1];

  const available = cab.height - 2 * th - (n - 1) * divTh;
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
      bandBottomMm: i === 0 ? 0 : dividerBottomsMm[i - 1] + divTh / 2,
      bandTopMm: i === n - 1 ? cab.height : openingTop + divTh / 2,
    });
    cursor = openingTop + divTh;
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
  /** Mechanism declared on the zone (rules/kinematics.ts); set only when it is valid for that zone. */
  kinematic?: KinematicId;
  /** Pull-out frames: how many baskets the frame carries. */
  levels?: number;
}

/** Baskets in a pull-out frame: the zone's shelves, or the default when it has none (a drawers zone has no shelves). */
export const pullOutLevels = (z: Pick<CabinetZone, 'shelves'>): number => (z.shelves && z.shelves > 0 ? Math.round(z.shelves) : PULL_OUT.DEFAULT_LEVELS);

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
  const gapHalf = PANEL.FRONT_GAP_BETWEEN_MM / 2;

  // Where Gola channels may exist is decided in rules/openings.ts (canUseGola).
  const golaOn = cab.frontConfig.hasGolaProfile && canUseGola(cab.category, layout.bands.map((b) => b.zone));
  const slots = golaOn ? golaSlotsOf(cab.frontConfig) : [];

  layout.bands.forEach((band, i) => {
    const z = band.zone;
    // Half millimetres: the middle of a divider can fall on one, and the 1 mm gap between two zones is centred on it.
    const round2 = (v: number) => Math.round(2 * v) / 2;
    const yLo = round2(band.bandBottomMm + (i === 0 ? half : reveal));
    const yHi = round2(band.bandTopMm - (i === n - 1 ? half : reveal));
    const extent = Math.max(0, yHi - yLo);
    const fullWidth = Math.max(0, cab.width - PANEL.FRONT_GAP_TOTAL_MM);
    const mech = validKinematic(z.kinematic, z.kind, cab.category);
    const mark = mech ? { kinematic: mech, ...(mech === 'PULL_OUT_FRAME' ? { levels: pullOutLevels(z) } : {}) } : {};

    if (z.kind === 'DOORS') {
      const count = Math.max(1, Math.round(z.count ?? 1));
      const stack = Math.max(0, extent - slots.length * PANEL.GOLA_OFFSET_MM);
      // Doors share the cabinet width (the nominal cuts fall on W/count, to the half millimetre) and each door loses half
      // the gap on every edge it shares with another door: 600 mm / 2 doors = 299.5 + 299.5 with 1 mm between them.
      // A lone door keeps the outer reveal on both sides (599 on a 600 cabinet); a row of several doors uses FRONT_ROW_OUTER_REVEAL_MM.
      const cut = (j: number) => Math.round((2 * j * cab.width) / count) / 2;
      const outer = count === 1 ? PANEL.FRONT_GAP_TOTAL_MM / 2 : PANEL.FRONT_ROW_OUTER_REVEAL_MM;
      for (let k = 0; k < count; k++) {
        const lo = cut(k) + (k === 0 ? outer : gapHalf);
        const hi = cut(k + 1) - (k === count - 1 ? outer : gapHalf);
        facades.push({ zoneIndex: i, kind: 'DOOR', index: k, count, widthMm: hi - lo, heightMm: stack, xMm: lo, yMm: yLo, ...mark });
      }
      if (slots.length > 0) channels.push({ slot: 0, yMm: yLo + stack, heightMm: PANEL.GOLA_OFFSET_MM });
    } else if (z.kind === 'DRAWERS') {
      const count = Math.max(1, Math.round(z.count ?? 1));
      const stack = Math.max(0, extent - slots.length * PANEL.GOLA_OFFSET_MM);
      // Drawers stack on the nominal cuts (stack / count, to the half millimetre); each loses half the gap on every edge it
      // shares with another drawer. Where a Gola channel sits between two drawers the channel is the gap, so nothing more is taken.
      const cut = (j: number) => Math.round((2 * j * stack) / count) / 2;
      let channelsBelow = 0;
      for (let p = 0; p < count; p++) { // bottom drawer first
        const k = count - 1 - p;
        const touchesBelow = p > 0 && !slots.includes(k + 1);
        const touchesAbove = p < count - 1 && !slots.includes(k);
        const lo = cut(p) + (touchesBelow ? gapHalf : 0);
        const hi = cut(p + 1) - (touchesAbove ? gapHalf : 0);
        facades.push({ zoneIndex: i, kind: 'DRAWER', index: k, count, widthMm: fullWidth, heightMm: hi - lo, xMm: x0, yMm: yLo + channelsBelow + lo, ...mark });
        if (slots.includes(k)) {
          channels.push({ slot: k, yMm: yLo + channelsBelow + cut(p + 1), heightMm: PANEL.GOLA_OFFSET_MM });
          channelsBelow += PANEL.GOLA_OFFSET_MM;
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
