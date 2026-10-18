// src/math/applianceModels.ts
// What an appliance of a cabinet niche LOOKS like in 3D: the shapes of the accessories library (math/accessoryModels.ts), stretched
// to the niche. Only the appliances that stand free in an open bay (a "half cabinet") are drawn this way; the built-in ones with a
// trim (oven, microwave, coffee machine) keep their frame.
import type { ApplianceKind } from '../types/flatma';
import type { AccessoryModelKey, FinishKey, ModelOpts } from '../data/accessoryCatalog';

export interface ApplianceLook {
  model: AccessoryModelKey;
  opts: ModelOpts;
  finish: FinishKey;
}

const LOOKS: Partial<Record<ApplianceKind, ApplianceLook>> = {
  WASHER: { model: 'washer', opts: {}, finish: 'white' },
  DRYER: { model: 'washer', opts: { dryer: true }, finish: 'white' },
  DISHWASHER: { model: 'dishwasherFree', opts: {}, finish: 'steel' },
  FRIDGE: { model: 'fridge', opts: { type: 'single' }, finish: 'steel' },
  UNDER_FRIDGE: { model: 'fridge', opts: { type: 'single' }, finish: 'white' },
};

/** The library look of an appliance, or undefined (the plain box is drawn). */
export function applianceLookOf(kind: ApplianceKind): ApplianceLook | undefined {
  return LOOKS[kind];
}
