// src/math/bomEngine.ts
// Factory report. EVERYTHING comes from partsEngine.priceCabinet, the same function that prices the cabinet, so the
// rows below add up to the project total by construction (the total used to be a cached number from another formula).

import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem, EdgeBandRoll } from '../types/flatma';
import { CabinetPricing, HardwareGroup, priceCabinet } from './partsEngine';
import { StockLine, StockShortage, checkStockFromPricing, shortageMessage, stockLedgerFromPricing } from './stockCheck';
import { bandPricePerMeterDA } from './edgeBand';
import { csvCell } from './utils';

export interface BOMWoodRow {
  cabinetName: string;
  cabinetCategory: string;
  partType: string;
  materialType: string;
  materialBrand: string;
  thicknessMm: number;
  /** Edge band thickness (mm) glued on this part; the cut sizes below already have it subtracted. */
  edgeThicknessMm?: number;
  /** CUT width / length (finished size minus the edge band). */
  netWidthMm: number;
  netLengthMm: number;
  quantity: number;
  grainDirection: 'vertical' | 'horizontal' | 'none';
  /** Board cost of all `quantity` pieces (the edge band is priced in the hardware list, by the metre). */
  estimatedCostDA: number;
}

export interface BOMHardwareRow {
  cabinetName: string;
  category: string;
  brand: string;
  modelType: string;
  quantityRequired: number;
  unitPriceDA: number;
  totalHardwareCostDA: number;
}

export interface BOMApplianceRow {
  cabinetName: string;
  label: string;
  nicheWidthMm: number;
  nicheHeightMm: number;
  nicheDepthMm: number;
  note: string;
}

export interface FinalBOMReport {
  projectTimestamp: string;
  totalKitchenCostDA: number;
  woodPanelsSummary: BOMWoodRow[];
  hardwareAccessoriesSummary: BOMHardwareRow[];
  /** Appliances the customer supplies: they only add a niche, never a price. */
  appliancesSummary: BOMApplianceRow[];
  /** Anything left unpriced, missing from stock or short of stock: read it before cutting. */
  issues: string[];
  /** What the project needs and the stock does not have, with numbers (math/stockCheck.ts). Empty = the stock is enough. */
  shortages: StockShortage[];
  /** EVERY item the workshop holds (boards, rolls, hardware) and what this project takes from it: the complete picture. */
  stockLedger: StockLine[];
}

const GROUP_LABEL: Record<HardwareGroup, string> = {
  'Front Hardware': 'Combined Project Hardware',
  'Gola Profile': 'Gola Profile',
  'Push-Open': 'Push-Open Mechanism',
  'Assembly Fixings': 'Assembly Fixings (cams, dowels, screws, pins)',
  'Base Fixing System': 'Base Fixing System',
  'Wall Fixing System': 'Wall Fixing System',
};

const round2 = (n: number) => Math.round(n * 100) / 100;

export function generateFactoryBOMReport(
  cabinets: CabinetObject[],
  woodMaterials: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
  now: Date = new Date(),
): FinalBOMReport {
  const woodSummary: BOMWoodRow[] = [];
  const hardwareSummaryMap: { [key: string]: BOMHardwareRow } = {};
  const appliances: BOMApplianceRow[] = [];
  const issueSet = new Set<string>();
  let totalKitchenCost = 0;
  const pricingList: CabinetPricing[] = [];

  cabinets.forEach((cab) => {
    const pricing = priceCabinet(cab, woodMaterials, hardwareItems, edgeRolls);
    pricingList.push(pricing);
    totalKitchenCost += pricing.totalDA;
    pricing.issues.forEach((i) => issueSet.add(i.message));
    pricing.appliances.forEach((a) => appliances.push(a));

    pricing.parts.forEach((p) => {
      woodSummary.push({
        cabinetName: cab.name,
        cabinetCategory: cab.category,
        partType: p.partType,
        materialType: p.role === 'back' ? 'HDF Standard 3mm' : p.material ? p.material.type : p.role === 'front' ? 'Acrylic Finish' : 'Standard Melamine',
        materialBrand: p.material ? p.material.brand : 'Generic',
        thicknessMm: p.thicknessMm,
        edgeThicknessMm: p.edge === 'NONE' ? undefined : p.edgeMm,
        netWidthMm: p.cutWidthMm,
        netLengthMm: p.cutLengthMm,
        quantity: p.quantity,
        grainDirection: p.grain,
        estimatedCostDA: p.boardCostDA,
      });
    });

    pricing.hardware.forEach((h) => {
      const key = `${h.item.brand}_${h.item.modelType}`;
      const row = hardwareSummaryMap[key];
      if (row) {
        row.quantityRequired += h.quantity;
        row.totalHardwareCostDA += h.totalCostDA;
      } else {
        hardwareSummaryMap[key] = {
          cabinetName: GROUP_LABEL[h.group],
          category: h.item.category,
          brand: h.item.brand,
          modelType: h.item.modelType,
          quantityRequired: h.quantity,
          unitPriceDA: h.item.pricePerUnitDA,
          totalHardwareCostDA: h.totalCostDA,
        };
      }
    });

    pricing.edgeUsage.forEach((u) => {
      const key = `edgeband_${u.roll.id}`;
      const row = hardwareSummaryMap[key];
      if (row) {
        row.quantityRequired = round2(row.quantityRequired + u.meters);
        row.totalHardwareCostDA += u.costDA;
      } else {
        hardwareSummaryMap[key] = {
          cabinetName: 'Edge Band (meters)',
          category: 'Edge Band',
          brand: u.roll.brand,
          modelType: `Edge Band PVC ${u.roll.thickness}x${u.roll.width}mm (per meter)`,
          quantityRequired: round2(u.meters),
          unitPriceDA: round2(bandPricePerMeterDA(u.roll)),
          totalHardwareCostDA: u.costDA,
        };
      }
    });
  });

  // What the project needs and the workshop does not have: sheets, edge-band metres, pieces (math/stockCheck.ts).
  // The same pricingList the rows above were built from, so a shortage can never contradict the cutting list.
  const shortages = checkStockFromPricing(pricingList, woodMaterials, hardwareItems, edgeRolls);
  shortages.forEach((s) => issueSet.add(shortageMessage(s)));
  // The full ledger: every board, roll and box in the workshop, with what this kitchen takes from it (not only the short ones).
  const stockLedger = stockLedgerFromPricing(pricingList, woodMaterials, hardwareItems, edgeRolls);

  return {
    projectTimestamp: now.toLocaleString('fr-DZ'),
    totalKitchenCostDA: totalKitchenCost,
    woodPanelsSummary: woodSummary,
    hardwareAccessoriesSummary: Object.values(hardwareSummaryMap),
    appliancesSummary: appliances,
    issues: Array.from(issueSet),
    shortages,
    stockLedger,
  };
}

/**
 * 📄 Industrial Utility: formats the report as a downloadable CSV. Text cells are quoted and neutralised against
 * spreadsheet formula injection (a cabinet named =HYPERLINK(...) was executed by Excel).
 */
export function convertBOMToCSVString(report: FinalBOMReport): string {
  let csv = `FLATMA FACTORY PRODUCTION BOM REPORT\n`;
  csv += `Generated Timestamp,${csvCell(report.projectTimestamp)}\n`;
  csv += `Total Project Manufacturing Cost,${report.totalKitchenCostDA} DA\n\n`;

  csv += `--- SECTION 1: PROCEDURAL WOOD PARTS CUTTING LIST ---\n`;
  csv += `Cabinet Unit,Category,Component Type,Core Material,Brand,Thickness(mm),Edge Band(mm),Cut Width(mm),Cut Length(mm),Quantity,Grain Direction,Prorated Cost(DA)\n`;
  report.woodPanelsSummary.forEach((w) => {
    csv += [
      csvCell(w.cabinetName), csvCell(w.cabinetCategory), csvCell(w.partType), csvCell(w.materialType), csvCell(w.materialBrand),
      w.thicknessMm, w.edgeThicknessMm ?? 0, w.netWidthMm, w.netLengthMm, w.quantity, csvCell(w.grainDirection), w.estimatedCostDA,
    ].join(',') + '\n';
  });

  csv += `\n--- SECTION 2: HARDWARE & MECHANICAL ACCESSORIES INVENTORY REPORT ---\n`;
  csv += `Allocation Group,Hardware Category,Brand Supplier,Model Specification,Total Pieces Required,Unit Cost(DA),Aggregated System Cost(DA)\n`;
  report.hardwareAccessoriesSummary.forEach((h) => {
    csv += [csvCell(h.cabinetName), csvCell(h.category), csvCell(h.brand), csvCell(h.modelType), h.quantityRequired, h.unitPriceDA, h.totalHardwareCostDA].join(',') + '\n';
  });

  if (report.appliancesSummary.length > 0) {
    csv += `\n--- SECTION 3: BUILT-IN APPLIANCES (supplied by the customer: niche only, no price) ---\n`;
    csv += `Cabinet Unit,Appliance,Niche Width(mm),Niche Height(mm),Niche Depth(mm),Note\n`;
    report.appliancesSummary.forEach((a) => {
      csv += [csvCell(a.cabinetName), csvCell(a.label), a.nicheWidthMm, a.nicheHeightMm, a.nicheDepthMm, csvCell(a.note)].join(',') + '\n';
    });
  }

  if (report.stockLedger && report.stockLedger.length > 0) {
    csv += `\n--- SECTION 4: STOCK LEDGER (what this project takes from the workshop) ---\n`;
    csv += `Stock Kind,Item,Unit,In Stock,Reserved By This Project,Left After Project,Shortage\n`;
    report.stockLedger.forEach((l) => {
      csv += [csvCell(l.kind), csvCell(l.label), csvCell(l.unit), l.inStock, l.required, l.left, l.shortfall > 0 ? l.shortfall : ''].join(',') + '\n';
    });
  }

  if (report.issues.length > 0) {
    csv += `\n--- WARNINGS (read before cutting) ---\n`;
    report.issues.forEach((i) => { csv += `${csvCell(i)}\n`; });
  }
  return csv;
}
