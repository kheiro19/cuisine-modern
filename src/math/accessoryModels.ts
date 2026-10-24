// src/math/accessoryModels.ts
// What every accessory LOOKS like, as plain data: a list of boxes, cylinders and spheres in millimetres. No three.js here, so
// the shapes can be tested (every piece must stay inside the box of the catalog size) and the React layer only maps them to
// meshes.
//
// Local frame of a model: origin at the CENTRE of its footprint, on its BOTTOM face; x along the wall, y up, z towards the
// user (the back of the piece is at z = -d/2). Positions below are the CENTRE of each primitive.

import { AccessoryModelKey, FINISHES, FinishStyle, ModelOpts } from '../data/accessoryCatalog';

interface Style {
  metal?: number;
  rough?: number;
  emissive?: string;
  opacity?: number;
}

export type Prim =
  | ({ t: 'box'; x: number; y: number; z: number; w: number; h: number; d: number; c: string } & Style)
  | ({ t: 'cyl'; x: number; y: number; z: number; r: number; len: number; ax: 'x' | 'y' | 'z'; c: string } & Style)
  | ({ t: 'sph'; x: number; y: number; z: number; r: number; c: string } & Style);

const STEEL = '#c7ced6';
const ALU = '#aab2bc';
const DARK = '#1f2937';
const BLACK = '#0b0f14';
const GLASS = '#111827';
const WOOD = '#c9a46a';
const LIGHT = '#e5e7eb';
const BRASS = '#b08d57';
const WARM = '#fff1c9';
const WHITE = '#f8fafc';
const CLEAR = '#cbd5e1';

/** Lighter (k > 0) or darker (k < 0) version of a #rrggbb colour. */
export function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.max(0, Math.min(255, Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  const r = ch((n >> 16) & 255), g = ch((n >> 8) & 255), b = ch(n & 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}

/** Box whose BOTTOM face is at `yb`, centred on (x, z). */
const box = (x: number, yb: number, z: number, w: number, h: number, d: number, c: string, s: Style = {}): Prim => ({ t: 'box', x, y: yb + h / 2, z, w, h, d, c, ...s });
/** Cylinder whose lowest point is at `yb` (for an horizontal axis `yb` is the bottom of the tube). Centred on (x, z). */
const cyl = (x: number, yb: number, z: number, r: number, len: number, ax: 'x' | 'y' | 'z', c: string, s: Style = {}): Prim => ({ t: 'cyl', x, y: ax === 'y' ? yb + len / 2 : yb + r, z, r, len, ax, c, ...s });
/** Sphere whose lowest point is at `yb`. */
const sph = (x: number, yb: number, z: number, r: number, c: string, s: Style = {}): Prim => ({ t: 'sph', x, y: yb + r, z, r, c, ...s });

const METAL: Style = { metal: 0.85, rough: 0.25 };
const GLOSS: Style = { metal: 0.3, rough: 0.12 };
const GLOW: Style = { emissive: '#ffe9a8' };
const ms = (f: FinishStyle): Style => ({ metal: f.metal, rough: f.rough });
const num = (o: ModelOpts, k: string, d: number): number => (typeof o[k] === 'number' ? (o[k] as number) : d);

type Build = (w: number, h: number, d: number, o: ModelOpts, f: FinishStyle) => Prim[];

// ======================================================= electricity ==================================================
const popupSocket: Build = (w, h, d, o, f) => {
  const n = num(o, 'n', 3), usb = !!o.usb;
  const r = Math.min(w, d) / 2, face = r * 0.86;
  const out: Prim[] = [cyl(0, 0, 0, r, 18, 'y', f.c, ms(f)), cyl(0, 18, 0, r * 0.86, h - 24, 'y', DARK), cyl(0, h - 6, 0, r * 0.9, 6, 'y', f.c, ms(f))];
  const pitch = (h - 90) / (n + (usb ? 1 : 0));
  for (let i = 0; i < n; i++) {
    const y = 40 + i * pitch;
    out.push(cyl(0, y, face - 1.5, 13, 3, 'z', LIGHT), box(-4.5, y + 10, face + 0.3, 3, 6, 1.5, BLACK), box(4.5, y + 10, face + 0.3, 3, 6, 1.5, BLACK));
  }
  if (usb) {
    const y = 40 + n * pitch;
    out.push(box(0, y, face - 1, 34, 10, 2, BLACK), box(0, y + 14, face - 1, 34, 6, 2, '#2563eb'));
  }
  return out;
};

const flushSocket: Build = (w, h, d, o, f) => {
  const n = num(o, 'n', 2), usb = !!o.usb;
  const out: Prim[] = [box(0, 0, 0, w, 6, d, f.c, ms(f)), box(0, 6, 0, w - 14, h - 6, d - 14, BLACK, GLOSS)];
  const pitch = Math.min(72, (w - 60) / n);
  for (let i = 0; i < n; i++) out.push(cyl((i - (n - 1) / 2) * pitch, h - 1.5, usb ? -d * 0.12 : -d * 0.05, 22, 1.5, 'y', LIGHT));
  if (usb) for (const sx of [-1, 1]) out.push(box(sx * w * 0.12, h - 1.5, d * 0.2, 26, 1.5, 12, '#374151'));
  return out;
};

const railSocket: Build = (w, h, d, o, f) => {
  const n = num(o, 'n', 4);
  const out: Prim[] = [box(0, 0, 0, w, h, d, f.c, ms(f))];
  for (let i = 0; i < n; i++) out.push(cyl((i - (n - 1) / 2) * (w / (n + 0.5)), h / 2 - 14, d / 2 - 1.5, 14, 3, 'z', f.c === STEEL ? LIGHT : WHITE));
  return out;
};

const wirelessCharger: Build = (w, h, d) => {
  const r = Math.min(w, d) / 2;
  return [cyl(0, 0, 0, r, h, 'y', BLACK, GLOSS), cyl(0, h - 0.5, 0, r * 0.6, 0.5, 'y', '#6b7280')];
};

const wallPlate: Build = (w, h, d, o, f) => {
  const kind = String(o.kind ?? 'socket');
  const out: Prim[] = [box(0, 0, 0, w, h, d, f.c, ms(f))];
  const ring = shade(f.c, -0.28);
  if (kind === 'socket') for (const y of [h * 0.3, h * 0.7]) out.push(cyl(0, y - 14, d / 2 - 1, 14, 2, 'z', ring));
  else if (kind === 'usbc') {
    out.push(cyl(0, h * 0.3 - 14, d / 2 - 1, 14, 2, 'z', ring));
    for (const sx of [-1, 1]) out.push(box(sx * 14, h * 0.65, d / 2 - 0.5, 20, 8, 1, BLACK));
  } else {
    const n = kind === 'switch3' ? 3 : 2;
    for (let i = 0; i < n; i++) out.push(box((i - (n - 1) / 2) * (kind === 'switch3' ? 46 : 40), h * 0.2, d / 2 - 1, 30, h * 0.6, 2, shade(f.c, -0.12)));
  }
  return out;
};

// ======================================================= sinks and taps ===============================================
const sink: Build = (w, h, d, o, f) => {
  const rimH = o.thin ? 6 : 12, bowls = String(o.bowls ?? '1'), m = ms(f);
  const basin = shade(f.c, -0.22), drain = shade(f.c, -0.5);
  const bh = h - rimH, bd = d - 70;
  if (bowls === 'round') {
    const R = Math.min(w, d) / 2;
    return [cyl(0, 0, 0, R, rimH, 'y', f.c, m), cyl(0, rimH, 0, R - 35, bh, 'y', basin, m), cyl(0, h - 1.5, 0, 26, 1.5, 'y', drain)];
  }
  const out: Prim[] = [box(0, 0, 0, w, rimH, d, f.c, m)];
  const drainAt = (x: number, z = 0) => out.push(cyl(x, h - 1.5, z, 26, 1.5, 'y', drain));
  if (bowls === '2') {
    for (const sx of [-1, 1]) { out.push(box(sx * w / 4, rimH, 0, w / 2 - 55, bh, bd, basin, m)); drainAt(sx * w / 4); }
  } else if (bowls === '1.5') {
    out.push(box(-w * 0.16, rimH, 0, w * 0.56, bh, bd, basin, m), box(w * 0.33, rimH, -d * 0.05, w * 0.24, bh, d * 0.62, basin, m));
    drainAt(-w * 0.16); drainAt(w * 0.33, -d * 0.05);
  } else if (bowls === 'drain') {
    out.push(box(-w * 0.2, rimH, 0, w * 0.5, bh, bd, basin, m), box(w * 0.29, rimH, 0, w * 0.34, 2, bd, shade(f.c, -0.05), m));
    for (let i = 0; i < 7; i++) out.push(box(w * 0.29 - w * 0.15 + (i * w * 0.3) / 6, rimH + 2, 0, 3, 2, bd - 30, shade(f.c, -0.3)));
    drainAt(-w * 0.2);
  } else {
    out.push(box(0, rimH, 0, w - 70, bh, bd, basin, m));
    drainAt(0);
  }
  return out;
};

const sinkWorkstation: Build = (w, h, d, _o, f) => {
  const m = ms(f), basin = shade(f.c, -0.22);
  return [
    box(0, 0, 0, w, 14, d, f.c, m),
    box(-w * 0.12, 14, 0, w * 0.62, h - 14, d - 60, basin, m),
    cyl(-w * 0.12, h - 1.5, 0, 28, 1.5, 'y', shade(f.c, -0.5)),
    box(w * 0.3, 14, 0, w * 0.26, 6, d * 0.6, WOOD),
    box(0, 14, d / 2 - 10, w - 40, h - 14, 4, f.c, m),
  ];
};

const tap: Build = (w, h, d, o, f) => {
  const reach = num(o, 'reach', 150), drop = num(o, 'drop', 90), style = String(o.style ?? 'arc');
  const z0 = -d / 2 + 30, top = h - 45, m = ms(f), c = f.c;
  const out: Prim[] = [cyl(0, 0, z0, 28, 40, 'y', c, m), cyl(0, 40, z0, 13, top - 40, 'y', c, m)];
  if (style === 'waterfall') out.push(box(0, top - 8, z0 + reach / 2, 46, 8, reach, c, m), box(0, top - 36, z0 + reach - 4, 46, 36, 8, c, m));
  else out.push(cyl(0, top - 13, z0 + reach / 2, 13, reach, 'z', c, m), cyl(0, top - drop, z0 + reach, 17, drop, 'y', c, m));
  if (style === 'sensor') out.push(box(0, 110, z0 + 14, 18, 30, 8, BLACK));
  if (style === 'boiling') out.push(cyl(0, 70, z0 + 13, 8, 24, 'z', '#dc2626'));
  return out;
};

const soapDispenser: Build = (w, h, d, _o, f) => {
  const z0 = -d / 2 + w / 2, m = ms(f);
  return [cyl(0, 0, z0, 22, 20, 'y', f.c, m), cyl(0, 20, z0, 9, h - 35, 'y', f.c, m), cyl(0, h - 20, z0 + 20, 5, 40, 'z', f.c, m)];
};

const sinkRack: Build = (w, h, d) => {
  const b = 6, out: Prim[] = [];
  out.push(box(0, 0, -(d / 2 - b / 2), w, b, b, STEEL, METAL), box(0, 0, d / 2 - b / 2, w, b, b, STEEL, METAL));
  out.push(box(-(w / 2 - b / 2), 0, 0, b, b, d, STEEL, METAL), box(w / 2 - b / 2, 0, 0, b, b, d, STEEL, METAL));
  for (let i = 1; i <= 8; i++) out.push(box(-w / 2 + (i * w) / 9, 0, 0, b, b, d - 2 * b, STEEL, METAL));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(sx * (w / 2 - b / 2), b, sz * (d / 2 - b / 2), b, h - b, b, STEEL, METAL));
  return out;
};

const colander: Build = (w, h, d) => {
  const R = Math.min(w - 60, d) / 2;
  return [cyl(0, 0, 0, R, h, 'y', '#9ca3af', METAL), cyl(0, h - 1.5, 0, R - 10, 1.5, 'y', '#4b5563'), box(R + 12, h - 20, 0, 30, 6, 16, '#9ca3af', METAL), box(-(R + 12), h - 20, 0, 30, 6, 16, '#9ca3af', METAL)];
};

const sinkBoard: Build = (w, h, d) => [box(0, 0, 0, w, h, d, WOOD), box(0, h - 1, d * 0.35, 100, 1.5, 20, '#7c5a2a')];

// ======================================================= hobs and hoods ===============================================
/** Cooking zones as [x, z, r]; the strip at the front (z > d/2 - 40) is kept free for the controls. */
function zonesOf(n: number | string, w: number, d: number): Array<[number, number, number]> {
  const zc = -16;
  if (n === 2) return [[0, zc - 120, Math.min(w * 0.38, 100)], [0, zc + 120, Math.min(w * 0.38, 100)]];
  const r4 = Math.min(w * 0.22, 105);
  const four: Array<[number, number, number]> = [[-w * 0.25, zc - 118, r4], [w * 0.25, zc - 118, r4], [-w * 0.25, zc + 118, r4], [w * 0.25, zc + 118, r4]];
  if (n === 5) {
    const r5 = Math.min(w * 0.15, 100);
    return [[-w * 0.3, zc - 118, r5], [w * 0.3, zc - 118, r5], [-w * 0.3, zc + 118, r5], [w * 0.3, zc + 118, r5], [0, zc, Math.min(w * 0.1, 85)]];
  }
  return four;
}

const hobInduction: Build = (w, h, d, o) => {
  const out: Prim[] = [box(0, 0, 0, w, h, d, GLASS, GLOSS)];
  if (o.zones === 'flex') {
    for (const sx of [-1, 1]) out.push(box(sx * w * 0.24, h - 0.8, -16, w * 0.4, 0.8, 330, '#374151'), box(sx * w * 0.24, h - 0.8, -16, w * 0.3, 0.8, 240, '#111827'));
  } else {
    for (const [x, z, r] of zonesOf(typeof o.zones === 'number' ? o.zones : 4, w, d)) out.push(cyl(x, h - 0.8, z, r, 0.8, 'y', '#4b5563'), cyl(x, h - 0.8, z, r * 0.55, 0.8, 'y', '#111827'));
  }
  out.push(box(0, h - 0.8, d / 2 - 28, w * 0.5, 0.8, 12, '#9ca3af'));
  return out;
};

const hobGas: Build = (w, h, d, o) => {
  const n = num(o, 'burners', 4), zc = -20;
  const out: Prim[] = [box(0, 0, 0, w, 10, d, o.glass ? GLASS : STEEL, o.glass ? GLOSS : METAL)];
  const pts: Array<[number, number, number]> =
    n === 2 ? [[0, zc - 100, 42], [0, zc + 100, 42]]
    : n === 5 ? [[-w * 0.28, zc - 105, 42], [w * 0.28, zc - 105, 42], [-w * 0.28, zc + 105, 42], [w * 0.28, zc + 105, 42], [0, zc, 46]]
    : [[-w * 0.25, zc - 105, 42], [w * 0.25, zc - 105, 42], [-w * 0.25, zc + 105, 42], [w * 0.25, zc + 105, 42]];
  for (const [x, z, r] of pts) {
    out.push(cyl(x, 10, z, r, 10, 'y', DARK), cyl(x, 20, z, r * 0.62, 6, 'y', BRASS, METAL), box(x, 26, z, 150, 14, 10, DARK), box(x, 26, z, 10, 14, 150, DARK));
  }
  const pitch = (w - 80) / n;
  for (let i = 0; i < n; i++) out.push(cyl((i - (n - 1) / 2) * pitch, 10, d / 2 - 28, 14, 14, 'y', DARK));
  return out;
};

const hobDowndraft: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 6, d, GLASS, GLOSS)];
  for (const [x, z, r] of zonesOf(4, w, d)) out.push(cyl(x, 5.2, z, r, 0.8, 'y', '#4b5563'), cyl(x, 5.2, z, r * 0.55, 0.8, 'y', '#111827'));
  out.push(box(0, 6, -d * 0.05, 44, h - 6, 16, STEEL, METAL), box(0, 5.2, d / 2 - 28, w * 0.5, 0.8, 12, '#9ca3af'));
  return out;
};

const hoodChimney: Build = (w, h, d, _o, f) => {
  const cd = d * 0.4, m = ms(f);
  return [
    box(0, 0, 0, w, 50, d, f.c, m), box(0, 50, 0, w * 0.85, 60, d * 0.85, f.c, m), box(0, 110, 0, w * 0.6, 60, d * 0.7, f.c, m),
    box(0, 170, -d / 2 + cd / 2, w * 0.38, h - 170, cd, f.c, m),
  ];
};

const hoodAngled: Build = (w, h, d, _o, f) => {
  const m = ms(f), cd = d * 0.4, dz = (d * 0.7) / 5;
  const out: Prim[] = [box(0, 0, 0, w, 50, d, f.c, m)];
  for (let i = 0; i < 5; i++) out.push(box(0, 50 + i * 70, d * 0.4 - dz * (i + 0.5), w * 0.97, 70, dz, f.c, m));
  out.push(box(0, 400, -d / 2 + cd / 2, w * 0.3, h - 400, cd, f.c, m));
  return out;
};

const hoodBox: Build = (w, h, d, _o, f) => {
  const m = ms(f), cd = d * 0.5;
  return [box(0, 0, 0, w, 110, d, f.c, m), box(0, 110, -d / 2 + cd / 2, w * 0.4, h - 110, cd, f.c, m), box(0, 8, d / 2 - 3, w * 0.9, 20, 6, BLACK, GLOSS)];
};

const hoodIsland: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  return [box(0, 0, 0, w, 60, d, f.c, m), box(0, 60, 0, w * 0.8, 50, d * 0.8, f.c, m), box(0, 110, 0, w * 0.3, h - 110, d * 0.3, f.c, m)];
};

const hoodSlim: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  const out: Prim[] = [box(0, 0, 0, w, 100, d, f.c, m), box(0, 100, -d * 0.15, w * 0.95, h - 100, d * 0.6, f.c, m)];
  for (const sx of [-1, 1]) out.push(cyl(sx * w * 0.38, 40, d / 2 - 3, 8, 6, 'z', DARK));
  return out;
};

const hoodGlass: Build = (w, h, d, _o, f) => {
  const sh = (h - 20) / 6, dz = d / 6;
  const out: Prim[] = [box(0, 0, d / 2 - 15, w, 20, 30, f.c, ms(f))];
  for (let i = 0; i < 6; i++) out.push(box(0, 20 + i * sh, d / 2 - dz * (i + 0.5), w, sh, dz, GLASS, { ...GLOSS, opacity: 0.85 }));
  return out;
};

// ======================================================= freestanding appliances ======================================
const fridge: Build = (w, h, d, o, f) => {
  const t = String(o.type ?? 'single'), m = ms(f), hc = shade(f.c, -0.3);
  const out: Prim[] = [box(0, 0, 0, w, h, d, f.c, m)];
  const seamH = (y: number) => out.push(box(0, y, d / 2 - 1.5, w - 8, 3, 3, DARK));
  const seamV = (x: number, y0: number, y1: number) => out.push(box(x, y0, d / 2 - 1.5, 3, y1 - y0, 3, DARK));
  const handleV = (x: number, y: number, len: number) => out.push(box(x, y, d / 2 - 12, 12, len, 20, hc, METAL));
  seamH(60);
  if (t === 'single') handleV(w * 0.38, h * 0.45, h * 0.3);
  else if (t === 'top') { seamH(h * 0.7); handleV(w * 0.38, h * 0.78, h * 0.12); handleV(w * 0.38, h * 0.5, h * 0.18); }
  else if (t === 'bottom') { seamH(h * 0.3); handleV(w * 0.38, h * 0.5, h * 0.25); out.push(box(0, h * 0.3 - 40, d / 2 - 12, w * 0.6, 14, 20, hc, METAL)); }
  else if (t === 'sbs') {
    seamV(-w * 0.12, 60, h); handleV(-w * 0.12 - 18, h * 0.4, h * 0.25); handleV(-w * 0.12 + 18, h * 0.4, h * 0.25);
    out.push(box(-w * 0.3, h * 0.5, d / 2 - 3, w * 0.2, 150, 6, '#0f172a'), box(-w * 0.3, h * 0.5 + 60, d / 2 - 2, w * 0.12, 40, 2, '#38bdf8', { emissive: '#38bdf8' }));
  } else {
    seamH(h * 0.3); seamV(0, h * 0.3, h); handleV(-18, h * 0.65, 250); handleV(18, h * 0.65, 250);
    out.push(box(0, h * 0.3 - 45, d / 2 - 12, w * 0.5, 14, 20, hc, METAL));
  }
  return out;
};

const wineCooler: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, h, d, DARK, METAL), box(0, 15, d / 2 - 5, w - 24, h - 30, 8, '#334155', { ...GLOSS, opacity: 0.6 })];
  for (let i = 0; i < 6; i++) out.push(box(0, 60 + (i * (h - 130)) / 5, 0, w - 60, 8, d - 80, WOOD));
  out.push(box(w / 2 - 40, h * 0.4, d / 2 - 14, 12, h * 0.3, 20, STEEL, METAL));
  return out;
};

const rangeCooker: Build = (w, h, d, o, f) => {
  const m = ms(f), n = num(o, 'burners', 4);
  const out: Prim[] = [
    box(0, 0, 0, w, 850, d, f.c, m), box(0, 120, d / 2 - 2, w - 60, 480, 4, GLASS, GLOSS), box(0, 610, d / 2 - 30, w - 100, 14, 20, STEEL, METAL),
    box(0, 700, d / 2 - 3, w - 40, 90, 6, DARK), box(0, 850, 0, w, 10, d, STEEL, METAL), box(0, 860, -d / 2 + 20, w, 40, 40, f.c, m),
  ];
  for (let i = 0; i < 5; i++) out.push(cyl((i - 2) * ((w - 120) / 4), 715, d / 2 - 8, 15, 12, 'z', STEEL, METAL));
  const pts: Array<[number, number]> = n === 5 ? [[-w * 0.28, -d * 0.2], [w * 0.28, -d * 0.2], [-w * 0.28, d * 0.15], [w * 0.28, d * 0.15], [0, -d * 0.03]]
    : [[-w * 0.25, -d * 0.2], [w * 0.25, -d * 0.2], [-w * 0.25, d * 0.15], [w * 0.25, d * 0.15]];
  for (const [x, z] of pts) out.push(cyl(x, 860, z, 35, 8, 'y', DARK), box(x, 868, z, 120, 12, 10, DARK), box(x, 868, z, 10, 12, 120, DARK));
  return out;
};

const washer: Build = (w, h, d, o, f) => {
  const m = ms(f), r1 = Math.min(w, h) * 0.3;
  const out: Prim[] = [
    box(0, 0, 0, w, h, d, f.c, m),
    cyl(0, h * 0.42 - r1, d / 2 - 3, r1, 6, 'z', o.dryer ? STEEL : LIGHT, METAL),
    cyl(0, h * 0.42 - r1 + 30, d / 2 - 4.5, r1 - 30, 9, 'z', GLASS, { ...GLOSS, opacity: 0.85 }),
    box(0, h - 110, d / 2 - 3, w - 40, 80, 6, shade(f.c, -0.12)),
    cyl(w * 0.3, h - 95, d / 2 - 7, 20, 8, 'z', DARK),
  ];
  if (!o.dryer) out.push(box(-w * 0.28, h - 100, d / 2 - 7, 110, 45, 2, DARK));
  return out;
};

const dishwasherFree: Build = (w, h, d, _o, f) => [
  box(0, 0, 0, w, h, d, f.c, ms(f)), box(0, h - 90, d / 2 - 3, w - 30, 60, 6, DARK), box(0, h - 150, d / 2 - 18, w * 0.7, 14, 20, STEEL, METAL), box(0, 60, d / 2 - 1.5, w - 10, 3, 3, DARK),
];

// ======================================================= small appliances =============================================
const espresso: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  return [
    box(0, 0, 0, w, 12, d, '#374151'), box(0, 12, -d * 0.15, w, h - 12, d * 0.55, f.c, m),
    cyl(0, h * 0.42, d * 0.17, Math.min(w * 0.1, 30), h * 0.1, 'y', STEEL, METAL),
    cyl(0, h * 0.4, d * 0.295, 8, d * 0.25, 'z', DARK),
    box(0, 12, d * 0.35, w * 0.7, 4, d * 0.28, STEEL, METAL),
    cyl(-w * 0.2, 16, d * 0.3, 26, 50, 'y', WHITE), cyl(w * 0.2, 16, d * 0.3, 26, 50, 'y', WHITE),
    box(0, h * 0.6, -d * 0.42, w * 0.8, h * 0.4, d * 0.1, CLEAR, { opacity: 0.5 }),
  ];
};

const coffeeDrip: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  return [
    box(0, 0, 0, w, 20, d, f.c, m), box(0, 20, -d * 0.36, w, h - 20, d * 0.28, f.c, m), box(0, h - 90, -d * 0.1, w, 70, d * 0.55, f.c, m),
    cyl(0, 20, d * 0.15, Math.min(w * 0.28, d * 0.22), 140, 'y', CLEAR, { opacity: 0.6 }),
  ];
};

const kettle: Build = (w, h, d, _o, f) => {
  const R = Math.min(w, d) * 0.42, m = ms(f), cx = -w * 0.06;
  return [
    cyl(cx, 0, 0, R + 8, 12, 'y', DARK), cyl(cx, 12, 0, R, h * 0.78, 'y', f.c, m), cyl(cx, 12 + h * 0.78, 0, R * 0.5, h - 12 - h * 0.78, 'y', DARK),
    box(cx + R + 8, 40, 0, 16, h * 0.6, 34, DARK), box(cx - R - 4, h * 0.55, 0, 16, 30, 20, f.c, m),
  ];
};

const toaster: Build = (w, h, d, _o, f) => [
  box(0, 10, 0, w, h - 10, d, f.c, ms(f)), box(0, 0, 0, w * 0.95, 10, d * 0.95, DARK),
  box(0, h - 1.5, -d * 0.2, w * 0.75, 1.5, 18, BLACK), box(0, h - 1.5, d * 0.2, w * 0.75, 1.5, 18, BLACK),
  box(w * 0.3, h * 0.5, d / 2 - 3, 14, 40, 6, DARK), cyl(-w * 0.3, h * 0.5 - 10, d / 2 - 4, 10, 8, 'z', DARK),
];

const microwave: Build = (w, h, d, _o, f) => [
  box(0, 0, 0, w, h, d, f.c, ms(f)), box(-w * 0.08, 15, d / 2 - 4, w * 0.68, h - 30, 8, GLASS, GLOSS),
  box(w * 0.37, 15, d / 2 - 3, w * 0.2, h - 30, 6, DARK), box(w * 0.24, 40, d / 2 - 12, 10, h - 80, 16, shade(f.c, -0.25), METAL),
];

const airFryer: Build = (w, h, d, _o, f) => [
  box(0, 0, -d * 0.04, w, h, d * 0.92, f.c, ms(f)), box(0, h * 0.3, d / 2 - 16, w * 0.7, 40, 20, DARK),
  box(0, h - 70, d * 0.42, w * 0.6, 40, 6, GLASS, GLOSS),
];

const blender: Build = (w, h, d, _o, f) => {
  const R = Math.min(w, d);
  return [
    box(0, 0, 0, w, 110, d, f.c, ms(f)), cyl(0, 110, 0, R * 0.4, h - 110 - 30, 'y', CLEAR, { opacity: 0.5 }), cyl(0, h - 30, 0, R * 0.42, 22, 'y', DARK),
    cyl(0, 36, d / 2 - 5, 14, 10, 'z', DARK),
  ];
};

const standMixer: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  return [
    box(0, 0, 0, w, 40, d, f.c, m), box(-w * 0.28, 40, -d * 0.25, w * 0.3, h - 40, d * 0.4, f.c, m), box(-w * 0.1, h - 130, 0, w * 0.7, 110, d * 0.9, f.c, m),
    cyl(w * 0.2, 40, 0, Math.min(w * 0.24, d * 0.4), 150, 'y', STEEL, METAL),
  ];
};

const riceCooker: Build = (w, h, d, _o, f) => {
  const R = (Math.min(w, d) / 2) * 0.95, m = ms(f);
  return [cyl(0, 0, 0, R, h * 0.7, 'y', f.c, m), cyl(0, h * 0.7, 0, R * 0.97, h * 0.3 - 8, 'y', shade(f.c, -0.1), m), cyl(0, h - 8, 0, 22, 8, 'y', DARK), box(0, h * 0.35, R - 3, R * 0.7, 40, 6, DARK)];
};

const foodProcessor: Build = (w, h, d, _o, f) => {
  const R = Math.min(w, d) * 0.45;
  return [
    box(0, 0, 0, w, 120, d, f.c, ms(f)), cyl(0, 120, 0, R, 160, 'y', CLEAR, { opacity: 0.5 }), cyl(0, 280, 0, R, 20, 'y', DARK),
    cyl(0, 300, 0, R * 0.35, h - 300, 'y', CLEAR, { opacity: 0.5 }), cyl(0, 50, d / 2 - 4, 14, 8, 'z', DARK),
  ];
};

// ======================================================= worktop accessories ==========================================
const cuttingBoard: Build = (w, h, d) => [box(0, 0, 0, w, h, d, WOOD), box(w * 0.38, h - 1, 0, 40, 1.5, 12, '#7c5a2a')];

const knifeBlock: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, h * 0.62, d * 0.8, WOOD)];
  for (let i = 0; i < 5; i++) out.push(box((i - 2) * w * 0.2, h * 0.62, (i % 2 ? 0.1 : -0.1) * d, 16, h * 0.38, 12, BLACK));
  return out;
};

const utensilHolder: Build = (w, h, d, _o, f) => {
  const R = Math.min(w, d) / 2;
  const out: Prim[] = [cyl(0, 0, 0, R, h * 0.5, 'y', f.c, ms(f))];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2, top = h * (0.8 + 0.04 * i);
    out.push(cyl(Math.cos(a) * R * 0.45, h * 0.1, Math.sin(a) * R * 0.45, 7, top - h * 0.1, 'y', i % 2 ? WOOD : DARK));
  }
  return out;
};

const dishDrainer: Build = (w, h, d, _o, f) => {
  const out: Prim[] = [box(0, 0, 0, w, 20, d, f.c, ms(f)), box(0, 20, d * 0.4, w - 20, 14, 8, f.c, ms(f)), box(0, 20, -d * 0.4, w - 20, 14, 8, f.c, ms(f))];
  for (let i = 0; i < 6; i++) out.push(cyl(-w * 0.35 + (i * w * 0.7) / 5, 26, 0, 110, 4, 'x', WHITE));
  return out;
};

const breadBin: Build = (w, h, d, _o, f) => [
  box(0, 0, 0, w, h * 0.72, d, f.c, ms(f)), box(0, h * 0.72, 0, w, h * 0.28, d * 0.9, shade(f.c, -0.12), ms(f)), box(0, h * 0.5, d / 2 - 6, w * 0.3, 10, 12, DARK),
];

const spiceCounter: Build = (w, h, d) => {
  const out: Prim[] = [];
  const colors = ['#f97316', '#eab308', '#a16207', '#dc2626'];
  for (let i = 0; i < 3; i++) {
    const depth = d * (1 - i * 0.25);
    out.push(box(0, i * 80, -d / 2 + depth / 2, w, 10, depth, WOOD));
    for (let j = 0; j < 4; j++) out.push(cyl((j - 1.5) * (w / 4.4), i * 80 + 10, -d / 2 + depth - 24 - 3, 24, 55, 'y', colors[(i + j) % 4], { opacity: 0.9 }));
  }
  return out;
};

const paperTowel: Build = (w, h, d, _o, f) => {
  const R = Math.min(w, d) / 2;
  return [cyl(0, 0, 0, R, 10, 'y', f.c, ms(f)), cyl(0, 10, 0, 6, h - 10, 'y', f.c, ms(f)), cyl(0, 10, 0, R * 0.9, h * 0.65, 'y', WHITE)];
};

const fruitBowl: Build = (w, h, d, _o, f) => {
  const R = Math.min(w, d) / 2;
  const out: Prim[] = [cyl(0, 0, 0, R, 40, 'y', f.c, ms(f)), cyl(0, 38, 0, R - 12, 2, 'y', shade(f.c, -0.3))];
  const fruit = ['#dc2626', '#f97316', '#16a34a', '#eab308', '#dc2626'];
  for (let i = 0; i < 5; i++) out.push(sph(Math.cos((i / 5) * 6.2832) * 80, 40, Math.sin((i / 5) * 6.2832) * 80, 40, fruit[i]));
  return out;
};

const canisters: Build = (w, h, d, _o, f) => {
  const out: Prim[] = [];
  [230, 190, 150].forEach((hh, i) => {
    const x = (i - 1) * 140;
    out.push(cyl(x, 0, 0, 65, hh - 12, 'y', f.c, ms(f)), cyl(x, hh - 12, 0, 65, 12, 'y', shade(f.c, -0.25), ms(f)));
  });
  return out;
};

// ======================================================= splashback and wall ==========================================
const panel: Build = (w, h, d, o, f) => {
  const style = String(o.style ?? 'tile');
  const base = style === 'steel' ? STEEL : f.c;
  const out: Prim[] = [box(0, 0, 0, w, h, d, base, style === 'steel' ? METAL : style === 'glass' ? GLOSS : { metal: 0.05, rough: 0.4 })];
  if (style === 'tile') {
    const rows = Math.max(1, Math.round(h / 75)), step = Math.max(150, w / 30), line = shade(f.c, -0.2);
    for (let r = 1; r < rows; r++) out.push(box(0, (r * h) / rows - 1, d / 2 - 0.2, w, 2, 0.8, line));
    for (let r = 0; r < rows; r++) for (let x = -w / 2 + step * (r % 2 ? 1 : 0.5); x < w / 2 - 1; x += step) out.push(box(x, (r * h) / rows, d / 2 - 0.2, 2, h / rows, 0.8, line));
  } else if (style === 'glass') {
    out.push(box(-w * 0.3, h * 0.08, d / 2 - 0.2, w * 0.1, h * 0.84, 0.6, shade(f.c, 0.14), { opacity: 0.45 }), box(w * 0.12, h * 0.08, d / 2 - 0.2, w * 0.04, h * 0.84, 0.6, shade(f.c, 0.14), { opacity: 0.35 }));
  } else if (style === 'steel') {
    out.push(box(0, h * 0.33, d / 2 - 0.2, w, 1.5, 0.6, shade(STEEL, -0.25)), box(0, h * 0.66, d / 2 - 0.2, w, 1.5, 0.6, shade(STEEL, -0.25)));
  } else if (style === 'marble') {
    out.push(box(-w * 0.22, h * 0.3, d / 2 - 0.2, w * 0.35, h * 0.4, 0.6, shade(f.c, -0.07)), box(w * 0.18, h * 0.5, d / 2 - 0.2, w * 0.4, h * 0.3, 0.6, shade(f.c, -0.1)), box(w * 0.05, h * 0.05, d / 2 - 0.2, w * 0.3, h * 0.25, 0.6, shade(f.c, -0.05)));
  }
  return out;
};

const wallRail: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  const out: Prim[] = [box(0, h - 15, -d / 2 + 10, w, 15, 20, f.c, m)];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * (w / 5.5);
    out.push(cyl(x, h - 25, -d / 2 + 30, 3, 20, 'z', f.c, m), cyl(x, 70, -d / 2 + 30, 5.5, h - 28 - 70, 'y', i % 2 ? WOOD : DARK));
    if (i % 2 === 0) out.push(box(x, 20, -d / 2 + 30, 40, 60, 8, i % 4 === 0 ? STEEL : WOOD));
  }
  return out;
};

const knifeStrip: Build = (w, h, d) => {
  const out: Prim[] = [box(0, h - 30, 0, w, 30, d, WOOD)];
  for (let i = 0; i < 4; i++) {
    const x = (i - 1.5) * w * 0.22;
    out.push(box(x, h - 30 - 55, 0, 20, 55, 14, BLACK), box(x, 30, 0, 34, h - 30 - 55 - 30, 3, STEEL, METAL));
  }
  return out;
};

const floatShelf: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 35, d, WOOD)];
  [-0.3, 0, 0.3].forEach((fx, i) => out.push(cyl(fx * w, 35, 0, 32, 77, 'y', ['#cbd5e1', '#fde68a', '#a7f3d0'][i], { opacity: 0.85 }), cyl(fx * w, 112, 0, 32, 8, 'y', DARK)));
  return out;
};

const wallClock: Build = (w, h, d, _o, f) => [
  cyl(0, 0, 0, 150, 30, 'z', f.c, ms(f)), cyl(0, 12, 15, 138, 4, 'z', WHITE), box(0, 150, 17.5, 4, 100, 1.5, BLACK), box(30, 148, 17.5, 60, 4, 1.5, BLACK),
];

const potFiller: Build = (w, h, d, _o, f) => {
  const m = ms(f), z1 = -d / 2 + 16;
  return [
    box(0, 60, -d / 2 + 8, 80, 140, 16, f.c, m), cyl(0, 120, z1 + 100, 10, 200, 'z', f.c, m), cyl(0, 120, z1 + 275, 9, 150, 'z', f.c, m), cyl(0, 60, z1 + 334, 9, 80, 'y', f.c, m),
  ];
};

// ======================================================= lighting =====================================================
const ledStrip: Build = (w, h, d, o) => {
  const dh = o.thick ? 6 : 4;
  return [box(0, dh, 0, w, h - dh, d, ALU, METAL), box(0, 0, 0, w - 6, dh, d - 4, WARM, GLOW)];
};

const spotLights: Build = (w, h, d) => {
  const out: Prim[] = [];
  for (const sx of [-1, 0, 1]) out.push(cyl((sx * w) / 3, 2, 0, Math.min(28, d / 2), h - 2, 'y', STEEL, METAL), cyl((sx * w) / 3, 0, 0, 22, h, 'y', WARM, GLOW));
  return out;
};

const puckLights: Build = (w, h, d) => {
  const out: Prim[] = [];
  const r = Math.min(40, d / 2);
  for (const sx of [-1, 0, 1]) out.push(cyl(sx * w * 0.33, 2, 0, r, h - 2, 'y', ALU, METAL), cyl(sx * w * 0.33, 0, 0, r - 8, h, 'y', WARM, GLOW));
  return out;
};

const pendantDome: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  return [
    cyl(0, 3, 0, w / 2, 37, 'y', f.c, m), cyl(0, 0, 0, w * 0.43, 3, 'y', WARM, GLOW), cyl(0, 40, 0, w * 0.31, 40, 'y', f.c, m), cyl(0, 80, 0, 40, 30, 'y', f.c, m),
    cyl(0, 110, 0, 3, h - 110, 'y', BLACK),
  ];
};

const pendantGlobe: Build = (w, h, d, _o, f) => {
  const r = Math.min(w, d) / 2;
  return [sph(0, 0, 0, r, f.c, { opacity: 0.9, emissive: '#fff3d0' }), cyl(0, 2 * r, 0, 3, h - 2 * r, 'y', BLACK)];
};

const pendantTrio: Build = (w, h, d, _o, f) => {
  const m = ms(f), out: Prim[] = [box(0, h - 20, 0, w, 20, 60, f.c, m)];
  [250, 340, 250].forEach((cable, i) => {
    const x = (i - 1) * w * 0.35, top = h - 20 - cable;
    out.push(cyl(x, top, 0, 3, cable, 'y', BLACK), cyl(x, top - 45 + 3, 0, 100, 42, 'y', f.c, m), cyl(x, top - 45, 0, 80, 3, 'y', WARM, GLOW));
  });
  return out;
};

const pendantLinear: Build = (w, h, d, _o, f) => [
  box(0, 3, 0, w, 37, d, f.c, ms(f)), box(0, 0, 0, w - 40, 3, d - 30, WARM, GLOW), cyl(-w * 0.35, 40, 0, 3, h - 40, 'y', BLACK), cyl(w * 0.35, 40, 0, 3, h - 40, 'y', BLACK),
];

const wallSconce: Build = (w, h, d, _o, f) => {
  const m = ms(f);
  return [box(0, 60, -d / 2 + 6, 60, 120, 12, f.c, m), cyl(0, 120, -d / 2 + 62, 8, 100, 'z', f.c, m), cyl(0, 40, 0, 60, 170, 'y', f.c, { ...m, emissive: '#3a2f12' })];
};

// ======================================================= organisers ===================================================
const insertTray: Build = (w, h, d, o, f) => {
  const cols = num(o, 'cols', 3), rows = num(o, 'rows', 1), t = 6, m = ms(f);
  const out: Prim[] = [box(0, 0, 0, w, 4, d, f.c, m)];
  out.push(box(0, 4, -(d / 2 - t / 2), w, h - 4, t, f.c, m), box(0, 4, d / 2 - t / 2, w, h - 4, t, f.c, m));
  out.push(box(-(w / 2 - t / 2), 4, 0, t, h - 4, d - 2 * t, f.c, m), box(w / 2 - t / 2, 4, 0, t, h - 4, d - 2 * t, f.c, m));
  for (let i = 1; i < cols; i++) out.push(box(-w / 2 + (i * w) / cols, 4, 0, 5, h - 14, d - 2 * t, f.c, m));
  for (let j = 1; j < rows; j++) out.push(box(0, 4, -d / 2 + (j * d) / rows, w - 2 * t, h - 14, 5, f.c, m));
  if (o.jars) {
    const colors = ['#f97316', '#eab308', '#a16207', '#dc2626'];
    const r = Math.min(w / cols, d / rows) / 2 - 8;
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) out.push(cyl(-w / 2 + ((i + 0.5) * w) / cols, 4, -d / 2 + ((j + 0.5) * d) / rows, r, h - 12, 'y', colors[(i + j) % 4], { opacity: 0.9 }));
  }
  return out;
};

const knifeInsert: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, h - 10, d, WOOD)];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * w * 0.14;
    out.push(box(x, h - 10, d * 0.3, 16, 10, 120, BLACK), box(x, h - 8, -d * 0.12, 3, 8, 260, STEEL, METAL));
  }
  return out;
};

const platePegs: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 12, d, WOOD)];
  for (let i = 0; i < 9; i++) for (let j = 0; j < 4; j++) out.push(cyl(-w / 2 + 30 + (i * (w - 60)) / 8, 12, -d / 2 + 40 + (j * (d - 80)) / 3, 5, h - 12, 'y', WOOD));
  return out;
};

const trayDivider: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 10, d, STEEL, METAL)];
  for (let i = 0; i < 8; i++) out.push(box(-w / 2 + 20 + (i * (w - 40)) / 7, 10, 0, 4, h - 10, d - 20, STEEL, METAL));
  return out;
};

function wireBasket(cx: number, cz: number, bw: number, bd: number, bh: number): Prim[] {
  const b = 5, out: Prim[] = [];
  const ring = (yb: number) => {
    out.push(box(cx, yb, cz - (bd / 2 - b / 2), bw, b, b, STEEL, METAL), box(cx, yb, cz + (bd / 2 - b / 2), bw, b, b, STEEL, METAL));
    out.push(box(cx - (bw / 2 - b / 2), yb, cz, b, b, bd, STEEL, METAL), box(cx + (bw / 2 - b / 2), yb, cz, b, b, bd, STEEL, METAL));
  };
  ring(0); ring(bh - b);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(box(cx + sx * (bw / 2 - b / 2), 0, cz + sz * (bd / 2 - b / 2), b, bh, b, STEEL, METAL));
  return out;
}

const pulloutBasket: Build = (w, h, d) => {
  const out = wireBasket(0, 0, w, d, h);
  for (let i = 1; i <= 6; i++) out.push(box(-w / 2 + (i * w) / 7, 0, 0, 5, 5, d - 10, STEEL, METAL));
  out.push(...wireBasket(0, 0, w, d, h / 2 + 2.5).slice(4, 8)); // the middle ring
  return out;
};

const bottleRack: Build = (w, h, d) => {
  const out: Prim[] = [];
  const pitch = (h - 6) / 3, bh = pitch - 14, r = Math.min(w * 0.28, 32);
  const colors = ['#3f6212', '#92400e'];
  for (let i = 0; i < 3; i++) {
    const yb = i * pitch;
    out.push(box(0, yb, 0, w, 6, d - 20, STEEL, METAL));
    for (const sz of [-1, 1]) out.push(cyl(0, yb + 6, sz * d * 0.22, r, bh, 'y', colors[(i + (sz > 0 ? 1 : 0)) % 2], { opacity: 0.9 }));
  }
  for (const sx of [-1, 1]) out.push(box(sx * (w / 2 - 2.5), 0, 0, 5, h, d - 20, STEEL, METAL));
  return out;
};

const cornerCarousel: Build = (w, h, d) => {
  const R = Math.min(w, d) / 2;
  return [cyl(0, 0, 0, 18, h, 'y', STEEL, METAL), cyl(0, 30, 0, R * 0.97, 8, 'y', LIGHT), cyl(0, h * 0.55, 0, R * 0.97, 8, 'y', LIGHT), cyl(0, h - 8, 0, R * 0.5, 8, 'y', LIGHT)];
};

const magicCorner: Build = (w, h, d) => [...wireBasket(-w * 0.2, d * 0.2, w * 0.55, d * 0.55, h), ...wireBasket(w * 0.2, -d * 0.2, w * 0.55, d * 0.55, h)];

const wasteSorter: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 6, d, STEEL, METAL)];
  const bw = (w - 8) / 3 - 4;
  const bodies = ['#3b82f6', '#22c55e', '#9ca3af'], lids = ['#93c5fd', '#86efac', '#d1d5db'];
  for (let i = -1; i <= 1; i++) {
    out.push(box(i * (bw + 4), 6, 0, bw, h * 0.8 - 6, d * 0.85, bodies[i + 1]), box(i * (bw + 4), h * 0.8, 0, bw, 14, d * 0.85, lids[i + 1]));
  }
  return out;
};

const plateRack: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 10, d, WOOD)];
  for (const sz of [-1, 1]) for (let i = 0; i < 9; i++) out.push(cyl(-w / 2 + 25 + (i * (w - 50)) / 8, 10, sz * d * 0.2, 5, h - 10, 'y', STEEL, METAL));
  return out;
};

const larder: Build = (w, h, d) => {
  const out: Prim[] = [box(-(w / 2 - 3), 0, 0, 6, h, d, STEEL, METAL), box(w / 2 - 3, 0, 0, 6, h, d, STEEL, METAL)];
  for (let i = 0; i < 6; i++) {
    const yb = (i * (h - 80)) / 5;
    out.push(box(0, yb, 0, w - 12, 8, d - 20, WOOD), box(0, yb + 8, d / 2 - 12, w - 12, 60, 4, STEEL, METAL));
  }
  return out;
};

const rolloutShelf: Build = (w, h, d) => [box(0, 0, 0, w, 10, d, WOOD), box(0, 10, d / 2 - 5, w, h - 10, 10, STEEL, METAL), box(-(w / 2 - 3), 0, 0, 6, 40, d, STEEL, METAL), box(w / 2 - 3, 0, 0, 6, 40, d, STEEL, METAL)];

const underSinkU: Build = (w, h, d) => [
  box(0, 0, 0, w, 12, d, WHITE), box(0, 12, d / 2 - 5, w, h - 12, 10, WHITE), box(-(w / 2 - 5), 12, d * 0.125, 10, h - 12, d * 0.75, WHITE), box(w / 2 - 5, 12, d * 0.125, 10, h - 12, d * 0.75, WHITE),
];

const disposer: Build = (w, h, d) => [cyl(0, 0, 0, 75, 150, 'y', DARK), cyl(0, 150, 0, 85, 110, 'y', STEEL, METAL), cyl(0, 260, 0, 70, 70, 'y', STEEL, METAL), cyl(65, 210, 0, 20, 40, 'x', STEEL, METAL)];

const waterFilter: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 20, d, STEEL, METAL), box(0, 280, 0, w - 6, 60, 100, '#1e3a8a')];
  for (const x of [-95, 0, 95]) out.push(cyl(x, 20, 0, 52, 260, 'y', '#e2e8f0', { opacity: 0.85 }), cyl(x, 340, 0, 8, h - 340, 'y', STEEL, METAL));
  return out;
};

const boilerTank: Build = (w, h, d) => {
  const R = Math.min(w, d) / 2;
  return [cyl(0, 0, 0, R, 240, 'y', WHITE), cyl(0, 240, 0, R * 0.77, 30, 'y', STEEL, METAL), cyl(0, 270, 0, 10, 30, 'y', STEEL, METAL), cyl(0, 90, R * 0.85, 14, 30, 'z', STEEL, METAL)];
};

const towelRail: Build = (w, h, d) => {
  const out: Prim[] = [box(-(w / 2 - 4), 0, 0, 8, h, d, STEEL, METAL), box(w / 2 - 4, 0, 0, 8, h, d, STEEL, METAL)];
  for (const z of [-0.3, 0, 0.3]) out.push(cyl(0, 62, z * d, 8, w - 16, 'x', STEEL, METAL));
  return out;
};

const wireShelf: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, d / 2 - 3, w, 25, 6, STEEL, METAL), box(0, 0, -(d / 2 - 3), w, 6, 6, STEEL, METAL)];
  for (let i = 1; i <= 8; i++) out.push(box(0, 0, -d / 2 + (i * d) / 9, w, 5, 5, STEEL, METAL));
  for (let i = 0; i <= 4; i++) out.push(box(-w / 2 + 3 + (i * (w - 6)) / 4, 0, 0, 6, 6, d, STEEL, METAL));
  return out;
};

// ======================================================= smart home and decor =========================================
const smartDisplay: Build = (w, h, d) => [box(0, 0, 0, w, h, d, DARK, GLOSS), box(0, 10, d / 2 - 1, w - 20, h - 20, 2, '#0ea5e9', { emissive: '#0369a1' })];
const gasDetector: Build = (w, h, d) => [box(0, 0, 0, w, h, d, WHITE), box(0, 20, d / 2 - 1, 50, 50, 2, DARK), cyl(25, 66, d / 2 - 1, 4, 2, 'z', '#22c55e', { emissive: '#22c55e' })];
const extinguisher: Build = (w, h, d) => [cyl(0, 20, 0, 50, 300, 'y', '#dc2626'), cyl(0, 320, 0, 20, 30, 'y', DARK), box(0, 340, 0, 60, 10, 20, DARK), box(0, 150, -d / 2 + 4, 40, 80, 8, DARK)];
const smartSpeaker: Build = (w, h, d, _o, f) => [cyl(0, 0, 0, Math.min(w, d) / 2, h - 6, 'y', f.c, ms(f)), cyl(0, h - 6, 0, Math.min(w, d) / 2 - 5, 6, 'y', '#38bdf8', { emissive: '#38bdf8' })];
const usbDock: Build = (w, h, d, _o, f) => {
  const out: Prim[] = [box(0, 0, 0, w, 20, d, f.c, ms(f))];
  for (const x of [-70, 0, 70]) out.push(box(x, 20, d * 0.15, 50, 95, 8, DARK), box(x, 25, d * 0.15 + 4.5, 42, 85, 1, '#0ea5e9', { emissive: '#075985' }));
  return out;
};

const plantPot: Build = (w, h, d, _o, f) => [
  cyl(0, 0, 0, Math.min(w, d) * 0.42, 120, 'y', f.c, ms(f)), cyl(0, 120, 0, 70, 5, 'y', '#3f2d1d'),
  sph(-35, 140, 10, 50, '#15803d'), sph(35, 150, -10, 50, '#16a34a'), sph(0, 210, 0, 55, '#22c55e'),
];

const herbTrio: Build = (w, h, d) => {
  const out: Prim[] = [box(0, 0, 0, w, 12, d, STEEL, METAL)];
  for (const [i, x] of [-120, 0, 120].entries()) out.push(cyl(x, 12, 0, 48, 70, 'y', '#b45309'), sph(x, 82, 0, 48, ['#16a34a', '#15803d', '#22c55e'][i]));
  return out;
};

const vase: Build = (w, h, d, _o, f) => {
  const out: Prim[] = [cyl(0, 0, 0, 55, 160, 'y', f.c, ms(f)), cyl(0, 160, 0, 30, 40, 'y', f.c, ms(f))];
  const fl = ['#f43f5e', '#fb923c', '#facc15', '#f472b6', '#fb7185'];
  [[-40, -25], [40, 25], [0, 0], [-20, 30], [25, -30]].forEach(([x, z], i) => out.push(cyl(x * 0.5, 200, z * 0.5, 3, 150, 'y', '#16a34a'), sph(x, 322, z, 28, fl[i])));
  return out;
};

const cookbook: Build = (w, h, d) => [
  box(0, 0, 0, w, 20, d, WOOD), box(0, 20, -d * 0.2, w * 0.9, 250, 10, WOOD), box(0, 40, -d * 0.1, w * 0.8, 200, 14, '#2563eb'), box(0, 42, -d * 0.1 + 8, w * 0.76, 196, 3, WHITE),
];

const barStool: Build = (w, h, d, _o, f) => {
  const m = ms(f), out: Prim[] = [cyl(0, 660, 0, 180, 40, 'y', f.c, m)];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cyl(sx * 100, 0, sz * 100, 12, 660, 'y', DARK));
  out.push(box(0, 250, 100, 200, 12, 12, DARK), box(0, 250, -100, 200, 12, 12, DARK), box(100, 250, 0, 12, 12, 200, DARK), box(-100, 250, 0, 12, 12, 200, DARK));
  return out;
};

const trolley: Build = (w, h, d, _o, f) => {
  const m = ms(f), out: Prim[] = [];
  for (const yb of [70, 400, 825]) out.push(box(0, yb, 0, w, 25, d, f.c, m));
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.push(cyl(sx * 230, 30, sz * (d / 2 - 30), 15, 800, 'y', DARK), cyl(sx * 235, 0, sz * (d / 2 - 30), 30, 20, 'x', BLACK));
  return out;
};

const rug: Build = (w, h, d, _o, f) => [box(0, 0, 0, w, h, d, f.c, { metal: 0, rough: 0.95 }), box(0, h - 1, 0, w - 100, 1.5, d - 100, shade(f.c, 0.15), { metal: 0, rough: 0.95 })];

// A piece of the external library whose 3D file is missing or still loading: a translucent box with a top and a bottom plate.
const placeholder: Build = (w, h, d) => [
  box(0, 0, 0, w, h, d, '#94a3b8', { opacity: 0.55, metal: 0, rough: 0.8 }), box(0, 0, 0, w, Math.min(6, h / 4), d, '#475569'), box(0, h - Math.min(6, h / 4), 0, w, Math.min(6, h / 4), d, '#475569'),
];

const BUILDERS: Record<AccessoryModelKey, Build> = {
  popupSocket, flushSocket, railSocket, wirelessCharger, wallPlate,
  sink, sinkWorkstation, tap, soapDispenser, sinkRack, colander, sinkBoard,
  hobInduction, hobGas, hobDowndraft, hoodChimney, hoodAngled, hoodBox, hoodIsland, hoodSlim, hoodGlass,
  fridge, wineCooler, range: rangeCooker, washer, dishwasherFree,
  espresso, coffeeDrip, kettle, toaster, microwave, airFryer, blender, standMixer, riceCooker, foodProcessor,
  cuttingBoard, knifeBlock, utensilHolder, dishDrainer, breadBin, spiceCounter, paperTowel, fruitBowl, canisters,
  panel, wallRail, knifeStrip, floatShelf, wallClock, potFiller,
  ledStrip, spotLights, puckLights, pendantDome, pendantGlobe, pendantTrio, pendantLinear, wallSconce,
  insertTray, knifeInsert, platePegs, trayDivider,
  pulloutBasket, bottleRack, cornerCarousel, wasteSorter, plateRack, larder, magicCorner, rolloutShelf, underSinkU,
  disposer, waterFilter, boilerTank, towelRail, wireShelf,
  smartDisplay, gasDetector, extinguisher, smartSpeaker, usbDock,
  plantPot, herbTrio, vase, barStool, trolley, rug, cookbook,
  placeholder,
};

export const ACCESSORY_MODEL_KEYS = Object.keys(BUILDERS) as AccessoryModelKey[];

/** The shapes of a model drawn inside a w x h x d box (mm), in the given variant and finish. */
export function modelPrims(model: AccessoryModelKey, w: number, h: number, d: number, opts: ModelOpts = {}, finish: FinishStyle = FINISHES.steel): Prim[] {
  return BUILDERS[model](w, h, d, opts, finish);
}

/** Axis-aligned extent of a primitive (mm): [minX, maxX, minY, maxY, minZ, maxZ]. */
export function primBounds(p: Prim): [number, number, number, number, number, number] {
  if (p.t === 'box') return [p.x - p.w / 2, p.x + p.w / 2, p.y - p.h / 2, p.y + p.h / 2, p.z - p.d / 2, p.z + p.d / 2];
  if (p.t === 'sph') return [p.x - p.r, p.x + p.r, p.y - p.r, p.y + p.r, p.z - p.r, p.z + p.r];
  const half = p.len / 2;
  const ex = p.ax === 'x' ? half : p.r;
  const ey = p.ax === 'y' ? half : p.r;
  const ez = p.ax === 'z' ? half : p.r;
  return [p.x - ex, p.x + ex, p.y - ey, p.y + ey, p.z - ez, p.z + ez];
}
