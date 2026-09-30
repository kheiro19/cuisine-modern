// src/components/InventoryManager.tsx

import React, { useState } from 'react';
import { useFurniture } from '../context/FurnitureContext';
import { HardwareCategory } from '../types/flatma';

export default function InventoryManager() {
  const { inventory, injectWoodPanel, injectHardwareItem } = useFurniture();

  // --- UI Accordion Toggle Controls (Flatma Style) ---
  const [isWoodOpen, setIsWoodOpen] = useState<boolean>(true);
  const [isHwOpen, setIsHwOpen] = useState<boolean>(false);
  const [isStockOpen, setIsStockOpen] = useState<boolean>(false);

  // --- 🔒 1. Full Wood Panels Suppliers & Brands List (23 Complete Options) ---
  const [supplierList, setSupplierList] = useState([
    "PANO ALGERIE (PDA)", "AGT (Turkey)", "EGGER (Austria)", "ALVIC (Spain)", 
    "GHAMOUD PAN (Algeria)", "KRONOSPAN (Global)", "KRONOSWISS (Switzerland)", "CLEAF (Italy)", 
    "SAVIOLA (Italy)", "KASTAMONU (Turkey)", "SALICE (Italy)", "BLUM (Austria)",
    "HETTICH (Germany)", "HÄFELE (Germany)", "GRASS (Germany)", "FINSA (Spain)",
    "KAINDL (Austria)", "SWISS KRONO (Global)", "PFLEIDERER (Germany)", "POLYREY (France)",
    "ARPA INDUSTRIALE (Italy)", "COMPAC (Global)", "NEOLITH (Global)"
  ]);

  // --- 🔒 2. Wood Panels Industry Sizes (14 Complete Dimensions Mapped) ---
  const [sizeList, setSizeList] = useState([
    { label: "4100 x 600 mm", w: 4100, h: 600 },
    { label: "4100 x 650 mm", w: 4100, h: 650 },
    { label: "4100 x 920 mm", w: 4100, h: 920 },
    { label: "3660 x 2200 mm", w: 3660, h: 2200 },
    { label: "3660 x 1830 mm", w: 3660, h: 1830 },
    { label: "3050 x 1525 mm", w: 3050, h: 1525 },
    { label: "3050 x 1300 mm", w: 3050, h: 1300 },
    { label: "3050 x 1220 mm", w: 3050, h: 1220 },
    { label: "2800 x 1220 mm", w: 2800, h: 1220 },
    { label: "2800 x 2070 mm", w: 2800, h: 2070 },
    { label: "2800 x 1300 mm", w: 2800, h: 1300 },
    { label: "2750 x 1220 mm", w: 2750, h: 1220 },
    { label: "2440 x 1220 mm", w: 2440, h: 1220 },
    { label: "2440 x 1525 mm", w: 2440, h: 1525 }
  ]);

  // --- 🔒 3. Materials, Finishes & Textures Catalog (12 Complete Types for Boxes and Fronts) ---
  const [materialTypeList, setMaterialTypeList] = useState([
    "MDF Raw / Brute", "MDF Melamine Matt", "MDF Wood Grain / Textured", 
    "Acrylic High Gloss", "Acrylic Super Matt", "Polylac / PET Panels", 
    "UV Lacquer Finish", "Standard Particle Board / Chipboard", 
    "Hydrofuge Melamine / Moisture-Resistant", "HDF Standard 3mm", 
    "Postformed HPL Countertop Block", "Glass Door with Aluminum Profile"
  ]);

  // --- 🔒 4. Full Wood Thicknesses Grid (23 Complete Options: 3mm to 25mm) ---
  const [thicknessList] = useState(
    Array.from({ length: 23 }, (_, i) => i + 3)
  );

  // --- 🔒 5. Edge Band PVC Thicknesses (27 Complete Options: 0.4mm to 3.0mm) ---
  const [edgeThicknessList] = useState(
    Array.from({ length: 27 }, (_, i) => Number((0.4 + i * 0.1).toFixed(1)))
  );

  // --- 🔒 6. Edge Band PVC Widths (34 Complete Options: 12mm to 45mm) ---
  const [edgeWidthList] = useState(
    Array.from({ length: 34 }, (_, i) => i + 12)
  );

  // --- Selected Parameter States for Panel Injection ---
  const [selectedSupplier, setSelectedSupplier] = useState("PANO ALGERIE (PDA)");
  const [selectedMaterial, setSelectedMaterial] = useState("MDF Melamine Matt");
  const [selectedSizeIdx, setSelectedSizeIdx] = useState(9); // Default to 2800 x 2070 mm
  const [selectedThickness, setSelectedThickness] = useState(18);
  const [selectedEdgeThickness, setSelectedEdgeThickness] = useState(2.0);
  const [selectedEdgeWidth, setSelectedEdgeWidth] = useState(22);
  const [woodQty, setWoodQty] = useState<number>(0);
  const [woodPrice, setWoodPrice] = useState<number>(0);

  // --- Hardware Accessories Injection States (Linked to the 5 Industry Subsystems) ---
  const [hwCategory, setHwCategory] = useState<HardwareCategory>('Cabinet Hinges');
  const [hwBrand, setHwBrand] = useState('Blum (Austria)');
  const [hwModel, setHwModel] = useState('Straight Hinge (Overlay)');
  const [hwQty, setHwQty] = useState<number>(0);
  const [hwPrice, setHwPrice] = useState<number>(0);

  const handleAddWoodToStock = () => {
    if (woodQty <= 0 || woodPrice <= 0) {
      alert("Validation Error: Quantity and price values must be greater than zero.");
      return;
    }
    const currentSize = sizeList[selectedSizeIdx];
    
    // Inject and hit Moving Average Engine in Context
    injectWoodPanel({
      id: `w_${Date.now()}`,
      brand: selectedSupplier,
      type: selectedMaterial,
      thickness: selectedThickness,
      widthSheet: currentSize.w,
      heightSheet: currentSize.h,
      edgeThickness: selectedEdgeThickness,
      edgeWidth: selectedEdgeWidth,
      currentQty: woodQty
    }, woodPrice);

    setWoodQty(0);
    setWoodPrice(0);
  };

  const handleAddHardwareToStock = () => {
    if (hwQty <= 0 || hwPrice <= 0) {
      alert("Validation Error: Hardware quantity and price must be greater than zero.");
      return;
    }
    injectHardwareItem({
      id: `h_${Date.now()}`,
      category: hwCategory,
      brand: hwBrand,
      modelType: hwModel,
      availableQty: hwQty
    }, hwPrice);

    setHwQty(0);
    setHwPrice(0);
  };

  return (
    <div className="w-full bg-white border border-[#E5E5E5] rounded-xl p-3 space-y-3 font-sans text-left shadow-xs">
      
      {/* 🌲 Section 1: Wood & Stone Panels Stock Loader (Fully Restored) */}
      <div className="border border-slate-200 rounded-lg overflow-hidden bg-white shadow-2xs">
        <button 
          onClick={() => setIsWoodOpen(!isWoodOpen)} 
          className="w-full bg-slate-50 p-2.5 flex items-center justify-between font-bold text-xs text-slate-800 cursor-pointer hover:bg-slate-100"
        >
          <span>片 Wood & Stone Panels Stock Loader</span>
          <span className="text-gray-400">{isWoodOpen ? '▼' : '▶'}</span>
        </button>
        
        {isWoodOpen && (
          <div className="p-3 space-y-3 border-t border-slate-100 text-xs">
            {/* Brands and Suppliers Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">Supplier / Brand</label>
              <select value={selectedSupplier} onChange={(e) => setSelectedSupplier(e.target.value)} className="w-full border bg-white rounded-lg p-2 text-xs font-medium focus:outline-none shadow-3xs">
                {supplierList.map((s, i) => <option key={i} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Core Finishing/Textures Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">Wood Core / Finish Texture Type</label>
              <select value={selectedMaterial} onChange={(e) => setSelectedMaterial(e.target.value)} className="w-full border bg-white rounded-lg p-2 text-xs font-medium focus:outline-none shadow-3xs">
                {materialTypeList.map((m, i) => <option key={i} value={m}>{m}</option>)}
              </select>
            </div>

            {/* Complete 14 Sizes Panel Format Dropdown */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">Sheet Dimension Format (Width x Length)</label>
              <select value={selectedSizeIdx} onChange={(e) => setSelectedSizeIdx(Number(e.target.value))} className="w-full border bg-white rounded-lg p-2 text-xs font-mono focus:outline-none shadow-3xs">
                {sizeList.map((s, i) => <option key={i} value={i}>{s.label}</option>)}
              </select>
            </div>

            {/* Complete Restored Thickness and Edge Band PVC Matrices Grid */}
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Thickness (T)</label>
                <select value={selectedThickness} onChange={(e) => setSelectedThickness(Number(e.target.value))} className="w-full border bg-white rounded-lg p-1.5 text-xs font-mono focus:outline-none shadow-3xs">
                  {thicknessList.map((t) => <option key={t} value={t}>{t} mm</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Edge PVC (T)</label>
                <select value={selectedEdgeThickness} onChange={(e) => setSelectedEdgeThickness(Number(e.target.value))} className="w-full border bg-white rounded-lg p-1.5 text-xs font-mono focus:outline-none shadow-3xs">
                  {edgeThicknessList.map((et) => <option key={et} value={et}>{et} mm</option>)}
                </select>
              </div>
              <div>
                <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Edge PVC (W)</label>
                <select value={selectedEdgeWidth} onChange={(e) => setSelectedEdgeWidth(Number(e.target.value))} className="w-full border bg-white rounded-lg p-1.5 text-xs font-mono focus:outline-none shadow-3xs">
                  {edgeWidthList.map((ew) => <option key={ew} value={ew}>{ew} mm</option>)}
                </select>
              </div>
            </div>

                        {/* Price and Stock Quantum Numerical Fields */}
            <div className="grid grid-cols-2 gap-2 font-mono text-xs pt-1">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block font-sans mb-0.5">Qty Sheets Incoming</label>
                <input type="number" placeholder="0" value={woodQty === 0 ? '' : woodQty} onChange={(e) => setWoodQty(Math.max(0, Number(e.target.value)))} className="w-full border bg-white rounded-lg p-1.5 focus:outline-none text-center font-bold shadow-3xs" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block font-sans mb-0.5">Purchase Price (DA)</label>
                <input type="number" placeholder="0" value={woodPrice === 0 ? '' : woodPrice} onChange={(e) => setWoodPrice(Math.max(0, Number(e.target.value)))} className="w-full border rounded-lg p-1.5 focus:outline-none text-center font-bold text-emerald-600 bg-white shadow-3xs" />
              </div>
            </div>

            <button onClick={handleAddWoodToStock} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-2 rounded-lg transition-all shadow-md cursor-pointer text-center mt-1">Add Board to Stock</button>
          </div>
        )}
      </div>

      {/* ⚙️ Section 2: Hardware Accessories System Injector (The 5 Subsystems) */}
      <div className="border border-indigo-100 rounded-lg overflow-hidden bg-white shadow-2xs">
        <button 
          onClick={() => setIsHwOpen(!isHwOpen)} 
          className="w-full bg-indigo-50/60 p-2.5 flex items-center justify-between font-bold text-xs text-slate-800 cursor-pointer hover:bg-indigo-100/80"
        >
          <span>⚙️ Hardware Accessories Loader</span>
          <span className="text-gray-400">{isHwOpen ? '▼' : '▶'}</span>
        </button>

        {isHwOpen && (
          <div className="p-3 space-y-3 border-t border-indigo-50 text-xs">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">System Category</label>
              <select value={hwCategory} onChange={(e) => setHwCategory(e.target.value as HardwareCategory)} className="w-full border bg-white rounded-lg p-2 font-bold text-gray-700 shadow-3xs focus:outline-none">
                <option value="Cabinet Hinges">1. Cabinet Hinges System</option>
                <option value="Drawer Slide Systems">2. Drawer Runner Slides</option>
                <option value="Overhead Lift Systems">3. Overhead Lift Systems</option>
                <option value="Gola & Handle Profiles">4. Gola & Handle Profiles</option>
                <option value="Assembly & Fixing">5. Assembly & Fixing Screws/Legs</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">Brand</label>
                <select value={hwBrand} onChange={(e) => setHwBrand(e.target.value)} className="w-full border bg-white rounded-lg p-2 font-bold text-indigo-600 shadow-3xs focus:outline-none">
                  <option value="Blum (Austria)">Blum (Austria)</option>
                  <option value="Hettich (Germany)">Hettich (Germany)</option>
                  <option value="Häfele (Germany)">Häfele (Germany)</option>
                  <option value="Samet (Turkey)">Samet (Turkey)</option>
                  <option value="Titus">Titus</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-bold text-gray-400 block mb-1">Specification Model Name</label>
                <input type="text" placeholder="e.g. Straight Hinge (Overlay)" value={hwModel} onChange={(e) => setHwModel(e.target.value)} className="w-full border bg-white rounded-lg p-2 text-xs focus:outline-none shadow-3xs" />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs font-mono">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block font-sans mb-0.5">Qty Pcs/Sets</label>
                <input type="number" placeholder="0" value={hwQty === 0 ? '' : hwQty} onChange={(e) => setHwQty(Math.max(0, Number(e.target.value)))} className="w-full border bg-white rounded-lg p-1.5 text-center shadow-3xs focus:outline-none" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block font-sans mb-0.5">Unit Price (DA)</label>
                <input type="number" placeholder="0" value={hwPrice === 0 ? '' : hwPrice} onChange={(e) => setHwPrice(Math.max(0, Number(e.target.value)))} className="w-full border bg-white rounded-lg p-1.5 font-bold text-emerald-600 text-center shadow-3xs focus:outline-none" />
              </div>
            </div>

            <button onClick={handleAddHardwareToStock} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-[10px] py-2 rounded-lg transition-all shadow-md cursor-pointer text-center mt-1">Inject Hardware Accessory</button>
          </div>
        )}
      </div>

      {/* 🗄️ Section 3: Real-Time Workshop Stockroom Display */}
      <div className="border border-slate-800 rounded-xl overflow-hidden bg-white shadow-2xs">
        <button 
          onClick={() => setIsStockOpen(!isStockOpen)} 
          className="w-full bg-slate-800 p-2.5 flex items-center justify-between font-bold text-xs text-white cursor-pointer hover:bg-slate-900"
        >
          <span>🗄️ Real-Time Workshop Stockroom Terminal</span>
          <span className="text-gray-300">{isStockOpen ? '▼' : '▶'}</span>
        </button>

        {isStockOpen && (
          <div className="p-2 border-t border-slate-700 bg-white">
            <div className="divide-y border border-slate-200 rounded-lg overflow-hidden bg-white max-h-56 overflow-y-auto shadow-inner">
              {inventory.woodPanels.length === 0 && inventory.hardwareItems.length === 2 && (
                <div className="p-4 text-center text-xs text-gray-400 font-mono bg-slate-50/50">Inventory stock is currently empty. Please insert components above.</div>
              )}
              {inventory.woodPanels.map((panel: any) => (
                <div key={panel.id} className="p-2 flex items-center justify-between text-[11px] font-mono hover:bg-slate-50/50">
                  <div className="text-left font-sans">
                    <span className="font-bold text-slate-800 block text-xs">{panel.brand} - {panel.type}</span>
                    <span className="text-slate-400 text-[9px] block font-mono">{panel.widthSheet}x{panel.heightSheet}mm | T: {panel.thickness}mm | Edge: {panel.edgeThickness}mm x {panel.edgeWidth}mm</span>
                  </div>
                  <div className="text-right flex items-center space-x-2">
                    <span className="bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-md text-[10px] font-bold">{panel.currentQty} Sheets</span>
                    <span className="font-bold text-emerald-600 text-xs">{panel.averagePriceDA.toLocaleString()} DA <span className="text-[8px] text-gray-400 font-sans font-normal">(MA)</span></span>
                  </div>
                </div>
              ))}
              {inventory.hardwareItems.map((item: any) => (
                <div key={item.id} className="p-2 flex items-center justify-between text-[11px] font-mono border-t border-dashed hover:bg-slate-50/50">
                  <div className="text-left font-sans max-w-[180px] truncate">
                    <span className="font-bold text-slate-800 block truncate text-xs">{item.modelType}</span>
                    <span className="text-indigo-600 text-[9px] font-bold block">Brand: {item.brand} | {item.category}</span>
                  </div>
                  <div className="text-right flex items-center space-x-2">
                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded-md text-[10px] font-bold">{item.availableQty} Pcs</span>
                    <span className="font-bold text-emerald-600 text-xs">{item.pricePerUnitDA.toLocaleString()} DA</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
