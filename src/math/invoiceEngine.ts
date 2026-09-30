// src/math/invoiceEngine.ts

import { FinalBOMReport } from './bomEngine';

export interface InvoiceLineItem {
  description: string;
  quantity: number;
  unitPriceDA: number;
  totalPriceDA: number;
}

export interface CustomerInvoiceReport {
  invoiceNumber: string;
  issueDate: string;
  currency: string;
  rawMaterialsCostDA: number;
  laborAndManufacturingFeeDA: number;
  profitMarginFeeDA: number;
  grandTotalCustomerPriceDA: number;
  itemizedSummary: InvoiceLineItem[];
}

/**
 * 🧾 Core Commercial Invoice Engine (Flatma Business Specification)
 * Converts raw manufacturing BOM costs into a polished, professional customer invoice.
 */
export function generateCustomerInvoice(
  bomReport: FinalBOMReport,
  laborRatePercentage: number = 20, // Default 20% for workshop cutting/assembly craftsmanship fees
  profitMarginPercentage: number = 30 // Default 30% business net profit margin
): CustomerInvoiceReport {
  
  const rawCost = bomReport.totalKitchenCostDA;
  
  // 📐 Math Pipeline: Calculate labor fees and commercial markup margins
  const laborFee = Math.round(rawCost * (laborRatePercentage / 100));
  const profitFee = Math.round((rawCost + laborFee) * (profitMarginPercentage / 100));
  const grandTotal = rawCost + laborFee + profitFee;

  const items: InvoiceLineItem[] = [];

  // 1. Roll up wood panels by material and brand for elegant customer reading
  const woodGroups: { [key: string]: { qty: number; cost: number } } = {};
  bomReport.woodPanelsSummary.forEach(w => {
    const key = `${w.materialBrand} ${w.materialType} (${w.thicknessMm}mm)`;
    if (woodGroups[key]) {
      woodGroups[key].qty += w.quantity;
      woodGroups[key].cost += w.estimatedCostDA;
    } else {
      woodGroups[key] = { qty: w.quantity, cost: w.estimatedCostDA };
    }
  });

  // Inject formatted wood entities into client invoice lines
  Object.keys(woodGroups).forEach(materialName => {
    const baseMaterialPrice = woodGroups[materialName].cost;
    // Prorate markup onto the consumer facing line items
    const clientLinePrice = Math.round(baseMaterialPrice * (1 + laborRatePercentage / 100) * (1 + profitMarginPercentage / 100));
    
    items.push({
      description: `Premium Cabinet Surface Layout: ${materialName}`,
      quantity: woodGroups[materialName].qty,
      unitPriceDA: Math.round(clientLinePrice / woodGroups[materialName].qty),
      totalPriceDA: clientLinePrice
    });
  });

  // 2. Roll up hardware accessories systems into elite commercial lines
  bomReport.hardwareAccessoriesSummary.forEach(h => {
    const baseHwPrice = h.totalHardwareCostDA;
    const clientHwPrice = Math.round(baseHwPrice * (1 + laborRatePercentage / 100) * (1 + profitMarginPercentage / 100));

    items.push({
      description: `Mechanical Architectural System: ${h.brand} ${h.modelType}`,
      quantity: h.quantityRequired,
      unitPriceDA: Math.round(clientHwPrice / h.quantityRequired),
      totalPriceDA: clientHwPrice
    });
  });

  return {
    invoiceNumber: `INV-${Date.now().toString().slice(-6)}`,
    issueDate: new Date().toLocaleDateString('fr-DZ'),
    currency: 'DA',
    rawMaterialsCostDA: rawCost,
    laborAndManufacturingFeeDA: laborFee,
    profitMarginFeeDA: profitFee,
    grandTotalCustomerPriceDA: grandTotal,
    itemizedSummary: items
  };
}

/**
 * 📄 Formats the commercial customer invoice into a structured plain text block for printing/viewing
 */
export function formatCustomerInvoiceText(invoice: CustomerInvoiceReport): string {
  let text = `==================================================\n`;
  text += `        MODERN KITCHEN DESIGN - INVOICE           \n`;
  text += `==================================================\n`;
  text += `Invoice Number : ${invoice.invoiceNumber}\n`;
  text += `Date           : ${invoice.issueDate}\n`;
  text += `Currency       : ${invoice.currency}\n`;
  text += `--------------------------------------------------\n`;
  text += `ITEMIZED COMMERCIAL SUMMARY:\n\n`;

  invoice.itemizedSummary.forEach((item, idx) => {
    text += `${idx + 1}. ${item.description}\n`;
    text += `   Qty: ${item.quantity} | Total Line Price: ${item.totalPriceDA.toLocaleString()} ${invoice.currency}\n`;
  });

  text += `--------------------------------------------------\n`;
  text += `FINANCIAL METRICS BREAKDOWN:\n`;
  text += `Craftsmanship & Manufacturing Fee : ${invoice.laborAndManufacturingFeeDA.toLocaleString()} ${invoice.currency}\n`;
  text += `--------------------------------------------------\n`;
  text += `GRAND TOTAL CUSTOMER PRICE        : ${invoice.grandTotalCustomerPriceDA.toLocaleString()} ${invoice.currency}\n`;
  text += `==================================================\n`;
  text += `Thank you for choosing our modern furniture workshop.\n`;
  
  return text;
}
