// src/math/stockCheck.ts
// "Can this kitchen really be built with what the workshop has?"
//
// The price, the BOM and the stock all come from partsEngine.priceCabinet: this module only ADDS UP what a whole project needs
// and compares it with the stock. Nothing here prices anything, so the numbers can never disagree with the cutting list.
//
// Three stocks are checked:
//   SHEET     — square metres of boards, in SHEETS of each material (priceCabinet already reports the sheet-equivalents
//               of every part, waste factor included).
//   EDGE_BAND — metres drawn from each ROLL. The same roll picked for carcase and fronts is one roll, so both draws add up.
//   HARDWARE  — pieces of each stock item (hinges, cams, legs...).
//   All three are compared the same way and against the SAME baseline: the stock as it was entered, before the project.
//
// A shortage is reported with what the project needs and what the workshop has, so the message is actionable.
import { CabinetObject, EdgeBandRoll, InjectedHardwareItem, InjectedWoodMaterial } from '../types/flatma';
import { CabinetPricing, priceCabinet } from './partsEngine';

export type StockKind = 'SHEET' | 'EDGE_BAND' | 'HARDWARE';
export type StockUnit = 'sheet' | 'meter' | 'piece';

export interface StockShortage {
  kind: StockKind;
  /** Material id / roll id / hardware item id. */
  itemId: string;
  /** Human label: "MDF Melamine Matt 18 mm", "Edge band 22 mm", "Clip Top". */
  label: string;
  /** What the project needs, in `unit`. */
  required: number;
  /** What the workshop has, in `unit`. */
  available: number;
  /** required - available, always > 0. */
  shortfall: number;
  unit: StockUnit;
}

export type StockDemand = Record<string, number>;

const round2 = (n: number) => Math.round(n * 100) / 100;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** How much of each material / roll / item a set of priced cabinets draws. Pure: it only reads the pricing results. */
export function demandOf(pricing: ReadonlyArray<CabinetPricing>): { sheets: StockDemand; band: StockDemand; hardware: StockDemand } {
  const sheets: StockDemand = {};
  const band: StockDemand = {};
  const hardware: StockDemand = {};

  pricing.forEach((p) => {
    // Sheets: every part knows its material and its sheet-equivalents (area x waste factor / sheet area).
    p.parts.forEach((part) => {
      const id = part.material?.id;
      if (id) sheets[id] = (sheets[id] ?? 0) + part.sheets;
    });
    // Edge band: one entry per (part kind, roll); the same roll may appear twice for one cabinet.
    p.edgeUsage.forEach((u) => { band[u.roll.id] = (band[u.roll.id] ?? 0) + u.meters; });
    // Hardware: the very requirements the BOM lists.
    p.hardware.forEach((h) => { hardware[h.item.id] = (hardware[h.item.id] ?? 0) + h.quantity; });
  });

  return { sheets, band, hardware };
}

/** What is left on a roll. A roll registered before `remainingLengthMeters` existed is a whole roll. */
export const remainingBandMeters = (roll: EdgeBandRoll): number =>
  typeof roll.remainingLengthMeters === 'number' && Number.isFinite(roll.remainingLengthMeters)
    ? Math.max(0, roll.remainingLengthMeters)
    : roll.totalLengthMeters;

/** How one kind of stock is rounded and how big a gap is worth a warning. */
const STOCK_RULES: Record<StockKind, { unit: StockUnit; round: (n: number) => number; epsilon: number }> = {
  SHEET: { unit: 'sheet', round: round2, epsilon: 0.01 },
  EDGE_BAND: { unit: 'meter', round: round1, epsilon: 0.05 },
  HARDWARE: { unit: 'piece', round: (n) => Math.round(n), epsilon: 0 },
};

const sheetLabel = (m: InjectedWoodMaterial) => `${m.type} ${m.thickness} mm`;
const rollLabel = (r: EdgeBandRoll) => `Edge band ${r.thickness} x ${r.width} mm (${r.brand})`;

/**
 * 📋 THE WHOLE INVENTORY, LINE BY LINE — not only what is short.
 *
 * One line per item the workshop holds (a board, a roll, a box of hinges), with three numbers that always mean the same thing:
 *   inStock  — what the workshop has for this project (see the hardware note below);
 *   required — what the WHOLE project takes, from the same pricing as the cutting list;
 *   left     — inStock - required. Negative = the project cannot be built with that stock.
 *
 * Every stock the app knows is here: boards, edge-band rolls, hardware. Nothing is dropped silently, so "not enough" can never
 * hide behind an item this module forgot about.
 *
 * ⚠️ THE CONTRACT: `woods` / `hardwareItems` / `edgeRolls` are the stock AS ENTERED — before this project took anything.
 * The context exposes that untouched snapshot (`baselineInventory`) next to the live one, because hardware is ALSO spent on the
 * shelf as cabinets are added (math/stockDelta), reversible by difference. Reading the live count here would count the same
 * pieces twice, so every caller passes the baseline and the arithmetic stays one line: left = inStock - required.
 * An item this project does not use keeps its own count and is never called a shortage (a negative there is not this kitchen's doing).
 */
export interface StockLine {
  kind: StockKind;
  itemId: string;
  label: string;
  unit: StockUnit;
  /** What the workshop has for this project, before it is built. */
  inStock: number;
  /** What this project takes, in `unit`. 0 = the kitchen does not use this item. */
  required: number;
  /** inStock - required. Negative = shortage. */
  left: number;
  /** How much is missing: max(0, -left), rounded like the unit. 0 = the project can be built. */
  shortfall: number;
}

export function stockLedgerFromPricing(
  pricing: ReadonlyArray<CabinetPricing>,
  woods: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
): StockLine[] {
  const { sheets, band, hardware } = demandOf(pricing);
  const out: StockLine[] = [];

  const push = (kind: StockKind, itemId: string, label: string, inStock: number, needed: number) => {
    const rule = STOCK_RULES[kind];
    const required = rule.round(Math.max(0, needed));
    // A hardware item this kitchen does not use is nobody's shortage: its own negative count is history, not this project.
    const shortfall = kind === 'HARDWARE' && required <= 0 ? 0 : Math.max(0, rule.round(required - inStock));
    const short = shortfall > 0 && required - inStock >= rule.epsilon;
    out.push({
      kind, itemId, label, unit: rule.unit,
      inStock: rule.round(inStock),
      required,
      left: rule.round(inStock - required),
      shortfall: short ? shortfall : 0,
    });
  };

  woods.forEach((m) => push('SHEET', m.id, sheetLabel(m), Math.max(0, m.currentQty), sheets[m.id] ?? 0));
  edgeRolls.forEach((r) => push('EDGE_BAND', r.id, rollLabel(r), remainingBandMeters(r), band[r.id] ?? 0));
  hardwareItems.forEach((h) => push('HARDWARE', h.id, h.modelType, h.availableQty, hardware[h.id] ?? 0));

  return out;
}

/** The same ledger, starting from the cabinets: prices them once (same function as the BOM) and reads the stock. */
export function stockLedger(
  cabinets: CabinetObject[],
  woods: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
): StockLine[] {
  return stockLedgerFromPricing(
    cabinets.map((c) => priceCabinet(c, woods, hardwareItems, edgeRolls)),
    woods, hardwareItems, edgeRolls,
  );
}

const lineToShortage = (l: StockLine): StockShortage => ({
  kind: l.kind,
  itemId: l.itemId,
  label: l.label,
  required: l.required,
  available: l.inStock,
  shortfall: l.shortfall,
  unit: l.unit,
});

/**
 * Every shortage of the project, from the pricing results already computed (bomEngine passes its own, so a BOM export costs
 * nothing more). An item that is missing from the stock altogether is not a shortage here: partsEngine already reports it as
 * "not in stock", and there is no number to compare with.
 * This is EXACTLY the shortage lines of the ledger, so the screen and the report can never disagree.
 */
export function checkStockFromPricing(
  pricing: ReadonlyArray<CabinetPricing>,
  woods: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
): StockShortage[] {
  return stockLedgerFromPricing(pricing, woods, hardwareItems, edgeRolls)
    .filter((l) => l.shortfall > 0)
    .map(lineToShortage);
}

/** Same check, starting from the cabinets: prices them once (same function as the BOM) and compares with the stock. */
export function checkStock(
  cabinets: CabinetObject[],
  woods: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
): StockShortage[] {
  return checkStockFromPricing(
    cabinets.map((c) => priceCabinet(c, woods, hardwareItems, edgeRolls)),
    woods, hardwareItems, edgeRolls,
  );
}

const UNIT_LABEL: Record<StockUnit, string> = { sheet: 'sheet(s)', meter: 'm', piece: 'piece(s)' };

/** One line per shortage, ready for the report and the CSV ("read this before cutting"). */
export const shortageMessage = (s: StockShortage): string =>
  `SHORTAGE: ${s.label} — the project needs ${s.required} ${UNIT_LABEL[s.unit]}, the stock has ${s.available}: missing ${s.shortfall} ${UNIT_LABEL[s.unit]}.`;
