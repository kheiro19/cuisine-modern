// The 3D Executive Showcase wing: the whole kitchen as the customer sees it, with the view toggles, the worktop
// controls and the accessories library. Presentational — App owns the cabinets, the layout and every action.
import type { Dispatch, SetStateAction } from 'react';
import Kitchen3DCanvas from '../../components/Kitchen3DCanvas';
import AccessoryLibrary from '../../components/AccessoryLibrary';
import CommitNumber from '../../components/CommitNumber';
import type { CabinetObject, InjectedHardwareItem, InjectedWoodMaterial, AdvancedHardwareSettings } from '../../types/flatma';
import type { KitchenLayout } from '../../math/kitchenLayout';
import { DEFAULT_WALL_GAP_MM } from '../../math/kitchenLayout';
import { COUNTERTOP } from '../../math/constants';
import type { CountertopSettings } from '../../math/countertop';
import type { PlacedAccessory, NudgeResult, PlaceResult } from '../../math/accessoryPlacement';
import type { FinishKey } from '../../data/accessoryCatalog';
import type { useTextureCatalog } from '../../data/textureCatalog';

export interface ShowcasePanelProps {
  cabinets: CabinetObject[];
  hardwareSettings: AdvancedHardwareSettings;
  layout: KitchenLayout;
  showFronts: boolean;
  setShowFronts: Dispatch<SetStateAction<boolean>>;
  isXRayMode: boolean;
  setIsXRayMode: Dispatch<SetStateAction<boolean>>;
  isWorkspaceMinimized: boolean;
  isShowroomMinimized: boolean;
  setIsWorkspaceMinimized: Dispatch<SetStateAction<boolean>>;
  setIsShowroomMinimized: Dispatch<SetStateAction<boolean>>;
  countertop: CountertopSettings;
  setCountertopSettings: (fields: Partial<CountertopSettings>) => void;
  countertopShort: { neededMm: number; shortByMm: number; canCover: boolean } | null;
  countertopPath: { x: number; zOffset: number }[];
  countertopFinishOpen: boolean;
  setCountertopFinishOpen: Dispatch<SetStateAction<boolean>>;
  localTextures: ReturnType<typeof useTextureCatalog>;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  accessories: PlacedAccessory[];
  onApplyTextureOverride: (cabinetId: string, texturePath: string, finishType: string, applyToAll: boolean) => void;
  onDeleteCabinet: (cabinetId: string) => void;
  onAddAccessory: (catalogId: string, hostCabinetId?: string, finish?: FinishKey) => PlaceResult;
  onNudgeAccessory: (id: string, dxMm: number) => NudgeResult;
  onRemoveAccessory: (id: string) => void;
  onFinishAccessory: (id: string, finish: FinishKey) => void;
  onClearAccessories: () => void;
}

export default function ShowcasePanel(props: ShowcasePanelProps) {
  const { cabinets, hardwareSettings, layout, showFronts, setShowFronts, isXRayMode, setIsXRayMode, isWorkspaceMinimized, isShowroomMinimized, setIsWorkspaceMinimized, setIsShowroomMinimized, countertop, setCountertopSettings, countertopShort, countertopPath, countertopFinishOpen, setCountertopFinishOpen, localTextures, woodPanels, hardwareItems, accessories } = props;
  const { onApplyTextureOverride, onDeleteCabinet, onAddAccessory, onNudgeAccessory, onRemoveAccessory, onFinishAccessory, onClearAccessories } = props;
  // The canvas and the library keep the prop names they always had.
  const handleApplyTexture = onApplyTextureOverride;
  const addAccessory = onAddAccessory, nudgeAccessory = onNudgeAccessory, removeAccessory = onRemoveAccessory, changeAccessoryFinish = onFinishAccessory, clearAccessories = onClearAccessories;
  const woods = woodPanels;
  return (
    <>
        {/* 📺 الجناح الثالث: صالة عرض المطبخ ثلاثية الأبعاد الكبرى للزبون (Showcase Canvas) */}
        {!isShowroomMinimized && (
          <div className={`${isWorkspaceMinimized ? 'xl:col-span-11' : 'xl:col-span-1'} bg-white border border-slate-200 rounded-2xl p-2 min-h-[580px] flex flex-col relative shadow-3xs transition-all duration-300 animate-fade-in`}>
            
            {/* ترويسة صالة العرض: العنوان وكل الأزرار في التدفق العادي فوق الـCanvas — لا شيء يطفو فوق المشهد فيغطّيه
                أو يغطّي جاره عندما يضيق الجناح (كانت أربعة عناصر مطلقة التموضع تتزاحم في نفس الزاوية). */}
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="text-[9px] font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded shadow-sm tracking-wider">
                {isWorkspaceMinimized ? "🧊 3D LUXURY KITCHEN SHOWROOM (100% MAXIMUM VIEW)" : "🧊 3D EXECUTIVE SHOWCASE"}
              </span>

              {/* أزرار الرؤية الجبرية المدمجة (X-Ray + حذف الواجهات) */}
              <div className="flex flex-wrap items-center bg-slate-900/80 backdrop-blur-xs px-2 py-1 rounded-lg border border-slate-700 gap-2 shadow-md">
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

              {/* سطح العمل: إظهار / إخفاء — يرسمه الزبون من عنده، فلا يدخل التسعير */}
              <span className="w-px bg-slate-600" />
              <button
                type="button"
                aria-label="سطح العمل"
                aria-pressed={countertop.visible}
                title="إظهار أو إخفاء سطح العمل في المشهد ثلاثي الأبعاد"
                onClick={() => setCountertopSettings({ visible: !countertop.visible })}
                className={`px-2.5 py-0.5 rounded text-[10px] font-bold transition-all cursor-pointer ${countertop.visible ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:text-slate-200'}`}
              >
                {countertop.visible ? '🍽️ إخفاء سطح العمل' : '🍽️ إظهار سطح العمل'}
              </button>
            </div>

              {isWorkspaceMinimized ? (
                <button type="button" onClick={() => setIsWorkspaceMinimized(false)} className="ml-auto bg-slate-900 text-white hover:bg-slate-800 rounded-lg px-3 py-1 font-sans text-xs font-bold transition-all cursor-pointer shadow-md">
                  🗖 استعادة لوحة التقطيع (Split View)
                </button>
              ) : (
                <button type="button" onClick={() => { setIsShowroomMinimized(true); setIsWorkspaceMinimized(false); }} className="ml-auto bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-all cursor-pointer shadow-xs" title="تقليص صالة العرض وتركيز باحة العين على تفكيك الألواح">
                  🗕 Minimize 3D Showcase
                </button>
              )}
            </div>

            {/* السمك والعرض: 20–40 مم و 580–650 مم. التغيير يتم عند Enter أو الخروج من الحقل. */}
            {countertop.visible && (
              <div data-testid="countertop-settings" className="flex flex-wrap items-center gap-2 bg-slate-900/80 backdrop-blur-xs px-2 py-1 rounded-lg border border-slate-700 shadow-md mb-2">
                <label className="flex items-center space-x-1 text-[9px] font-mono font-bold text-slate-300">
                  <span>سُمك سطح العمل</span>
                  <CommitNumber value={countertop.thicknessMm} min={COUNTERTOP.THICKNESS_MM[0]} max={COUNTERTOP.THICKNESS_MM[1]} ariaLabel="سُمك سطح العمل" title="السمك من 20 إلى 40 مم" onCommit={(v) => setCountertopSettings({ thicknessMm: v })} />
                  <span>مم</span>
                </label>
                <label className="flex items-center space-x-1 text-[9px] font-mono font-bold text-slate-300">
                  <span>عرض سطح العمل</span>
                  <CommitNumber value={countertop.depthMm} min={COUNTERTOP.DEPTH_MM[0]} max={COUNTERTOP.DEPTH_MM[1]} ariaLabel="عرض سطح العمل" title="العرض (العمق من الجدار) من 580 إلى 650 مم" onCommit={(v) => setCountertopSettings({ depthMm: v })} />
                  <span>مم</span>
                </label>
                {countertopShort && (
                  <span className="flex items-center gap-1 text-[9px] font-bold text-amber-300" title="العرض الذي كتبته أقصر من الواجهة التي يغطيها سطح العمل — والرسم يتبع رقمك، لا العكس">
                    ⚠️ أقصر من الواجهة بـ {countertopShort.shortByMm} مم (الواجهة عند {countertopShort.neededMm} مم)
                    {countertopShort.canCover && (
                      <button type="button" onClick={() => setCountertopSettings({ depthMm: countertopShort.neededMm })} className="px-1 rounded border border-amber-400 bg-amber-900/40 hover:bg-amber-800 text-[8px] font-bold cursor-pointer">
                        اجعله {countertopShort.neededMm}
                      </button>
                    )}
                  </span>
                )}
                {/* خامة سطح العمل: تُختار من نفس مكتبة الـ public/textures التي تختار منها الواجهات (عرض فقط، بلا تسعير) */}
                <span className="relative">
                  <button
                    type="button"
                    aria-label="خامة سطح العمل"
                    onClick={() => setCountertopFinishOpen((o) => !o)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded border border-slate-500 bg-slate-800 hover:bg-slate-700 text-[9px] font-bold text-slate-200 cursor-pointer"
                    title="افتح مكتبة public/textures واختر خامة للسطح — كما تختار خامة الواجهة"
                  >
                    🪨 {countertop.texturePath ? countertop.texturePath.split('/').pop()?.replace(/\.[^.]+$/, '') : 'رخام أبيض'}
                    <span className="text-[8px] font-mono text-slate-400">({localTextures.count})</span>
                  </button>
                  {countertopFinishOpen && (
                    <span className="absolute z-50 top-6 left-0 w-72 max-h-56 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900/95 p-1.5 shadow-2xl block" style={{ direction: 'ltr' }}>
                      <span className="flex items-center justify-between px-1 pb-1" style={{ direction: 'rtl' }}>
                        <span className="text-[9px] font-bold text-slate-200">مكتبة الخامات ({localTextures.count})</span>
                        <button type="button" onClick={() => setCountertopSettings({ texturePath: undefined })} className="px-1 rounded border border-slate-600 bg-slate-800 text-[8px] text-slate-300 hover:bg-slate-700 cursor-pointer">↺ رخام أبيض</button>
                      </span>
                      {localTextures.count === 0 && (
                        <span className="block px-1 py-1 text-[9px] text-amber-300" style={{ direction: 'rtl' }}>مجلد public/textures غير مقروء في هذا البناء.</span>
                      )}
                      <span className="grid grid-cols-6 gap-1">
                        {localTextures.entries.map((tex) => (
                          <button
                            key={tex.id}
                            type="button"
                            title={tex.name}
                            onClick={() => { setCountertopSettings({ texturePath: tex.path }); setCountertopFinishOpen(false); }}
                            className={`w-10 h-10 rounded border overflow-hidden cursor-pointer hover:border-indigo-400 ${countertop.texturePath === tex.path ? 'border-indigo-400 ring-2 ring-indigo-500' : 'border-slate-600'}`}
                          >
                            <img src={tex.path} alt={tex.name} loading="lazy" decoding="async" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} className="w-full h-full object-cover" />
                          </button>
                        ))}
                      </span>
                    </span>
                  )}
                </span>
                <span className="text-[8px] font-mono text-slate-500">مجاني في التسعير — على الزبون</span>
              </div>
            )}

            <div className={`w-full ${isWorkspaceMinimized ? 'h-[80vh]' : 'h-full'} rounded-xl overflow-hidden relative flex flex-col flex-1`}>
              <Kitchen3DCanvas
                cabinets={cabinets}
                hardware={{ ...hardwareSettings, wallSplashHeight: layout.wallGapMm ?? DEFAULT_WALL_GAP_MM }}
                showFronts={showFronts}
                isXRayMode={isXRayMode}
                countertopPath={countertopPath}
                countertop={countertop}
                layout={layout}
                woodPanels={woods}
                hardwareItems={hardwareItems}
                accessories={accessories}
                onApplyTextureOverride={handleApplyTexture}
                onDeleteCabinet={onDeleteCabinet}
              />
            </div>

            <AccessoryLibrary cabinets={cabinets} accessories={accessories} onAdd={addAccessory} onNudge={nudgeAccessory} onRemove={removeAccessory} onFinish={changeAccessoryFinish} onClear={clearAccessories} />
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
    </>
  );
}
