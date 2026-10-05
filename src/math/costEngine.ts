// src/math/costEngine.ts

import { InjectedWoodMaterial, InjectedHardwareItem, CabinetObject, EdgeBandRoll } from '../types/flatma';
import { bandUsageOf } from './edgeBand';

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
 * 💸 Core Production Function: Computes the explicit manufacturing cost of a single procedural cabinet
 */
export function computeCabinetTotalCost(
  cabinet: CabinetObject,
  woodMaterials: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = []
): number {
  let totalCost = 0;

  const carcaseMat = woodMaterials.find(m => m.id === cabinet.carcaseMaterialId);
  const frontMat = woodMaterials.find(m => m.id === cabinet.frontMaterialId);

  if (!carcaseMat) return 0;

  // 1. Calculate Carcase Board Consumption (Left, Right, Bottom, Top Rails, Backwall)
  const th = carcaseMat.thickness;
  const w = cabinet.width;
  const h = cabinet.height;
  const d = cabinet.depth;

  const leftRightCost = calculatePanelCost(th, h, carcaseMat.widthSheet, carcaseMat.heightSheet, carcaseMat.averagePriceDA) * 2;
  const bottomCost = calculatePanelCost(w - (2 * th), th, carcaseMat.widthSheet, carcaseMat.heightSheet, carcaseMat.averagePriceDA);
  const topRailsCost = calculatePanelCost(w - (2 * th), th, carcaseMat.widthSheet, carcaseMat.heightSheet, carcaseMat.averagePriceDA) * 2;
  const backwallCost = calculatePanelCost(w, h, carcaseMat.widthSheet, carcaseMat.heightSheet, carcaseMat.averagePriceDA); // Assumed 3mm HDF standard or matching price
  
  let shelvesCost = 0;
  if (cabinet.shelvesCount > 0) {
    shelvesCost = calculatePanelCost(w - (2 * th) - 2, d - 20, carcaseMat.widthSheet, carcaseMat.heightSheet, carcaseMat.averagePriceDA) * cabinet.shelvesCount;
  }

  totalCost += leftRightCost + bottomCost + topRailsCost + backwallCost + shelvesCost;

  // 2. Calculate Front Facade Board Consumption
  if (cabinet.frontConfig.openingType !== 'NONE' && frontMat) {
    const frontCost = calculatePanelCost(w - 4, h - 4, frontMat.widthSheet, frontMat.heightSheet, frontMat.averagePriceDA);
    totalCost += frontCost;

    // 3. Dynamic Hardware Items Linkage & Cost Aggregation
    const activeHardware = hardwareItems.find(h => h.id === cabinet.frontConfig.hardwareItemId);
    if (activeHardware) {
      if (cabinet.frontConfig.openingType === 'DOORS') {
        // Automatic calculation: 2 hinges per door minimum, 3 if tall
        const hingesPerElement = h > 900 ? 3 : 2;
        const totalHinges = cabinet.frontConfig.elementCount * hingesPerElement;
        totalCost += totalHinges * activeHardware.pricePerUnitDA;
      } else if (cabinet.frontConfig.openingType === 'DRAWERS') {
        // 1 set of runner slides per drawer element
        totalCost += cabinet.frontConfig.elementCount * activeHardware.pricePerUnitDA;
      }
    }
  }

  // 4. Structural Fixing Elements Auto-Injection Cost (4 Legs for base unit, 2 hanger plates for wall unit)
  if (cabinet.category === 'BASE_UNIT') {
    const legsHardware = hardwareItems.find(i => i.modelType.includes('Adjustable Kitchen Legs'));
    if (legsHardware) totalCost += 4 * legsHardware.pricePerUnitDA;
  } else if (cabinet.category === 'WALL_UNIT') {
    const hangersHardware = hardwareItems.find(i => i.modelType.includes('Cabinet Hanger Plates'));
    if (hangersHardware) totalCost += 2 * hangersHardware.pricePerUnitDA;
  }

  // 5. Edge band consumed (roll price prorated by the metres glued on carcase + fronts)
  totalCost += bandUsageOf(cabinet, edgeRolls).reduce((sum, u) => sum + u.costDA, 0);

  return Math.round(totalCost);
}
