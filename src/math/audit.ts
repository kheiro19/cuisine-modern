// src/math/audit.ts
// The audit ruler: it does NOT read the numbers of the model, it compares them with what is actually DRAWN.
// The 3D scene is measured (one axis-aligned box per tagged mesh, taken from three.js), then compared with the boxes the model says
// should be there. A part that is drawn at the wrong size, in the wrong place, missing, overlapping another one, or with a front gap
// that is not the planned one shows up here, whichever layer (model or drawing code) made the mistake.
// Pure functions (no three.js import): the scene reading lives in components/AuditProbe.tsx.
import { ApplianceGeo, AssemblyGeometry, applianceKey, facadeKey } from './assemblyGeometry';

export type Vec3 = [number, number, number];

/** An axis-aligned box in millimetres, in any frame (the audit aligns the frames itself). */
export interface PartBox {
  key: string;
  min: Vec3;
  max: Vec3;
}

export const boxFromCenterSize = (key: string, center: ArrayLike<number>, size: ArrayLike<number>): PartBox => ({
  key,
  min: [center[0] - size[0] / 2, center[1] - size[1] / 2, center[2] - size[2] / 2],
  max: [center[0] + size[0] / 2, center[1] + size[1] / 2, center[2] + size[2] / 2],
});

const sizeOf = (b: PartBox): Vec3 => [b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]];
const AXES = ['x', 'y', 'z'] as const;

/** Every part the model says is drawn. Fronts are left out when they are hidden or drawn as several meshes (glass frames). */
export function expectedParts(geo: AssemblyGeometry, opts: { facades: boolean; frontThicknessMm: number }): PartBox[] {
  const out: PartBox[] = geo.boxes.map((b) => boxFromCenterSize(b.key, b.centerMm, b.sizeMm));
  if (opts.facades) {
    geo.facades.forEach((f) => out.push({
      key: facadeKey(f),
      min: [f.xMm, f.yMm, f.zMm - opts.frontThicknessMm / 2],
      max: [f.xMm + f.widthMm, f.yMm + f.heightMm, f.zMm + opts.frontThicknessMm / 2],
    }));
  }
  geo.appliances.forEach((a: ApplianceGeo) => {
    out.push(boxFromCenterSize(applianceKey(a.zoneIndex), a.centerMm, a.sizeMm));
    if (a.trim) out.push(boxFromCenterSize(`${applianceKey(a.zoneIndex)}-trim`, a.trim.centerMm, a.trim.sizeMm));
  });
  return out;
}

export interface GapReading {
  a: string;
  b: string;
  axis: 'x' | 'y' | 'z';
  gapMm: number;
  /** Where the gap is, on the two other axes: the middle of the overlap (mm, same frame as the boxes). */
  at: Vec3;
}

/** Pairs of boxes that face each other across a small gap (fronts and their neighbours): the 1 mm between two doors, for instance. */
export function gapsBetween(boxes: PartBox[], maxGapMm = 5, eps = 1e-6): GapReading[] {
  const out: GapReading[] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      for (let k = 0; k < 3; k++) {
        const first = boxes[i].min[k] <= boxes[j].min[k] ? boxes[i] : boxes[j];
        const second = first === boxes[i] ? boxes[j] : boxes[i];
        const gap = second.min[k] - first.max[k];
        if (gap < -eps || gap > maxGapMm) continue;
        const others = [0, 1, 2].filter((x) => x !== k);
        const spans = others.map((o) => [Math.max(first.min[o], second.min[o]), Math.min(first.max[o], second.max[o])]);
        if (spans.some(([lo, hi]) => hi - lo <= eps)) continue; // they must really face each other
        const at: Vec3 = [0, 0, 0];
        at[k] = first.max[k] + Math.max(gap, 0) / 2;
        others.forEach((o, n) => { at[o] = (spans[n][0] + spans[n][1]) / 2; });
        out.push({ a: first.key, b: second.key, axis: AXES[k], gapMm: Math.max(gap, 0), at });
        break;
      }
    }
  }
  return out;
}

const penetration = (A: PartBox, B: PartBox): number => {
  let least = Infinity;
  for (let k = 0; k < 3; k++) least = Math.min(least, Math.min(A.max[k], B.max[k]) - Math.max(A.min[k], B.min[k]));
  return least; // > 0 on every axis = the boxes share volume
};

export type AuditCode = 'SIZE' | 'OFFSET' | 'MISSING' | 'EXTRA' | 'GAP' | 'OVERLAP';

export interface AuditFinding {
  code: AuditCode;
  key: string;
  other?: string;
  /** The numbers behind the message, in mm. */
  expected?: number[];
  measured?: number[];
  deltaMm: number;
  message: string;
}

export interface AuditReport {
  /** Parts present in both lists and compared. */
  checked: number;
  findings: AuditFinding[];
  /** Every front gap found in the drawing, as drawn. */
  gaps: GapReading[];
  ok: boolean;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;
const fmt = (v: number[]) => v.map((n) => round3(n)).join(' × ');

/**
 * Compares the drawing with the model. Frames: the measured boxes may sit anywhere (the preview centres the cabinet), so both lists
 * are aligned on the lower corner of what they share; sizes, positions, gaps and overlaps are then compared in millimetres.
 */
export function auditParts(expected: PartBox[], measured: PartBox[], tolMm = 0.01): AuditReport {
  const findings: AuditFinding[] = [];
  const byKey = new Map(measured.map((m) => [m.key, m]));
  const common = expected.filter((e) => byKey.has(e.key));
  const lower = (list: PartBox[]): Vec3 => [0, 1, 2].map((k) => Math.min(...list.map((b) => b.min[k]))) as Vec3;
  const shift: Vec3 = common.length > 0
    ? (() => { const e = lower(common), m = lower(common.map((c) => byKey.get(c.key)!)); return [e[0] - m[0], e[1] - m[1], e[2] - m[2]] as Vec3; })()
    : [0, 0, 0];
  const aligned = new Map<string, PartBox>(measured.map((m) => [m.key, {
    key: m.key,
    min: [m.min[0] + shift[0], m.min[1] + shift[1], m.min[2] + shift[2]],
    max: [m.max[0] + shift[0], m.max[1] + shift[1], m.max[2] + shift[2]],
  }]));

  expected.forEach((e) => {
    const m = aligned.get(e.key);
    if (!m) {
      findings.push({ code: 'MISSING', key: e.key, deltaMm: 0, message: `${e.key}: القطعة موجودة في النموذج ولا تُرسم` });
      return;
    }
    const es = sizeOf(e), ms = sizeOf(m);
    const dSize = [0, 1, 2].map((k) => ms[k] - es[k]);
    if (dSize.some((d) => Math.abs(d) > tolMm)) {
      findings.push({ code: 'SIZE', key: e.key, expected: es.map(round3), measured: ms.map(round3), deltaMm: round3(Math.max(...dSize.map(Math.abs))), message: `${e.key}: المقاس المرسوم ${fmt(ms)} والمتوقع ${fmt(es)} مم` });
      return; // a wrong size shifts its centre too: one finding per part is enough
    }
    const dPos = [0, 1, 2].map((k) => m.min[k] - e.min[k]);
    if (dPos.some((d) => Math.abs(d) > tolMm)) {
      findings.push({ code: 'OFFSET', key: e.key, expected: e.min.map(round3), measured: m.min.map(round3), deltaMm: round3(Math.max(...dPos.map(Math.abs))), message: `${e.key}: مزاحة عن موضعها ${fmt(dPos)} مم` });
    }
  });
  const known = new Set(expected.map((e) => e.key));
  measured.forEach((m) => { if (!known.has(m.key)) findings.push({ code: 'EXTRA', key: m.key, deltaMm: 0, message: `${m.key}: قطعة مرسومة ولا وجود لها في النموذج` }); });

  // Gaps between the fronts, as planned and as drawn.
  const isFront = (b: PartBox) => b.key.startsWith('facade-');
  const gapKey = (g: GapReading) => `${g.a}|${g.b}|${g.axis}`;
  const plannedGaps = new Map(gapsBetween(expected.filter(isFront), 5, tolMm).map((g) => [gapKey(g), g]));
  const drawnList = [...aligned.values()].filter(isFront);
  const drawnGaps = gapsBetween(drawnList, 5, tolMm);
  const drawn = new Map(drawnGaps.map((g) => [gapKey(g), g]));
  plannedGaps.forEach((p, k) => {
    const d = drawn.get(k);
    if (!d) {
      if (byKey.has(p.a) && byKey.has(p.b)) findings.push({ code: 'GAP', key: p.a, other: p.b, expected: [p.gapMm], deltaMm: 0, message: `الفراغ بين ${p.a} و${p.b} (${round3(p.gapMm)} مم) لم يعد قائمًا في الرسم` });
      return;
    }
    if (Math.abs(d.gapMm - p.gapMm) > tolMm) findings.push({ code: 'GAP', key: p.a, other: p.b, expected: [p.gapMm], measured: [d.gapMm], deltaMm: round3(Math.abs(d.gapMm - p.gapMm)), message: `الفراغ بين ${p.a} و${p.b}: ${round3(d.gapMm)} مم والمخطط ${round3(p.gapMm)} مم` });
  });

  // Overlaps that the model does not have (a back panel that overlays the boards is in the model, so it is not reported).
  const alignedList = [...aligned.values()].filter((b) => known.has(b.key));
  const expectedByKey = new Map(expected.map((e) => [e.key, e]));
  for (let i = 0; i < alignedList.length; i++) {
    for (let j = i + 1; j < alignedList.length; j++) {
      const A = alignedList[i], B = alignedList[j];
      const pen = penetration(A, B);
      if (pen <= tolMm) continue;
      const planned = penetration(expectedByKey.get(A.key)!, expectedByKey.get(B.key)!);
      if (pen > planned + tolMm) findings.push({ code: 'OVERLAP', key: A.key, other: B.key, expected: [Math.max(planned, 0)], measured: [pen], deltaMm: round3(pen - Math.max(planned, 0)), message: `${A.key} و${B.key} يتداخلان ${round3(pen)} مم` });
    }
  }

  return { checked: common.length, findings, gaps: drawnGaps, ok: findings.length === 0 };
}
