// The 3D Atomic Workspace wing: the single-cabinet preview (exploded view, fasteners, audit) of the draft being built.
// Presentational: every value and the one action come in as props from App, which owns the state.
import CabinetPreview3D from '../../components/CabinetPreview3D';
import type { EdgeBandInfo } from '../../components/CabinetPreview3D';
import type { CabinetObject, InjectedHardwareItem, InjectedWoodMaterial } from '../../types/flatma';

export interface AtomicPanelProps {
  previewCabinet: CabinetObject;
  showFronts: boolean;
  isXRayMode: boolean;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  edges: { front: EdgeBandInfo; carcase: EdgeBandInfo };
  editing: CabinetObject | null;
  presetNote?: string;
  canSave: boolean;
  isCornerBuilder: boolean;
  isShowroomMinimized: boolean;
  onMinimizeWorkspace: () => void;
}

export default function AtomicPanel({ previewCabinet, showFronts, isXRayMode, woodPanels, hardwareItems, edges, editing, presetNote, canSave, isCornerBuilder, isShowroomMinimized, onMinimizeWorkspace }: AtomicPanelProps) {
  return (
        <div className={`${isShowroomMinimized ? 'xl:col-span-2' : 'xl:col-span-1'} bg-slate-900 border border-slate-800 rounded-xl p-4 relative overflow-hidden shadow-inner flex flex-col justify-end min-h-[480px] animate-fade-in`}>
          
          <button 
            type="button" 
            onClick={onMinimizeWorkspace} 
            className="absolute top-3 right-3 z-40 bg-white/10 hover:bg-white/20 text-white border border-white/10 rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-all cursor-pointer shadow-sm"
            title="تقليص شاشة الورشة وتكبير صالة العرض للزبون كلياً"
          >
            🗕 Minimize Workspace
          </button>

          <span className="absolute top-3 left-3 text-[9px] font-mono font-bold bg-indigo-600 text-white px-2 py-0.5 rounded shadow-sm">
            📐 3D ATOMIC WORKSPACE
          </span>
          <div className="absolute inset-x-0 top-9 bottom-0">
            <CabinetPreview3D
              cabinet={previewCabinet}
              showFronts={showFronts}
              isXRayMode={isXRayMode}
              woodPanels={woodPanels}
              hardwareItems={hardwareItems}
              edges={edges}
            />
          </div>
          {editing && (
            <span className="absolute top-3 left-44 z-30 text-[9px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm max-w-[160px] truncate">
              ✏️ تعديل: {editing.name}
            </span>
          )}
          {(presetNote || !canSave) && (
            <div className="absolute top-10 left-3 right-3 z-30 flex flex-col gap-1">
              {presetNote && (
                <span className="text-[9px] leading-snug bg-amber-100/95 text-amber-900 border border-amber-300 rounded px-2 py-1" style={{ direction: 'rtl' }}>
                  ⚠️ {presetNote}
                </span>
              )}
              {isCornerBuilder && (
                <span className="text-[9px] leading-snug bg-indigo-100/95 text-indigo-900 border border-indigo-300 rounded px-2 py-1" style={{ direction: 'rtl' }}>
                  📐 معاينة ذراع واحد من الزاوية L. الزاوية كاملة (المربع والذراعان) تظهر في صالة العرض بعد الإضافة.
                </span>
              )}
              {!canSave && (
                <span className="text-[9px] leading-snug bg-slate-100/95 text-slate-800 border border-slate-300 rounded px-2 py-1" style={{ direction: 'rtl' }}>
                  أضف لوحاً خشبياً من المخزن (العمود الأول) لتتمكن من حقن الوحدة.
                </span>
              )}
            </div>
          )}
        </div>
  );
}
