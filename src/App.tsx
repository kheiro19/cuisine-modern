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
    case 'Tandem_Pantry':
      return [
        ...baseBoards,
        { id: 'top', name: 'سقف خزانة الترادف', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: global.height - thk, z: 0 }, materialThickness: thk, color: '#c7b198' },
        { id: 'tandem-back-shelf', name: 'أرفف عميقة آلية خلفية', type: 'shelf', dimensions: { width: global.width - (thk * 2) - 60, height: thk, depth: global.depth * 0.5 }, position: { x: thk + 30, y: global.height / 2, z: 40 }, materialThickness: thk, color: '#e2e8f0' }
      ];
    default:
      return [
        ...baseBoards,
        { id: 'top', name: 'اللوح العلوي القياسي', type: 'top_bottom', dimensions: { width: global.width - (thk * 2), height: thk, depth: global.depth }, position: { x: thk, y: global.height - thk, z: 0 }, materialThickness: thk, color: '#c7b198' },
        { id: 'shelf-universal', name: 'رف تخزين داخلي عام', type: 'shelf', dimensions: { width: global.width - (thk * 2) - 4, height: thk, depth: global.depth - 20 }, position: { x: thk + 2, y: global.height / 2, z: 10 }, materialThickness: thk, color: '#f5ebe0' }
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
  const [showFronts] = useState<boolean>(true);
  const [isXRayMode] = useState<boolean>(false);

  const [cabCategory, setCabCategory] = useState<CabinetCategory>('BASE_UNIT');
  const [openingType, setOpeningType] = useState<FrontOpeningType>('DOORS');
  const [elementCount, setElementCount] = useState<number>(2);
  const [hasGola, setHasGola] = useState<boolean>(false);

  const [bomReportText, setBomReportText] = useState<string>('');
  const [invoiceText, setInvoiceText] = useState<string>('');

  // 🔒 محرك التحجيم الحركي (Minimize / Maximize Matrix) لإبهار العميل وتلبية أمرك
  const [isWorkspaceMinimized, setIsWorkspaceMinimized] = useState<boolean>(false);
  const [isShowroomMinimized, setIsShowroomMinimized] = useState<boolean>(false);

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
    if (newSubtype === 'Ceiling_Height' || newSubtype === 'Standard_Wall' || newSubtype === 'Lift_Up' || newSubtype === 'Glass_Front') {
      defaultDims = { width: 600, height: 720, depth: 350 };
    } else if (newSubtype === 'Over_Fridge') {
      defaultDims = { width: 900, height: 450, depth: 600 };
    } else if (newSubtype === 'Deep_Drawers' || newSubtype === 'Pull_Out_Sink' || newSubtype === 'Cargo_Pull_Out' || newSubtype === 'Hinged_Pull_Out_Trays') {
      defaultDims = { width: 600, height: 870, depth: 600 };
    } else if (newSubtype === 'Tall_Pantry_Cargo' || newSubtype === 'Pocket_Door_Pantry' || newSubtype === 'Built_In_Appliance' || newSubtype === 'Tandem_Pantry' || newSubtype === 'Push_To_Open_Tall') {
      defaultDims = { width: 600, height: 2200, depth: 600 };
    } else if (newSubtype.includes('Corner') || newSubtype === 'Lazy_Susan' || newSubtype === 'LeMans_Curve' || newSubtype === 'Blind_Corner' || newSubtype === 'Diagonal_Corner') {
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
      alert("⚠️ Workshop Blocked: Wood Panels inventory missing.");
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

  // الحساب اللوجستي لتقسيم المساحات بناءً على أزرار المينيميز لحقن تمدد الـ Grid تلقائياً
  const gridLayoutClass = useMemo(() => {
    if (isWorkspaceMinimized) return "grid-cols-1 xl:grid-cols-12"; // الـ 3D يأخذ كل شيء
    if (isShowroomMinimized) return "grid-cols-1 xl:grid-cols-4";   // الورشة والمخزن يتوسعان
    return "grid-cols-1 xl:grid-cols-4"; // الوضع الافتراضي المستقر المتناظر كلياً
  }, [isWorkspaceMinimized, isShowroomMinimized]);

  return (
    <div className="w-full min-h-screen bg-[#F4F4F5] p-3 flex flex-col font-sans text-slate-800 antialiased overflow-x-hidden select-none">
      
      {/* 🔝 الترويسة الرئيسية للمنصة */}
      <header className="w-full border border-[#E4E4E7] bg-white rounded-xl px-4 py-2 mb-3 flex justify-between items-center shadow-3xs">
        <div className="flex items-center space-x-2">
          <span className="text-md">📐</span>
          <h1 className="text-xs font-bold uppercase text-slate-900 tracking-wider">FLATMA Sketch <span className="text-indigo-600">x Screen Fusion Pro</span></h1>
        </div>
        <button type="button" disabled={!canUndo} onClick={triggerUndo} className={`px-3 py-1 rounded-md border text-[11px] font-bold ${canUndo ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
          ↩️ تراجع خطوة
        </button>
      </header>

      {/* 🔳 الشاشة الفاخرة المدمجة الموزونة حركياً بالأزرار */}
      <div className={`w-full grid ${gridLayoutClass} gap-3 items-stretch flex-1`}>
        
        {/* 📋 الجناح الأول: المخازن والتسعير الصافي (يختفي فوراً إذا تمدد الـ 3D كلياً) */}
        {!isWorkspaceMinimized && (
          <div className="xl:col-span-1 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs max-h-[750px] overflow-y-auto animate-fade-in">
            <InventoryManager />
          </div>
        )}

        {/* 💻 الجناح الثاني المدمج: ورشة تفكيك الألواح الفردية بالمليمتر (Workspace) */}
        {!isWorkspaceMinimized && (
          <div className={`${isShowroomMinimized ? 'xl:col-span-2' : 'xl:col-span-1'} bg-slate-900 border border-slate-800 rounded-xl p-4 relative overflow-hidden shadow-inner flex flex-col justify-end min-h-[480px] animate-fade-in`}>
            
            {/* 🎛️ زر المينيميز لتقليص شاشة الورشة وتكبير شاشة المطبخ بالكامل */}
            <button 
              type="button" 
              onClick={() => { setIsWorkspaceMinimized(true); setIsShowroomMinimized(false); }} 
              className="absolute top-3 right-3 z-40 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-all cursor-pointer shadow-sm"
              title="تقليص شاشة الورشة وتكبير صالة العرض للزبون كلياً"
            >
              🗕 Minimize Workspace
            </button>

            <span className="absolute top-3 left-3 text-[9px] font-mono font-bold bg-indigo-600 text-white px-2 py-0.5 rounded shadow-sm">
              📐 3D ATOMIC WORKSPACE
            </span>
            <div className="w-full h-full flex items-center justify-center relative">
              {parametricCabinet.boards && parametricCabinet.boards.length > 0 && parametricCabinet.boards.map(b => {
                const maxDim = Math.max(parametricCabinet.globalDimensions?.height || 1, parametricCabinet.globalDimensions?.width || 1);
                const scale = 220 / (maxDim || 1);
                return (
                  <div key={b.id} className="absolute flex items-center justify-center text-[9px] text-white text-center rounded border border-white/20 transition-all font-mono shadow-md" style={{ right: `${(b.position?.x || 0) * scale + 40}px`, bottom: `${(b.position?.y || 0) * scale + 40}px`, width: `${(b.dimensions?.width || 1) * scale}px`, height: `${(b.dimensions?.height || 1) * scale}px`, backgroundColor: b.color || '#444' }}>
                    {b.name ? b.name.substring(0, 10) : ''}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 📺 الجناح الثالث: صالة عرض المطبخ ثلاثية الأبعاد الكبرى للزبون (Showcase Canvas) */}
        {!isShowroomMinimized && (
          <div className={`${isWorkspaceMinimized ? 'xl:col-span-11 font-sans' : 'xl:col-span-1'} bg-white border border-slate-200 rounded-2xl p-2 min-h-[580px] flex flex-col relative shadow-3xs transition-all duration-300 animate-fade-in`}>
            
            {/* 🎛️ زر المينيميز/الماكسيميز المتبادل بذكاء مطلق لقهر الانكماش */}
            {isWorkspaceMinimized ? (
              <button 
                type="button" 
                onClick={() => setIsWorkspaceMinimized(false)} 
                className="absolute top-4 right-4 z-40 bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-3 py-1 font-sans text-xs font-bold transition-all cursor-pointer shadow-md"
              >
                🗖 استعادة لوحة التحكم والورشة (Split View)
              </button>
            ) : (
              <button 
                type="button" 
                onClick={() => { setIsShowroomMinimized(true); setIsWorkspaceMinimized(false); }} 
                className="absolute top-3 right-3 z-40 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-all cursor-pointer shadow-xs"
                title="تقليص صالة العرض وتركيز باحة العين على تفكيك الألواح"
              >
                🗕 Minimize 3D Showcase
              </button>
            )}

            <span className="absolute top-3 left-3 z-30 text-[9px] font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">
              {isWorkspaceMinimized ? "🧊 3D LUXURY KITCHEN SHOWROOM (100% MAXIMUM FULL-SCREEN)" : "🧊 3D EXECUTIVE SHOWCASE"}
            </span>

            {/* الحاوية تم تمديدها ديناميكياً لتأخذ الارتفاع الكامل حسب حالة المينيميز */}
            <div className={`w-full ${isWorkspaceMinimized ? 'h-[80vh]' : 'h-full'} rounded-xl overflow-hidden relative mt-6 flex flex-col flex-1`}>
              <Kitchen3DCanvas cabinets={cabinets} hardware={hardwareSettings} showFronts={showFronts} isXRayMode={isXRayMode} countertopPath={countertopPath} woodPanels={inventory?.woodPanels} hardwareItems={inventory?.hardwareItems} onApplyTextureOverride={(cabinetId, texturePath) => { updateCabinet(cabinetId, { frontMaterialId: texturePath, calculatedCostDA: cabinets.find(c => c.id === cabinetId)?.calculatedCostDA || 0 }); }} />
            </div>
          </div>
        )}

        {/* زر التمدد إذا تم عمل مينيميز لصالة العرض بالكامل */}
        {isShowroomMinimized && (
          <div className="xl:col-span-1 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-col items-center justify-center p-4 animate-fade-in text-center">
            <span className="text-xl mb-1">🧊</span>
            <span className="text-[10px] font-bold text-indigo-900 block mb-2">صالة العرض مصغرة الآن</span>
            <button type="button" onClick={() => setIsShowroomMinimized(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded text-[11px] cursor-pointer shadow-xs">🗖 استعادة وعرض الـ 3D للزبون</button>
          </div>
        )}

                {/* 🛠️ الجناح الرابع والأخير: لوحة التحكم الـ 24 طرازاً وحقن العقد (تختفي فوراً لتوسيع الـ 3D) */}
        {!isWorkspaceMinimized && (
          <div className="xl:col-span-1 flex flex-col space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs text-right text-xs animate-fade-in" style={{ direction: 'rtl' }}>
            <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1 text-sm">🛠️ الموديلات البرامترية والـ CNC</span>
            
            <div className="space-y-1">
              <label className="text-[10px] font-bold text-slate-400 block mb-0.5">اختر طراز الخزانة للتقطيع والتعديل:</label>
              <select value={parametricCabinet.subtype} onChange={(e) => handleSubtypeChange(e.target.value as CabinetSubtype)} className="w-full border bg-white rounded-md p-1.5 font-medium text-xs focus:outline-none">
                <optgroup label="1. الخزائن العلوية والسقفية">
                  <option value="Standard_Wall">خزانة علوية بأبواب جانبية</option>
                  <option value="Ceiling_Height">الخزائن الممتدة للسقف</option>
                  <option value="Lift_Up">الخزائن الهيدروليكية (Lift-up)</option>
                  <option value="Glass_Front">الخزائن الزجاجية الفاخرة</option>
                  <option value="Over_Fridge">الخزانة العميقة فوق الثلاجة</option>
                </optgroup>
                <optgroup label="2. الخزائن السفلية والحركية">
                  <option value="Deep_Drawers">وحدات الأدراج العميق (Deep Drawers)</option>
                  <option value="Pull_Out_Sink">خزانة الحوض بسحب أمامي</option>
                  <option value="Cargo_Pull_Out">صيدلية التوابل العمودية</option>
                  <option value="Hinged_Pull_Out_Trays">خزائن الأرفف الداخلية المتحركة</option>
                </optgroup>
                <optgroup label="3. وحدات المؤونة الطولية">
                  <option value="Tall_Pantry_Cargo">خزانة المؤونة بسحب كلي</option>
                  <option value="Pocket_Door_Pantry">خزانة المؤونة بالأبواب المكنوزة</option>
                  <option value="Built_In_Appliance">دولاب الأجهزة المدمجة بالفرن</option>
                  <option value="Tandem_Pantry">خزانة المؤونة الترادفتية</option>
                  <option value="Push_To_Open_Tall">الدولاب الطولي بالفتح بالضغط</option>
                </optgroup>
                <optgroup label="4. خزائن الزوايا والأركان 90 و45">
                  <option value="Magic_Corner">خزانة الزاوية السحرية (Magic Corner)</option>
                  <option value="Lazy_Susan">خزانة ليزي سوزان الدائرية</option>
                  <option value="Corner_Drawers">أدراج الزاوية المتداخلة 90</option>
                  <option value="LeMans_Curve">خزانة السحب المنحني LeMans</option>
                  <option value="Blind_Corner">خزانة الزاوية العادية الممتدة</option>
                  <option value="Diagonal_Corner">خزانة الزاوية المائلة 45 درجة</option>
                </optgroup>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-50 p-1.5 rounded border">
              <div>W (العرض):<input type="number" value={parametricCabinet.globalDimensions?.width || 0} onChange={(e) => handleUpdateGlobalDimensions('width', Number(e.target.value))} className="w-full border p-0.5 text-center bg-white font-bold rounded focus:outline-none" /></div>
              <div>H (الارتفاع):<input type="number" value={parametricCabinet.globalDimensions?.height || 0} onChange={(e) => handleUpdateGlobalDimensions('height', Number(e.target.value))} className="w-full border p-0.5 text-center bg-white font-bold rounded focus:outline-none" /></div>
              <div>D (العمق):<input type="number" value={parametricCabinet.globalDimensions?.depth || 0} onChange={(e) => handleUpdateGlobalDimensions('depth', Number(e.target.value))} className="w-full border p-0.5 text-center bg-white font-bold rounded focus:outline-none" /></div>
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
              <button type="button" onClick={handleCreateCabinetNode} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 rounded-lg text-[11px] shadow-xs transition-colors cursor-pointer">➕ حقن وتثبيت الوحدة في المطبخ</button>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={handleExportFactoryBOM} className="bg-slate-900 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer">🏭 تقرير BOM</button>
                <button type="button" onClick={handlePrintCustomerInvoice} className="bg-emerald-600 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-emerald-700 transition-colors cursor-pointer">🧾 الفاتورة</button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* الكونسول السفلي التفاعلي للمستندات والتقارير المطبوعة */}
      {(bomReportText || invoiceText) && (
        <div className="w-full mt-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-3 font-mono text-xs text-left shadow-md max-h-36 overflow-y-auto animate-fade-in">
          <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{bomReportText || invoiceText}</pre>
        </div>
      )}

    </div>
  );
}
