// src/math/modelFit.ts
// Puts a real 3D model (a .glb of the external library) into the box of its catalog size. Pure numbers: the same function
// decides the scale in the 3D scene and the warnings of `npm run models:check`.
//
// The model keeps its own units (metres, centimetres, millimetres: it does not matter, only its proportions do), so a file
// exported in any unit lands at the catalog size. The result is expressed in scene metres, with the model centred on the
// footprint and standing on y = 0 (the same frame as math/accessoryModels.ts).

export type Vec3 = [number, number, number];
export interface BBox { min: Vec3; max: Vec3 }
export type FitMode = 'contain' | 'stretch';
export interface Fit { scale: Vec3; offset: Vec3 }

export const bboxSize = (b: BBox): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];

/** The box of a model turned by `deg` degrees about the vertical axis (three.js convention: rotation.y). */
export function rotateBBoxY(b: BBox, deg: number): BBox {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
  for (const x of [b.min[0], b.max[0]]) {
    for (const z of [b.min[2], b.max[2]]) {
      const rx = x * c + z * s, rz = -x * s + z * c;
      x0 = Math.min(x0, rx); x1 = Math.max(x1, rx); z0 = Math.min(z0, rz); z1 = Math.max(z1, rz);
    }
  }
  return { min: [x0, b.min[1], z0], max: [x1, b.max[1], z1] };
}

const TINY = 1e-9;

/**
 * Scale and offset (to apply as p' = p * scale + offset, after the rotation) that put the model's box into
 * `target` (mm): 'contain' keeps the proportions and touches the tightest side, 'stretch' fills the three sides.
 */
export function fitToBox(b: BBox, target: { w: number; h: number; d: number }, mode: FitMode = 'contain'): Fit {
  const [bw, bh, bd] = bboxSize(b);
  if (bw < TINY || bh < TINY || bd < TINY) return { scale: [1, 1, 1], offset: [0, 0, 0] };
  const tw = target.w / 1000, th = target.h / 1000, td = target.d / 1000;
  const scale: Vec3 = mode === 'stretch' ? [tw / bw, th / bh, td / bd] : (() => { const k = Math.min(tw / bw, th / bh, td / bd); return [k, k, k] as Vec3; })();
  const cx = (b.min[0] + b.max[0]) / 2, cz = (b.min[2] + b.max[2]) / 2;
  return { scale, offset: [-cx * scale[0], -b.min[1] * scale[1], -cz * scale[2]] };
}

/** How far the proportions of the model are from the ones of the catalog size: 0 = identical, 0.5 = 50 % off on one side. */
export function proportionMismatch(b: BBox, target: { w: number; h: number; d: number }): number {
  const [bw, bh, bd] = bboxSize(b);
  if (bw < TINY || bh < TINY || bd < TINY) return Infinity;
  const k = [target.w / bw, target.h / bh, target.d / bd];
  return Math.max(...k) / Math.min(...k) - 1;
}
