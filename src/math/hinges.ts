// src/math/hinges.ts
import { HARDWARE_RULES } from './constants';

/** Hinges per swinging door, by DOOR height (HINGE_STEPS in constants.ts). */
export function hingesPerDoor(doorHeightMm: number): number {
  for (const step of HARDWARE_RULES.HINGE_STEPS) {
    if (doorHeightMm <= step.upToMm) return step.hinges;
  }
  return HARDWARE_RULES.HINGES_ABOVE_LAST_STEP;
}
