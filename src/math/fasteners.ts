// src/math/fasteners.ts
// The connectors and mechanisms of a cabinet, derived from the SAME assembly geometry the BOM and the 3D read:
// cam-lock bolts and housings, dowels, shelf pins, back-panel screws, hinge cups / arms / plates, drawer runners and
// lift kits. Each one belongs to a PARENT part (a board key or a facade key): in the exploded view it travels with
// that part, so a dowel stays in its board and is visible in the gap, exactly like in a real assembly.
// Cabinet-local coordinates in millimetres, same as assemblyGeometry.ts.
import { CabinetObject } from '../types/flatma';
import { AssemblyGeometry, BoxGeo, FacadeGeo, applianceKey, facadeKey, runnerLengthMm } from './assemblyGeometry';
import { FASTENER } from './constants';
import { hingesPerDoor } from './hinges';

export type FastenerKind =
  | 'DOWEL' | 'CAM_BOLT' | 'CAM' | 'BACK_SCREW' | 'SHELF_PIN'
  | 'HINGE_CUP' | 'HINGE_ARM' | 'HINGE_PLATE' | 'RUNNER' | 'LIFT_KIT';

export interface Fastener {
  kind: FastenerKind;
  shape: 'cyl' | 'box';
  /** Cylinders: the axis they lie along. Boxes ignore it. */
  axis: 'x' | 'y' | 'z';
  centerMm: [number, number, number];
  /** Cylinder: [diameter, length, 0]. Box: [x, y, z]. */
  sizeMm: [number, number, number];
  /** Key of the board / facade that carries this fastener. */
  parent: string;
}

type Vec = [number, number, number];
const cyl = (kind: FastenerKind, axis: Fastener['axis'], c: Vec, dia: number, len: number, parent: string): Fastener =>
  ({ kind, shape: 'cyl', axis, centerMm: c, sizeMm: [dia, len, 0], parent });
const box = (kind: FastenerKind, c: Vec, size: Vec, parent: string): Fastener =>
  ({ kind, shape: 'box', axis: 'y', centerMm: c, sizeMm: size, parent });

/** n+1 points from a to b, never further apart than `pitch`. */
export function spread(a: number, b: number, pitch: number): number[] {
  if (b <= a) return [(a + b) / 2];
  const n = Math.max(1, Math.ceil((b - a) / pitch));
  return Array.from({ length: n + 1 }, (_, i) => a + ((b - a) * i) / n);
}

/** Depth positions of the connectors along a joint spanning z in [zLo, zHi]. */
export function jointZs(zLo: number, zHi: number): number[] {
  const span = zHi - zLo;
  const mid = (zLo + zHi) / 2;
  if (span < 2 * FASTENER.EDGE_SETBACK_MM + 60) return [mid];
  const zs = [zHi - FASTENER.EDGE_SETBACK_MM, zLo + FASTENER.EDGE_SETBACK_MM];
  if (span > FASTENER.MID_CONNECTOR_DEPTH_MM) zs.splice(1, 0, mid);
  return zs;
}

export function buildFasteners(geo: AssemblyGeometry, cab: Pick<CabinetObject, 'width' | 'height' | 'depth'>, o: { carcaseTh: number; frontTh: number }): Fastener[] {
  const out: Fastener[] = [];
  const { carcaseTh: th, frontTh } = o;
  const W = cab.width, H = cab.height, D = cab.depth;
  const sides: Array<{ key: string; xFace: number; dir: 1 | -1 }> = [
    { key: 'side-left', xFace: th, dir: 1 },
    { key: 'side-right', xFace: W - th, dir: -1 },
  ];

  // ---- board-to-side joints: a cam bolt (screwed into the side) + its cam housing (in the board) + a dowel
  geo.boxes.filter((b) => b.kind === 'bottom' || b.kind === 'divider' || b.kind === 'rail' || b.kind === 'roof').forEach((b: BoxGeo) => {
    const [, cy, cz] = b.centerMm;
    const zLo = cz - b.sizeMm[2] / 2, zHi = cz + b.sizeMm[2] / 2;
    sides.forEach((s) => {
      jointZs(zLo, zHi).forEach((z) => {
        out.push(cyl('CAM_BOLT', 'x', [s.xFace + s.dir * (FASTENER.BOLT_LEN_MM / 2 - 5), cy, z], FASTENER.BOLT_DIA_MM, FASTENER.BOLT_LEN_MM, s.key));
        out.push(cyl('CAM', 'y', [s.xFace + s.dir * FASTENER.BOLT_LEN_MM, cy + b.sizeMm[1] / 2 - FASTENER.CAM_DEPTH_MM / 2, z], FASTENER.CAM_DIA_MM, FASTENER.CAM_DEPTH_MM, b.key));
        const zd = z > (zLo + zHi) / 2 ? z - FASTENER.DOWEL_OFFSET_MM : z + FASTENER.DOWEL_OFFSET_MM;
        out.push(cyl('DOWEL', 'x', [s.xFace, cy, zd], FASTENER.DOWEL_DIA_MM, FASTENER.DOWEL_LEN_MM, b.key));
      });
    });
  });

  // ---- shelf pins: four under every shelf, set in the sides
  geo.boxes.filter((b) => b.kind === 'shelf').forEach((b) => {
    const [, cy, cz] = b.centerMm;
    const y = cy - b.sizeMm[1] / 2 - FASTENER.SHELF_PIN_DIA_MM / 2;
    const zs = [cz + b.sizeMm[2] / 2 - FASTENER.SHELF_PIN_SETBACK_MM, cz - b.sizeMm[2] / 2 + FASTENER.SHELF_PIN_SETBACK_MM];
    sides.forEach((s) => zs.forEach((z) => out.push(cyl('SHELF_PIN', 'x', [s.xFace + s.dir * FASTENER.SHELF_PIN_LEN_MM / 2, y, z], FASTENER.SHELF_PIN_DIA_MM, FASTENER.SHELF_PIN_LEN_MM, s.key))));
  });

  // ---- back panel: screws round the perimeter, into the rear edges of the sides, bottom and top
  const back = geo.boxes.find((b) => b.kind === 'back');
  if (back) {
    const zc = -D / 2 - back.sizeMm[2] + FASTENER.BACK_SCREW_LEN_MM / 2;
    const pitch = FASTENER.BACK_SCREW_PITCH_MM;
    const put = (x: number, y: number) => out.push(cyl('BACK_SCREW', 'z', [x, y, zc], FASTENER.BACK_SCREW_DIA_MM, FASTENER.BACK_SCREW_LEN_MM, back.key));
    spread(30, H - 30, pitch).forEach((y) => { put(th / 2, y); put(W - th / 2, y); });
    spread(th + 30, W - th - 30, pitch).forEach((x) => { put(x, th / 2); put(x, H - th / 2); });
  }

  // ---- facades: hinges, lift kits, drawer runners
  geo.facades.forEach((f: FacadeGeo) => {
    const key = facadeKey(f);
    const zRear = f.zMm - frontTh / 2;
    if (f.motion === 'SWING' && f.hinge) {
      const left = f.hinge === 'LEFT';
      const xCup = left ? f.xMm + FASTENER.HINGE_CUP_EDGE_MM : f.xMm + f.widthMm - FASTENER.HINGE_CUP_EDGE_MM;
      const xPlate = left ? th + 4 : W - th - 4;
      const n = hingesPerDoor(f.heightMm);
      const lo = f.yMm + Math.min(FASTENER.HINGE_END_OFFSET_MM, f.heightMm / 4);
      const hi = f.yMm + f.heightMm - Math.min(FASTENER.HINGE_END_OFFSET_MM, f.heightMm / 4);
      const ys = n <= 1 ? [(lo + hi) / 2] : Array.from({ length: n }, (_, i) => lo + ((hi - lo) * i) / (n - 1));
      ys.forEach((y) => {
        out.push(cyl('HINGE_CUP', 'z', [xCup, y, zRear + FASTENER.HINGE_CUP_DEPTH_MM / 2], FASTENER.HINGE_CUP_DIA_MM, FASTENER.HINGE_CUP_DEPTH_MM, key));
        out.push(box('HINGE_ARM', [(xCup + xPlate) / 2, y, zRear - 8], [Math.abs(xCup - xPlate) + 10, 10, 26], key));
        out.push(box('HINGE_PLATE', [xPlate, y, zRear - 22], [8, 40, 35], left ? 'side-left' : 'side-right'));
      });
    } else if (f.motion === 'LIFT') {
      const parent = geo.boxes.some((b) => b.key === 'roof') ? 'roof' : 'rail-front';
      out.push(box('LIFT_KIT', [f.xMm + f.widthMm / 2, f.yMm + f.heightMm - 55, zRear - 40], [Math.min(f.widthMm * 0.6, 320), 40, 60], parent));
    } else if (f.motion === 'SLIDE') {
      const len = runnerLengthMm(D);
      const y = f.yMm + f.heightMm * 0.35;
      const z = zRear - 20 - len / 2;
      out.push(box('RUNNER', [th + 6, y, z], [12, 40, len], 'side-left'));
      out.push(box('RUNNER', [W - th - 6, y, z], [12, 40, len], 'side-right'));
    } else if (f.motion === 'PULL_OUT' && f.frame) {
      // Full-extension runners hug the frame (one pair per front). Outer runners fix to the carcase sides; runners
      // between two side-by-side fronts would need a partition (the model warns about it) and hang on the bottom board.
      const len = runnerLengthMm(D);
      const [fw, fh] = f.frame.sizeMm;
      const cx = f.frame.centerMm[0];
      const y = f.frame.centerMm[1] - fh / 2 + 20;
      const z = zRear - 20 - len / 2;
      const first = f.kind !== 'DOOR' || f.index === 0;
      const last = f.kind !== 'DOOR' || f.index === f.count - 1;
      out.push(box('RUNNER', [cx - fw / 2 - 6, y, z], [12, 40, len], first ? 'side-left' : 'bottom'));
      out.push(box('RUNNER', [cx + fw / 2 + 6, y, z], [12, 40, len], last ? 'side-right' : 'bottom'));
    }
  });

  return out;
}

/** How many of each connector the cabinet needs (the BOM counts these when your stock has the matching item). */
export function fastenerCounts(list: Fastener[]): Record<FastenerKind, number> {
  const counts = { DOWEL: 0, CAM_BOLT: 0, CAM: 0, BACK_SCREW: 0, SHELF_PIN: 0, HINGE_CUP: 0, HINGE_ARM: 0, HINGE_PLATE: 0, RUNNER: 0, LIFT_KIT: 0 } as Record<FastenerKind, number>;
  list.forEach((f) => { counts[f.kind] += 1; });
  return counts;
}

// ------------------------------------------------------------------------------------------ exploded view

export type Offset = [number, number, number];

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * How far every part moves (mm) at `amount` in [0, 1]: sides out left / right, bottom down, top up, back behind,
 * facades forward, shelves and dividers spreading up and down from the middle. Fasteners follow their parent.
 */
export function explodeOffsets(geo: AssemblyGeometry, cab: Pick<CabinetObject, 'width' | 'height' | 'depth'>, amount: number): Record<string, Offset> {
  const a = clamp(amount, 0, 1);
  const out: Record<string, Offset> = {};
  const u = a * clamp(0.3 * Math.max(cab.width, cab.depth) + 80, 150, 300); // sideways / depth unit
  const v = a * clamp(0.12 * cab.height, 120, 260);                          // vertical unit
  const rel = (y: number) => clamp((y - cab.height / 2) / (cab.height / 2), -1, 1);
  const clean = (o: Offset): Offset => [o[0] === 0 ? 0 : o[0], o[1] === 0 ? 0 : o[1], o[2] === 0 ? 0 : o[2]]; // no -0

  geo.boxes.forEach((b) => {
    const y = b.centerMm[1];
    let o: Offset = [0, 0, 0];
    if (b.key === 'side-left') o = [-u, 0, 0];
    else if (b.key === 'side-right') o = [u, 0, 0];
    else if (b.kind === 'bottom') o = [0, -v, 0];
    else if (b.kind === 'roof') o = [0, v, 0];
    else if (b.key === 'rail-front') o = [0, v, 0.35 * u];
    else if (b.key === 'rail-rear') o = [0, v, -0.35 * u];
    else if (b.kind === 'back') o = [0, 0, -1.4 * u];
    else if (b.kind === 'divider' || b.kind === 'shelf') o = [0, rel(y) * v * 0.9, 0];
    out[b.key] = clean(o);
  });
  geo.facades.forEach((f) => { out[facadeKey(f)] = clean([0, rel(f.yMm + f.heightMm / 2) * v * 0.6, 1.6 * u]); });
  geo.appliances.forEach((p) => { out[applianceKey(p.zoneIndex)] = clean([0, rel(p.centerMm[1]) * v * 0.6, 0.8 * u]); });
  return out;
}
