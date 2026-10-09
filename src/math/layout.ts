// src/math/layout.ts
import { CabinetCategory } from '../types/flatma';

/**
 * Where the next cabinet of `category` goes. Base units and wall units form two independent runs along the
 * wall: before, a new wall unit was placed after the combined width of EVERY cabinet, so it ended up
 * shifted sideways instead of above the base run.
 */
export function nextPositionX(
  cabinets: ReadonlyArray<{ category: CabinetCategory; positionX: number; width: number }>,
  category: CabinetCategory,
): number {
  return cabinets
    .filter((c) => c.category === category)
    .reduce((end, c) => Math.max(end, c.positionX + c.width), 0);
}
