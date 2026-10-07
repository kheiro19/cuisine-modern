// src/math/costEngine.ts

import { InjectedWoodMaterial, InjectedHardwareItem, CabinetObject, EdgeBandRoll } from '../types/flatma';
import { priceCabinet } from './partsEngine';

/**
 * 📈 Calculates the Moving Average Cost (السعر المتوسط التراكمي) when new inventory arrives
 * Formula: ((Current Qty * Current Avg Price) + (New Qty * New Price)) / (Current Qty + New Qty)
 */
export function calculateMovingAverage(
  currentQty: number,
  currentAvgPrice: number,
  newQty: number,
  newPrice: number
): number {
  const totalQty = currentQty + newQty;
  if (totalQty === 0) return 0;
  
  const totalValue = (currentQty * currentAvgPrice) + (newQty * newPrice);
  return Math.round(totalValue / totalQty);
}

/**
 * 📐 Calculates the raw material cost of a panel based on its surface area (m²) prorated from the sheet cost
 */
export function calculatePanelCost(
  widthMm: number,
  heightMm: number,
  sheetWidthMm: number,
  sheetHeightMm: number,
  sheetPriceDA: number
): number {
  const panelAreaM2 = (widthMm * heightMm) / 1000000;
  const sheetAreaM2 = (sheetWidthMm * sheetHeightMm) / 1000000;
  
  if (sheetAreaM2 === 0) return 0;
  
  const costPerM2 = sheetPriceDA / sheetAreaM2;
  return Math.round(panelAreaM2 * costPerM2);
}

/**
 * 💸 Core Production Function: the manufacturing cost of a single procedural cabinet.
 * It IS partsEngine.priceCabinet — the function the BOM sums — so a cabinet's price and the total of its BOM rows are
 * the same number (the old formula here used a different geometry and priced a lift kit like 2-3 hinges).
 */
export function computeCabinetTotalCost(
  cabinet: CabinetObject,
  woodMaterials: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = []
): number {
  return priceCabinet(cabinet, woodMaterials, hardwareItems, edgeRolls).totalDA;
}
