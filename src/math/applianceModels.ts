// src/math/applianceModels.ts
// What an appliance of a cabinet niche LOOKS like in 3D, and which pieces of the accessories library can stand in a niche.
// The shapes are the ones of math/accessoryModels.ts, stretched to the niche. Only the appliances that stand free in an open bay
// (a "half cabinet") are drawn this way; the built-in ones with a trim (oven, microwave, coffee machine) keep their frame.
import type { ApplianceKind } from '../types/flatma';
import { AccessoryItem, AccessoryModelKey, FinishKey, ModelOpts, allAccessories, getAccessory } from '../data/accessoryCatalog';

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

/** The kind of niche a piece of the library fits (washer, dryer, dishwasher, fridge...), or undefined: it cannot stand in a niche. */
export function applianceKindOfItem(item: AccessoryItem | undefined): ApplianceKind | undefined {
  if (!item || item.mount !== 'FLOOR') return undefined;
  switch (item.model) {
    case 'washer': return item.opts?.dryer ? 'DRYER' : 'WASHER';
    case 'dishwasherFree': return 'DISHWASHER';
    case 'wineCooler': return 'FRIDGE';
    case 'fridge': return item.sizeMm.h < 1000 ? 'UNDER_FRIDGE' : 'FRIDGE';
    default: return undefined;
  }
}

/** The pieces of the library that can be chosen for the niche of a cabinet, with the kind of niche each one asks for. */
export function libraryAppliances(): Array<{ item: AccessoryItem; kind: ApplianceKind }> {
  return allAccessories().flatMap((item) => {
    const kind = applianceKindOfItem(item);
    return kind ? [{ item, kind }] : [];
  });
}

/** The library look of an appliance: the chosen piece of the library when there is one, else the standard look of its kind. */
export function applianceLookOf(kind: ApplianceKind, libraryId?: string): ApplianceLook | undefined {
  const item = libraryId ? getAccessory(libraryId) : undefined;
  if (item && applianceKindOfItem(item) === kind) return { model: item.model, opts: item.opts ?? {}, finish: item.finishes?.[0] ?? LOOKS[kind]?.finish ?? 'steel' };
  return LOOKS[kind];
}
