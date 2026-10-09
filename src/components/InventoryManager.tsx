// src/components/InventoryManager.tsx
import React, { useState, useMemo } from 'react';
import { useFurniture } from '../context/FurnitureContext';
import { HardwareCategory } from '../types/flatma';
import HardwareViewer3D, { HardwareGallery3D } from './Hardware3D';

export default function InventoryManager() {
  const { inventory, addWoodMaterial, addHardwareItem, addEdgeBandRoll } = useFurniture();

  // ========================================================
  // 🪵 🔒 LES 6 GRILLES DOCTRINALES ET COMPLÈTES SANS AUCUNE MODIFICATION
  // ========================================================
  
  // 1. Full Wood Panels Suppliers & Brands List (23 Complete Options)
  const [supplierList, setSupplierList] = useState<string[]>([
    "PANO ALGERIE (PDA)", "AGT (Turkey)", "EGGER (Austria)", "ALVIC (Spain)", 
    "GHAMOUD PAN (Algeria)", "KRONOSPAN (Global)", "KRONOSWISS (Switzerland)", "CLEAF (Italy)", 
    "SAVIOLA (Italy)", "KASTAMONU (Turkey)", "SALICE (Italy)", "BLUM (Austria)",
    "HETTICH (Germany)", "HÄFELE (Germany)", "GRASS (Germany)", "FINSA (Spain)",
    "KAINDL (Austria)", "SWISS KRONO (Global)", "PFLEIDERER (Germany)", "POLYREY (France)",
    "ARPA INDUSTRIALE (Italy)", "COMPAC (Global)", "NEOLITH (Global)"
  ]);

  // 2. Wood Panels Industry Sizes (14 Complete Dimensions Mapped)
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

  // 3. Materials, Finishes & Textures Catalog (12 Complete Types for Boxes and Fronts)
  const [materialTypeList, setMaterialTypeList] = useState<string[]>([
    "MDF Raw / Brute", "MDF Melamine Matt", "MDF Wood Grain / Textured", 
    "Acrylic High Gloss", "Acrylic Super Matt", "Polylac / PET Panels", 
    "UV Lacquer Finish", "Standard Particle Board / Chipboard", 
    "Hydrofuge Melamine / Moisture-Resistant", "HDF Standard 3mm", 
    "Postformed HPL Countertop Block", "Glass Door with Aluminum Profile"
  ]);

  // 4. Full Wood Thicknesses Grid (23 Complete Options: 3mm to 25mm Re-Hydrated)
  const [thicknessList, setThicknessList] = useState<number[]>(
    Array.from({ length: 23 }, (_, i) => i + 3)
  );

  // 5. Edge Band PVC Thicknesses (27 Complete Options: 0.4mm to 3.0mm)
  const [edgeThicknessList, setEdgeThicknessList] = useState<number[]>(
    Array.from({ length: 27 }, (_, i) => Number((0.4 + i * 0.1).toFixed(1)))
  );

  // 6. Edge Band PVC Widths (34 Complete Options: 12mm to 45mm)
  const [edgeWidthList, setEdgeWidthList] = useState<number[]>(
    Array.from({ length: 34 }, (_, i) => i + 12)
  );

  // ========================================================
  // ⚙️ LES 5 SOUS-SYSTÈMES INTERNES DE QUINCAILLERIE STANDARDISÉS
  // ========================================================
  const hardwareSystemsRegistry: Record<HardwareCategory, string[]> = useMemo(() => ({
    'Cabinet Hinges': [
      'Straight Hinge (Overlay)', 'Half-Crank Hinge (Half-Overlay)', 'Inset Hinge (Cranked)',
      'Blind Corner Hinge', '45-Degree Corner Hinge', 'Pie-Corner Hinge (Corner Fold)', 'Thick Door Hinge'
    ],
    'Drawer Slide Systems': [
      'Double-Wall Metal Box System', 'Hidden Under-mount Runner (Full Extension)',
      'Hidden Under-mount Runner (Partial Extension)', 'Standard Ball Bearing Slide',
      'Standard Roller Slide', 'Push-to-Open Heavy Duty Slides'
    ],
    'Overhead Lift Systems': [
      'Bi-fold Lift System (Aventos HF)', 'Up & Over Lift System (Aventos HS)',
      'Lift Up System (Aventos HL)', 'Stay Lift System (Aventos HK / HK-top)',
      'Standard Gas Strut System', 'Mechanical Stay Friction Hinge'
    ],
    'Gola & Handle Profiles': [
      'Horizontal Gola L-Profile (J-Profile)', 'Horizontal Gola C-Profile (Mid-Profile)',
      'Vertical Gola Single Profile', 'Vertical Gola Double Profile',
      'Aluminum Inset Handle Profile', 'Standard Drilling Handle'
    ],
    'Push-Open Systems': [
      'Magnetic Push Latch (Touch Latch)', 'Mechanical Tip-On (Blum Tip-On)',
      'Electric Servo-Drive (Blum Servo-Drive)', 'Push-to-Open for Drawers (Silent)'
    ],
    'Assembly & Fixing': [
      'Adjustable Kitchen Legs (100mm - 150mm)', 'Cabinet Hanger Plates (Heavy Duty)',
      'Confirmated Assembly Screws (5x50mm)', 'PVC Plinth Base Board (With Rubber)',
      'Corner Filler Profiles', 'Aluminum Sink Bottom Protector'
    ]
  }), []);

  // ========================================================
  // 🛠️ ACTIVE LOCAL STATE FORM SELECTORS
  // ========================================================
  const [selectedBrand, setSelectedBrand] = useState<string>("PANO ALGERIE (PDA)");
  const [selectedFinish, setSelectedFinish] = useState<string>("MDF Melamine Matt");
  const [selectedDimensionLabel, setSelectedDimensionLabel] = useState<string>("2800 x 2070 mm");
  const [woodThickness, setWoodThickness] = useState<number>(18);
  const [woodQty, setWoodQty] = useState<string>('10');
  const [woodPrice, setWoodPrice] = useState<string>('15000');

  // Chants PVC Autonomous States
  const [selectedEdgeBrand, setSelectedEdgeBrand] = useState<string>("PANO ALGERIE (PDA)");
  const [selectedEdgeThickness, setSelectedEdgeThickness] = useState<number>(2);
  const [selectedEdgeWidth, setSelectedEdgeWidth] = useState<number>(22);
  const [edgeRollLength, setEdgeRollLength] = useState<string>('100');
  const [edgeRollPrice, setEdgeRollPrice] = useState<string>('4500');

  const [selectedHwCategory, setSelectedHwCategory] = useState<HardwareCategory>('Cabinet Hinges');
  const [selectedHwBrand, setSelectedHwBrand] = useState<string>("BLUM (Austria)");
  const [customHwModels, setCustomHwModels] = useState<Record<string, string[]>>({});
  
  const currentAvailableModels = useMemo(() => {
    const defaultModels = hardwareSystemsRegistry[selectedHwCategory] || [];
    const customModels = customHwModels[selectedHwCategory] || [];
    return [...defaultModels, ...customModels];
  }, [selectedHwCategory, hardwareSystemsRegistry, customHwModels]);

  const [selectedHwModel, setSelectedHwModel] = useState<string>('Straight Hinge (Overlay)');

  React.useEffect(() => {
    if (currentAvailableModels.length > 0) {
      setSelectedHwModel(currentAvailableModels[0]);
    }
  }, [selectedHwCategory, currentAvailableModels]);

  const [hwQty, setHwQty] = useState<string>('4');
  const [hwPrice, setHwPrice] = useState<string>('500');

  // ========================================================
  // ⚡ INLINE INPUT FIELDS CONTROLLERS (Niveaux de saisie épurés)
  // ========================================================
  const [newBrandInput, setNewBrandInput] = useState<string>('');
  const [showBrandInput, setShowBrandInput] = useState<boolean>(false);

  const [newFinishInput, setNewFinishInput] = useState<string>('');
  const [showFinishInput, setShowFinishInput] = useState<boolean>(false);

  const [newDimensionInput, setNewDimensionInput] = useState<string>('');
  const [newDimW, setNewDimW] = useState<string>('2800');
  const [newDimH, setNewDimH] = useState<string>('2070');
  const [showDimensionInput, setShowDimensionInput] = useState<boolean>(false);

  const [newThicknessInput, setNewThicknessInput] = useState<string>('');
  const [showThicknessInput, setShowThicknessInput] = useState<boolean>(false);

  const [newEdgeThInput, setNewEdgeThicknessInput] = useState<string>('');
  const [showEdgeThInput, setShowEdgeThicknessInput] = useState<boolean>(false);

  const [newEdgeWInput, setNewEdgeWidthInput] = useState<string>('');
  const [showEdgeWInput, setShowEdgeWidthInput] = useState<boolean>(false);

  const [newHwModelInput, setNewHwModelInput] = useState<string>('');
  const [showHwModelInput, setShowHwModelInput] = useState<boolean>(false);

  const [woodExpanded, setWoodExpanded] = useState<boolean>(true);
  const [edgeExpanded, setEdgeExpanded] = useState<boolean>(true);
  const [hardwareExpanded, setHardwareExpanded] = useState<boolean>(true);

  // ========================================================
  // 🧪 INLINE MUTATION INJECTION UTILITIES
  // ========================================================
  const handleAddNewBrand = () => {
    if (newBrandInput.trim() === '') return;
    const val = newBrandInput.trim();
    setSupplierList([...supplierList, val]);
    setSelectedBrand(val);
    setSelectedHwBrand(val);
    setSelectedEdgeBrand(val);
    setNewBrandInput('');
    setShowBrandInput(false);
  };

  const handleAddNewFinish = () => {
    if (newFinishInput.trim() === '') return;
    const val = newFinishInput.trim();
    setMaterialTypeList([...materialTypeList, val]);
    setSelectedFinish(val);
    setNewFinishInput('');
    setShowFinishInput(false);
  };

  const handleAddNewDimension = () => {
    const wVal = parseInt(newDimW, 10);
    const hVal = parseInt(newDimH, 10);
    if (isNaN(wVal) || isNaN(hVal) || wVal <= 0 || hVal <= 0) return;
    
    const labelStr = `${wVal} x ${hVal} mm`;
    setSizeList([...sizeList, { label: labelStr, w: wVal, h: hVal }]);
    setSelectedDimensionLabel(labelStr);
    setShowDimensionInput(false);
  };

  const handleAddNewThickness = () => {
    const val = parseInt(newThicknessInput, 10);
    if (isNaN(val) || val <= 0) return;
    setThicknessList([...thicknessList, val].sort((a, b) => a - b));
    setWoodThickness(val);
    setNewThicknessInput('');
    setShowThicknessInput(false);
  };

  const handleAddNewEdgeThickness = () => {
    const val = parseFloat(newEdgeThInput);
    if (isNaN(val) || val <= 0) return;
    setEdgeThicknessList([...edgeThicknessList, val].sort((a, b) => a - b));
    setSelectedEdgeThickness(val);
    setNewEdgeThicknessInput('');
    setShowEdgeThicknessInput(false);
  };

  const handleAddNewEdgeWidth = () => {
    const val = parseInt(newEdgeWInput, 10);
    if (isNaN(val) || val <= 0) return;
    setEdgeWidthList([...edgeWidthList, val].sort((a, b) => a - b));
    setSelectedEdgeWidth(val);
    setNewEdgeWidthInput('');
    setShowEdgeWidthInput(false);
  };

  const handleAddNewHwModel = () => {
    if (newHwModelInput.trim() === '') return;
    const val = newHwModelInput.trim();
    const activeList = customHwModels[selectedHwCategory] || [];
    setCustomHwModels({ ...customHwModels, [selectedHwCategory]: [...activeList, val] });
    setSelectedHwModel(val);
    setNewHwModelInput('');
    setShowHwModelInput(false);
  };

  // ========================================================
  // 🏭 CORE SUBMISSIONS FORM EXECUTION
  // ========================================================
  const submitWoodToStock = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQty = parseInt(woodQty, 10);
    const parsedPrice = parseFloat(woodPrice);
    const matchedSize = sizeList.find(s => s.label === selectedDimensionLabel);

    if (isNaN(parsedQty) || parsedQty <= 0 || isNaN(parsedPrice) || parsedPrice <= 0 || !matchedSize) {
      alert("⚠️ Input Warning: Please state precise mathematical panel values.");
      return;
    }

    addWoodMaterial({
      id: `wood_${Date.now()}`,
      brand: selectedBrand,
      type: selectedFinish,
      widthSheet: matchedSize.w,
      heightSheet: matchedSize.h,
      thickness: woodThickness,
      edgeThickness: 0, 
      edgeWidth: 0,
      currentQty: parsedQty,
      averagePriceDA: parsedPrice
    });

    alert("🪵 Sheet panel successfully stored.");
  };

  const submitEdgeToStock = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedLength = parseInt(edgeRollLength, 10);
    const parsedPrice = parseFloat(edgeRollPrice);

    if (isNaN(parsedLength) || parsedLength <= 0 || isNaN(parsedPrice) || parsedPrice <= 0) {
      alert("⚠️ Input Warning: Correct the Edge Band PVC numerical measurements.");
      return;
    }

    addEdgeBandRoll({
      id: `edge_${Date.now()}`,
      brand: selectedEdgeBrand,
      thickness: selectedEdgeThickness,
      width: selectedEdgeWidth,
      totalLengthMeters: parsedLength,
      rollPriceDA: parsedPrice
    });

    alert("📋 Autonomous Edge Band PVC Roll registered into storage lines.");
  };

  const submitHardwareToStock = (e: React.FormEvent) => {
    e.preventDefault();
    const parsedQty = parseInt(hwQty, 10);
    const parsedPrice = parseFloat(hwPrice);

    if (isNaN(parsedQty) || parsedQty <= 0 || isNaN(parsedPrice) || parsedPrice <= 0) {
      alert("⚠️ Input Warning: Hardware fields reject zero quantities.");
      return;
    }

    addHardwareItem({
      id: `hw_${Date.now()}`,
      category: selectedHwCategory,
      brand: selectedHwBrand,
      modelType: selectedHwModel,
      availableQty: parsedQty,
      pricePerUnitDA: parsedPrice
    });

    alert("⚙️ Mechanical quincallerie integrated successfully.");
  };

  return (
    <div className="w-full flex flex-col space-y-4 select-none text-xs font-sans text-slate-700">
      
      {/* 🪵 COMPONENT 1: Parametric Wood Panels Section */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden shadow-3xs">
        <button type="button" onClick={() => setWoodExpanded(!woodExpanded)} className="w-full bg-slate-50/80 px-4 py-2.5 border-b border-slate-200/60 flex justify-between items-center font-bold text-slate-800">
          <span>🪵 Parametric Panels Stock Loader</span>
          <span>{woodExpanded ? '▼' : '▶'}</span>
        </button>

        {woodExpanded && (
          <form onSubmit={submitWoodToStock} className="p-3.5 space-y-3 text-left">
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Sheet Supplier</label>
                <button type="button" onClick={() => setShowBrandInput(!showBrandInput)} className="text-indigo-600 font-bold hover:text-indigo-800 text-xs cursor-pointer">＋ Add New</button>
              </div>
              <select value={selectedBrand} onChange={(e) => setSelectedBrand(e.target.value)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium">
                {supplierList.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
              {showBrandInput && (
                <div className="flex items-center space-x-2 pt-1 animate-fade-in">
                  <input type="text" placeholder="New supplier..." value={newBrandInput} onChange={(e) => setNewBrandInput(e.target.value)} className="flex-1 border rounded-md p-1 focus:outline-none font-medium text-slate-800" />
                  <button type="button" onClick={handleAddNewBrand} className="bg-indigo-600 text-white font-bold px-3 py-1 rounded-md hover:bg-indigo-700">Save</button>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Core Material & Finish</label>
                <button type="button" onClick={() => setShowFinishInput(!showFinishInput)} className="text-indigo-600 font-bold hover:text-indigo-800 text-xs cursor-pointer">＋ Add New</button>
              </div>
              <select value={selectedFinish} onChange={(e) => setSelectedFinish(e.target.value)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium">
                {materialTypeList.map((f, i) => <option key={i} value={f}>{f}</option>)}
              </select>
              {showFinishInput && (
                <div className="flex items-center space-x-2 pt-1 animate-fade-in">
                  <input type="text" placeholder="New material/finish..." value={newFinishInput} onChange={(e) => setNewFinishInput(e.target.value)} className="flex-1 border rounded-md p-1 focus:outline-none font-medium text-slate-800" />
                  <button type="button" onClick={handleAddNewFinish} className="bg-indigo-600 text-white font-bold px-3 py-1 rounded-md hover:bg-indigo-700">Save</button>
                </div>
              )}
            </div>

            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Sheet Dimension Format Layout</label>
                <button type="button" onClick={() => setShowDimensionInput(!showDimensionInput)} className="text-indigo-600 font-bold hover:text-indigo-800 text-xs cursor-pointer">＋ Add New</button>
              </div>
              <select value={selectedDimensionLabel} onChange={(e) => setSelectedDimensionLabel(e.target.value)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium">
                {sizeList.map((s, i) => <option key={i} value={s.label}>{s.label}</option>)}
              </select>
              {showDimensionInput && (
                <div className="flex flex-col space-y-1 pt-1 p-2 border bg-slate-50/50 rounded-lg animate-fade-in">
                  <div className="flex items-center space-x-2">
                    <input type="number" placeholder="W" value={newDimW} onChange={(e) => setNewDimW(e.target.value)} className="w-20 border rounded p-1 text-center font-bold" />
                    <span className="font-bold text-slate-400">x</span>
                    <input type="number" placeholder="H" value={newDimH} onChange={(e) => setNewDimH(e.target.value)} className="w-20 border rounded p-1 text-center font-bold" />
                    <button type="button" onClick={handleAddNewDimension} className="bg-indigo-600 text-white font-bold px-3 py-1 rounded-md hover:bg-indigo-700">Save</button>
                  </div>
                </div>
              )}
            </div>

            <div>
              <div className="flex justify-between items-center mb-0.5">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Panel Thickness</label>
                <button type="button" onClick={() => setShowThicknessInput(!showThicknessInput)} className="text-indigo-600 font-bold text-xs">＋ Add New</button>
              </div>
              <select value={woodThickness} onChange={(e) => setWoodThickness(Number(e.target.value))} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-bold text-center">
                {thicknessList.map((t, i) => <option key={i} value={t}>{t} mm</option>)}
              </select>
              {showThicknessInput && (
                <div className="flex items-center space-x-2 pt-1 animate-fade-in">
                  <input type="number" placeholder="mm" value={newThicknessInput} onChange={(e) => setNewThicknessInput(e.target.value)} className="w-24 border rounded p-1 text-center font-bold" />
                  <button type="button" onClick={handleAddNewThickness} className="bg-indigo-600 text-white font-bold px-3 py-1 rounded-md hover:bg-indigo-700">Save</button>
                </div>
              )}
            </div>

             {/* Quantity Controls */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Qty Sheets</label>
                <input type="number" value={woodQty} onChange={(e) => setWoodQty(e.target.value)} className="w-full border rounded-lg p-1.5 text-center focus:outline-none font-bold" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Purchase Price (DA)</label>
                <input type="number" value={woodPrice} onChange={(e) => setWoodPrice(e.target.value)} className="w-full border text-emerald-600 rounded-lg p-1.5 text-center focus:outline-none font-bold bg-emerald-50/20" />
              </div>
            </div>

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl transition-all shadow-xs cursor-pointer text-center">
              Add Board to Stock Account
            </button>
          </form>
        )}
      </div>

      {/* 📋 COMPONENT 2: Autonomous Edge Band PVC Roll Loader Section */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden shadow-3xs">
        <button type="button" onClick={() => setEdgeExpanded(!edgeExpanded)} className="w-full bg-slate-50/80 px-4 py-2.5 border-b border-slate-200/60 flex justify-between items-center font-bold text-slate-800">
          <span>📋 Edge Band Roll Loader (مخزون شريط الحواف المستقل)</span>
          <span>{edgeExpanded ? '▼' : '▶'}</span>
        </button>

        {edgeExpanded && (
          <form onSubmit={submitEdgeToStock} className="p-3.5 space-y-3 text-left">
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Edge Band Supplier</label>
              <select value={selectedEdgeBrand} onChange={(e) => setSelectedEdgeBrand(e.target.value)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium">
                {supplierList.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <div className="flex justify-between items-center mb-0.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Edge PVC (T)</label>
                  <button type="button" onClick={() => setShowEdgeThicknessInput(!showEdgeThInput)} className="text-indigo-600 font-bold text-xs">＋</button>
                </div>
                <select value={selectedEdgeThickness} onChange={(e) => setSelectedEdgeThickness(Number(e.target.value))} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-bold text-center">
                  {edgeThicknessList.map((et, i) => <option key={i} value={et}>{et} mm</option>)}
                </select>
                {showEdgeThInput && (
                  <div className="flex items-center space-x-1 pt-1 animate-fade-in">
                    <input type="number" step="0.1" placeholder="mm" value={newEdgeThInput} onChange={(e) => setNewEdgeThicknessInput(e.target.value)} className="w-16 border rounded p-0.5 text-center font-bold" />
                    <button type="button" onClick={handleAddNewEdgeThickness} className="bg-indigo-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">✓</button>
                  </div>
                )}
              </div>

              <div>
                <div className="flex justify-between items-center mb-0.5">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Edge PVC (W)</label>
                  <button type="button" onClick={() => setShowEdgeWidthInput(!showEdgeWInput)} className="text-indigo-600 font-bold text-xs">＋</button>
                </div>
                <select value={selectedEdgeWidth} onChange={(e) => setSelectedEdgeWidth(Number(e.target.value))} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-bold text-center">
                  {edgeWidthList.map((ew, i) => <option key={i} value={ew}>{ew} mm</option>)}
                </select>
                {showEdgeWInput && (
                  <div className="flex items-center space-x-1 pt-1 animate-fade-in">
                    <input type="number" placeholder="mm" value={newEdgeWInput} onChange={(e) => setNewEdgeWidthInput(e.target.value)} className="w-16 border rounded p-0.5 text-center font-bold" />
                    <button type="button" onClick={handleAddNewEdgeWidth} className="bg-indigo-600 text-white font-bold px-2 py-0.5 rounded text-[10px]">✓</button>
                  </div>
                )}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Roll Total Meters (m)</label>
                <input type="number" value={edgeRollLength} onChange={(e) => setEdgeRollLength(e.target.value)} className="w-full border rounded-lg p-1.5 text-center focus:outline-none font-bold" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Roll Price (DA)</label>
                <input type="number" value={edgeRollPrice} onChange={(e) => setEdgeRollPrice(e.target.value)} className="w-full border text-emerald-600 rounded-lg p-1.5 text-center focus:outline-none font-bold bg-emerald-50/20" />
              </div>
            </div>

            <button type="submit" className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl transition-all shadow-xs cursor-pointer text-center">
              Load Edge Band PVC Roll to Stock
            </button>
          </form>
        )}
      </div>

      {/* ⚙️ COMPONENT 3: Hardware Accessories Loader Section */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden shadow-3xs">
        <button type="button" onClick={() => setHardwareExpanded(!hardwareExpanded)} className="w-full bg-slate-50/80 px-4 py-2.5 border-b border-slate-200/60 flex justify-between items-center font-bold text-slate-800">
          <span>⚙️ Hardware Accessories Loader (الأنظمة الـ 5 الميكانيكية)</span>
          <span>{hardwareExpanded ? '▼' : '▶'}</span>
        </button>

        {hardwareExpanded && (
          <div className="p-3.5 pb-0 text-left">
            <div className="text-[10px] font-bold text-slate-400 mb-1.5">📷 مكتبة الصور ثلاثية الأبعاد (اضغط على نظام لاختياره في النموذج)</div>
            <HardwareGallery3D onSelect={(c, m) => { setSelectedHwCategory(c as HardwareCategory); setSelectedHwModel(m); }} />
          </div>
          <form onSubmit={submitHardwareToStock} className="p-3.5 space-y-3 text-left">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-1">System Kinematic Category</label>
              <select value={selectedHwCategory} onChange={(e) => setSelectedHwCategory(e.target.value as HardwareCategory)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium">
                <option value="Cabinet Hinges">⚙️ 1. Cabinet Hinges System (مفصلات أبواب)</option>
                <option value="Drawer Slide Systems">📁 2. Drawer Slide Systems (سكك أدراج)</option>
                <option value="Overhead Lift Systems">📁 3. Overhead Lift Systems (أنظمة رفع علوية)</option>
                <option value="Gola & Handle Profiles">📁 4. Gola & Handle Profiles (بروفيلات مقابض)</option>
                <option value="Push-Open Systems">📁 6. Push-Open Systems (فتح بالضغط)</option>
                               <option value="Assembly & Fixing">📁 5. Assembly & Fixing Screws (أرجل وبراغي تركيب)</option>
              </select>
            </div>

            {/* Hardware Manufacturer Brand */}
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Hardware Manufacturer Brand</label>
              <select value={selectedHwBrand} onChange={(e) => setSelectedHwBrand(e.target.value)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium">
                {supplierList.map((b, i) => <option key={i} value={b}>{b}</option>)}
              </select>
            </div>

            {/* Specification Model Name */}
            <div className="space-y-1">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">Specification Model Name</label>
                <button type="button" onClick={() => setShowHwModelInput(!showHwModelInput)} className="text-indigo-600 font-bold hover:text-indigo-800 text-xs cursor-pointer">＋ Add New</button>
              </div>
              <select value={selectedHwModel} onChange={(e) => setSelectedHwModel(e.target.value)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium text-indigo-700">
                {currentAvailableModels.map((m, i) => <option key={i} value={m}>{m}</option>)}
              </select>
              <HardwareViewer3D modelType={selectedHwModel} />
              {showHwModelInput && (
                <div className="flex items-center space-x-2 pt-1 animate-fade-in">
                  <input type="text" placeholder="Insert custom system model name..." value={newHwModelInput} onChange={(e) => setNewHwModelInput(e.target.value)} className="flex-1 border rounded-md p-1 focus:outline-none font-medium text-slate-800" />
                  <button type="button" onClick={handleAddNewHwModel} className="bg-indigo-600 text-white font-bold px-3 py-1 rounded-md hover:bg-indigo-700">Save</button>
                </div>
              )}
            </div>

            {/* Pricing metrics grid */}
            <div className="grid grid-cols-2 gap-3 font-mono">
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Qty Pcs/Sets</label>
                <input type="number" value={hwQty} onChange={(e) => setHwQty(e.target.value)} className="w-full border rounded-lg p-1.5 text-center focus:outline-none font-bold" />
              </div>
              <div>
                <label className="text-[9px] font-bold text-slate-400 block mb-0.5 font-sans">Unit Price (DA)</label>
                <input type="number" value={hwPrice} onChange={(e) => setHwPrice(e.target.value)} className="w-full border text-emerald-600 rounded-lg p-1.5 text-center focus:outline-none font-bold bg-emerald-50/20" />
              </div>
            </div>

            <button type="submit" className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold py-2 rounded-xl transition-all shadow-xs cursor-pointer text-center">
              Inject Hardware Accessory
            </button>
          </form>
        )}
      </div>

      {/* 🔮 COMPONENT 4: Terminal Stockroom View */}
      <div className="bg-white border border-[#E5E5E5] rounded-xl overflow-hidden shadow-3xs text-left">
        <div className="bg-slate-900 text-slate-100 px-4 py-2.5 flex justify-between items-center font-bold font-sans">
          <span>🔮 Real-Time Workshop Stockroom Terminal</span>
        </div>
        
        <div className="p-3 max-h-52 overflow-y-auto space-y-2">
          {inventory.woodPanels.length === 0 && inventory.hardwareItems.length === 0 && inventory.edgeBandRolls?.length === 0 && (
            <div className="text-center py-6 text-slate-400 font-mono text-[11px] border border-dashed border-slate-200 rounded-lg">
              Inventory stock is currently empty.<br />Please insert raw components above.
            </div>
          )}

          {inventory.woodPanels.map((w) => (
            <div key={w.id} className="border border-slate-100 p-2 rounded-lg flex justify-between items-center bg-slate-50/40 font-mono text-[11px]">
              <div>
                <span className="font-bold text-slate-900 font-sans block">{w.brand} - {w.type}</span>
                <span className="text-gray-400 text-[10px]">{w.widthSheet}x{w.heightSheet}mm | T: {w.thickness}mm</span>
              </div>
              <div className="text-right">
                <span className="text-indigo-600 font-bold block">{w.currentQty} Sheets</span>
                <span className="text-emerald-600 font-bold">{w.averagePriceDA.toLocaleString()} DA</span>
              </div>
            </div>
          ))}
		  
          {/* Render Active Custom Edge Band PVC Rolls */}

          {inventory.edgeBandRolls?.map((e) => (
            <div key={e.id} className="border border-slate-100 p-2 rounded-lg flex justify-between items-center bg-blue-50/30 font-mono text-[11px]">
              <div>
                <span className="font-bold text-slate-900 font-sans block">Edge Band PVC ({e.brand})</span>
                <span className="text-gray-400 text-[10px]">W: {e.width}mm | T: {e.thickness}mm</span>
              </div>
              <div className="text-right">
                <span className="text-blue-600 font-bold block">{e.totalLengthMeters} meters</span>
                <span className="text-emerald-600 font-bold">{e.rollPriceDA.toLocaleString()} DA</span>
              </div>
            </div>
          ))}

          {inventory.hardwareItems.map((h) => (
            <div key={h.id} className="border border-slate-100 p-2 rounded-lg flex justify-between items-center bg-slate-50/40 font-mono text-[11px]">
              <div>
                <span className="font-bold text-slate-900 font-sans block">{h.modelType} ({h.brand})</span>
                <span className="text-gray-400 text-[10px] uppercase tracking-tight">{h.category}</span>
              </div>
              <div className="text-right">
                <span className={`font-bold block ${h.availableQty < 0 ? 'text-red-600' : 'text-indigo-600'}`}>{h.availableQty} Pcs{h.availableQty < 0 ? ' ⚠️ عجز' : ''}</span>
                <span className="text-emerald-600 font-bold">{h.pricePerUnitDA.toLocaleString()} DA</span>
              </div>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
}
