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

export interface ComprehensiveCabinetFormState {
  id: string;
  name: string;
  subtype: CabinetSubtype;
  globalDimensions: Dimensions;
  materialThickness: number;
  boards: Board[];
}

const generateParametricBoards = (subtype: CabinetSubtype, global: Dimensions, thk: number): Board[] => {
  const baseBoards: Board[] = [
    { id: 'side-l', name: 'اللوح الجانبي الأيسر', type: 'side', dimensions: { width: thk, height: global.height, depth: global.depth }, position: { x: 0, y: 0, z: 0 }, materialThickness: thk, color: '#e3d5ca' },
    { id: 'side-r', name: 'اللوح الجانبي الأيمن', type: 'side', dimensions: { width: thk, height: global.height, depth: global.depth }, position: { x: global.width - thk, y: 0, z: 0 }, materialThickness: thk, color: '#e3d5ca' },
    { id: 'bottom', name: 'اللوح السفلي الصندوق', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: 0, z: 0 }, materialThickness: thk, color: '#d5bdaf' },
  ];

  switch (subtype) {
    case 'Deep_Drawers':
      return [
        ...baseBoards,
        { id: 'top-stretcher', name: 'عارضة التثبيت', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: 100 }, position: { x: thk, y: global.height - thk, z: 100 }, materialThickness: thk, color: '#d5bdaf' },
        { id: 'drw-front-1', name: 'واجهة الدرج السفلي', type: 'drawer_front', dimensions: { width: global.width - 4, height: (global.height / 2) - 6, depth: 18 }, position: { x: 2, y: 4, z: 0 }, materialThickness: 18, color: '#b7b7a4' },
        { id: 'drw-front-2', name: 'واجهة الدرج العلوي', type: 'drawer_front', dimensions: { width: global.width - 4, height: (global.height / 2) - 6, depth: 18 }, position: { x: 2, y: (global.height / 2) + 2, z: 0 }, materialThickness: 18, color: '#b7b7a4' }
      ];
    default:
      return [
        ...baseBoards,
        { id: 'top', name: 'اللوح العلوي القياسي', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: global.height - thk, z: 0 }, materialThickness: thk, color: '#d5bdaf' },
        { id: 'shelf-universal', name: 'رف داخلي عام', type: 'shelf', dimensions: { width: global.width - (thk * 2) - 4, height: thk, depth: global.depth - 20 }, position: { x: thk + 2, y: global.height / 2, z: 10 }, materialThickness: thk, color: '#f5ebe0' }
      ];
  }
};

export default function App() {
  const context = useFurniture();
  
  const cabinets = context?.cabinets || [];
  const inventory = context?.inventory || { woodPanels: null, hardwareItems: null };
  const activeCabinetId = context?.activeCabinetId || null;
  const updateCabinet = context?.updateCabinet || (() => {});
  const addCabinet = context?.addCabinet || (() => {});
  const deleteCabinet = context?.deleteCabinet || (() => {});
  const triggerUndo = context?.triggerUndo || (() => {});
  const canUndo = context?.canUndo || false;

  const [hardwareSettings] = useState({ carcaseThickness: 18, frontThickness: 18, wallSplashHeight: 600 });
  const [countertopPath] = useState([{ x: 0, zOffset: 0 }, { x: 2400, zOffset: 0 }]);
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
    globalDimensions: { width: 1050, height: 870, depth: 600 },
    materialThickness: 18,
    boards: generateParametricBoards('Deep_Drawers', { width: 1050, height: 870, depth: 600 }, 18)
  });

  const [selectedBoardId, setSelectedBoardId] = useState<string | null>(null);

  const handleSubtypeChange = (newSubtype: CabinetSubtype) => {
    let defaultDims: Dimensions = { width: 600, height: 720, depth: 350 };
    if (newSubtype === 'Ceiling_Height') defaultDims = { width: 600, height: 950, depth: 350 };
    else if (newSubtype === 'Over_Fridge') defaultDims = { width: 900, height: 450, depth: 600 };
    else if (newSubtype.includes('Drawers') || newSubtype.includes('Corner') || newSubtype === 'Blind_Corner') {
      defaultDims = { width: 1050, height: 870, depth: 600 };
    }

    setParametricCabinet(prev => ({
      id: `universal-${Date.now()}`,
      name: `هيكل مخصص لـ: ${newSubtype}`,
      subtype: newSubtype,
      globalDimensions: defaultDims,
      materialThickness: prev.materialThickness,
      boards: generateParametricBoards(newSubtype, defaultDims, prev.materialThickness)
    }));
    setSelectedBoardId(null);
  };

  const handleUpdateGlobalDimensions = (field: keyof Dimensions, value: number) => {
    setParametricCabinet(prev => {
      const updatedDims = { ...prev.globalDimensions, [field]: value };
      return {
        ...prev,
        globalDimensions: updatedDims,
        boards: generateParametricBoards(prev.subtype, updatedDims, prev.materialThickness)
      };
    });
  };

  const handleCreateCabinetNode = () => {
    const panels = inventory?.woodPanels;
    if (!panels) {
      alert("⚠️ المستودع فارغ كلياً!");
      return;
    }
    addCabinet({
      id: `cab_${Date.now()}`,
      name: `${parametricCabinet.subtype} Module`,
      category: cabCategory,
      width: parametricCabinet.globalDimensions.width,
      height: parametricCabinet.globalDimensions.height,
      depth: parametricCabinet.globalDimensions.depth,
      positionX: cabinets.length > 0 ? cabinets.reduce((sum, c) => sum + c.width, 0) : 0,
      positionY: 0,
      positionZ: 0,
      shelvesCount: parametricCabinet.boards.filter(b => b.type === 'shelf').length,
      carcaseMaterialId: panels?.id || 'default_wood',
      frontMaterialId: panels?.id || 'default_wood',
      frontConfig: { openingType, elementCount, hardwareItemId: '', hasGolaProfile: hasGola }
    });
  };

  const handleExportFactoryBOM = () => {
    if (cabinets.length === 0) return;
    const report = generateFactoryBOMReport(cabinets, inventory?.woodPanels, inventory?.hardwareItems);
    setBomReportText(convertBOMToCSVString(report));
    setInvoiceText('');
  };

  const handlePrintCustomerInvoice = () => {
    if (cabinets.length === 0) return;
    const report = generateFactoryBOMReport(cabinets, inventory?.woodPanels, inventory?.hardwareItems);
    setInvoiceText(formatCustomerInvoiceText(generateCustomerInvoice(report, 20, 30)));
    setBomReportText('');
  };

  return (
    <div className="w-full min-h-screen bg-[#F4F4F5] p-3 flex flex-col font-sans text-slate-800 antialiased overflow-x-hidden">
      
      {/* 🔝 الترويسة الرئيسية الحاكمة */}
      <header className="w-full border border-[#E4E4E7] bg-white rounded-xl px-4 py-2 mb-3 flex justify-between items-center shadow-3xs">
        <div className="flex items-center space-x-2">
          <span className="text-md">📐</span>
          <h1 className="text-xs font-bold uppercase text-slate-900">FLATMA Sketch <span className="text-indigo-600">x Dual-3D Pro</span></h1>
        </div>
        <button type="button" disabled={!canUndo} onClick={triggerUndo} className={`px-3 py-1 rounded-md border text-[11px] font-bold ${canUndo ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
          ↩️ تراجع
        </button>
      </header>

            {/* 🔳 الشاشة البانورامية الكبرى المقسمة هندسياً */}
      <div className="w-full grid grid-cols-1 xl:grid-cols-4 gap-3 items-stretch flex-1">
        
        {/* 📋 1. الجناح الأيسر: إدارة المخزن والألواح والأسعار (Inventory Manager) */}
        <div className="xl:col-span-1 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs max-h-[750px] overflow-y-auto">
          <InventoryManager />
        </div>

        {/* 💻 2. الجناح الأوسط: صندوق المعاينة ثلاثي الأبعاد وعرض النماذج (3D Construction Workspace) */}
        <div className="xl:col-span-2 flex flex-col space-y-3">
          
          {/* المحطة الفرعية الفوقية: صندوق الرسم الذري لتفكيك القطعة الواحدة حياً */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-3 h-72 relative overflow-hidden shadow-inner flex flex-col justify-end">
            <span className="absolute top-2 left-3 text-[9px] font-mono font-bold bg-indigo-600 text-white px-2 py-0.5 rounded shadow-sm">
              📐 3D ATOMIC CONSTRUCTION WORKSPACE
            </span>
            <div className="absolute inset-0 flex items-center justify-center opacity-20 pointer-events-none text-white text-xs font-mono">
              [ مسرح تصيير وتفكيك الألواح الفردية بالمليمتر ]
            </div>
            
            {/* عرض الألواح البرامترية التفاعلية بداخل الورشة */}
            <div className="w-full h-40 relative">
              {parametricCabinet.boards && parametricCabinet.boards.length > 0 && parametricCabinet.boards.map(b => {
                const maxDim = Math.max(parametricCabinet.globalDimensions?.height || 1, parametricCabinet.globalDimensions?.width || 1);
                const scale = 220 / (maxDim || 1);
                return (
                  <div 
                    key={b.id} 
                    className="absolute flex items-center justify-center text-[8px] text-white text-center rounded border border-white/20" 
                    style={{ 
                      right: `${(b.position?.x || 0) * scale + 40}px`, 
                      bottom: `${(b.position?.y || 0) * scale + 10}px`, 
                      width: `${(b.dimensions?.width || 1) * scale}px`, 
                      height: `${(b.dimensions?.height || 1) * scale}px`, 
                      backgroundColor: b.color || '#444', 
                      opacity: 0.9 
                    }}
                  >
                    {b.name ? b.name.substring(0, 8) : ''}
                  </div>
                );
              })}
            </div>
          </div>

          {/* المحطة الكبرى الأساسية: صالة عرض المطبخ ثلاثية الأبعاد الكاملة التي يراها الزبون */}
          <div className="bg-white border border-slate-200 rounded-xl p-2 h-[450px] flex flex-col relative shadow-3xs flex-1">
            <span className="absolute top-3 left-3 z-30 text-[9px] font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">
              🧊 3D EXECUTIVE SHOWCASE (FULL KITCHEN LAYOUT)
            </span>
            <div className="w-full h-full rounded-lg overflow-hidden">
              <Kitchen3DCanvas 
                cabinets={cabinets} 
                hardware={hardwareSettings} 
                showFronts={showFronts} 
                isXRayMode={isXRayMode} 
                countertopPath={countertopPath} 
                woodPanels={inventory?.woodPanels} 
                hardwareItems={inventory?.hardwareItems} 
                onApplyTextureOverride={(cabinetId, texturePath) => { 
                  updateCabinet(cabinetId, { 
                    frontMaterialId: texturePath, 
                    calculatedCostDA: cabinets.find(c => c.id === cabinetId)?.calculatedCostDA || 0 
                  }); 
                }} 
              />
            </div>
          </div>
        </div>

        {/* 🛠️ 3. الجناح الأيمن الفاخر: ورشة التحكم والـ 24 خزانة البرامترية وحقن العقد (Cabinet Procedural Injection) */}
        <div className="xl:col-span-1 flex flex-col space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs text-right text-xs" style={{ direction: 'rtl' }}>
          <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1 text-sm">🛠️ لوحة التحكم الجبرية والـ 24 خزانة</span>
          
          <div className="space-y-1">
            <label className="text-[10px] font-bold text-slate-400 block">اختر طراز الخزانة للتعديل والتقطيع:</label>
            <select value={parametricCabinet.subtype} onChange={(e) => handleSubtypeChange(e.target.value as CabinetSubtype)} className="w-full border bg-white rounded-md p-1.5 font-medium text-xs focus:outline-none">
              <optgroup label="1. وحدات سفلية">
                <option value="Deep_Drawers">وحدة أدراج سفلية عميقة</option>
                <option value="Pull_Out_Sink">وحدة أسفل الحوض بسحب كامل</option>
              </optgroup>
              <optgroup label="2. وحدات علوية ومعلقة">
                <option value="Standard_Wall">خزانة علوية قياسية</option>
                <option value="Ceiling_Height">خزانة ممتدة للسقف بالكامل</option>
              </optgroup>
              <optgroup label="3. وحدات الزوايا الميكانيكية">
                <option value="Magic_Corner">خزانة الزاوية Сحرية الذكية</option>
                <option value="Blind_Corner">خزانة الزاوية العادية الممتدة</option>
              </optgroup>
            </select>
          </div>

          {/* حقول تغيير المقاسات الخارجية (W, H, D) مطابقة لصور الـ Parameters المرفقة */}
          <div className="grid grid-cols-3 gap-1.5 text-[10px] bg-slate-50 p-2 rounded-lg border">
            <div>العرض (W):<input type="number" value={parametricCabinet.globalDimensions?.width || 0} onChange={(e) => handleUpdateGlobalDimensions('width', Number(e.target.value))} className="w-full border p-1 text-center bg-white rounded focus:outline-none font-bold" /></div>
            <div>الارتفاع (H):<input type="number" value={parametricCabinet.globalDimensions?.height || 0} onChange={(e) => handleUpdateGlobalDimensions('height', Number(e.target.value))} className="w-full border p-1 text-center bg-white rounded focus:outline-none font-bold" /></div>
            <div>العمق (D):<input type="number" value={parametricCabinet.globalDimensions?.depth || 0} onChange={(e) => handleUpdateGlobalDimensions('depth', Number(e.target.value))} className="w-full border p-1 text-center bg-white rounded focus:outline-none font-bold" /></div>
          </div>

          <div className="space-y-2 border-t pt-2 mt-1">
            <div>
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">فئة التركيب الإجمالية:</label>
              <select value={cabCategory} onChange={(e) => setCabCategory(e.target.value as CabinetCategory)} className="w-full border bg-white rounded-md p-1 focus:outline-none text-[11px]">
                <option value="BASE_UNIT">Caisson Bas (سفلية)</option>
                <option value="WALL_UNIT">Caisson Haut (علوية معلقة)</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold text-gray-400 block mb-0.5">بروتوكول فتح واجهة الفساد:</label>
              <select value={openingType} onChange={(e) => setOpeningType(e.target.value as FrontOpeningType)} className="w-full border bg-white rounded-md p-1 focus:outline-none text-[11px]">
                <option value="DOORS">Swing Doors (أبواب جانبية)</option>
                <option value="DRAWERS">Extension Drawers (أدراج سحابة)</option>
                <option value="NONE">Open Layout (بدون واجهة)</option>
              </select>
            </div>
          </div>

          <div className="pt-2 space-y-1.5 mt-auto">
            <button type="button" onClick={handleCreateCabinetNode} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg text-xs shadow-xs transition-colors cursor-pointer">
              ➕ حقن وتثبيت الوحدة في المطبخ الإجمالي
            </button>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={handleExportFactoryBOM} className="bg-slate-900 text-white font-mono font-bold text-[10px] py-1.5 rounded-md hover:bg-slate-800 transition-colors cursor-pointer">🏭 استخراج تقرير BOM</button>
              <button type="button" onClick={handlePrintCustomerInvoice} className="bg-emerald-600 text-white font-mono font-bold text-[10px] py-1.5 rounded-md hover:bg-emerald-700 transition-colors cursor-pointer">🧾 طباعة الفاتورة</button>
            </div>
          </div>

          {activeCabinetId && (
            <div className="bg-red-50/50 border border-red-200 rounded-lg p-2 text-center mt-2">
              <button type="button" onClick={() => deleteCabinet(activeCabinetId)} className="text-red-600 font-bold text-[11px] hover:underline cursor-pointer">✕ حذف الخزانة المحددة من المسرح</button>
            </div>
          )}
        </div>
      </div>

      {/* الكونسول السفلي لعرض المستندات والتقارير المطبوعة */}
      {(bomReportText || invoiceText) && (
        <div className="w-full mt-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-3 font-mono text-xs text-left shadow-md max-h-40 overflow-y-auto animate-fade-in">
          <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{bomReportText || invoiceText}</pre>
        </div>
      )}

    </div>
  );
}
