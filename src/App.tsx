// src/App.tsx
import React, { useState, useMemo } from 'react';
import { useFurniture } from './context/FurnitureContext';
import InventoryManager from './components/InventoryManager';
import Kitchen3DCanvas from './components/Kitchen3DCanvas';
import { generateFactoryBOMReport, convertBOMToCSVString } from './math/bomEngine';
import { generateCustomerInvoice, formatCustomerInvoiceText } from './math/invoiceEngine';
import { CabinetCategory, FrontOpeningType } from './types/flatma';

// ========================================================
// 📐 1. الأرشيف الهيكلي والأنواع البرامترية المتقدمة للـ 24 طراز
// ========================================================
export interface Dimensions {
  width: number;
  height: number;
  depth: number;
}

export interface Position {
  x: number;
  y: number;
  z: number;
}

export interface Board {
  id: string;
  name: string;
  type: 'side' | 'top_bottom' | 'back' | 'shelf' | 'drawer_front' | 'drawer_box' | 'corner_blind' | 'custom';
  dimensions: Dimensions;
  position: Position;
  materialThickness: number;
  color: string;
}

export type CabinetSubtype = 

  | 'Ceiling_Height' | 'Standard_Wall' | 'Lift_Up' | 'Glass_Front' | 'Over_Fridge' | 'Open_Shelving' | 'Double_Depth'
  | 'Deep_Drawers' | 'Pull_Out_Sink' | 'Cargo_Pull_Out' | 'Panel_Ready' | 'Push_To_Open_Base' | 'Hinged_Pull_Out_Trays'
  | 'Tall_Pantry_Cargo' | 'Pocket_Door_Pantry' | 'Built_In_Appliance' | 'Tandem_Pantry' | 'Push_To_Open_Tall'
  | 'Magic_Corner' | 'Lazy_Susan' | 'Corner_Drawers' | 'LeMans_Curve' | 'Blind_Corner' | 'Diagonal_Corner';

export interface ComprehensiveCabinet {
  id: string;
  name: string;
  subtype: CabinetSubtype;
  globalDimensions: Dimensions;
  materialThickness: number;
  boards: Board[];
}

// ========================================================
// 🧠 2. المحرك الإجرائي: توليد الألواح وتفكيك الهيكل هندسياً بالملي
// ========================================================
const generateParametricBoards = (subtype: CabinetSubtype, global: Dimensions, thk: number): Board[] => {
  const baseBoards: Board[] = [
    { id: 'side-l', name: 'اللوح الجانبي الأيسر', type: 'side', dimensions: { width: thk, height: global.height, depth: global.depth }, position: { x: 0, y: 0, z: 0 }, materialThickness: thk, color: '#7d5226' },
    { id: 'side-r', name: 'اللوح الجانبي الأيمن', type: 'side', dimensions: { width: thk, height: global.height, depth: global.depth }, position: { x: global.width - thk, y: 0, z: 0 }, materialThickness: thk, color: '#7d5226' },
    { id: 'bottom', name: 'اللوح السفلي الصندوق', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: 0, z: 0 }, materialThickness: thk, color: '#8c5e32' },
  ];

  switch (subtype) {
    case 'Ceiling_Height':
    case 'Standard_Wall':
    case 'Push_To_Open_Tall':
      return [
        ...baseBoards,
        { id: 'top', name: 'اللوح العلوي والسقفي', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: global.height - thk, z: 0 }, materialThickness: thk, color: '#8c5e32' },
        { id: 'back', name: 'ظهر الخزانة الحامي', type: 'back', dimensions: { width: global.width - (thk * 2), height: global.height - (thk * 2), depth: 8 }, position: { x: thk, y: thk, z: global.depth - 8 }, materialThickness: 8, color: '#a67546' },
        { id: 'shelf-1', name: 'رف داخلي قابل للتعديل', type: 'shelf', dimensions: { width: global.width - (thk * 2) - 4, height: thk, depth: global.depth - 15 }, position: { x: thk + 2, y: global.height * 0.4, z: 5 }, materialThickness: thk, color: '#d9a773' },
        { id: 'shelf-2', name: 'رف داخلي إضافي', type: 'shelf', dimensions: { width: global.width - (thk * 2) - 4, height: thk, depth: global.depth - 15 }, position: { x: thk + 2, y: global.height * 0.7, z: 5 }, materialThickness: thk, color: '#d9a773' }
      ];

    case 'Deep_Drawers':
    case 'Corner_Drawers':
      return [
        ...baseBoards,
        { id: 'top-stretcher', name: 'عارضة التثبيت العلوية الخلفية', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: 100 }, position: { x: thk, y: global.height - thk, z: global.depth - 100 }, materialThickness: thk, color: '#8c5e32' },
        { id: 'back', name: 'ظهر MDF الصندوق', type: 'back', dimensions: { width: global.width - (thk * 2), height: global.height - thk, depth: 8 }, position: { x: thk, y: thk, z: global.depth - 8 }, materialThickness: 8, color: '#a67546' },
        { id: 'drw-front-1', name: 'واجهة الدرج السفلي العميق', type: 'drawer_front', dimensions: { width: global.width - 4, height: (global.height / 2) - 6, depth: 18 }, position: { x: 2, y: 4, z: 0 }, materialThickness: 18, color: '#1d6359' },
        { id: 'drw-bottom-1', name: 'قاعدة صندوق الدرج الداخلي', type: 'drawer_box', dimensions: { width: global.width - (thk * 2) - 26, height: 16, depth: global.depth - 30 }, position: { x: thk + 13, y: 30, z: 20 }, materialThickness: 16, color: '#e6cbb3' },
        { id: 'drw-front-2', name: 'واجهة الدرج العلوي النحيف', type: 'drawer_front', dimensions: { width: global.width - 4, height: (global.height / 2) - 6, depth: 18 }, position: { x: 2, y: (global.height / 2) + 2, z: 0 }, materialThickness: 18, color: '#1d6359' }
      ];

    case 'Built_In_Appliance':
      return [
        ...baseBoards,
        { id: 'top', name: 'اللوح العلوي للسقفية', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: global.height - thk, z: 0 }, materialThickness: thk, color: '#8c5e32' },
        { id: 'appliance-shelf-base', name: 'رف تدعيم الفرن الحراري الثقيل', type: 'shelf', dimensions: { width: global.width - (thk * 2), height: 25, depth: global.depth - 10 }, position: { x: thk, y: global.height * 0.3, z: 0 }, materialThickness: 25, color: '#bf360c' },
        { id: 'appliance-shelf-top', name: 'رف الفصل العلوي للميكروويف', type: 'shelf', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth - 10 }, position: { x: thk, y: global.height * 0.7, z: 0 }, materialThickness: thk, color: '#d9a773' },
        { id: 'back-top', name: 'ظهر علوي مجزأ (للتهوية)', type: 'back', dimensions: { width: global.width - (thk * 2), height: global.height * 0.25, depth: 8 }, position: { x: thk, y: global.height * 0.75, z: global.depth - 8 }, materialThickness: 8, color: '#a67546' }
      ];

    case 'Blind_Corner':
    case 'Magic_Corner':
      return [
        ...baseBoards,
        { id: 'top', name: 'اللوح العلوي للركن', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: global.height - thk, z: 0 }, materialThickness: thk, color: '#8c5e32' },
        { id: 'blind-panel', name: 'لوح الميزانية الأعمى (الميت للربط)', type: 'corner_blind', dimensions: { width: 450, height: global.height, depth: thk }, position: { x: thk, y: 0, z: 150 }, materialThickness: thk, color: '#424242' },
        { id: 'magic-tray-1', name: 'الإطار الحديدي السحاب الأمامي', type: 'shelf', dimensions: { width: 400, height: 60, depth: global.depth * 0.6 }, position: { x: 460, y: global.height * 0.2, z: 20 }, materialThickness: 5, color: '#78909c' }
      ];

    default:
      return [
        ...baseBoards,
        { id: 'top', name: 'اللوح العلوي القياسي', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: global.height - thk, z: 0 }, materialThickness: thk, color: '#8c5e32' },
        { id: 'shelf-universal', name: 'رف تخزين داخلي عام', type: 'shelf', dimensions: { width: global.width - (thk * 2) - 4, height: thk, depth: global.depth - 20 }, position: { x: thk + 2, y: global.height / 2, z: 10 }, materialThickness: thk, color: '#d9a773' }
      ];
  }
}; // 🔒 إغلاق دالة توليد الألواح البرامترية بشكل سليم ومستقل تماماً

export interface ComprehensiveCabinetFormState {
  id: string;
  name: string;
  subtype: CabinetSubtype;
  globalDimensions: Dimensions;
  materialThickness: number;
  boards: Board[];
}

export function App() {
  const {
    cabinets,
    inventory,
    activeCabinetId,
    setActiveCabinetId,
    addCabinet,
    updateCabinet,
    deleteCabinet,
    triggerUndo,
    canUndo
  } = useFurniture();

  const [hardwareSettings] = useState({ carcaseThickness: 18, frontThickness: 18, wallSplashHeight: 600 });
  const [countertopPath] = useState([{ x: 0, zOffset: 0 }, { x: 2400, zOffset: 0 }]);
  const [wallGeometry] = useState({ id: 'w_main', length: 3000 });
  const [showFronts, setShowFronts] = useState<boolean>(true);
  const [isXRayMode, setIsXRayMode] = useState<boolean>(false);

  const [cabCategory, setCabCategory] = useState<CabinetCategory>('BASE_UNIT');
  const [openingType, setOpeningType] = useState<FrontOpeningType>('DOORS');
  const [elementCount, setElementCount] = useState<number>(2);
  const [hasGola, setHasGola] = useState<boolean>(false);

  const [bomReportText, setBomReportText] = useState<string>('');
  const [invoiceText, setInvoiceText] = useState<string>('');

  const [parametricCabinet, setParametricCabinet] = useState<ComprehensiveCabinetFormState>({
    id: 'universal-01',
    name: 'وحدة أدراج سفلية عميقة عصرية',
    subtype: 'Deep_Drawers',
    globalDimensions: { width: 800, height: 870, depth: 600 },
    materialThickness: 18,
    boards: generateParametricBoards('Deep_Drawers', { width: 800, height: 870, depth: 600 }, 18)
  });

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

    const handleSubtypeChange = (newSubtype: CabinetSubtype) => {
    let defaultDims: Dimensions = { width: 600, height: 720, depth: 350 };
    if (newSubtype === 'Ceiling_Height') {
      defaultDims = { width: 600, height: 950, depth: 350 };
    } else if (newSubtype === 'Over_Fridge') {
      defaultDims = { width: 900, height: 450, depth: 600 };
    } else if (newSubtype.includes('Drawers') || newSubtype.includes('Base') || newSubtype === 'Cargo_Pull_Out' || newSubtype === 'Pull_Out_Sink') {
      defaultDims = { width: 600, height: 870, depth: 600 };
    } else if (newSubtype.includes('Pantry') || newSubtype === 'Built_In_Appliance' || newSubtype.includes('Tall')) {
      defaultDims = { width: 600, height: 2200, depth: 600 };
    } else if (newSubtype.includes('Corner') || newSubtype === 'Lazy_Susan' || newSubtype === 'LeMans_Curve' || newSubtype === 'Blind_Corner') {
      defaultDims = { width: 1050, height: 870, depth: 600 };
    }

    setParametricCabinet({
      id: `universal-${Date.now()}`,
      name: `هيكل تفصيلي مخصص لـ: ${newSubtype}`,
      subtype: newSubtype,
      globalDimensions: defaultDims,
      materialThickness: parametricCabinet.materialThickness,
      boards: generateParametricBoards(newSubtype, defaultDims, parametricCabinet.materialThickness)
    });
    setSelectedBoardId(null);
  };

  const selectedBoard = useMemo(() => {
    return parametricCabinet.boards.find(b => b.id === selectedBoardId) || null;
  }, [parametricCabinet.boards, selectedBoardId]);

  const handleUpdateBoardDimensions = (boardId: string, field: keyof Dimensions, value: number) => {
    setParametricCabinet(prev => ({
      ...prev,
      boards: prev.boards.map(board => 
        board.id === boardId ? { ...board, dimensions: { ...board.dimensions, [field]: value } } : board
      )
    }));
  };

  const handleUpdateBoardPosition = (boardId: string, field: keyof Position, value: number) => {
    setParametricCabinet(prev => ({
      ...prev,
      boards: prev.boards.map(board => 
        board.id === boardId ? { ...board, position: { ...board.position, [field]: value } } : board
      )
    }));
  };

  const handleAddCustomBoard = () => {
    const newCustom: Board = {
      id: `custom-${Date.now()}`,
      name: `قطعة لوح مضافة مخصصة #${parametricCabinet.boards.length + 1}`,
      type: 'custom',
      dimensions: { width: 150, height: parametricCabinet.materialThickness, depth: parametricCabinet.globalDimensions.depth - 20 },
      position: { x: parametricCabinet.materialThickness + 10, y: parametricCabinet.globalDimensions.height / 2, z: 10 },
      materialThickness: parametricCabinet.materialThickness,
      color: '#4db6ac'
    };
    setParametricCabinet(prev => ({ ...prev, boards: [...prev.boards, newCustom] }));
    setSelectedBoardId(newCustom.id);
  };

  const handleCreateCabinetNode = () => {
    if (!inventory.woodPanels || inventory.woodPanels.length === 0) {
      alert("⚠️ Workshop Production Blocked: You cannot construct cabinets while the stockroom is empty. Please inject at least one Wood Panel asset into your warehouse first.");
      return;
    }
    if (openingType !== 'NONE' && (!inventory.hardwareItems || inventory.hardwareItems.length === 0)) {
      alert("⚠️ Mechanical Assembly Blocked: Record at least one Hardware Accessory in your stockroom first.");
      return;
    }

    addCabinet({
      id: `cab_${Date.now()}`,
      name: `${parametricCabinet.subtype} Module ${cabinets.length + 1}`,
      category: cabCategory,
      width: parametricCabinet.globalDimensions.width,
      height: parametricCabinet.globalDimensions.height,
      depth: parametricCabinet.globalDimensions.depth,
      positionX: cabinets.length > 0 ? Math.min(cabinets.reduce((sum, c) => sum + c.width, 0), wallGeometry.length - 600) : 0,
      positionY: 0,
      positionZ: 0,
      shelvesCount: parametricCabinet.boards.filter(b => b.type === 'shelf').length,
      carcaseMaterialId: inventory.woodPanels?.id || '',
      frontMaterialId: inventory.woodPanels?.id || '',
      frontConfig: { openingType, elementCount, hardwareItemId: inventory.hardwareItems?.id || '', hasGolaProfile: cabCategory === 'BASE_UNIT' && hasGola }
    });
  };

  return (
    <div className="w-full min-h-screen bg-[#F4F4F5] p-4 flex flex-col font-sans text-slate-800 antialiased selection:bg-indigo-100">
      
      <header className="w-full border border-[#E4E4E7] bg-white rounded-xl px-5 py-3 mb-4 flex justify-between items-center shadow-3xs">
        <div className="flex items-center space-x-2">
          <span className="text-lg">📐</span>
          <h1 className="text-sm font-bold tracking-tight uppercase text-slate-900">Cuisine Modern <span className="text-indigo-600">x Flatma Dual-3D</span></h1>
        </div>
        <button disabled={!canUndo} onClick={triggerUndo} className={`px-3 py-1.5 rounded-lg border font-mono text-xs font-bold shadow-3xs ${canUndo ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>↩️ UNDO MATRIX STEP</button>
      </header>

      <div className="w-full flex-1 grid grid-cols-1 lg:grid-cols-4 gap-4 items-start">
        <div className="lg:col-span-1 space-y-3 h-full overflow-y-auto"><InventoryManager /></div>

        <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4 w-full">
          <div className="bg-white border border-slate-200 rounded-xl p-4 h-[590px] flex flex-col relative shadow-2xs font-sans text-right" style={{ direction: 'rtl' }}>
            <span className="absolute top-3 left-3 text-[9px] font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded">📐 3D CONSTRUCTION WORKSPACE</span>
            
            <div className="mb-3">
              <label className="text-[11px] font-bold text-slate-400 block mb-1">🚀 اختر طراز الخزانة للتفكيك والتقطيع الآلي:</label>
              <select value={parametricCabinet.subtype} onChange={(e) => handleSubtypeChange(e.target.value as CabinetSubtype)} className="w-full border bg-white rounded-lg p-1.5 focus:outline-none font-medium text-xs">
                <optgroup label="1. الخزائن العلوية والسقفية"><option value="Standard_Wall">خزانة علوية بأبواب جانبية</option><option value="Ceiling_Height">خزانة ممتدة للسقف بالكامل</option><option value="Lift_Up">خزانة هيدروليكية تفتح لأعلى</option><option value="Glass_Front">خزانة واجهة زجاجية مضيئة</option><option value="Over_Fridge">خزانة فوق الثلاجة عمق 60سم</option></optgroup>
                <optgroup label="2. الخزائن السفلية الحركية"><option value="Deep_Drawers">وحدة أدراج عريضة عميقة</option><option value="Pull_Out_Sink">وحدة أسفل الحوض بسحب كامل</option><option value="Cargo_Pull_Out">صيدلية توابل عمودية نحيفة</option></optgroup>
                <optgroup label="3. وحدات المؤونة الطولية"><option value="Built_In_Appliance">دولاب الأجهزة المدمجة (فرن/ميكروويف)</option><option value="Tall_Pantry_Cargo">خزانة مؤونة عمودية بسحب كلي</option></optgroup>
                <optgroup label="4. حلول الأركان والزوايا"><option value="Magic_Corner">خزانة الزاوية السحرية الذكية</option><option value="Blind_Corner">خزانة الزاوية العادية الممتدة</option></optgroup>
              </select>
            </div>

            <button type="button" onClick={handleAddCustomBoard} className="w-full bg-teal-700 text-white font-bold py-1.5 rounded-lg text-[11px] hover:bg-teal-800 transition-colors mb-2">🔨 إضافة لوح خشب مخصص داخلي (قاطع / رف)</button>

            <div className="flex-1 w-full bg-slate-900 border border-slate-800 rounded-lg relative overflow-hidden h-60">
              {parametricCabinet.boards.map(b => {
                const scale = 360 / Math.max(parametricCabinet.globalDimensions.height, parametricCabinet.globalDimensions.width);
                const isSelected = b.id === selectedBoardId;
                return (
                  <div key={b.id} onClick={() => setSelectedBoardId(b.id)} className="absolute transition-all duration-150 cursor-pointer flex items-center justify-center text-[9px] text-white text-center rounded border" style={{ right: `${b.position.x * scale + 20}px`, bottom: `${b.position.y * scale + 20}px`, width: `${b.dimensions.width * scale}px`, height: `${b.dimensions.height * scale}px`, backgroundColor: b.color, borderColor: isSelected ? '#00e676' : '#1a1a1a', borderWidth: isSelected ? '3px' : '1px', opacity: isSelected ? 1 : 0.85, boxShadow: 'inset 0 0 6px rgba(0,0,0,0.5)' }} title={`${b.name}\n${b.dimensions.width}x${b.dimensions.height}mm`}>
                    {b.dimensions.width * scale > 40 && b.dimensions.height * scale > 25 ? b.name.substring(0, 10) : ''}
                  </div>
                );
              })}
            </div>

            <select size={3} className="w-full border rounded-lg p-1 text-[11px] font-mono mt-2" value={selectedBoardId || ''} onChange={(e) => setSelectedBoardId(e.target.value)}>
              {parametricCabinet.boards.map(b => <option key={b.id} value={b.id}>{b.name} ({b.dimensions.width}×{b.dimensions.height}mm)</option>)}
            </select>

            {selectedBoard && (
              <div className="border border-teal-200 p-2 rounded-lg bg-teal-50/10 text-[10px] grid grid-cols-2 gap-2 mt-2">
                <div>
                  <span className="font-bold text-teal-800 block mb-0.5">📐 تعديل المقاسات (ملم):</span>
                  Width: <input type="number" value={selectedBoard.dimensions.width} onChange={(e) => handleUpdateBoardDimensions(selectedBoard.id, 'width', Number(e.target.value))} className="w-12 border p-0.5 text-center" />
                  H: <input type="number" value={selectedBoard.dimensions.height} onChange={(e) => handleUpdateBoardDimensions(selectedBoard.id, 'height', Number(e.target.value))} className="w-12 border p-0.5 text-center m-0.5" />
                </div>
                <div>
                                    <span className="font-bold text-slate-700 block mb-0.5">📍 محاور الإزاحة الفراغية:</span>
                  X: <input type="number" value={selectedBoard.position.x} onChange={(e) => handleUpdateBoardPosition(selectedBoard.id, 'x', Number(e.target.value))} className="w-12 border p-0.5 text-center" />
                  Y: <input type="number" value={selectedBoard.position.y} onChange={(e) => handleUpdateBoardPosition(selectedBoard.id, 'y', Number(e.target.value))} className="w-12 border p-0.5 text-center m-0.5" />
                  <button type="button" onClick={() => { setParametricCabinet(p => ({ ...p, boards: p.boards.filter(b => b.id !== selectedBoard.id) })); setSelectedBoardId(null); }} className="text-red-600 font-bold block mt-1 hover:underline">🗑️ حذف اللوح</button>
                </div>
              </div>
            )}
          </div>

          {/* المحطة 2: صالة العرض ثلاثية الأبعاد وإكساء الخامات الـ 400 حياً (Showroom Rendering) */}
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-2 h-[590px] flex flex-col relative shadow-2xs">
            <span className="absolute top-3 left-3 z-30 text-[9px] font-mono font-bold bg-indigo-600 text-white px-2 py-0.5 rounded shadow-sm">🧊 3D EXECUTIVE SHOWCASE</span>
            <div className="flex-1 w-full h-full">
              <Kitchen3DCanvas cabinets={cabinets} hardware={hardwareSettings} showFronts={showFronts} isXRayMode={isXRayMode} countertopPath={countertopPath} woodPanels={inventory.woodPanels} hardwareItems={inventory.hardwareItems} onApplyTextureOverride={(cabinetId, texturePath) => { updateCabinet(cabinetId, { frontMaterialId: texturePath, calculatedCostDA: cabinets.find(c => c.id === cabinetId)?.calculatedCostDA || 0 }); }} />
            </div>
          </div>
        </div>

        {/* Right Side: Configuration Insertion Form & Production Logs */}
        <div className="lg:col-span-1 space-y-3">
          <div className="bg-white border border-[#E4E4E7] rounded-xl p-3 text-left space-y-2.5 shadow-3xs text-xs">
            <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1">🛠️ Cabinet Procedural Injection</span>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">Unit Category</label>
              <select value={cabCategory} onChange={(e) => setCabCategory(e.target.value as CabinetCategory)} className="w-full border bg-white rounded-md p-1 focus:outline-none"><option value="BASE_UNIT">Base Unit (Caisson Bas)</option><option value="WALL_UNIT">Wall Unit (Caisson Haut المعلق)</option></select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-gray-400 block">Facade Overlay Opening Type</label>
              <select value={openingType} onChange={(e) => setOpeningType(e.target.value as FrontOpeningType)} className="w-full border bg-white rounded-md p-1 focus:outline-none"><option value="DOORS">Swing Open Doors (أبواب)</option><option value="DRAWERS">Slide Extension Drawers (أدراج)</option><option value="NONE">Open Caisson Layout (بدون واجهة)</option></select>
            </div>
            {openingType !== 'NONE' && (
              <div className="grid grid-cols-2 gap-2">
                <div><label className="text-[10px] font-bold text-gray-400 block mb-0.5">Count</label><input type="number" min="1" max="4" value={elementCount} onChange={(e) => setElementCount(Math.max(1, Number(e.target.value)))} className="w-full border rounded-md p-0.5 text-center font-bold" /></div>
                {cabCategory === 'BASE_UNIT' && <div className="flex flex-col justify-center items-center pt-3"><label className="text-[9px] font-bold text-slate-400 block mb-0.5">Gola</label><input type="checkbox" checked={hasGola} onChange={(e) => setHasGola(e.target.checked)} className="rounded cursor-pointer w-4 h-4 text-indigo-600" /></div>}
              </div>
            )}
            <button type="button" onClick={handleCreateCabinetNode} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg cursor-pointer text-center text-xs shadow-xs">➕ Construct & Insert Cabinet</button>
          </div>

          {activeCabinetId && (
            <div className="bg-red-50/50 border border-red-200 rounded-xl p-3 text-left space-y-2 text-xs shadow-3xs">
              <span className="font-bold text-red-800 block">⚠️ Selected Node Destruction Console</span>
              <button type="button" onClick={() => deleteCabinet(activeCabinetId)} className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-1.5 rounded-lg text-center cursor-pointer">✕ Delete Cabinet Node</button>
            </div>
          )}

          <div className="bg-white border border-[#E4E4E7] rounded-xl p-2.5 space-y-2 shadow-3xs">
            <button type="button" onClick={handleExportFactoryBOM} className="w-full bg-slate-900 hover:bg-slate-800 text-white font-mono font-bold text-[10px] py-2 rounded-lg cursor-pointer transition-all">🏭 GENERATE FACTORY PRODUCTION BOM (.CSV)</button>
            <button type="button" onClick={handlePrintCustomerInvoice} className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-mono font-bold text-[10px] py-2 rounded-lg cursor-pointer transition-all">🧾 CALCULATE & PRINT CUSTOMER INVOICE</button>
          </div>
        </div>
      </div>

      {(bomReportText || invoiceText) && (
        <div className="w-full mt-4 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-4 font-mono text-xs text-left shadow-md max-h-72 overflow-y-auto animate-fade-in">
          <pre className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">{bomReportText || invoiceText}</pre>
        </div>
      )}

    </div>
  );
}
