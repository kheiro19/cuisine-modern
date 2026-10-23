// src/math/base.ts
// What a floor unit stands on: nothing, adjustable legs, legs + a front plinth board, or a wooden frame made in the workshop.
// Pure numbers (no three.js). ONE place decides everything about it, and the BOM, the price, the drawing and the dimension lines read it:
//
//   cabinet.height is the FINISHED height from the floor (870 mm). A base of 100 mm leaves a body of 770 mm: bodyView() is the cabinet
//   as the engines (parts, zones, geometry) see it; the base itself is drawn and cut from baseBoxes() / basePartsOf().
//   Geometry: x 0..width, z centred on the depth (back at -depth/2), y from the FLOOR (0) up to the base height.
import type { BaseType, CabinetBase, CabinetObject } from '../types/flatma';
import { BASE } from './constants';
import { clampInt } from './utils';
import { isApplianceBayAtBottom, zonesOf } from './zones';

export const BASE_TYPE_LABELS: Record<BaseType, string> = {
  NONE: 'بدون (على الأرض)',
  LEGS: 'أرجل قابلة للتعديل',
  PLINTH: 'أرجل + وزرة أمامية',
  WOOD: 'قاعدة خشبية (طوق)',
};

export type BaseIgnoredReason = 'WALL_UNIT' | 'APPLIANCE_BAY' | 'TOO_LOW';

export interface ResolvedBase {
  /** A cabinet saved before bases existed: nothing is drawn or subtracted, and the 4 legs are still counted as before. */
  legacy: boolean;
  /** The base that is really applied. */
  type: BaseType;
  /** 0 when `type` is NONE. */
  heightMm: number;
  frontSetbackMm: number;
  backSetbackMm: number;
  /** Legs bought and drawn (0 for NONE and WOOD). */
  legCount: number;
  legCountAuto: boolean;
  plinthMaterial: 'PVC' | 'BOARD';
  /** Why the base the user chose is not applied, when it is not. */
  ignored?: BaseIgnoredReason;
}

type BaseCab = Pick<CabinetObject, 'category' | 'height' | 'width' | 'depth' | 'base' | 'frontConfig' | 'shelvesCount'> & { zones?: CabinetObject['zones'] };

const NONE_BASE: ResolvedBase = { legacy: false, type: 'NONE', heightMm: 0, frontSetbackMm: 0, backSetbackMm: 0, legCount: 0, legCountAuto: true, plinthMaterial: 'PVC' };
const LEGACY_BASE: ResolvedBase = { ...NONE_BASE, legacy: true };

export const autoLegCount = (widthMm: number): number => (widthMm > BASE.LEGS_WIDE_ABOVE_MM ? BASE.LEGS_AUTO_WIDE : BASE.LEGS_AUTO);

/** The base as it is really applied to this cabinet: defaults filled, limits kept, and ignored where it cannot stand (wall unit, appliance bay, too low). */
export function baseOf(cab: BaseCab): ResolvedBase {
  if (cab.category === 'WALL_UNIT') return { ...NONE_BASE, ignored: cab.base && cab.base.type !== 'NONE' ? 'WALL_UNIT' : undefined };
  if (!cab.base) return LEGACY_BASE;
  const want: BaseType = cab.base.type;
  if (want === 'NONE') return NONE_BASE;
  // A washer or a dishwasher stands on the floor on its own feet: nothing is put under it — not even when the cabinet carries
  // doors or drawers above the bay. Only the appliances that really stand on the floor count: an OPEN shelving zone keeps its base.
  if (isApplianceBayAtBottom(zonesOf(cab))) return { ...NONE_BASE, ignored: 'APPLIANCE_BAY' };
  const room = cab.height - BASE.MIN_BODY_MM;
  if (room < BASE.HEIGHT_MM[0]) return { ...NONE_BASE, ignored: 'TOO_LOW' };
  const heightMm = clampInt(cab.base.heightMm, BASE.HEIGHT_MM[0], Math.min(BASE.HEIGHT_MM[1], room), Math.min(BASE.DEFAULT_HEIGHT_MM, room));
  const defaultFront = want === 'PLINTH' || want === 'WOOD' ? BASE.DEFAULT_PLINTH_SETBACK_MM : 0;
  const maxTotal = Math.max(0, cab.depth - BASE.MIN_RING_DEPTH_MM);
  const frontSetbackMm = Math.min(clampInt(cab.base.frontSetbackMm, BASE.FRONT_SETBACK_MM[0], BASE.FRONT_SETBACK_MM[1], defaultFront), maxTotal);
  const backSetbackMm = Math.min(clampInt(cab.base.backSetbackMm, BASE.BACK_SETBACK_MM[0], BASE.BACK_SETBACK_MM[1], want === 'WOOD' ? BASE.DEFAULT_WOOD_BACK_SETBACK_MM : 0), Math.max(0, maxTotal - frontSetbackMm));
  const asked = clampInt(cab.base.legCount, 0, BASE.LEGS_RANGE[1], 0);
  const legCountAuto = asked < BASE.LEGS_RANGE[0];
  const hasLegs = want === 'LEGS' || want === 'PLINTH';
  return {
    legacy: false,
    type: want,
    heightMm,
    frontSetbackMm,
    backSetbackMm,
    legCount: !hasLegs ? 0 : legCountAuto ? autoLegCount(cab.width) : asked,
    legCountAuto,
    plinthMaterial: cab.base.plinthMaterial === 'BOARD' ? 'BOARD' : 'PVC',
  };
}

/**
 * The cabinet as the parts / zones / geometry engines see it: its BODY (height minus the base). The returned view says "no base", so
 * applying it twice changes nothing. A cabinet without a base is returned as it is.
 */
export function bodyView<T extends BaseCab>(cab: T): T {
  const b = baseOf(cab);
  return b.heightMm > 0 ? { ...cab, height: cab.height - b.heightMm, base: { type: 'NONE' } as CabinetBase } : cab;
}

// ------------------------------------------------------------------------------------------------ the drawing

export interface BaseBox {
  key: string;
  kind: 'leg' | 'plinth' | 'wood';
  sizeMm: [number, number, number];
  centerMm: [number, number, number];
}

/** One row of `n` legs spread between the two edge insets (a lone leg is centred). */
const spread = (n: number, widthMm: number): number[] => {
  const lo = BASE.LEG_EDGE_INSET_MM, hi = widthMm - BASE.LEG_EDGE_INSET_MM;
  return n <= 0 ? [] : n === 1 ? [widthMm / 2] : Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
};

/** The wooden frame: outer rectangle of four boards, and cross supports between its long sides every WOOD_SUPPORT_STEP_MM of width. */
export function woodFrameOf(cab: Pick<CabinetObject, 'width' | 'depth'>, base: ResolvedBase, thicknessMm: number) {
  const th = thicknessMm;
  const backZ = -cab.depth / 2 + base.backSetbackMm;
  const frontZ = cab.depth / 2 - base.frontSetbackMm;
  const ringDepth = Math.max(0, frontZ - backZ);
  const inner = Math.max(0, ringDepth - 2 * th);
  const supports = cab.width > BASE.WOOD_SUPPORT_STEP_MM ? Math.ceil(cab.width / BASE.WOOD_SUPPORT_STEP_MM) - 1 : 0;
  return { th, backZ, frontZ, ringDepth, inner, supports };
}

/** Every box under the body, in floor coordinates: legs (as squares 40 mm), the plinth board, or the boards of the wooden frame. */
export function baseBoxes(cab: Pick<CabinetObject, 'width' | 'depth'> & BaseCab, thicknessMm: number): BaseBox[] {
  const b = baseOf(cab);
  const out: BaseBox[] = [];
  if (b.heightMm <= 0) return out;
  const W = cab.width, D = cab.depth, B = b.heightMm, th = thicknessMm;
  if (b.legCount > 0) {
    const d = BASE.LEG_DIAMETER_MM;
    const plinthT = b.type === 'PLINTH' ? (b.plinthMaterial === 'PVC' ? BASE.PVC_THICKNESS_MM : th) : 0;
    const frontZ = D / 2 - (b.type === 'PLINTH' ? b.frontSetbackMm + plinthT + d / 2 + 5 : BASE.LEG_DEPTH_INSET_MM);
    const backZ = -D / 2 + BASE.LEG_DEPTH_INSET_MM + b.backSetbackMm;
    const front = Math.ceil(b.legCount / 2), back = Math.floor(b.legCount / 2);
    spread(front, W).forEach((x, i) => out.push({ key: `leg-f${i + 1}`, kind: 'leg', sizeMm: [d, B, d], centerMm: [x, B / 2, frontZ] }));
    spread(back, W).forEach((x, i) => out.push({ key: `leg-b${i + 1}`, kind: 'leg', sizeMm: [d, B, d], centerMm: [x, B / 2, backZ] }));
  }
  if (b.type === 'PLINTH') {
    const t = b.plinthMaterial === 'PVC' ? BASE.PVC_THICKNESS_MM : th;
    const h = B - BASE.PLINTH_FLOOR_GAP_MM;
    out.push({ key: 'plinth', kind: 'plinth', sizeMm: [W, h, t], centerMm: [W / 2, BASE.PLINTH_FLOOR_GAP_MM + h / 2, D / 2 - b.frontSetbackMm - t / 2] });
  }
  if (b.type === 'WOOD') {
    const f = woodFrameOf(cab, b, th);
    out.push({ key: 'wood-front', kind: 'wood', sizeMm: [W, B, th], centerMm: [W / 2, B / 2, f.frontZ - th / 2] });
    out.push({ key: 'wood-back', kind: 'wood', sizeMm: [W, B, th], centerMm: [W / 2, B / 2, f.backZ + th / 2] });
    const midZ = (f.frontZ + f.backZ) / 2;
    out.push({ key: 'wood-side-left', kind: 'wood', sizeMm: [th, B, f.inner], centerMm: [th / 2, B / 2, midZ] });
    out.push({ key: 'wood-side-right', kind: 'wood', sizeMm: [th, B, f.inner], centerMm: [W - th / 2, B / 2, midZ] });
    for (let i = 1; i <= f.supports; i++) {
      out.push({ key: `wood-support-${i}`, kind: 'wood', sizeMm: [th, B, f.inner], centerMm: [(W * i) / (f.supports + 1), B / 2, midZ] });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the cutting list

export interface BasePart {
  partType: string;
  widthMm: number;
  lengthMm: number;
  quantity: number;
  /** True: cut from the cabinet's own sheet. False never appears here: a PVC plinth is hardware (see hardwareOf). */
}

/** Boards cut from the carcase sheet: the wooden frame, or the plinth board when it is made of the sheet instead of PVC. */
export function basePartsOf(cab: Pick<CabinetObject, 'width' | 'depth'> & BaseCab, thicknessMm: number): BasePart[] {
  const b = baseOf(cab);
  if (b.heightMm <= 0) return [];
  const th = thicknessMm;
  if (b.type === 'PLINTH' && b.plinthMaterial === 'BOARD') {
    return [{ partType: 'Plinth Board', widthMm: b.heightMm - BASE.PLINTH_FLOOR_GAP_MM, lengthMm: cab.width, quantity: 1 }];
  }
  if (b.type === 'WOOD') {
    const f = woodFrameOf(cab, b, th);
    const parts: BasePart[] = [
      { partType: 'Wood Base Front/Back Board', widthMm: b.heightMm, lengthMm: cab.width, quantity: 2 },
      { partType: 'Wood Base Side Board', widthMm: b.heightMm, lengthMm: f.inner, quantity: 2 },
    ];
    if (f.supports > 0) parts.push({ partType: 'Wood Base Cross Support', widthMm: b.heightMm, lengthMm: f.inner, quantity: f.supports });
    return parts;
  }
  return [];
}

/** Hardware a base asks the stock for: how many legs, and whether a PVC plinth board is bought (one piece, as wide as the cabinet). */
export function baseHardwareOf(cab: BaseCab): { legs: number; pvcPlinth: boolean; legacy: boolean } {
  const b = baseOf(cab);
  return { legs: b.legacy ? -1 : b.legCount, pvcPlinth: b.type === 'PLINTH' && b.plinthMaterial === 'PVC', legacy: b.legacy };
}
