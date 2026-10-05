// src/math/bomEngine.ts

import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { frontStackHeightMm } from './gola';
import { edgeMmOf } from './edgeBand';

export interface BOMWoodRow {
  cabinetName: string;
  cabinetCategory: string;
  partType: string;
  materialType: string;
  materialBrand: string;
  thicknessMm: number;
  /** Edge band thickness (mm) glued on this part; the cut sizes below already have it subtracted. */
  edgeThicknessMm?: number;
  netWidthMm: number;
  netLengthMm: number;
  quantity: number;
  grainDirection: 'vertical' | 'horizontal' | 'none';
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

export interface FinalBOMReport {
  projectTimestamp: string;
  totalKitchenCostDA: number;
  woodPanelsSummary: BOMWoodRow[];
  hardwareAccessoriesSummary: BOMHardwareRow[];
}

/**
 * 🏭 Core Industrial BOM & Cost Export Engine (Flatma Production Specification)
 * Scans the virtual layout setup and extracts pristine manufacturing metrics for the factory floor.
 * Upgraded with Ultra-Slim Minimalist Gaps: 1mm for single front, 1mm total shared for multiple configurations.
 */
export function generateFactoryBOMReport(
  cabinets: CabinetObject[],
  woodMaterials: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[]
): FinalBOMReport {
  
  const woodSummary: BOMWoodRow[] = [];
  const hardwareSummaryMap: { [key: string]: BOMHardwareRow } = {};
  let totalKitchenCost = 0;

  cabinets.forEach((cab) => {
    totalKitchenCost += cab.calculatedCostDA;

    const carcaseMat = woodMaterials.find(m => m.id === cab.carcaseMaterialId);
    const frontMat = woodMaterials.find(m => m.id === cab.frontMaterialId);

    const carcaseEdge = edgeMmOf(cab, 'carcase', carcaseMat);
    const frontEdge = edgeMmOf(cab, 'front', frontMat);
    const round2 = (n: number) => Math.round(n * 100) / 100;

    const carcaseThickness = cab.carcaseThickness;
    const frontThickness = cab.frontThickness;

    // Resolve materials names for industrial clarity
    const carcaseTypeName = carcaseMat ? carcaseMat.type : 'Standard Melamine';
    const carcaseBrandName = carcaseMat ? carcaseMat.brand : 'Generic';
    const frontTypeName = frontMat ? frontMat.type : 'Acrylic Finish';
    const frontBrandName = frontMat ? frontMat.brand : 'Generic';

    // Helper utility to calculate relative prorated area cost for individual boards
    const getBoardCost = (wMm: number, hMm: number, mat: InjectedWoodMaterial | undefined) => {
      if (!mat) return 0;
      const boardArea = (wMm * hMm) / 1000000;
      const sheetArea = (mat.widthSheet * mat.heightSheet) / 1000000;
      return Math.round((boardArea / sheetArea) * mat.averagePriceDA);
    };

    // ========================================================
    // 🪚 STEP 1: PROCEDURAL DECONSTRUCTION OF CARCASE COMPONENTS
    // ========================================================
    
    // A. Left & Right Gable/Side Panels (2 Pieces)
    woodSummary.push({
      cabinetName: cab.name,
      cabinetCategory: cab.category,
      partType: 'Side Panel (Left/Right)',
      materialType: carcaseTypeName,
      materialBrand: carcaseBrandName,
      thicknessMm: carcaseThickness,
      edgeThicknessMm: carcaseEdge,
      netWidthMm: round2(cab.depth - carcaseEdge),
      netLengthMm: cab.height,
      quantity: 2,
      grainDirection: 'vertical',
      estimatedCostDA: getBoardCost(cab.depth, cab.height, carcaseMat) * 2
    });

    // B. Bottom Deck Panel (1 Piece)
    const netBottomWidth = cab.width - (2 * carcaseThickness);
    woodSummary.push({
      cabinetName: cab.name,
      cabinetCategory: cab.category,
      partType: 'Bottom Deck Panel',
      materialType: carcaseTypeName,
      materialBrand: carcaseBrandName,
      thicknessMm: carcaseThickness,
      edgeThicknessMm: carcaseEdge,
      netWidthMm: round2(cab.depth - carcaseEdge),
      netLengthMm: netBottomWidth,
      quantity: 1,
      grainDirection: 'horizontal',
      estimatedCostDA: getBoardCost(cab.depth, netBottomWidth, carcaseMat)
    });

    // C. Top Boundary Infrastructure (Traverses vs Solid Roof)
    if (cab.category === 'BASE_UNIT') {
      // Base units use 2 structural stretcher rails (Traverses) for stone top placement
      woodSummary.push({
        cabinetName: cab.name,
        cabinetCategory: cab.category,
        partType: 'Top Stretcher Rail (Traverse)',
        materialType: carcaseTypeName,
        materialBrand: carcaseBrandName,
        thicknessMm: carcaseThickness,
        netWidthMm: 100, // Standard 100mm industrial rail depth
        netLengthMm: netBottomWidth,
        quantity: 2,
        grainDirection: 'horizontal',
        estimatedCostDA: getBoardCost(100, netBottomWidth, carcaseMat) * 2
      });
    } else {
      // Wall units require a fully closed solid top roof board
      woodSummary.push({
        cabinetName: cab.name,
        cabinetCategory: cab.category,
        partType: 'Top Roof Panel',
        materialType: carcaseTypeName,
        materialBrand: carcaseBrandName,
        thicknessMm: carcaseThickness,
      edgeThicknessMm: carcaseEdge,
        netWidthMm: round2(cab.depth - carcaseEdge),
        netLengthMm: netBottomWidth,
        quantity: 1,
        grainDirection: 'horizontal',
        estimatedCostDA: getBoardCost(cab.depth, netBottomWidth, carcaseMat)
      });
    }

    // D. Backwall Fiberboard Enclosure (3mm High Density Backing)
    woodSummary.push({
      cabinetName: cab.name,
      cabinetCategory: cab.category,
      partType: 'Backwall Panel (MDF/HDF)',
      materialType: 'HDF Standard 3mm',
      materialBrand: carcaseBrandName,
      thicknessMm: 3,
      netWidthMm: cab.width,
      netLengthMm: cab.height,
      quantity: 1,
      grainDirection: 'vertical',
      estimatedCostDA: getBoardCost(cab.width, cab.height, carcaseMat) // Prorated approximation
    });

    // E. Internal Adjustable Modular Shelves Array
    if (cab.shelvesCount > 0) {
      const shelfWidth = netBottomWidth - 2; // 2mm total clearance offset for side pinning
      const shelfDepth = cab.depth - 20;     // 20mm inset recess safety step
      woodSummary.push({
        cabinetName: cab.name,
        cabinetCategory: cab.category,
        partType: 'Adjustable Internal Shelf',
        materialType: carcaseTypeName,
        materialBrand: carcaseBrandName,
        thicknessMm: carcaseThickness,
      edgeThicknessMm: carcaseEdge,
        netWidthMm: round2(shelfDepth - carcaseEdge),
        netLengthMm: shelfWidth,
        quantity: cab.shelvesCount,
        grainDirection: 'horizontal',
        estimatedCostDA: getBoardCost(shelfDepth, shelfWidth, carcaseMat) * cab.shelvesCount
      });
    }

    // ========================================================
    // 🚪 STEP 2: PROCEDURAL DECONSTRUCTION OF EXTERIOR FACADES
    // ========================================================
    if (cab.frontConfig.openingType !== 'NONE') {
      const frontStackMm = frontStackHeightMm(cab.height, cab.frontConfig); // height left after every Gola channel (mm)
      
      // 📐 Dynamic Ultra-Slim Clearance Offsets (1mm for single setup, 1mm total shared for symmetric multiple setups)
      const dynamicAdjustment = 1; 

      if (cab.frontConfig.openingType === 'DOORS') {
        const individualDoorWidth = round2(Math.round((cab.width - dynamicAdjustment) / cab.frontConfig.elementCount) - 2 * frontEdge); // band on all 4 edges
        const netDoorHeight = round2(frontStackMm - 2 * frontEdge); // Clearance + Gola offsets removed, minus band top & bottom
        
        woodSummary.push({
          cabinetName: cab.name,
          cabinetCategory: cab.category,
          partType: `Door Facade Panel (1 of ${cab.frontConfig.elementCount})`,
          materialType: frontTypeName,
          materialBrand: frontBrandName,
          thicknessMm: frontThickness,
          edgeThicknessMm: frontEdge,
          netWidthMm: individualDoorWidth, // Perfectly maps your 0.5mm split concept for double configurations
          netLengthMm: netDoorHeight,
          quantity: cab.frontConfig.elementCount,
          grainDirection: 'vertical',
          estimatedCostDA: getBoardCost(individualDoorWidth, netDoorHeight, frontMat) * cab.frontConfig.elementCount
        });

        // Track allocated Hinges into unified summary list
        const activeHardware = hardwareItems.find(h => h.id === cab.frontConfig.hardwareItemId);
        if (activeHardware) {
          const hingesPerDoor = cab.height > 900 ? 3 : 2;
          const totalHingesCount = cab.frontConfig.elementCount * hingesPerDoor;
          const mapKey = `${activeHardware.brand}_${activeHardware.modelType}`;

          if (hardwareSummaryMap[mapKey]) {
            hardwareSummaryMap[mapKey].quantityRequired += totalHingesCount;
            hardwareSummaryMap[mapKey].totalHardwareCostDA += totalHingesCount * activeHardware.pricePerUnitDA;
          } else {
            hardwareSummaryMap[mapKey] = {
              cabinetName: 'Combined Project Hardware',
              category: activeHardware.category,
              brand: activeHardware.brand,
              modelType: activeHardware.modelType,
              quantityRequired: totalHingesCount,
              unitPriceDA: activeHardware.pricePerUnitDA,
              totalHardwareCostDA: totalHingesCount * activeHardware.pricePerUnitDA
            };
          }
        }

      } else if (cab.frontConfig.openingType === 'DRAWERS') {
        const individualDrawerWidth = round2(cab.width - dynamicAdjustment - 2 * frontEdge);
        const individualDrawerHeight = round2(Math.round(frontStackMm / cab.frontConfig.elementCount) - 2 * frontEdge);

        woodSummary.push({
          cabinetName: cab.name,
          cabinetCategory: cab.category,
          partType: `Drawer Front Facade (1 of ${cab.frontConfig.elementCount})`,
          materialType: frontTypeName,
          materialBrand: frontBrandName,
          thicknessMm: frontThickness,
          edgeThicknessMm: frontEdge,
          netWidthMm: individualDrawerWidth,
          netLengthMm: individualDrawerHeight,
          quantity: cab.frontConfig.elementCount,
          grainDirection: 'horizontal',
          estimatedCostDA: getBoardCost(individualDrawerWidth, individualDrawerHeight, frontMat) * cab.frontConfig.elementCount
        });

                // Track Drawer slides runners into unified summary list
        const activeHardware = hardwareItems.find(h => h.id === cab.frontConfig.hardwareItemId);
        if (activeHardware) {
          const totalRunnersCount = cab.frontConfig.elementCount; // 1 full mechanical drawer kit set per element
          const mapKey = `${activeHardware.brand}_${activeHardware.modelType}`;

          if (hardwareSummaryMap[mapKey]) {
            hardwareSummaryMap[mapKey].quantityRequired += totalRunnersCount;
            hardwareSummaryMap[mapKey].totalHardwareCostDA += totalRunnersCount * activeHardware.pricePerUnitDA;
          } else {
            hardwareSummaryMap[mapKey] = {
              cabinetName: 'Combined Project Hardware',
              category: activeHardware.category,
              brand: activeHardware.brand,
              modelType: activeHardware.modelType,
              quantityRequired: totalRunnersCount,
              unitPriceDA: activeHardware.pricePerUnitDA,
              totalHardwareCostDA: totalRunnersCount * activeHardware.pricePerUnitDA
            };
          }
        }
      }
    }

    // ========================================================
    // ⚙️ STEP 3: AUTOMATIC STRUCTURAL FIXING ACCUMULATION
    // ========================================================
    if (cab.category === 'BASE_UNIT') {
      const legs = hardwareItems.find(h => h.modelType.includes('Adjustable Kitchen Legs'));
      if (legs) {
        const mapKey = `${legs.brand}_${legs.modelType}`;
        if (hardwareSummaryMap[mapKey]) {
          hardwareSummaryMap[mapKey].quantityRequired += 4;
          hardwareSummaryMap[mapKey].totalHardwareCostDA += 4 * legs.pricePerUnitDA;
        } else {
          hardwareSummaryMap[mapKey] = {
            cabinetName: 'Base Fixing System',
            category: legs.category,
            brand: legs.brand,
            modelType: legs.modelType,
            quantityRequired: 4,
            unitPriceDA: legs.pricePerUnitDA,
            totalHardwareCostDA: 4 * legs.pricePerUnitDA
          };
        }
      }
    } else if (cab.category === 'WALL_UNIT') {
      const hangers = hardwareItems.find(h => h.modelType.includes('Cabinet Hanger Plates'));
      if (hangers) {
        const mapKey = `${hangers.brand}_${hangers.modelType}`;
        if (hardwareSummaryMap[mapKey]) {
          hardwareSummaryMap[mapKey].quantityRequired += 2;
          hardwareSummaryMap[mapKey].totalHardwareCostDA += 2 * hangers.pricePerUnitDA;
        } else {
          hardwareSummaryMap[mapKey] = {
            cabinetName: 'Wall Fixing System',
            category: hangers.category,
            brand: hangers.brand,
            modelType: hangers.modelType,
            quantityRequired: 2,
            unitPriceDA: hangers.pricePerUnitDA,
            totalHardwareCostDA: 2 * hangers.pricePerUnitDA
          };
        }
      }
    }
  });

  return {
    projectTimestamp: new Date().toLocaleString('fr-DZ'),
    totalKitchenCostDA: totalKitchenCost,
    woodPanelsSummary: woodSummary,
    hardwareAccessoriesSummary: Object.values(hardwareSummaryMap)
  };
}

/**
 * 📄 Industrial Utility: Formats the entire factory report layout into a clean downloadable CSV text format string
 */
export function convertBOMToCSVString(report: FinalBOMReport): string {
  let csv = `FLATMA FACTORY PRODUCTION BOM REPORT\n`;
  csv += `Generated Timestamp,${report.projectTimestamp}\n`;
  csv += `Total Project Manufacturing Cost,${report.totalKitchenCostDA} DA\n\n`;
  
  csv += `--- SECTION 1: PROCEDURAL WOOD PARTS CUTTING LIST ---\n`;
  csv += `Cabinet Unit,Category,Component Type,Core Material,Brand,Thickness(mm),Edge Band(mm),Cut Width(mm),Cut Length(mm),Quantity,Grain Direction,Prorated Cost(DA)\n`;
  
  report.woodPanelsSummary.forEach(w => {
    csv += `"${w.cabinetName}","${w.cabinetCategory}","${w.partType}","${w.materialType}","${w.materialBrand}",${w.thicknessMm},${w.edgeThicknessMm ?? 0},${w.netWidthMm},${w.netLengthMm},${w.quantity},"${w.grainDirection}",${w.estimatedCostDA}\n`;
  });
  
  csv += `\n--- SECTION 2: HARDWARE & MECHANICAL ACCESSORIES INVENTORY REPORT ---\n`;
  csv += `Allocation Group,Hardware Category,Brand Supplier,Model Specification,Total Pieces Required,Unit Cost(DA),Aggregated System Cost(DA)\n`;
  
  report.hardwareAccessoriesSummary.forEach(h => {
    csv += `"${h.cabinetName}","${h.category}","${h.brand}","${h.modelType}",${h.quantityRequired},${h.unitPriceDA},${h.totalHardwareCostDA}\n`;
  });

  return csv;
}
