// src/math/accessoryPlacement.ts
// Where an accessory of the library goes in the kitchen, and whether it fits there. Pure numbers (no three.js, no React):
// the 3D layer only draws what `footprintOf` returns.
//
// Scene frame (the same as Kitchen3DCanvas, millimetres): x along the wall, y up from the floor, z away from the wall towards
// the user. A cabinet's back is at z = -positionZ and its front at z = -positionZ + depth.
import type { CabinetObject, RunId } from '../types/flatma';
import { LAYOUT } from './constants';
import { DEFAULT_ROOM_HEIGHT_MM, RUN_LABELS, runOf, wallBottomMmOf, wallLengthOf } from './kitchenLayout';
import type { KitchenLayout } from './kitchenLayout';
import { AccessoryItem, FinishKey, getAccessory, isHob, isSink } from '../data/accessoryCatalog';

export interface PlacedAccessory {
  id: string;
  catalogId: string;
  /** Centre along the wall (COUNTERTOP / BACKSPLASH / ABOVE_HOB / HANGING / FLOOR). Ignored for cabinet-hosted pieces. */
  xMm: number;
  /** Cabinet that hosts the piece (CABINET_UNDER / CABINET_INSIDE). */
  cabinetId?: string;
  /** Taps, dispensers and racks: the placed sink they are fixed on, and their offset along it. */
  hostId?: string;
  dxMm?: number;
  /** Height above the worktop for wall-mounted and hanging pieces (BACKSPLASH default 150, ABOVE_HOB 650, HANGING 800). */
  yOffsetMm?: number;
  /** Colour / material chosen among the finishes the piece offers. */
  finish?: FinishKey;
  /** FLOOR pieces: the wall they stand on (missing = the back wall, as every piece saved before runs existed). */
  run?: RunId;
  /** The user's own size for THIS piece (missing = the catalog size). Edited from the library drawer or the 3D view. */
  sizeMm?: { w: number; h: number; d: number };
  /** Quarter turns around the vertical axis: 90/270 swap the footprint's width and depth. Missing = as catalogued. */
  rotY?: 0 | 90 | 180 | 270;
  /** Mirrored left-right (a fridge door hinged the other side). The footprint does not change. */
  flip?: boolean;
}

/** The size the user gave this piece, else the catalog size (before rotation). */
export const sizeOf = (p: PlacedAccessory, item: AccessoryItem) => p.sizeMm ?? item.sizeMm;
/** The size as it stands on the floor / worktop: a quarter turn swaps width and depth. */
export const footprintSizeOf = (p: PlacedAccessory, item: AccessoryItem) => {
  const s = sizeOf(p, item);
  return p.rotY === 90 || p.rotY === 270 ? { w: s.d, h: s.h, d: s.w } : { w: s.w, h: s.h, d: s.d };
};

export type CabinetLite = Pick<CabinetObject, 'id' | 'category' | 'positionX' | 'positionZ' | 'width' | 'height' | 'depth' | 'frontThickness' | 'carcaseThickness'> & { name?: string; wallMount?: CabinetObject['wallMount']; run?: RunId };

export interface SceneRef {
  hasCounter: boolean;
  baseHeightMm: number;
  /** Top face of the worktop. */
  counterTopYMm: number;
  counterXStartMm: number;
  counterXEndMm: number;
  zBackMm: number;
  zFrontMm: number;
  /** Bottom face of the wall units that hang at the standard gap (a unit with its own wallMount: see wallBottomOf). */
  wallBottomYMm: number;
  /** Floor to ceiling. */
  roomHeightMm: number;
  /** Height of the wall strip between the worktop and the wall units. */
  splashMm: number;
}

/** Where this wall unit really hangs (its own wallMount, else the standard gap above the worktop). */
export const wallBottomOf = (cab: Pick<CabinetLite, 'height' | 'wallMount'>, scene: SceneRef): number =>
  wallBottomMmOf(cab, { counterTopMm: scene.counterTopYMm, defaultGapMm: scene.splashMm, roomHeightMm: scene.roomHeightMm });

/** The same numbers Kitchen3DCanvas uses for the worktop and the wall units. */
export function sceneRefOf(cabinets: ReadonlyArray<CabinetLite>, wallSplashHeightMm: number, roomHeightMm: number = DEFAULT_ROOM_HEIGHT_MM): SceneRef {
  const counter = cabinets.filter((c) => c.category === 'BASE_UNIT' && c.height <= LAYOUT.COUNTERTOP_MAX_UNIT_HEIGHT_MM);
  const baseHeightMm = counter.length > 0 ? Math.max(...counter.map((c) => c.height)) : LAYOUT.DEFAULT_BASE_HEIGHT_MM;
  const counterTopYMm = baseHeightMm + LAYOUT.COUNTERTOP_THICKNESS_MM;
  const common = { baseHeightMm, counterTopYMm, wallBottomYMm: counterTopYMm + wallSplashHeightMm, splashMm: wallSplashHeightMm, roomHeightMm };
  if (counter.length === 0) return { hasCounter: false, counterXStartMm: 0, counterXEndMm: 0, zBackMm: 0, zFrontMm: 600, ...common };
  return {
    hasCounter: true,
    counterXStartMm: Math.min(...counter.map((c) => c.positionX)),
    counterXEndMm: Math.max(...counter.map((c) => c.positionX + c.width)),
    zBackMm: Math.min(...counter.map((c) => -c.positionZ)),
    zFrontMm: Math.max(...counter.map((c) => c.depth + c.frontThickness - c.positionZ)) + LAYOUT.COUNTERTOP_FRONT_OVERHANG_MM,
    ...common,
  };
}

export interface Footprint {
  /** Centre of the footprint (mm); y is the BOTTOM face of the piece. */
  xMm: number;
  yMm: number;
  zMm: number;
  w: number;
  h: number;
  d: number;
}

const MARGIN_MM = 30;
const CABINET_MARGIN_MM = 5;
const STEP_MM = 10;
const FLOOR_SCAN_MM = 8000;
const CABINET_BACK_CLEARANCE_MM = 20;
export const BACKSPLASH_DEFAULT_Y_MM = 150;
export const HOOD_DEFAULT_Y_MM = 650;
export const HANGING_DEFAULT_Y_MM = 800;

const round1 = (v: number) => Math.round(v * 10) / 10;
const itemOf = (p: PlacedAccessory): AccessoryItem | undefined => getAccessory(p.catalogId);
const cabinetOf = (cabs: ReadonlyArray<CabinetLite>, id?: string): CabinetLite | undefined => (id ? cabs.find((c) => c.id === id) : undefined);
const backsplashY = (h: number, scene: SceneRef) => Math.max(0, Math.min(BACKSPLASH_DEFAULT_Y_MM, scene.splashMm - h));

/** Interior pieces of one cabinet stack bottom -> top in the order they were added. */
function stackBelow(all: ReadonlyArray<PlacedAccessory>, p: PlacedAccessory): number {
  let sum = 0;
  for (const other of all) {
    if (other.id === p.id) break;
    const it = itemOf(other);
    if (it && it.mount === 'CABINET_INSIDE' && other.cabinetId === p.cabinetId) sum += sizeOf(other, it).h;
  }
  return sum;
}

/** Where a placed piece really is. null = its host (cabinet or sink) no longer exists. */
export function footprintOf(
  p: PlacedAccessory,
  all: ReadonlyArray<PlacedAccessory>,
  cabs: ReadonlyArray<CabinetLite>,
  scene: SceneRef,
): Footprint | null {
  const item = itemOf(p);
  if (!item) return null;
  const { w, h, d } = footprintSizeOf(p, item);
  const midZ = (scene.zBackMm + scene.zFrontMm) / 2;
  switch (item.mount) {
    case 'COUNTERTOP': {
      if (item.rest === 'SINK') {
        const host = all.find((a) => a.id === p.hostId);
        const hostItem = host ? itemOf(host) : undefined;
        // Only a real sink can host a piece (this also rules out a loop of pieces hosted on each other).
        const hf = host && hostItem && isSink(hostItem) ? footprintOf(host, all, cabs, scene) : null;
        if (!hf) return null;
        const z = item.restZ === 'CENTER' ? hf.zMm : hf.zMm - hf.d / 2 + d / 2 + 15;
        return { xMm: round1(hf.xMm + (p.dxMm ?? 0)), yMm: scene.counterTopYMm, zMm: round1(z), w, h, d };
      }
      const z = item.zPlace === 'CENTER' ? midZ : item.zPlace === 'FRONT' ? scene.zFrontMm - d / 2 - 30 : scene.zBackMm + 60 + d / 2;
      return { xMm: p.xMm, yMm: scene.counterTopYMm, zMm: round1(z), w, h, d };
    }
    case 'BACKSPLASH':
      if (item.autoSpan) {
        const span = Math.max(100, scene.counterXEndMm - scene.counterXStartMm);
        return { xMm: (scene.counterXStartMm + scene.counterXEndMm) / 2, yMm: scene.counterTopYMm, zMm: scene.zBackMm + d / 2, w: span, h: scene.splashMm, d };
      }
      return { xMm: p.xMm, yMm: scene.counterTopYMm + (p.yOffsetMm ?? backsplashY(h, scene)), zMm: scene.zBackMm + d / 2, w, h, d };
    case 'ABOVE_HOB':
      return { xMm: p.xMm, yMm: scene.counterTopYMm + (p.yOffsetMm ?? HOOD_DEFAULT_Y_MM), zMm: scene.zBackMm + d / 2, w, h, d };
    case 'HANGING': {
      const z = item.zPlace === 'REAR' ? scene.zBackMm + 60 + d / 2 : midZ;
      return { xMm: p.xMm, yMm: scene.counterTopYMm + (p.yOffsetMm ?? HANGING_DEFAULT_Y_MM), zMm: round1(z), w, h, d };
    }
    case 'FLOOR': {
      const z = item.zPlace === 'FRONT' ? scene.zFrontMm + d / 2 + 40 : scene.zBackMm + d / 2;
      return { xMm: p.xMm, yMm: 0, zMm: round1(z), w, h, d };
    }
    case 'CABINET_UNDER': {
      const cab = cabinetOf(cabs, p.cabinetId);
      if (!cab || cab.category !== 'WALL_UNIT') return null;
      const width = item.autoWidth ? cab.width - 40 : Math.min(w, cab.width - 20);
      const back = -cab.positionZ;
      const z = item.zPlace === 'FRONT' ? back + cab.depth - d / 2 - 30 : back + d / 2 + CABINET_BACK_CLEARANCE_MM;
      return { xMm: cab.positionX + cab.width / 2, yMm: wallBottomOf(cab, scene) - h, zMm: z, w: width, h, d };
    }
    case 'CABINET_INSIDE': {
      const cab = cabinetOf(cabs, p.cabinetId);
      if (!cab) return null;
      const floor = cab.category === 'WALL_UNIT' ? wallBottomOf(cab, scene) : 0;
      const z = item.zPlace === 'FRONT' ? -cab.positionZ + cab.depth - d / 2 - 20 : -cab.positionZ + cab.depth / 2;
      return { xMm: cab.positionX + cab.width / 2, yMm: floor + cab.carcaseThickness + stackBelow(all, p), zMm: z, w, h, d };
    }
  }
}

function overlaps(a: Footprint, b: Footprint, marginMm = MARGIN_MM): boolean {
  return Math.abs(a.xMm - b.xMm) < (a.w + b.w) / 2 + marginMm && Math.abs(a.zMm - b.zMm) < (a.d + b.d) / 2 + marginMm;
}

/** Pieces that compete for the same surface: the worktop (not what sits on a sink), the splashback, the hood height, the air, the floor. */
function sameSurface(a: AccessoryItem, b: AccessoryItem): boolean {
  if (a.noCollide || b.noCollide || a.mount !== b.mount) return false;
  if (a.mount === 'COUNTERTOP') return !a.rest && !b.rest;
  return a.mount === 'BACKSPLASH' || a.mount === 'ABOVE_HOB' || a.mount === 'HANGING' || a.mount === 'FLOOR';
}

/** A floor piece against the base units (they stand on the same floor). */
function hitsCabinet(f: Footprint, cabs: ReadonlyArray<CabinetLite>): boolean {
  return cabs.some((c) => {
    if (c.category !== 'BASE_UNIT') return false;
    const cx = c.positionX + c.width / 2, cz = -c.positionZ + (c.depth + c.frontThickness) / 2;
    return Math.abs(f.xMm - cx) < (f.w + c.width) / 2 + CABINET_MARGIN_MM && Math.abs(f.zMm - cz) < (f.d + c.depth + c.frontThickness) / 2 + CABINET_MARGIN_MM;
  });
}

function collides(
  candidate: PlacedAccessory,
  item: AccessoryItem,
  all: ReadonlyArray<PlacedAccessory>,
  cabs: ReadonlyArray<CabinetLite>,
  scene: SceneRef,
): boolean {
  const cf = footprintOf(candidate, [...all.filter((a) => a.id !== candidate.id), candidate], cabs, scene);
  if (!cf) return true;
  if (item.mount === 'FLOOR' && !item.noCollide && hitsCabinet(cf, cabs)) return true;
  return all.some((o) => {
    if (o.id === candidate.id) return false;
    const oi = itemOf(o);
    if (!oi || !sameSurface(item, oi)) return false;
    // Two floor pieces only compete when they stand on the same wall.
    if (item.mount === 'FLOOR' && (o.run ?? 'A') !== (candidate.run ?? 'A')) return false;
    const of = footprintOf(o, all, cabs, scene);
    return !!of && overlaps(cf, of, item.mount === 'FLOOR' ? CABINET_MARGIN_MM : MARGIN_MM);
  });
}


export type PlaceResult = { ok: true; placed: PlacedAccessory; warnings: string[] } | { ok: false; error: string };
const fail = (error: string): PlaceResult => ({ ok: false, error });

/** First x in [lo, hi] (step 10 mm, towards `dir`) where `free` is true; `prefer` is tried first. */
function scanX(lo: number, hi: number, free: (x: number) => boolean, prefer?: number, dir: 1 | -1 = 1): number | null {
  if (hi < lo) return null;
  if (prefer !== undefined && prefer >= lo && prefer <= hi && free(prefer)) return prefer;
  for (let x = dir === 1 ? lo : hi; dir === 1 ? x <= hi + 1e-9 : x >= lo - 1e-9; x += dir * STEP_MM) if (free(x)) return round1(x);
  return null;
}

function hoodWarnings(x: number, item: AccessoryItem, cabs: ReadonlyArray<CabinetLite>): string[] {
  const out: string[] = [];
  for (const c of cabs) {
    if (c.category !== 'WALL_UNIT') continue;
    if (Math.abs(c.positionX + c.width / 2 - x) < (c.width + item.sizeMm.w) / 2) {
      out.push(`الشفاط يتداخل مع الخزانة العلوية «${c.name ?? c.id}»: اترك بين خزانتين علويتين فراغًا بعرض الشفاط.`);
    }
  }
  return out;
}

/** Adds one piece of the library to the design (or says why it cannot go there). `hostCabinetId` = the chosen cabinet for the hosted mounts. */
export interface PlaceOptions {
  /** The room: with it, a floor piece is placed in a real gap on its wall and never past the wall's end. Without it the historic behaviour (after the run, unbounded) is kept for the old tests. */
  layout?: KitchenLayout;
  /** FLOOR only: the wall the piece stands on (default A). */
  run?: RunId;
}

export function placeAccessory(
  catalogId: string,
  newId: string,
  all: ReadonlyArray<PlacedAccessory>,
  cabs: ReadonlyArray<CabinetLite>,
  scene: SceneRef,
  hostCabinetId?: string,
  finish?: FinishKey,
  opts?: PlaceOptions,
): PlaceResult {
  const item = getAccessory(catalogId);
  if (!item) return fail('قطعة غير موجودة في المكتبة.');
  const { w, h, d } = item.sizeMm;
  const base: PlacedAccessory = { id: newId, catalogId, xMm: 0, ...(finish && item.finishes?.includes(finish) ? { finish } : {}), ...(item.mount === 'FLOOR' && opts?.run && opts.run !== 'A' ? { run: opts.run } : {}) };

  // ---- fixed on a cabinet --------------------------------------------------------------------------------------------
  if (item.mount === 'CABINET_INSIDE' || item.mount === 'CABINET_UNDER') {
    if (!hostCabinetId) return fail(item.mount === 'CABINET_UNDER' ? 'اختر الخزانة العلوية التي ستوضع تحتها القطعة.' : 'اختر الخزانة التي ستوضع فيها القطعة.');
    const cab = cabinetOf(cabs, hostCabinetId);
    if (!cab) return fail('الخزانة المختارة غير موجودة.');
    const placed: PlacedAccessory = { ...base, xMm: cab.positionX + cab.width / 2, cabinetId: cab.id };
    if (item.mount === 'CABINET_UNDER') {
      if (cab.category !== 'WALL_UNIT') return fail('هذه القطعة تُركَّب تحت خزانة علوية فقط.');
      if (!item.autoWidth && w > cab.width - 20) return fail(`الخزانة العلوية (${cab.width} مم) أضيق من القطعة (${w} مم).`);
      if (all.some((a) => a.catalogId === catalogId && a.cabinetId === cab.id)) return fail('هذه القطعة موجودة بالفعل تحت هذه الخزانة.');
      return { ok: true, placed, warnings: [] };
    }
    const th = cab.carcaseThickness;
    const used = all.filter((a) => a.cabinetId === cab.id && itemOf(a)?.mount === 'CABINET_INSIDE').reduce((s, a) => s + (itemOf(a)?.sizeMm.h ?? 0), 0);
    if (w > cab.width - 2 * th) return fail(`الفتحة الداخلية (${cab.width - 2 * th} مم) أضيق من القطعة (${w} مم).`);
    if (d > cab.depth - 20) return fail(`عمق الخزانة (${cab.depth} مم) لا يكفي لعمق القطعة (${d} مم).`);
    if (used + h > cab.height - 2 * th) return fail('الارتفاع الداخلي المتبقي لا يكفي لهذه القطعة.');
    return { ok: true, placed, warnings: [] };
  }

  // ---- stands on the floor -------------------------------------------------------------------------------------------
  if (item.mount === 'FLOOR' && opts?.layout) {
    // The coordinated way: the piece belongs to a wall, the wall has a length, and the place is the FIRST gap on that
    // wall (from the corner) that fits between the base cabinets and the floor pieces already there — exactly how a
    // new cabinet is placed. Nothing is ever exiled past the end of the wall: no gap, no placement, with the reason.
    const layout = opts.layout;
    const run: RunId = base.run ?? 'A';
    const wallMm = wallLengthOf(layout, run);
    if (w > wallMm) return fail(`عرض القطعة (${w} مم) أكبر من ${RUN_LABELS[run]} (${wallMm} مم).`);
    const runCabs = cabs.filter((c) => runOf(c) === run);
    const free = (x: number) => !collides({ ...base, xMm: x }, item, all, runCabs, scene);
    let lo = w / 2, hi = wallMm - w / 2;
    if (item.zPlace === 'FRONT' && scene.hasCounter) {
      // In front of the worktop (stools): keep to the stretch the worktop of this wall covers.
      const counter = runCabs.filter((c) => c.category === 'BASE_UNIT' && c.height <= LAYOUT.COUNTERTOP_MAX_UNIT_HEIGHT_MM);
      if (counter.length > 0) {
        lo = Math.max(lo, Math.min(...counter.map((c) => c.positionX)) + w / 2);
        hi = Math.min(hi, Math.max(...counter.map((c) => c.positionX + c.width)) - w / 2);
      }
    }
    // Flush candidates first (against the wall start and against each obstacle's far side, cabinet margin included):
    // a 610 mm gap fits a 600 mm washer only at its exact centre, which a 10 mm scan would step over and miss.
    const flush = new Set<number>([lo]);
    runCabs.filter((c) => c.category === 'BASE_UNIT').forEach((c) => flush.add(c.positionX + c.width + w / 2 + CABINET_MARGIN_MM));
    all.forEach((o) => { const oi = itemOf(o); if (oi && oi.mount === 'FLOOR' && !oi.noCollide && (o.run ?? 'A') === run) flush.add(o.xMm + oi.sizeMm.w / 2 + w / 2 + CABINET_MARGIN_MM); });
    const x = [...flush].filter((v) => v >= lo - 1e-9 && v <= hi + 1e-9).sort((a, b) => a - b).find(free) ?? scanX(lo, hi, free);
    if (x === null) return fail(`لا توجد فجوة بعرض ${w} مم على ${RUN_LABELS[run]} لهذه القطعة. حرّك خزانة أو اختر جدارًا آخر.`);
    return { ok: true, placed: { ...base, xMm: x }, warnings: [] };
  }
  if (item.mount === 'FLOOR') {
    const free = (x: number) => !collides({ ...base, xMm: x }, item, all, cabs, scene);
    let x: number | null;
    if (item.zPlace === 'FRONT') {
      x = scene.hasCounter ? scanX(scene.counterXStartMm + w / 2, scene.counterXEndMm - w / 2, free) : (free(0) ? 0 : null);
    } else {
      const right = (scene.hasCounter ? scene.counterXEndMm : 0) + w / 2 + 10;
      const left = (scene.hasCounter ? scene.counterXStartMm : 0) - w / 2 - 10;
      x = scanX(right, right + FLOOR_SCAN_MM, free) ?? scanX(left - FLOOR_SCAN_MM, left, free, undefined, -1);
    }
    if (x === null) return fail('لا يوجد مكان كافٍ على الأرض لهذه القطعة.');
    return { ok: true, placed: { ...base, xMm: x }, warnings: [] };
  }

  // ---- everything else needs the worktop -----------------------------------------------------------------------------
  if (!scene.hasCounter) return fail('أضف خزانة سفلية أولًا لتظهر الرخامة التي تُركَّب عليها القطعة.');
  const span = scene.counterXEndMm - scene.counterXStartMm;

  if (item.autoSpan) {
    if (all.some((a) => itemOf(a)?.autoSpan)) return fail('يوجد غطاء جداري بالفعل، احذفه أولًا لتضع غيره.');
    return { ok: true, placed: { ...base, xMm: scene.counterXStartMm + span / 2 }, warnings: [] };
  }
  if (w > span) return fail(`الرخامة أقصر من القطعة (${w} مم).`);

  // taps, dispensers, racks: on a sink
  if (item.rest === 'SINK') {
    const sinks = all.filter((a) => {
      const it = itemOf(a);
      return !!it && isSink(it);
    });
    if (sinks.length === 0) return fail('أضف حوضًا أولًا ثم ركّب عليه هذه القطعة.');
    const fitting = sinks.filter((s) => (itemOf(s)?.sizeMm.w ?? 0) - 40 >= w || item.restGroup === 'TAP' || item.restGroup === 'SOAP');
    if (fitting.length === 0) return fail('الأحواض الموجودة أضيق من هذه القطعة.');
    const free = fitting.find((s) => !all.some((a) => a.hostId === s.id && itemOf(a)?.restGroup === item.restGroup));
    if (!free) return fail('كل الأحواض تحمل قطعة من هذا النوع بالفعل.');
    const sinkItem = itemOf(free) as AccessoryItem;
    const dx = item.restGroup === 'SOAP' ? sinkItem.sizeMm.w / 2 - 55 : 0;
    return { ok: true, placed: { ...base, xMm: free.xMm + dx, hostId: free.id, dxMm: dx }, warnings: [] };
  }

  // wall pieces must fit between the worktop and the wall units
  if (item.mount === 'BACKSPLASH' && h > scene.splashMm) return fail(`القطعة أطول من المسافة بين الرخامة والخزائن العلوية (${scene.splashMm} مم).`);

  const lo = scene.counterXStartMm + w / 2, hi = scene.counterXEndMm - w / 2;
  let prefer: number | undefined;
  if (item.preferHob) {
    const hob = all.find((a) => {
      const it = itemOf(a);
      return !!it && isHob(it);
    });
    prefer = hob?.xMm;
  }
  const x = scanX(lo, hi, (cx) => !collides({ ...base, xMm: cx }, item, all, cabs, scene), prefer);
  if (x === null) return fail('لا يوجد فراغ كافٍ لهذه القطعة على هذا السطح.');
  return { ok: true, placed: { ...base, xMm: x }, warnings: item.mount === 'ABOVE_HOB' ? hoodWarnings(x, item, cabs) : [] };
}

export type NudgeResult = { ok: true; list: PlacedAccessory[] } | { ok: false; error: string };

/** Moves a piece along the wall by dx (mm): it stays in its range and stops before the first piece in the way. */
export function nudgeAccessory(
  id: string,
  dxMm: number,
  all: ReadonlyArray<PlacedAccessory>,
  cabs: ReadonlyArray<CabinetLite>,
  scene: SceneRef,
  layout?: KitchenLayout,
): NudgeResult {
  const p = all.find((a) => a.id === id);
  const item = p ? itemOf(p) : undefined;
  if (!p || !item) return { ok: false, error: 'القطعة غير موجودة.' };
  if (item.mount === 'CABINET_INSIDE' || item.mount === 'CABINET_UNDER') return { ok: false, error: 'هذه القطعة مثبّتة بالخزانة، انقلها بنقل الخزانة.' };
  if (item.autoSpan) return { ok: false, error: 'هذا الغطاء يمتد على كل الجدار.' };
  const replace = (np: PlacedAccessory) => all.map((a) => (a.id === id ? np : a));

  if (item.rest === 'SINK') {
    const host = all.find((a) => a.id === p.hostId);
    const hostItem = host ? itemOf(host) : undefined;
    if (!host || !hostItem) return { ok: false, error: 'الحوض غير موجود.' };
    const limit = footprintSizeOf(host, hostItem).w / 2 - footprintSizeOf(p, item).w / 2 - 20;
    const dx = Math.max(-limit, Math.min(limit, (p.dxMm ?? 0) + dxMm));
    return { ok: true, list: replace({ ...p, dxMm: dx, xMm: round1(host.xMm + dx) }) };
  }

  let lo: number, hi: number;
  // With a room, a floor piece is fenced by its own wall; the collisions are judged against that wall's cabinets only.
  const scopedCabs = item.mount === 'FLOOR' && layout ? cabs.filter((c) => runOf(c) === (p.run ?? 'A')) : cabs;
  const effW = footprintSizeOf(p, item).w;
  if (item.mount === 'FLOOR' && layout) {
    const wallMm = wallLengthOf(layout, p.run ?? 'A');
    lo = effW / 2; hi = Math.max(lo, wallMm - effW / 2);
  } else if (item.mount === 'FLOOR') {
    lo = -FLOOR_SCAN_MM; hi = FLOOR_SCAN_MM + (scene.hasCounter ? scene.counterXEndMm : 0);
  } else {
    if (!scene.hasCounter) return { ok: false, error: 'لا توجد رخامة.' };
    lo = scene.counterXStartMm + effW / 2; hi = scene.counterXEndMm - effW / 2;
  }
  const target = Math.max(lo, Math.min(hi, p.xMm + dxMm));
  if (target === p.xMm) return { ok: false, error: 'وصلت القطعة إلى الحافة.' };
  // Slide towards the target and stop just before the first piece in the way (a big step never jumps over a piece).
  const dir = target > p.xMm ? 1 : -1;
  // A piece a cabinet was built over (older saves could do that) starts INSIDE the obstacle: let it walk out to the
  // first free spot in the chosen direction instead of refusing every step — the refusal is what trapped it there.
  const trapped = collides({ ...p, xMm: p.xMm }, item, all, scopedCabs, scene);
  // Trapped, the 50 mm step is not the limit: the piece walks on to the first free spot in that direction (wall-fenced).
  const limit = trapped ? (dir === 1 ? hi : lo) : target;
  let best = p.xMm;
  for (let x = p.xMm + dir * STEP_MM; dir * (limit - x) > -1e-9; x += dir * STEP_MM) {
    if (collides({ ...p, xMm: x }, item, all, scopedCabs, scene)) { if (!trapped) break; continue; }
    best = x;
    if (trapped) break; // out: stop at the first free spot, never tunnel on through the neighbour
  }
  if (best !== target && Math.abs(target - best) < STEP_MM && !collides({ ...p, xMm: target }, item, all, scopedCabs, scene)) best = target;
  if (best === p.xMm) return { ok: false, error: trapped ? 'لا مخرج في هذا الاتجاه: جرّب الاتجاه الآخر.' : 'تصطدم القطعة بقطعة أخرى في هذا الاتجاه.' };
  return { ok: true, list: replace({ ...p, xMm: round1(best) }) };
}

/** Changes the finish of a piece (only to one it offers). */
export function setFinish(all: ReadonlyArray<PlacedAccessory>, id: string, finish: FinishKey): PlacedAccessory[] {
  return all.map((a) => (a.id === id && itemOf(a)?.finishes?.includes(finish) ? { ...a, finish } : a));
}

/** Removes a piece and everything fixed on it (a sink takes its taps with it). */
export function removeAccessory(all: ReadonlyArray<PlacedAccessory>, id: string): PlacedAccessory[] {
  return all.filter((a) => a.id !== id && a.hostId !== id);
}

/** Drops the pieces whose cabinet or sink was deleted (they could not be drawn anyway). */
export function reconcileAccessories(all: ReadonlyArray<PlacedAccessory>, cabs: ReadonlyArray<CabinetLite>): PlacedAccessory[] {
  let list = all.filter((a) => {
    const it = itemOf(a);
    if (!it) return false;
    if (it.mount === 'CABINET_INSIDE' || it.mount === 'CABINET_UNDER') return !!cabinetOf(cabs, a.cabinetId);
    return true;
  });
  for (;;) {
    const next = list.filter((a) => !a.hostId || list.some((o) => o.id === a.hostId));
    if (next.length === list.length) return next;
    list = next;
  }
}

// ---- the user's own size and direction ---------------------------------------------------------------------------------
// A piece may be resized (W x H x D), turned by quarter turns and mirrored, alone or hosted. Every change is judged by
// the same footprint and collision rules as a fresh placement: what does not fit is refused, with the largest size that
// WOULD fit at this spot — never silently clipped, because a clipped size is a kitchen that cannot be built.

export type TransformResult = { ok: true; list: PlacedAccessory[] } | { ok: false; error: string };

const swapIn = (all: ReadonlyArray<PlacedAccessory>, candidate: PlacedAccessory) => all.map((a) => (a.id === candidate.id ? candidate : a));

/** Why this piece, at this size and direction, cannot stand where it is (null = it can). Plain reason, no size hints. */
export function transformProblem(
  candidate: PlacedAccessory,
  all: ReadonlyArray<PlacedAccessory>,
  cabs: ReadonlyArray<CabinetLite>,
  scene: SceneRef,
  layout?: KitchenLayout,
): string | null {
  const item = itemOf(candidate);
  if (!item) return 'قطعة غير موجودة في المكتبة.';
  if (item.autoSpan) return 'هذا الغطاء يمتد على الجدار كله بمقاسه.';
  const list = swapIn(all, candidate);
  const fp = footprintOf(candidate, list, cabs, scene);
  if (!fp) return 'الخزانة أو الحوض المستضيف لم يعد موجودًا.';
  const eff = footprintSizeOf(candidate, item);
  const scoped = item.mount === 'FLOOR' && layout ? cabs.filter((c) => runOf(c) === (candidate.run ?? 'A')) : cabs;

  if (item.mount === 'FLOOR' && layout && !item.noCollide) {
    const wallMm = wallLengthOf(layout, candidate.run ?? 'A');
    if (fp.xMm - fp.w / 2 < -0.5 || fp.xMm + fp.w / 2 > wallMm + 0.5) return `تتجاوز نهاية ${RUN_LABELS[candidate.run ?? 'A']} (${wallMm} مم).`;
  }
  if (item.mount === 'BACKSPLASH' && eff.h > scene.splashMm) return `ارتفاعها (${eff.h} مم) أكبر من المسافة بين الرخامة والخزائن العلوية (${scene.splashMm} مم).`;
  if (item.mount === 'COUNTERTOP' && !item.rest && scene.hasCounter) {
    if (fp.xMm - fp.w / 2 < scene.counterXStartMm - 0.5 || fp.xMm + fp.w / 2 > scene.counterXEndMm + 0.5) return 'تخرج عن طرفي الرخامة.';
    if (fp.zMm - fp.d / 2 < scene.zBackMm - 0.5 || fp.zMm + fp.d / 2 > scene.zFrontMm + 0.5) return `عمقها (${eff.d} مم) أكبر من عمق الرخامة المتاح.`;
  }
  if (item.mount === 'CABINET_INSIDE') {
    const cab = cabinetOf(cabs, candidate.cabinetId);
    if (!cab) return 'الخزانة المستضيفة غير موجودة.';
    const th = cab.carcaseThickness;
    if (eff.w > cab.width - 2 * th) return `أعرض من الفتحة الداخلية للخزانة (${cab.width - 2 * th} مم).`;
    if (eff.d > cab.depth - 20) return `أعمق من الخزانة (${cab.depth - 20} مم متاحة).`;
    const used = list.filter((a) => a.id !== candidate.id && a.cabinetId === cab.id && itemOf(a)?.mount === 'CABINET_INSIDE')
      .reduce((s, a) => { const it = itemOf(a); return s + (it ? sizeOf(a, it).h : 0); }, 0);
    if (used + eff.h > cab.height - 2 * th) return `الارتفاع الداخلي المتبقي (${cab.height - 2 * th - used} مم) لا يكفي لهذا الارتفاع.`;
  }
  if (item.mount === 'CABINET_UNDER') {
    const cab = cabinetOf(cabs, candidate.cabinetId);
    if (!cab) return 'الخزانة المستضيفة غير موجودة.';
    if (!item.autoWidth && eff.w > cab.width - 20) return `أعرض من الخزانة العلوية (${cab.width - 20} مم متاحة).`;
    if (eff.d > cab.depth) return `أعمق من الخزانة العلوية (${cab.depth} مم).`;
  }
  if (item.rest === 'SINK') {
    const host = list.find((a) => a.id === candidate.hostId);
    const hostItem = host ? itemOf(host) : undefined;
    const hf = host && hostItem ? footprintOf(host, list, cabs, scene) : null;
    if (!hf || !hostItem) return 'الحوض غير موجود.';
    if (eff.w > hf.w || eff.d > hf.d) return `أكبر من الحوض (${hf.w}×${hf.d} مم).`;
  }
  if (!item.noCollide && collides(candidate, item, list, scoped, scene)) return 'تصطدم بخزانة أو بقطعة أخرى بهذا المقاس/الاتجاه.';
  return null;
}

/** Largest value of one axis (at most `requested`) that fits at this spot, the other two axes as requested. */
function maxAxis(candidate: PlacedAccessory, axis: 'w' | 'h' | 'd', requested: number, all: ReadonlyArray<PlacedAccessory>, cabs: ReadonlyArray<CabinetLite>, scene: SceneRef, layout?: KitchenLayout): number {
  const item = itemOf(candidate);
  if (!item) return requested;
  const fits = (v: number) => transformProblem({ ...candidate, sizeMm: { ...(candidate.sizeMm ?? item.sizeMm), [axis]: v } }, all, cabs, scene, layout) === null;
  if (fits(requested)) return requested;
  let lo = 10, hi = requested;
  while (lo < hi) { const mid = Math.floor((lo + hi + 1) / 2); if (fits(mid)) lo = mid; else hi = mid - 1; }
  return lo;
}

/** Gives a placed piece the user's own size (mm, intrinsic — rotation applies on top). Refused, with the max that fits, when it cannot stand. */
export function resizeAccessory(
  id: string,
  size: { w: number; h: number; d: number },
  all: ReadonlyArray<PlacedAccessory>,
  cabs: ReadonlyArray<CabinetLite>,
  scene: SceneRef,
  layout?: KitchenLayout,
): TransformResult {
  const p = all.find((a) => a.id === id);
  const item = p ? itemOf(p) : undefined;
  if (!p || !item) return { ok: false, error: 'القطعة غير موجودة.' };
  const want = { w: Math.max(10, Math.round(size.w)), h: Math.max(10, Math.round(size.h)), d: Math.max(10, Math.round(size.d)) };
  const candidate = { ...p, sizeMm: want };
  const problem = transformProblem(candidate, all, cabs, scene, layout);
  if (!problem) return { ok: true, list: swapIn(all, candidate) };
  const hints: string[] = [];
  (['w', 'h', 'd'] as const).forEach((axis) => {
    const cur = (p.sizeMm ?? item.sizeMm)[axis];
    if (want[axis] !== cur) {
      const m = maxAxis({ ...p, sizeMm: want }, axis, want[axis], all, cabs, scene, layout);
      if (m < want[axis]) hints.push(`أقصى ${axis === 'w' ? 'عرض' : axis === 'h' ? 'ارتفاع' : 'عمق'} ممكن هنا ${m} مم`);
    }
  });
  return { ok: false, error: `لا يتسع المكان لهذا المقاس: ${problem}${hints.length ? ` (${hints.join('، ')})` : ''}` };
}

/** Turns a piece by a quarter turn (dir +1 = clockwise seen from above). Refused when the turned footprint cannot stand. */
export function rotateAccessory(
  id: string,
  dir: 1 | -1,
  all: ReadonlyArray<PlacedAccessory>,
  cabs: ReadonlyArray<CabinetLite>,
  scene: SceneRef,
  layout?: KitchenLayout,
): TransformResult {
  const p = all.find((a) => a.id === id);
  const item = p ? itemOf(p) : undefined;
  if (!p || !item) return { ok: false, error: 'القطعة غير موجودة.' };
  if (item.autoSpan) return { ok: false, error: 'هذا الغطاء يمتد على الجدار كله ولا يُدوَّر.' };
  const rotY = (((p.rotY ?? 0) + dir * 90) % 360 + 360) % 360 as 0 | 90 | 180 | 270;
  const candidate = { ...p, rotY };
  const problem = transformProblem(candidate, all, cabs, scene, layout);
  if (problem) return { ok: false, error: `الاتجاه الجديد (${rotY}°) لا يتسع هنا: ${problem}` };
  return { ok: true, list: swapIn(all, candidate) };
}

/** Mirrors a piece left-right. The footprint never changes, so this always succeeds (except the wall-wide cover). */
export function flipAccessory(all: ReadonlyArray<PlacedAccessory>, id: string): TransformResult {
  const p = all.find((a) => a.id === id);
  const item = p ? itemOf(p) : undefined;
  if (!p || !item) return { ok: false, error: 'القطعة غير موجودة.' };
  if (item.autoSpan) return { ok: false, error: 'هذا الغطاء يمتد على الجدار كله.' };
  return { ok: true, list: all.map((a) => (a.id === id ? { ...a, flip: !a.flip } : a)) };
}

/** Back to the catalog size and direction. */
export function resetAccessoryTransform(all: ReadonlyArray<PlacedAccessory>, id: string): PlacedAccessory[] {
  return all.map((a) => {
    if (a.id !== id) return a;
    const { sizeMm: _s, rotY: _r, flip: _f, ...rest } = a;
    return rest;
  });
}
