// src/components/CabinetConfigurator.tsx
import React, { useState, useMemo } from 'react';
import { useFurniture } from '../context/FurnitureContext';
import { CabinetCategory, FrontOpeningType, HardwareCategory } from '../types/flatma';

export default function CabinetConfigurator() {
  const {
    cabinets,
    inventory,
    activeCabinetId,
    addCabinet,
    updateCabinet,
    deleteCabinet
  } = useFurniture();

  // Active targeted cabinet instance memoization
  const activeCabinet = useMemo(() => 
    cabinets.find(c => c.id === activeCabinetId), 
    [cabinets, activeCabinetId]
  );

  // Dynamic Commercial Pricing Parameters (Modifiable by the craftsman)
  const [laborPercentage, setLaborPercentage] = useState<number>(20);
  const [profitPercentage, setProfitMarginPercentage] = useState<number>(30);

  // Procedural Form Generation Local States (Fallback creation placeholders)
  const [category, setCategory] = useState<CabinetCategory>('BASE_UNIT');
  const [name, setName] = useState<string>('Procedural Module');
  const [width, setWidth] = useState<number>(600);
  const [height, setHeight] = useState<number>(720);
  const [depth, setDepth] = useState<number>(560);
  const [shelves, setShelves] = useState<number>(1);

  const [openingType, setOpeningType] = useState<FrontOpeningType>('DOORS');
  const [elementCount, setElementCount] = useState<number>(2);
  const [hasGola, setHasGola] = useState<boolean>(false);

  const [carcaseMatId, setCarcaseMatId] = useState<string>('');
  const [frontMatId, setFrontMatId] = useState<string>('');
  const [hardwareItemId, setHardwareItemId] = useState<string>('');

  // Sift and categorize active systems out of the central storehouse lines
  const filteredHardwareOptions = useMemo(() => {
    let targetedCategory: HardwareCategory = 'Cabinet Hinges';
    if (openingType === 'DRAWERS') targetedCategory = 'Drawer Slide Systems';
    if (category === 'WALL_UNIT' && openingType === 'DOORS') {
      return inventory.hardwareItems.filter(h => h.category === 'Cabinet Hinges' || h.category === 'Overhead Lift Systems');
    }
    return inventory.hardwareItems.filter(h => h.category === targetedCategory);
  }, [inventory.hardwareItems, category, openingType]);

  const handleApplyConstruction = () => {
    if (inventory.woodPanels.length === 0) {
      alert("Workshop Error: Please inject at least one valid Wood Material sheet in stock before compiling.");
      return;
    }

    const assignedCarcaseId = carcaseMatId || inventory.woodPanels[0].id;
    const assignedFrontId = frontMatId || inventory.woodPanels[0].id;
    const assignedHardwareId = hardwareItemId || (filteredHardwareOptions[0]?.id || '');

    if (activeCabinet) {
      // Perform strict transformation override mutation on active cabinet entity
      updateCabinet(activeCabinet.id, {
        width,
        height,
        depth,
        shelvesCount: shelves,
        carcaseMaterialId: assignedCarcaseId,
        frontMaterialId: assignedFrontId,
        frontConfig: {
          openingType,
          elementCount,
          hardwareItemId: assignedHardwareId,
          hasGolaProfile: category === 'BASE_UNIT' && hasGola
        }
      });
    } else {
      // Execute procedural creation injection
      addCabinet({
        id: `cab_${Date.now()}`,
        name: `${name} ${cabinets.length + 1}`,
        category,
        width,
        height,
        depth,
        positionX: cabinets.reduce((sum, c) => sum + c.width, 0),
        positionY: 0,
        positionZ: 0,
        shelvesCount: shelves,
        carcaseMaterialId: assignedCarcaseId,
        frontMaterialId: assignedFrontId,
        frontConfig: {
          openingType,
          elementCount,
          hardwareItemId: assignedHardwareId,
          hasGolaProfile: category === 'BASE_UNIT' && hasGola
        }
      });
    }
  };

  // Synchronize input fields instantly if user switches active cabinets on the layout canvas
  React.useEffect(() => {
    if (activeCabinet) {
      setCategory(activeCabinet.category);
      setWidth(activeCabinet.width);
      setHeight(activeCabinet.height);
      setDepth(activeCabinet.depth);
      setShelves(activeCabinet.shelvesCount);
      setOpeningType(activeCabinet.frontConfig.openingType);
      setElementCount(activeCabinet.frontConfig.elementCount);
      setHasGola(activeCabinet.frontConfig.hasGolaProfile);
      setCarcaseMatId(activeCabinet.carcaseMaterialId);
      setFrontMatId(activeCabinet.frontMaterialId);
      setHardwareItemId(activeCabinet.frontConfig.hardwareItemId);
    }
  }, [activeCabinetId, activeCabinet]);

  // Compute final real-time customer price factoring commercial markups
  const computedCustomerPrice = useMemo(() => {
    if (!activeCabinet) return 0;
    const rawCost = activeCabinet.calculatedCostDA;
    const labor = rawCost * (laborPercentage / 100);
    const profit = (rawCost + labor) * (profitPercentage / 100);
    return Math.round(rawCost + labor + profit);
  }, [activeCabinet, laborPercentage, profitPercentage]);

  return (
    <div className="w-full bg-white border border-[#E5E5E5] rounded-xl p-3 space-y-3.5 text-xs text-left shadow-xs font-sans">
      <div className="border-b border-slate-100 pb-1.5 flex justify-between items-center">
        <span className="font-bold text-slate-900 uppercase tracking-tight text-[11px]">
          {activeCabinet ? `🔧 Tuning: ${activeCabinet.name}` : '🛠️ Parametric Unit Constructor'}
        </span>
        {activeCabinet && (
          <span className="text-[9px] bg-indigo-50 border border-indigo-100 text-indigo-700 font-bold px-1.5 py-0.5 rounded">
            ID: {activeCabinet.id.slice(-4)}
          </span>
        )}
      </div>

      {/* 📐 SECTION 1: Structural Core Geometric Inputs */}
      {!activeCabinet && (
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[10px] font-bold text-gray-400 block mb-1">Module Node Class</label>
            <select 
              value={category} 
              onChange={(e) => {
                const cat = e.target.value as CabinetCategory;
                setCategory(cat);
                setHeight(cat === 'BASE_UNIT' ? 720 : 900);
                setDepth(cat === 'BASE_UNIT' ? 560 : 320);
              }} 
              className="w-full border bg-white rounded-lg p-2 font-medium focus:outline-none"
            >
              <option value="BASE_UNIT">Base Unit (سفلي)</option>
              <option value="WALL_UNIT">Wall Unit (علوي معلق)</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] font-bold text-gray-400 block mb-1">Custom Reference Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full border bg-white rounded-lg p-2 focus:outline-none font-medium" />
          </div>
        </div>
      )}

      {/* Outer Dimensional Form Boundaries Grid */}
      <div className="grid grid-cols-4 gap-1.5 font-mono">
        <div>
          <label className="text-[9px] font-bold text-gray-400 font-sans block mb-0.5">Width W</label>
          <input type="number" value={width} onChange={(e) => setWidth(Number(e.target.value))} className="w-full border rounded-lg p-1.5 text-center focus:outline-none font-bold" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-gray-400 font-sans block mb-0.5">Height H</label>
          <input type="number" value={height} onChange={(e) => setHeight(Number(e.target.value))} className="w-full border rounded-lg p-1.5 text-center focus:outline-none font-bold" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-gray-400 font-sans block mb-0.5">Depth D</label>
          <input type="number" value={depth} onChange={(e) => setDepth(Number(e.target.value))} className="w-full border rounded-lg p-1.5 text-center focus:outline-none font-bold" />
        </div>
        <div>
          <label className="text-[9px] font-bold text-gray-400 font-sans block mb-0.5">Shelves</label>
          <input type="number" min="0" max="5" value={shelves} onChange={(e) => setShelves(Number(e.target.value))} className="w-full border rounded-lg p-1.5 text-center focus:outline-none font-bold" />
        </div>
      </div>

      {/* 🪵 SECTION 2: Polymorphic Sheet Materials Selector from Workshop Inventory */}
      <div className="bg-slate-50/50 border border-slate-100 rounded-lg p-2.5 space-y-2">
        <span className="text-[10px] font-bold text-slate-500 block uppercase tracking-wider">Surface Material Injection</span>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Internal Box Caisson</label>
            <select value={carcaseMatId} onChange={(e) => setCarcaseMatId(e.target.value)} className="w-full border bg-white rounded-md p-1.5 focus:outline-none text-[11px]">
              {inventory.woodPanels.map(m => (
                <option key={m.id} value={m.id}>{m.brand} {m.type} ({m.thickness}mm)</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Exterior Front Facade</label>
            <select value={frontMatId} onChange={(e) => setFrontMatId(e.target.value)} className="w-full border bg-white rounded-md p-1.5 focus:outline-none text-[11px]">
              {inventory.woodPanels.map(m => (
                <option key={m.id} value={m.id}>{m.brand} {m.type} ({m.thickness}mm)</option>
              ))}
            </select>
          </div>
        </div>
      </div>

              {/* ⚙️ SECTION 3: Parametric Mechanical Openings & Kinematics */}
        <div className="space-y-2 border border-slate-200 rounded-lg p-2.5 bg-white">
          <span className="text-[10px] font-bold text-indigo-600 block uppercase tracking-wider">Mechanical Kinematics Subsystem</span>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Opening Vector Typology</label>
              <select 
                value={openingType} 
                onChange={(e) => {
                  const type = e.target.value as FrontOpeningType;
                  setOpeningType(type);
                  setElementCount(type === 'DRAWERS' ? 3 : 2);
                }} 
                className="w-full border bg-white rounded-md p-1.5 focus:outline-none"
              >
                <option value="DOORS">Swing Doors (أبواب)</option>
                {category === 'BASE_UNIT' && <option value="DRAWERS">Slides Drawers (أدراج)</option>}
                <option value="NONE">No Front (مكشوف)</option>
              </select>
            </div>

            {openingType !== 'NONE' && (
              <div>
                <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Elements Quantity Array</label>
                <select value={elementCount} onChange={(e) => setElementCount(Number(e.target.value))} className="w-full border bg-white rounded-md p-1.5 focus:outline-none font-bold">
                  {openingType === 'DOORS' ? (
                    <>
                      <option value={1}>1 Door Panel</option>
                      <option value={2}>2 Symmetrical Doors</option>
                      <option value={3}>3 Segmented Doors</option>
                    </>
                  ) : (
                    <>
                      <option value={2}>2 Large Deep Drawers</option>
                      <option value={3}>3 Standard Stacked Drawers</option>
                      <option value={4}>4 Minimalist Slim Drawers</option>
                    </>
                  )}
                </select>
              </div>
            )}
          </div>

          {/* Kinematic hardware item linkage matched instantly to the selected category */}
          {openingType !== 'NONE' && (
            <div className="grid grid-cols-1 pt-0.5">
              <label className="text-[9px] font-bold text-gray-400 block mb-0.5">Assigned Mechanical Runner/Hinges Kit</label>
              <select value={hardwareItemId} onChange={(e) => setHardwareItemId(e.target.value)} className="w-full border bg-white rounded-md p-1.5 focus:outline-none font-medium text-indigo-700">
                {filteredHardwareOptions.map(h => (
                  <option key={h.id} value={h.id}>{h.brand} — {h.modelType}</option>
                ))}
              </select>
            </div>
          )}

          {/* Gola Embed option triggered exclusively on ground nodes */}
          {category === 'BASE_UNIT' && openingType !== 'NONE' && (
            <div className="flex items-center justify-between border-t border-slate-100 pt-2 px-1">
              <span className="text-gray-500 font-medium text-[11px]">Embed Aluminum Gola Profiling Channel</span>
              <input type="checkbox" checked={hasGola} onChange={(e) => setHasGola(e.target.checked)} className="rounded cursor-pointer w-4 h-4 text-indigo-600 focus:ring-indigo-500" />
            </div>
          )}
        </div>

        {/* 💼 SECTION 4: Real-time Commercial Cost Valuation Layout */}
        {activeCabinet && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 space-y-2 text-left animate-fade-in font-mono">
            <span className="text-[10px] font-bold text-emerald-800 font-sans block uppercase tracking-wider">Commercial Revenue Metrics Console</span>
            <div className="grid grid-cols-2 gap-2 text-xs font-sans text-emerald-900 font-medium">
              <div>
                <label className="text-[8px] font-bold text-emerald-600 block uppercase font-mono mb-0.5">Craftsmanship %</label>
                <input type="number" value={laborPercentage} onChange={(e) => setLaborPercentage(Math.max(0, Number(e.target.value)))} className="w-full border border-emerald-300 rounded bg-white p-1 text-center font-bold focus:outline-none" />
              </div>
              <div>
                <label className="text-[8px] font-bold text-emerald-600 block uppercase font-mono mb-0.5">Profit Margin %</label>
                <input type="number" value={profitPercentage} onChange={(e) => setProfitMarginPercentage(Math.max(0, Number(e.target.value)))} className="w-full border border-emerald-300 rounded bg-white p-1 text-center font-bold focus:outline-none" />
              </div>
            </div>
            <div className="pt-1 flex justify-between items-center text-emerald-900 border-t border-emerald-200/50 font-sans">
              <span className="text-[10px] font-bold text-emerald-700">Client Facing Invoice Price:</span>
              <span className="text-sm font-bold font-mono">{computedCustomerPrice.toLocaleString()} DA</span>
            </div>
          </div>
        )}

        {/* Compile Submission Action Buttons */}
        <div className="pt-1 grid grid-cols-1 gap-2">
          <button 
            onClick={handleApplyConstruction} 
            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-xl transition-all shadow-md text-center cursor-pointer"
          >
            {activeCabinet ? '✓ Apply Transformation Overrides' : '➕ Construct & Insert Procedural Cabinet'}
          </button>
          {activeCabinet && (
            <button 
              onClick={() => deleteCabinet(activeCabinet.id)} 
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 rounded-xl transition-all text-center cursor-pointer"
            >
              ✕ Destroy Selected Cabinet Node
            </button>
          )}
        </div>
      </div>
    );
  }
