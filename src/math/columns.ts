// src/math/columns.ts
// A zone can be split by ONE vertical board into two columns (not a general tree: columns inside columns wait until they are needed).
//   MAIN column: the appliance niche, or the zone's own doors.   FILL column: what is left of the width.
// The board is as tall as the zone's opening (between the two horizontal boards) and as deep as the cabinet.
// Swapping the side of the MAIN column moves the appliance left or right. Everything else (fronts, BOM, 3D, connectors) reads the
// numbers computed here, so they cannot disagree. Thresholds: SPLIT in constants.ts.
import { CabinetZone, ColumnFillChoice } from '../types/flatma';
import { APPLIANCES, nicheOf } from '../rules/appliances';
import { hardwareKindOfZone } from '../rules/kinematics';
import { PANEL, SPLIT } from './constants';

/** What a FILL column holds once AUTO is resolved. */
export type ColumnFill = 'PULL_OUT' | 'DOOR' | 'OPEN' | 'PANEL';
export const COLUMN_FILLS: ColumnFill[] = ['PULL_OUT', 'DOOR', 'OPEN', 'PANEL'];

export const FILL_LABELS: Record<ColumnFill, string> = {
  PULL_OUT: 'سلة سحب (درج توابل)',
  DOOR: 'باب صغير',
  OPEN: 'فراغ مفتوح',
  PANEL: 'لوح سدّ ثابت',
};

export interface ZoneColumn {
  role: 'MAIN' | 'FILL';
  /** FILL columns only. */
  fill?: ColumnFill;
  /** The free space inside the carcase: between a side board and the vertical board, measured from the cabinet's left. */
  innerLoMm: number;
  innerHiMm: number;
  /** The strip its fronts live in, before the reveals: from the cabinet edge or the middle of the vertical board, to the next one. */
  frontLoMm: number;
  frontHiMm: number;
}

export interface SplitLayout {
  mainSide: 'LEFT' | 'RIGHT';
  /** The vertical board: its left face and thickness. */
  boardXLoMm: number;
  boardWidthMm: number;
  main: ZoneColumn;
  fill: ZoneColumn;
}

export interface SplitIssue {
  code: 'SPLIT_NO_ROOM';
  message: string;
}

/** Only zones that have a width to share can be split. */
export const canSplitZone = (zone: Pick<CabinetZone, 'kind'>): boolean => zone.kind === 'DOORS' || zone.kind === 'APPLIANCE';

/** What fills a leftover column of this inside width when the choice is AUTO. */
export function suggestFill(innerWidthMm: number): ColumnFill {
  if (innerWidthMm >= SPLIT.PULL_OUT_MIN_MM) return 'PULL_OUT';
  if (innerWidthMm >= SPLIT.DOOR_MIN_MM) return 'DOOR';
  return 'PANEL';
}

export const resolveFill = (choice: ColumnFillChoice | undefined, innerWidthMm: number): ColumnFill =>
  choice && choice !== 'AUTO' ? choice : suggestFill(innerWidthMm);

/** The MAIN column's inside width: the niche + clearance for an appliance, otherwise the stated width or half of what there is. */
export function mainColumnWidthMm(zone: CabinetZone, innerWidthMm: number, boardMm: number): number {
  const stated = zone.split?.mainWidthMm;
  if (typeof stated === 'number' && Number.isFinite(stated) && stated > 0) return stated;
  if (zone.kind === 'APPLIANCE' && zone.appliance) return (nicheOf(zone)?.w ?? APPLIANCES[zone.appliance].nicheWidthMm) + SPLIT.NICHE_CLEARANCE_MM;
  return Math.floor((innerWidthMm - boardMm) / 2);
}

/**
 * The two columns of a zone, or nothing: no split asked for, a zone that cannot be split, an open carcase (the appliance IS the
 * carcase), or no room (a column narrower than SPLIT.MIN_COLUMN_MM), in which case an issue says so.
 */
export function splitLayoutOf(
  zone: CabinetZone,
  cab: { width: number },
  thicknessMm: number,
  opts: { open?: boolean } = {},
): { layout?: SplitLayout; issue?: SplitIssue } {
  if (!zone.split || !canSplitZone(zone) || opts.open) return {};
  const th = thicknessMm;
  const inner = cab.width - 2 * th;
  const mainW = mainColumnWidthMm(zone, inner, th);
  const fillW = inner - th - mainW;
  if (mainW < SPLIT.MIN_COLUMN_MM || fillW < SPLIT.MIN_COLUMN_MM) {
    return {
      issue: {
        code: 'SPLIT_NO_ROOM',
        message: `لا مكان للوح العمودي: العرض الداخلي ${Math.round(inner)} مم، وعمود الجهاز/الأبواب ${Math.round(mainW)} مم، يبقى ${Math.round(fillW)} مم فقط. وسّع الخزانة أو ألغِ اللوح.`,
      },
    };
  }
  const left = zone.split.mainSide !== 'RIGHT';
  const boardXLo = left ? th + mainW : th + fillW;
  const mid = boardXLo + th / 2;
  const mainCol = (lo: number, hi: number): ZoneColumn => ({ role: 'MAIN', innerLoMm: lo, innerHiMm: hi, frontLoMm: left ? 0 : mid, frontHiMm: left ? mid : cab.width });
  const fillCol = (lo: number, hi: number): ZoneColumn => ({
    role: 'FILL', fill: resolveFill(zone.split?.fill, fillW), innerLoMm: lo, innerHiMm: hi, frontLoMm: left ? mid : 0, frontHiMm: left ? cab.width : mid,
  });
  return {
    layout: {
      mainSide: left ? 'LEFT' : 'RIGHT',
      boardXLoMm: boardXLo,
      boardWidthMm: th,
      main: left ? mainCol(th, th + mainW) : mainCol(boardXLo + th, cab.width - th),
      fill: left ? fillCol(boardXLo + th, cab.width - th) : fillCol(th, th + fillW),
    },
  };
}

/** The strip a column's fronts occupy once the outer reveal and half the gap at the board are taken off. */
export function frontStripOf(col: Pick<ZoneColumn, 'frontLoMm' | 'frontHiMm'>, cabinetWidthMm: number): { loMm: number; hiMm: number } {
  const edge = PANEL.FRONT_GAP_TOTAL_MM / 2;
  const half = PANEL.FRONT_GAP_BETWEEN_MM / 2;
  return {
    loMm: col.frontLoMm <= 0 ? edge : col.frontLoMm + half,
    hiMm: col.frontHiMm >= cabinetWidthMm ? cabinetWidthMm - edge : col.frontHiMm - half,
  };
}

/**
 * Which hardware the zones need once every split is resolved: hinges / a lift for doors (a small door beside an appliance counts),
 * runners for drawers and pull-out frames (a spice rack beside an appliance counts).
 */
export function frontHardwareNeeds(
  zones: CabinetZone[],
  cab: { width: number },
  thicknessMm: number,
  open = false,
): { doors: boolean; drawers: boolean } {
  let doors = false;
  let drawers = false;
  zones.forEach((z) => {
    const kind = hardwareKindOfZone(z);
    if (kind === 'DOOR') doors = true;
    else if (kind === 'DRAWER') drawers = true;
    const fill = splitLayoutOf(z, cab, thicknessMm, { open }).layout?.fill.fill;
    if (fill === 'DOOR') doors = true;
    else if (fill === 'PULL_OUT') drawers = true;
  });
  return { doors, drawers };
}

/** One run of fixed shelves: the horizontal span they cross. */
export interface ShelfSpan {
  /** 'ALL' = the whole interior of an unsplit zone. */
  column: 'ALL' | 'MAIN' | 'FILL';
  loMm: number;
  hiMm: number;
}

/**
 * Where a zone's fixed shelves go. An unsplit DOORS / OPEN zone has one run across the interior (nothing when it carries baskets).
 * In a split zone every column that is a shelf compartment gets the zone's shelf count: the doors column (unless it carries
 * baskets) and a small-door or open filler. A pull-out or a panel column has none. BOM and 3D both read this.
 */
export function shelfSpansOf(
  zone: CabinetZone,
  split: SplitLayout | undefined,
  th: number,
  cabinetWidthMm: number,
  mainHasBaskets: boolean,
): ShelfSpan[] {
  if (!split) {
    if (zone.kind !== 'DOORS' && zone.kind !== 'OPEN') return [];
    return mainHasBaskets ? [] : [{ column: 'ALL', loMm: th, hiMm: cabinetWidthMm - th }];
  }
  const out: ShelfSpan[] = [];
  if (zone.kind === 'DOORS' && !mainHasBaskets) out.push({ column: 'MAIN', loMm: split.main.innerLoMm, hiMm: split.main.innerHiMm });
  if (split.fill.fill === 'DOOR' || split.fill.fill === 'OPEN') out.push({ column: 'FILL', loMm: split.fill.innerLoMm, hiMm: split.fill.innerHiMm });
  return out;
}
