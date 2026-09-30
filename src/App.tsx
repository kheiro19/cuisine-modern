// src/App.tsx
import React, { useState } from 'react';
import { useFurniture } from './context/FurnitureContext';
import InventoryManager from './components/InventoryManager';
import Kitchen2DCanvas from './components/Kitchen2DCanvas';
import Kitchen3DCanvas from './components/Kitchen3DCanvas';
import { generateFactoryBOMReport, convertBOMToCSVString } from './math/bomEngine';
import { generateCustomerInvoice, formatCustomerInvoiceText } from './math/invoiceEngine';
import { CabinetCategory, FrontOpeningType } from './types/flatma';

export default function App() {
  const {
    cabinets,
    inventory,
    activeCabinetId,
    addCabinet,
    updateCabinet,
    deleteCabinet,
    triggerUndo,
    canUndo
  } = useFurniture();

  // Global fallbacks for structural configurations matching Flatma specs
  const [hardwareSettings] = useState({
    carcaseThickness: 18,
    frontThickness: 18,
    wallSplashHeight: 600 // 600mm standard splash layout gap
  });

  const [countertopPath] = useState([
    { x: 0, zOffset: 0 },
    { x: 2400, zOffset: 0 } // Straight 2.4-meter kitchen line example
  ]);

  const [wallGeometry] = useState({ id: 'w_main', length: 3000 }); // 3-meter boundary wall
  const [showFronts, setShowFronts] = useState<boolean>(true);
  const [isXRayMode, setIsXRayMode] = useState<boolean>(false);

  // States for procedural addition forms
  const [cabCategory, setCabCategory] = useState<CabinetCategory>('BASE_UNIT');
  const [openingType, setOpeningType] = useState<FrontOpeningType>('DOORS');
  const [elementCount, setElementCount] = useState<number>(2);
  const [hasGola, setHasGola] = useState<boolean>(false);

  // Commercial / Production report views triggers
  const [bomReportText, setBomReportText] = useState<string>('');
  const [invoiceText, setInvoiceText] = useState<string>('');

  const handleCreateCabinetNode = () => {
    // Spatial boundary configuration verification
    if (inventory.woodPanels.length === 0) {
      alert("Workshop Setup Blocked: Please inject at least one Wood Panel asset into the stockroom first.");
      return;
    }

    const defaultCarcaseId = inventory.woodPanels.id;
    const defaultFrontId = inventory.woodPanels.id;
    
    // Auto-select hinges or runners based on front layout option
    let defaultHwId = '';
    if (openingType === 'DOORS') {
      const hinge = inventory.hardwareItems.find(h => h.category === 'Cabinet Hinges');
      if (hinge) defaultHwId = hinge.id;
    } else if (openingType === 'DRAWERS') {
      const runner = inventory.hardwareItems.find(h => h.category === 'Drawer Slide Systems');
      if (runner) defaultHwId = runner.id;
    }

    const uniqueId = `cab_${Date.now()}`;
    const calculatedPositionX = cabinets.length > 0 
      ? Math.min(cabinets.reduce((sum, c) => sum + c.width, 0), wallGeometry.length - 600)
      : 0;

    addCabinet({
      id: uniqueId,
      name: `${cabCategory === 'BASE_UNIT' ? 'Base' : 'Wall'} Module ${cabinets.length + 1}`,
      category: cabCategory,
      width: 600,  // 600mm standard clean width block
      height: cabCategory === 'BASE_UNIT' ? 720 : 900, // Standard heights
      depth: cabCategory === 'BASE_UNIT' ? 560 : 320,  // Standard depths
      positionX: calculatedPositionX,
      positionY: 0,
      positionZ: 0,
      shelvesCount: 1,
      carcaseMaterialId: defaultCarcaseId,
      frontMaterialId: defaultFrontId,
      frontConfig: {
        openingType,
        elementCount,
        hardwareItemId: defaultHwId,
        hasGolaProfile: cabCategory === 'BASE_UNIT' && hasGola
      }
    });
  };

  const handleExportFactoryBOM = () => {
    if (cabinets.length === 0) {
      alert("Export Failed: No active cabinet entities placed on the canvas layout.");
      return;
    }
    const report = generateFactoryBOMReport(cabinets, inventory.woodPanels, inventory.hardwareItems);
    const csvString = convertBOMToCSVString(report);
    setBomReportText(csvString);
    setInvoiceText('');
  };

  const handlePrintCustomerInvoice = () => {
    if (cabinets.length === 0) {
      alert("Invoice Failed: Design layout is empty.");
      return;
    }
    const report = generateFactoryBOMReport(cabinets, inventory.woodPanels, inventory.hardwareItems);
    const invoice = generateCustomerInvoice(report, 20, 30); // 20% craftsmanship fee, 30% margin
    const formattedInvoice = formatCustomerInvoiceText(invoice);
    setInvoiceText(formattedInvoice);
    setBomReportText('');
  };

  return (
    <div className="w-full min-h-screen bg-[#F4F4F5] p-4 flex flex-col font-sans text-slate-800 antialiased selection:bg-indigo-100">
      
      {/* ⚡ Clean Minimalist Top Global Branding Header */}
      <header className="w-full border border-[#E4E4E7] bg-white rounded-xl px-5 py-3 mb-4 flex justify-between items-center shadow-3xs">
        <div className="flex items-center space-x-2">
          <span className="text-lg">📐</span>
          <h1 className="text-sm font-bold tracking-tight uppercase text-slate-900 font-sans">
            Cuisine Modern <span className="text-indigo-600">x Flatma Engine</span>
          </h1>
        </div>
        <div className="flex items-center space-x-3">
          <button 
            disabled={!canUndo} 
            onClick={triggerUndo}
            className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold transition-all cursor-pointer shadow-3xs ${canUndo ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
          >
            ↩️ UNDO MATRIX STEP
          </button>
          <div className="h-4 w-px bg-slate-200"></div>
          <span className="text-[10px] font-mono bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold px-2.5 py-1 rounded-md">
            ACTIVE WORKSHOP SESSION
          </span>
        </div>
      </header>

      {/* 🏗️ Main Operational Workcell Grid Layout */}
      <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        
        {/* Left Hand Sidebar Terminal: Stockroom Panel Aggregator */}
        <div className="lg:col-span-1 space-y-3 h-full overflow-y-auto">
          <InventoryManager />
          
          {/* Real-time Rendering Parameters Config Box */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-3 space-y-2.5 text-xs shadow-3xs text-left">
            <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1">🕶️ Viewport Display Pipeline</span>
            <div className="flex items-center justify-between">
              <label className="text-gray-500 font-medium">Render Door Fronts</label>
              <input type="checkbox" checked={showFronts} onChange={(e) => setShowFronts(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" />
            </div>
            <div className="flex items-center justify-between">
              <label className="text-gray-500 font-medium">X-Ray Structural Mode</label>
              <input type="checkbox" checked={isXRayMode} onChange={(e) => setIsXRayMode(e.target.checked)} className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer w-4 h-4" />
            </div>
          </div>
        </div>

        {/* Center Canvas Viewports Terminal: The Dual Plan Viewport */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden shadow-2xs">
            <Kitchen2DCanvas wall={wallGeometry} />
          </div>
          <div className="bg-white border border-[#E4E4E7] rounded-xl overflow-hidden shadow-2xs">
            <Kitchen3DCanvas 
              cabinets={cabinets} 
              hardware={hardwareSettings} 
              showFronts={showFronts} 
              isXRayMode={isXRayMode} 
              countertopPath={countertopPath}
              woodPanels={inventory.woodPanels}
              hardwareItems={inventory.hardwareItems}
              onApplyTextureOverride={(cabinetId, texturePath, finishType) => {
                // 🚀 Instant Materials Swap Pipeline Link (Click-to-Apply Module)
                // Re-writes the targeted node attributes dynamically in the memory stack
                updateCabinet(cabinetId, {
                  frontMaterialId: texturePath, // Smoothly injects chosen local/cloud file link
                  calculatedCostDA: cabinets.find(c => c.id === cabinetId)?.calculatedCostDA || 0
                });
              }}
            />
          </div>
        </div>

        {/* Right Hand Sidebar Terminal: Cabinet Node Creator & Pricing Output */}
        <div className="lg:col-span-1 space-y-3">
          
                    {/* Parametric Assembly Insertion Form */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-3 text-left space-y-2.5 shadow-3xs text-xs">
            <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1">🛠️ Cabinet Procedural Injection</span>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">Unit Structural Category</label>
              <select value={cabCategory} onChange={(e) => setCabCategory(e.target.value as CabinetCategory)} className="w-full border bg-white rounded-md p-1.5 focus:outline-none">
                <option value="BASE_UNIT">Base Unit (Caisson Bas)</option>
                <option value="WALL_UNIT">Wall Unit (Caisson Haut المعلق)</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">Facade Overlay Opening Type</label>
              <select value={openingType} onChange={(e) => setOpeningType(e.target.value as FrontOpeningType)} className="w-full border bg-white rounded-md p-1.5 focus:outline-none">
                <option value="DOORS">Swing Open Doors (أبواب)</option>
                <option value="DRAWERS">Slide Extension Drawers (أدراج)</option>
                <option value="NONE">Open Caisson Layout (بدون واجهة)</option>
              </select>
            </div>

            {openingType !== 'NONE' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-gray-400 block mb-0.5">Elements Count</label>
                  <input type="number" min="1" max="4" value={elementCount} onChange={(e) => setElementCount(Math.max(1, Number(e.target.value)))} className="w-full border rounded-md p-1 focus:outline-none text-center font-bold" />
                </div>
                {cabCategory === 'BASE_UNIT' && (
                  <div className="flex flex-col justify-center items-center pt-3">
                    <label className="text-[9px] font-bold text-slate-400 block mb-0.5">Gola System</label>
                    <input type="checkbox" checked={hasGola} onChange={(e) => setHasGola(e.target.checked)} className="rounded cursor-pointer w-4 h-4 text-indigo-600" />
                  </div>
                )}
              </div>
            )}

            <button onClick={handleCreateCabinetNode} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg transition-colors cursor-pointer text-center shadow-xs">
              ➕ Construct & Insert Cabinet
            </button>
          </div>

          {/* Active Blueprint Entity Management & Destruction Console */}
          {activeCabinetId && (
            <div className="bg-red-50/50 border border-red-200/80 rounded-xl p-3 text-left space-y-2 text-xs shadow-3xs animate-fade-in">
              <span className="font-bold text-red-800 block">⚠️ Selected Node Destruction Node</span>
              <p className="text-[10px] text-red-600 font-medium">Removing this component will automatically return all its allocated hardware accessories back into the workshop inventory stockroom lines.</p>
              <button onClick={() => deleteCabinet(activeCabinetId)} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 rounded-lg transition-colors cursor-pointer text-center">
                ✕ Delete Cabinet Node
              </button>
            </div>
          )}

          {/* Commercial & Production Output Actions Block */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-2.5 space-y-2 shadow-3xs">
            <button onClick={handleExportFactoryBOM} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-[10px] py-2 rounded-lg cursor-pointer transition-all shadow-3xs">
              🏭 GENERATE FACTORY PRODUCTION BOM (.CSV)
            </button>
            <button onClick={handlePrintCustomerInvoice} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-[10px] py-2 rounded-lg cursor-pointer transition-all shadow-3xs">
              🧾 CALCULATE & PRINT CUSTOMER INVOICE
            </button>
          </div>

        </div>
      </div>

      {/* 📄 Terminal Console Block: Displays compiled reports layout below viewports */}
      {(bomReportText || invoiceText) && (
        <div className="w-full mt-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-4 font-mono text-xs text-left shadow-md max-h-72 overflow-y-auto animate-fade-in">
          <div className="flex justify-between items-center border-b border-slate-700 pb-2 mb-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              {bomReportText ? 'Industrial cutting BOM Terminal Output' : 'Commercial customer invoice Terminal Output'}
            </span>
            <button onClick={() => { setBomReportText(''); setInvoiceText(''); }} className="text-slate-400 hover:text-white font-bold text-xs p-1">✕ Clear Output</button>
          </div>
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
            {bomReportText || invoiceText}
          </pre>
        </div>
      )}

    </div>
  );
}
