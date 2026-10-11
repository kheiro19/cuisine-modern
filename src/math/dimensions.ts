// src/math/dimensions.ts
// The dimension lines of the 3D atomic workspace, drawn like the reference screenshots: a vertical chain on the left (every opening,
// then the total), the inner and the outer width one under the other at the bottom, the depth along the top edge, and a small bracket
// across every front gap (the 1 mm between two doors), and the width and the height of every FRONT (door, drawer, panel) drawn on its
// own face (finished size, then "✂" and the size really cut once the edge band is taken off), because the carcase measures alone do not tell the size of the fronts. Pure numbers in millimetres (x right, y up, z towards the viewer, the cabinet's
// left edge at x = 0, its bottom at y = 0, its middle at z = 0); components/MeasureOverlay.tsx draws them.
import { AssemblyGeometry, facadeKey } from './assemblyGeometry';
import { PartBox, Vec3, gapsBetween } from './audit';

export type DimensionKind = 'OPENING' | 'BOARD' | 'TOTAL' | 'WIDTH_INNER' | 'WIDTH_OUTER' | 'DEPTH' | 'GAP' | 'FRONT_W' | 'FRONT_H';

export interface DimensionLine {
  id: string;
  kind: DimensionKind;
  /** The two points being measured. */
  a: Vec3;
  b: Vec3;
  /** Where the dimension line is drawn, relative to the measured points (the extension lines run out to it). */
  offset: Vec3;
  valueMm: number;
  /** Fronts only: the size that is really CUT (finished size minus the edge band glued on both sides); absent when no band is known. */
  cutMm?: number;
  label: string;
  /** Thin boards and gaps: drawn lighter, labelled only when asked for. */
  minor?: boolean;
}

/** 248, 241, 381.8, 0.5: whole numbers without a decimal point, otherwise one decimal. */
export const formatMm = (v: number): string => {
  const r = Math.round(v * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
};

const ROW = 60; // distance between the cabinet and the first dimension row, and between two rows

/** The horizontal boards (bottom, dividers, roof, rails) as height intervals, merged: what is left between them is an opening. */
function boardIntervals(geo: AssemblyGeometry): Array<[number, number]> {
  const spans = geo.boxes
    .filter((b) => b.kind === 'bottom' || b.kind === 'divider' || b.kind === 'roof' || b.kind === 'rail')
    .map((b): [number, number] => [b.centerMm[1] - b.sizeMm[1] / 2, b.centerMm[1] + b.sizeMm[1] / 2])
    .sort((p, q) => p[0] - q[0]);
  const merged: Array<[number, number]> = [];
  spans.forEach(([lo, hi]) => {
    const last = merged[merged.length - 1];
    if (last && lo <= last[1] + 1e-6) last[1] = Math.max(last[1], hi);
    else merged.push([lo, hi]);
  });
  return merged;
}

export function dimensionsOf(geo: AssemblyGeometry, cab: { width: number; height: number; depth: number }, thicknessMm: number, frontThicknessMm = thicknessMm, frontEdgeMm = 0): DimensionLine[] {
  const { width: W, height: H, depth: D } = cab;
  const front = D / 2;
  const out: DimensionLine[] = [];

  // Left chain: every board and every opening from the floor to the top, bottom to top.
  const boards = boardIntervals(geo);
  const cuts: Array<{ lo: number; hi: number; board: boolean }> = [];
  let cursor = 0;
  boards.forEach(([lo, hi]) => {
    if (lo > cursor + 1e-6) cuts.push({ lo: cursor, hi: lo, board: false });
    cuts.push({ lo: Math.max(lo, cursor), hi, board: true });
    cursor = hi;
  });
  if (cursor < H - 1e-6) cuts.push({ lo: cursor, hi: H, board: false });
  cuts.forEach((c, i) => {
    const len = c.hi - c.lo;
    out.push({ id: `chain-${i}`, kind: c.board ? 'BOARD' : 'OPENING', a: [0, c.lo, front], b: [0, c.hi, front], offset: [-ROW, 0, 0], valueMm: len, label: formatMm(len), minor: c.board });
  });
  out.push({ id: 'total', kind: 'TOTAL', a: [0, 0, front], b: [0, H, front], offset: [-2 * ROW, 0, 0], valueMm: H, label: formatMm(H) });

  // Bottom: the inner width, and under it the overall width.
  out.push({ id: 'width-inner', kind: 'WIDTH_INNER', a: [thicknessMm, 0, front], b: [W - thicknessMm, 0, front], offset: [0, -ROW, 0], valueMm: W - 2 * thicknessMm, label: formatMm(W - 2 * thicknessMm) });
  out.push({ id: 'width-outer', kind: 'WIDTH_OUTER', a: [0, 0, front], b: [W, 0, front], offset: [0, -2 * ROW, 0], valueMm: W, label: formatMm(W) });

  // Top: the depth, along the left edge.
  out.push({ id: 'depth', kind: 'DEPTH', a: [0, H, -D / 2], b: [0, H, front], offset: [0, ROW, 0], valueMm: D, label: formatMm(D) });

  // A bracket across every gap between two fronts, floating a little in front of them.
  const fronts: PartBox[] = geo.facades.map((f) => ({ key: facadeKey(f), min: [f.xMm, f.yMm, f.zMm - 1], max: [f.xMm + f.widthMm, f.yMm + f.heightMm, f.zMm + 1] })); // 2 mm deep: they must overlap in z to face each other
  const faceZ = Math.max(...geo.facades.map((f) => f.zMm), 0) + frontThicknessMm / 2; // the brackets float just in front of the fronts' face
  gapsBetween(fronts).forEach((g, i) => {
    if (g.axis === 'z') return;
    const k = g.axis === 'x' ? 0 : 1;
    const a: Vec3 = [...g.at] as Vec3, b: Vec3 = [...g.at] as Vec3;
    a[k] = g.at[k] - g.gapMm / 2; b[k] = g.at[k] + g.gapMm / 2;
    a[2] = b[2] = faceZ;
    out.push({ id: `gap-${i}`, kind: 'GAP', a, b, offset: [0, 0, 30], valueMm: g.gapMm, label: formatMm(g.gapMm), minor: true });
  });

  // The size of every front, as it is cut: its width near its top edge and its height near its left edge, floating just in front of
  // the face (the offset keeps the extension lines non-zero and the brackets clear of the gap brackets above).
  geo.facades.forEach((f) => {
    if (f.widthMm <= 0 || f.heightMm <= 0) return;
    const key = facadeKey(f);
    const z = f.zMm + frontThicknessMm / 2; // the outer face of the front
    const yW = f.yMm + f.heightMm - Math.min(60, f.heightMm * 0.2);
    const xH = f.xMm + Math.min(60, f.widthMm * 0.2);
    // Fronts are banded on all four edges: the board is cut smaller than the finished size by the band on each side.
    const cutW = f.widthMm - 2 * frontEdgeMm, cutH = f.heightMm - 2 * frontEdgeMm;
    const label = (finished: number, cut: number) => (frontEdgeMm > 0 ? `${formatMm(finished)} ✂ ${formatMm(cut)}` : formatMm(finished));
    const extra = (cut: number) => (frontEdgeMm > 0 ? { cutMm: cut } : {});
    out.push({ id: `front-w-${key}`, kind: 'FRONT_W', a: [f.xMm, yW, z], b: [f.xMm + f.widthMm, yW, z], offset: [0, 0, 20], valueMm: f.widthMm, ...extra(cutW), label: label(f.widthMm, cutW) });
    out.push({ id: `front-h-${key}`, kind: 'FRONT_H', a: [xH, f.yMm, z], b: [xH, f.yMm + f.heightMm, z], offset: [0, 0, 20], valueMm: f.heightMm, ...extra(cutH), label: label(f.heightMm, cutH) });
  });
  return out;
}

export interface DimensionGraphics {
  /** Line segments to draw, each [from, to]. */
  segments: Array<[Vec3, Vec3]>;
  /** Where the number goes. */
  labelAt: Vec3;
}

const add = (p: Vec3, q: Vec3): Vec3 => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const scale = (p: Vec3, s: number): Vec3 => [p[0] * s, p[1] * s, p[2] * s];
const norm = (p: Vec3): Vec3 => { const l = Math.hypot(p[0], p[1], p[2]) || 1; return scale(p, 1 / l); };

/** The two extension lines, the dimension line between them and a slanted tick at each end (the architectural style of the references). */
export function dimensionGraphics(d: DimensionLine, overshootMm = 8, tickMm = 6): DimensionGraphics {
  const dir = norm([d.b[0] - d.a[0], d.b[1] - d.a[1], d.b[2] - d.a[2]]);
  const out = norm(d.offset);
  const a2 = add(d.a, d.offset), b2 = add(d.b, d.offset);
  const slant = norm(add(dir, out));
  const over = scale(out, overshootMm);
  return {
    segments: [
      [d.a, add(a2, over)],
      [d.b, add(b2, over)],
      [a2, b2],
      [add(a2, scale(slant, -tickMm)), add(a2, scale(slant, tickMm))],
      [add(b2, scale(slant, -tickMm)), add(b2, scale(slant, tickMm))],
    ],
    labelAt: add(scale(add(a2, b2), 0.5), scale(out, 0)),
  };
}
