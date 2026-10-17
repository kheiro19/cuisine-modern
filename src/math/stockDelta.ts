// src/math/stockDelta.ts
// Hardware stock is corrected by the DIFFERENCE in consumption between the old and the new set of cabinets.
// One mechanism for add / edit / delete / undo, reversible by construction. Before: each action had its own
// copy of the rule, deduction was clamped at zero while restoration was not (so add + delete of a cabinet
// needing 4 legs with 2 in stock left 4: stock invented from nothing), and Undo never touched the stock.
// Stock may now go negative: a negative number is a visible shortage, not a silent clamp.
import { CabinetObject, InjectedHardwareItem } from '../types/flatma';
import { hardwareRequirements } from './partsEngine';

/** Units of each hardware item (by id) a cabinet uses: the very requirements the BOM and the price use. */
export function hardwareConsumption(cab: CabinetObject, items: InjectedHardwareItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const req of hardwareRequirements(cab, items)) out[req.item.id] = (out[req.item.id] ?? 0) + req.quantity;
  return out;
}

export function totalConsumption(cabs: CabinetObject[], items: InjectedHardwareItem[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const cab of cabs) {
    for (const [id, qty] of Object.entries(hardwareConsumption(cab, items))) total[id] = (total[id] ?? 0) + qty;
  }
  return total;
}

/**
 * Registers a NEW hardware item in the stock. Cabinets drawn before it existed may need it now (legs registered after the
 * cabinets): their consumption is taken from the new item at once. Without this, deleting (or undoing) such a cabinet
 * gave back pieces that were never taken: 100 legs registered -> 104 after add + delete, stock invented from nothing.
 */
export function registerHardwareItem(
  items: InjectedHardwareItem[],
  item: InjectedHardwareItem,
  cabinets: CabinetObject[],
): InjectedHardwareItem[] {
  const used = totalConsumption(cabinets, [...items, item])[item.id] ?? 0;
  return [...items, used === 0 ? item : { ...item, availableQty: item.availableQty - used }];
}

export function applyConsumptionDelta(
  items: InjectedHardwareItem[],
  before: CabinetObject[],
  after: CabinetObject[],
): InjectedHardwareItem[] {
  const b = totalConsumption(before, items);
  const a = totalConsumption(after, items);
  return items.map((item) => {
    const delta = (b[item.id] ?? 0) - (a[item.id] ?? 0);
    return delta === 0 ? item : { ...item, availableQty: item.availableQty + delta };
  });
}
