// src/math/materialLifecycle.ts
// A material built by TextureEngine owns GPU memory: its own clone of the texture, uploaded on its own. React and three.js never free
// it by themselves, so every cabinet edit used to leak one clone per material. These helpers hold the rules (no three.js import, so
// they are tested in plain node): which materials a cabinet needs, and how to release / re-arm them.

export type Grain = 'vertical' | 'horizontal';

/** Drawer and apron fronts run their grain across, everything else along. */
export const grainOf = (kind: string): Grain => (kind === 'DRAWER' || kind === 'APRON' ? 'horizontal' : 'vertical');

/** One front material per distinct facade size and grain, so the texture scale follows each front. A zone may overrule the
 * grain of its kind, and flip it 180° (the R suffix): the key carries both, so each combination gets its own material. */
export const materialKeyOf = (f: { kind: string; widthMm: number; heightMm: number }, grain?: Grain, flip?: boolean): string =>
  `${f.widthMm}x${f.heightMm}x${grain ?? grainOf(f.kind)}${flip ? 'R' : ''}`;

/**
 * Every material key a cabinet's fronts need, as one string. It is the memo key for the front materials: it does NOT change when a
 * cabinet only moves or when a front keeps its size, so the materials (and their GPU textures) are not rebuilt for nothing.
 */
export const facadeMaterialSignature = (facades: ReadonlyArray<{ kind: string; widthMm: number; heightMm: number }>): string =>
  [...new Set(facades.map((f) => materialKeyOf(f)))].sort().join('|');

export function parseMaterialKey(key: string): { widthMm: number; heightMm: number; grain: Grain; flip: boolean } {
  const [w, h, grain] = key.split('x');
  return { widthMm: Number(w), heightMm: Number(h), grain: grain?.startsWith('horizontal') ? 'horizontal' : 'vertical', flip: !!grain?.endsWith('R') };
}

/** The part of a three.js material the lifecycle touches. */
export interface OwnedMaterial {
  userData: Record<string, unknown>;
  /** The per-material texture clone (never the shared base texture). */
  map?: { dispose(): void } | null;
  dispose(): void;
}

/** Frees the material and its own texture clone, and marks it so a texture that arrives late is not attached to a dead material. */
export function disposeOwned(m: OwnedMaterial): void {
  m.userData.disposed = true;
  m.map?.dispose();
  m.dispose();
}

/**
 * React StrictMode (development) runs setup, cleanup, setup again on the SAME memoised materials: re-arming on setup keeps them usable
 * (three.js uploads a disposed texture again the next time it is drawn).
 */
export function reviveOwned(m: OwnedMaterial): void {
  m.userData.disposed = false;
}

export const canAttachTexture = (m: Pick<OwnedMaterial, 'userData'>): boolean => m.userData.disposed !== true;
