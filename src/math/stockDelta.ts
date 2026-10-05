// src/math/stockDelta.ts
// Hardware stock is corrected by the DIFFERENCE in consumption between the old and the new set of cabinets.
// One mechanism for add / edit / delete / undo, reversible by construction. Before: each action had its own
// copy of the rule, deduction was clamped at zero while restoration was not (so add + delete of a cabinet
// needing 4 legs with 2 in stock left 4: stock invented from nothing), and Undo never touched the stock.
// Stock may now go negative: a negative number is a visible shortage, not a silent clamp.
import { CabinetObject, InjectedHardwareItem } from '../types/flatma';

const LEGS_KEYWORD = 'Adjustable Kitchen Legs';
const HANGERS_KEYWORD = 'Cabinet Hanger Plates';

/** Units of each hardware item (by id) a cabinet uses — the same rule costEngine prices. */
export function hardwareConsumption(cab: CabinetObject, items: InjectedHardwareItem[]): Record<string, number> {
  const out: Record<string, number> = {};
  const add = (id: string, qty: number) => {
    out[id] = (out[id] ?? 0) + qty;
  };
  const { openingType, elementCount, hardwareItemId } = cab.frontConfig;
  if (openingType !== 'NONE' && items.some((i) => i.id === hardwareItemId)) {
    add(hardwareItemId, openingType === 'DOORS' ? (cab.height > 900 ? 3 : 2) * elementCount : elementCount);
  }
  if (cab.category === 'BASE_UNIT') {
    const legs = items.find((i) => i.modelType.includes(LEGS_KEYWORD));
    if (legs) add(legs.id, 4);
  } else {
    const hangers = items.find((i) => i.modelType.includes(HANGERS_KEYWORD));
    if (hangers) add(hangers.id, 2);
  }
  return out;
}

export function totalConsumption(cabs: CabinetObject[], items: InjectedHardwareItem[]): Record<string, number> {
  const total: Record<string, number> = {};
  for (const cab of cabs) {
    for (const [id, qty] of Object.entries(hardwareConsumption(cab, items))) total[id] = (total[id] ?? 0) + qty;
  }
  return total;
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
