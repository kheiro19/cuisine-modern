// src/math/utils.ts
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function toFiniteNumber(value: unknown, fallback: number): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** Parses, rounds and clamps. Non-numeric input falls back to `fallback` (then clamped). */
export function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  return clamp(Math.round(toFiniteNumber(value, fallback)), min, max);
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

let uidCounter = 0;
/** Collision-safe id (two clicks in the same millisecond used to share Date.now()). */
export function uid(prefix: string): string {
  uidCounter += 1;
  const rnd =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}_${uidCounter}_${rnd}`;
}

/**
 * RFC-4180 quoting + CSV/formula-injection guard.
 * A string starting with = + - @ TAB or CR is prefixed with an apostrophe so Excel /
 * LibreOffice treat it as text instead of executing it. Numbers are written as-is.
 */
export function csvCell(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  let s = value;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}
