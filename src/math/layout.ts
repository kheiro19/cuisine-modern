// src/math/layout.ts
import { CabinetCategory, WallSide } from '../types/flatma';

type Placed = { category: CabinetCategory; positionX: number; width: number; depth?: number; wall?: WallSide };

/** Depth of the back run: side runs (L / U) start after it so they do not collide in the corner. */
export function cornerClearanceMm(cabinets: ReadonlyArray<Placed>): number {
  return cabinets
    .filter((c) => (c.wall ?? 'BACK') === 'BACK' && c.category === 'BASE_UNIT')
    .reduce((m, c) => Math.max(m, c.depth ?? 0), 0);
}

/**
 * Where the next cabinet of `category` goes on `wall`. Base units and wall units form independent runs along each
 * wall. On a side wall (LEFT / RIGHT) an empty run starts after the back run's depth.
 */
export function nextPositionX(cabinets: ReadonlyArray<Placed>, category: CabinetCategory, wall: WallSide = 'BACK'): number {
  const run = cabinets.filter((c) => c.category === category && (c.wall ?? 'BACK') === wall);
  const start = wall === 'BACK' ? 0 : cornerClearanceMm(cabinets);
  return run.reduce((end, c) => Math.max(end, c.positionX + c.width), start);
}
