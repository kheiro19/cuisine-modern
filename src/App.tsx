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
        { id: 'drw-front-1', name: 'واجهة الدرج السفلي العميق', type: 'drawer_front', dimensions: { width: global.width - 4, height: (global.height / 2) - 6, depth: 18 }, position: { x: 2, y: 4, z: 0 }, materialThickness: 18, color: '#2b6cb0' },
        { id: 'drw-front-2', name: 'واجهة الدرج العلوي المكمل', type: 'drawer_front', dimensions: { width: global.width - 4, height: (global.height / 2) - 6, depth: 18 }, position: { x: 2, y: (global.height / 2) + 2, z: 0 }, materialThickness: 18, color: '#2b6cb0' }
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
  const inventory = context?.inventory || { woodPanels: [], hardwareItems: [] };
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
  };

  const handleUpdateGlobalDimensions = (field: keyof Dimensions, value: number) => {
    // التحقق لمنع إدخال قيم سالبة أو صفرية كاشفة للثغرات الأمنية
    if (value <= 0) return;
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
    const panels = inventory?.woodPanels || [];
    const hardware = inventory?.hardwareItems || [];

    // 🔒 تصحيح الثغرة رقم 3: قراءة المصفوفة الفعلية عوضاً عن الكائن المفرد لإحياء التكلفة الحقيقية
    if (!Array.isArray(panels) || panels.length === 0) {
      alert("⚠️ التقطيع معطل: يرجى إضافة لوح خشب واحد على الأقل في المخزن أولاً لتفعيل الحسابات المالية.");
      return;
    }

    const firstActiveWoodId = panels[0]?.id || 'default_wood_node';
    const firstActiveHardwareId = hardware[0]?.id || '';

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
      carcaseMaterialId: firstActiveWoodId,
      frontMaterialId: firstActiveWoodId,
      frontConfig: { 
        openingType, 
        elementCount, 
        hardwareItemId: firstActiveHardwareId, 
        hasGolaProfile: cabCategory === 'BASE_UNIT' && hasGola 
      }
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

   const gridLayoutClass = useMemo(() => {
    if (isWorkspaceMinimized) return "grid-cols-1 xl:grid-cols-12";
    if (isShowroomMinimized) return "grid-cols-1 xl:grid-cols-4";
    return "grid-cols-1 xl:grid-cols-4";
  }, [isWorkspaceMinimized, isShowroomMinimized]);

  return (
    <div className="w-full min-h-screen bg-[#F4F4F5] p-3 flex flex-col font-sans text-slate-800 antialiased overflow-x-hidden select-none">
      
      {/* 🔝 الترويسة الرئيسية للمنصة */}
      <header className="w-full border border-[#E4E4E7] bg-white rounded-xl px-4 py-2 mb-3 flex justify-between items-center shadow-3xs">
        <div className="flex items-center space-x-2">
          <span className="text-md">📐</span>
          <h1 className="text-xs font-bold uppercase text-slate-900 tracking-wider">FLATMA Sketch <span className="text-indigo-600">x Fusion Engine</span></h1>
        </div>
        <button type="button" disabled={!canUndo} onClick={triggerUndo} className={`px-3 py-1 rounded-md border text-[11px] font-bold ${canUndo ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
          ↩️ تراجع خطوة
        </button>
      </header>

      {/* 🔳 الشاشة المدمجة الحركية بنظام النوافذ المتبادلة المطهّرة 100% */}
      <div className={`w-full grid ${gridLayoutClass} gap-3 items-stretch flex-1`}>
        
        {/* 📋 الجناح الأول: المخازن والتسعير الصافي */}
        {!isWorkspaceMinimized && (
          <div className="xl:col-span-1 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs max-h-[750px] overflow-y-auto animate-fade-in">
            <InventoryManager />
          </div>
        )}

        {/* 💻 الجناح الثاني المدمج: ورشة تفكيك الألواح الفردية بالمليمتر */}
        {!isWorkspaceMinimized && (
          <div className={`${isShowroomMinimized ? 'xl:col-span-2' : 'xl:col-span-1'} bg-slate-900 border border-slate-800 rounded-xl p-4 relative overflow-hidden shadow-inner flex flex-col justify-end min-h-[480px] animate-fade-in`}>
            
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
              {parametricCabinet.boards?.map(b => {
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
          <div className={`${isWorkspaceMinimized ? 'xl:col-span-11' : 'xl:col-span-1'} bg-white border border-slate-200 rounded-2xl p-2 min-h-[580px] flex flex-col relative shadow-3xs transition-all duration-300 animate-fade-in`}>
            
            {/* أزرار التحكم بالمينيميز ومحاور الاستعادة الذكية */}
            {isWorkspaceMinimized ? (
              <button type="button" onClick={() => setIsWorkspaceMinimized(false)} className="absolute top-4 right-4 z-40 bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-3 py-1 font-sans text-xs font-bold transition-all cursor-pointer shadow-md">
                🗖 استعادة لوحة التقطيع (Split View)
              </button>
            ) : (
              <button type="button" onClick={() => { setIsShowroomMinimized(true); setIsWorkspaceMinimized(false); }} className="absolute top-3 right-3 z-40 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-all cursor-pointer shadow-xs">
                🗕 Minimize 3D Showcase
              </button>
            )}

            {/* أزرار الرؤية الجبرية المدمجة (X-Ray + حذف الواجهات) */}
            <div className="absolute top-3 left-3 z-40 flex bg-slate-900/80 backdrop-blur-xs px-2 py-1 rounded-lg border border-slate-700 space-x-2 shadow-md" style={{ marginLeft: '130px' }}>
              <button 
                type="button" 
                onClick={() => setShowFronts(p => !p)} 
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${showFronts ? 'bg-indigo-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              >
                {showFronts ? '🚪 إخفاء الواجهات والتعرية' : '🚪 إظهار الأبواب مغلقة'}
              </button>
              <button 
                type="button" 
                onClick={() => setIsXRayMode(p => !p)} 
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${isXRayMode ? 'bg-teal-600 text-white shadow-inner animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              >
                {isXRayMode ? '💀 وضع X-Ray نشط (شفاف)' : '💀 تشغيل شفافية الألواح X-Ray'}
              </button>
            </div>

            <span className="absolute top-3 left-3 z-30 text-[9px] font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">
              {isWorkspaceMinimized ? "🧊 3D LUXURY KITCHEN SHOWROOM (100% MAXIMUM VIEW)" : "🧊 3D EXECUTIVE SHOWCASE"}
            </span>

            <div className={`w-full ${isWorkspaceMinimized ? 'h-[80vh]' : 'h-full'} rounded-xl overflow-hidden relative mt-6 flex flex-col flex-1`}>
              <Kitchen3DCanvas cabinets={cabinets} hardware={hardwareSettings} showFronts={showFronts} isXRayMode={isXRayMode} countertopPath={countertopPath} woodPanels={inventory?.woodPanels} hardwareItems={inventory?.hardwareItems} onApplyTextureOverride={(cabinetId, texturePath) => { updateCabinet(cabinetId, { frontMaterialId: texturePath, calculatedCostDA: cabinets.find(c => c.id === cabinetId)?.calculatedCostDA || 0 }); }} />
            </div>
          </div>
        )}

        {/* زر التمدد الفوري إذا تم عمل مينيميز لصالة العرض بالكامل */}
        {isShowroomMinimized && (
          <div className="xl:col-span-1 bg-indigo-50 border border-indigo-200 rounded-xl flex flex-col items-center justify-center p-4 animate-fade-in text-center">
            <span className="text-xl mb-1">🧊</span>
            <span className="text-[10px] font-bold text-indigo-900 block mb-2">صالة العرض مصغرة الآن</span>
            <button type="button" onClick={() => setIsShowroomMinimized(false)} className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1 px-3 rounded text-[11px] cursor-pointer shadow-xs">🗖 استعادة وعرض الـ 3D للزبون</button>
          </div>
        )}

        {/* 🛠️ الجناح الرابع والأخير: لوحة التحكم الـ 24 طرازاً وحقن العقد الفعلي */}
        {!isWorkspaceMinimized && (
          <div className="xl:col-span-1 flex flex-col space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs text-right text-xs animate-fade-in" style={{ direction: 'rtl' }}>
            <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1 text-sm">🛠️ الموديلات البرامترية والـ CNC</span>
            
            <div className="space-y-1">
              <select value={parametricCabinet.subtype} onChange={(e) => handleSubtypeChange(e.target.value as CabinetSubtype)} className="w-full border bg-white rounded-md p-1.5 font-medium text-xs focus:outline-none">
                <optgroup label="1. الخزائن العلوية والسقفية">
                  <option value="Standard_Wall">خزانة علوية قياسية</option>
                  <option value="Ceiling_Height">الخزائن الممتدة للسقف</option>
                  <option value="Lift_Up">الخزائن الهيدروليكية (Lift-up)</option>
                  <option value="Glass_Front">الخزائن الزجاجية الفاخرة</option>
                  <option value="Over_Fridge">الخزانة فوق الثلاجة عمق 60سم</option>
                </optgroup>
                <optgroup label="2. الخزائن السفلية والحركية">
                  <option value="Deep_Drawers">وحدات الأدراج العميق (Deep Drawers)</option>
                  <option value="Pull_Out_Sink">خزانة الحوض بسحب أمامي</option>
                  <option value="Cargo_Pull_Out">صيدلية التوابل العمودية</option>
                  <option value="Hinged_Pull_Out_Trays">الخزائن ذات الأرفف السحابة</option>
                </optgroup>
                                <optgroup label="3. وحدات المؤونة الطولية">
                  <option value="Tall_Pantry_Cargo">خزانة المؤونة بسحب كلي</option>
                  <option value="Tandem_Pantry">خزانة المؤونة الترادفتية</option>
                  <option value="Built_In_Appliance">دولاب الأجهزة المدمجة</option>
                  <option value="Pocket_Door_Pantry">خزانة الأبواب المخفية المطوية</option>
                  <option value="Push_To_Open_Tall">الدولاب الطولي بفتح بالضغط</option>
                </optgroup>
                <optgroup label="4. حلول الأركان والزوا">
                  <option value="Magic_Corner">خزانة الزاوية السحرية</option>
                  <option value="Lazy_Susan">خزانة ليزي سوزان 360 درجة</option>
                  <option value="Corner_Drawers">أدراج الزاوية المتداخلة 90</option>
                  <option value="LeMans_Curve">خزانة السحب المنحني LeMans</option>
                  <option value="Blind_Corner">خزانة الزاوية العادية الممتدة</option>
                  <option value="Diagonal_Corner">خزانة الزاوية المائلة 45 درجة</option>
                </optgroup>
              </select>
            </div>

            <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-50 p-1.5 rounded border">
              <div>W:<input type="number" value={parametricCabinet.globalDimensions?.width || 0} onChange={(e) => handleUpdateGlobalDimensions('width', Number(e.target.value))} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
              <div>H:<input type="number" value={parametricCabinet.globalDimensions?.height || 0} onChange={(e) => handleUpdateGlobalDimensions('height', Number(e.target.value))} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
              <div>D:<input type="number" value={parametricCabinet.globalDimensions?.depth || 0} onChange={(e) => handleUpdateGlobalDimensions('depth', Number(e.target.value))} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
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
              <button type="button" onClick={handleCreateCabinetNode} className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-1.5 rounded-lg text-[11px] shadow-xs cursor-pointer">➕ حقن وتثبيت الوحدة في المطب</button>
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={handleExportFactoryBOM} className="bg-slate-900 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer">🏭 تقرير BOM</button>
                <button type="button" onClick={handlePrintCustomerInvoice} className="bg-emerald-600 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-emerald-700 transition-colors cursor-pointer">🧾 الفاتورة</button>
              </div>
            </div>
          </div>
        )}

      {/* الكونسول السفلي التفاعلي للمستندات والتقارير */}
      {(bomReportText || invoiceText) && (
        <div className="w-full mt-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-3 font-mono text-xs text-left shadow-md max-h-36 overflow-y-auto animate-fade-in">
          <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{bomReportText || invoiceText}</pre>
        </div>
      )}

    </div>
  );
}




