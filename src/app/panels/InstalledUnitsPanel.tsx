// The installed-units section of the control panel: every cabinet already in the kitchen, with its fit state,
// the stock-shortage warnings, and permanent edit / move / delete actions. Presentational — App owns the list.
import CommitNumber from '../../components/CommitNumber';
import type { CabinetObject, RunId } from '../../types/flatma';
import type { FitState } from '../../math/kitchenLayout';
import { RUN_LABELS, runOf } from '../../math/kitchenLayout';
import { zonesOf } from '../../math/zones';
import { APPLIANCES } from '../../rules/appliances';
import type { checkStock } from '../../math/stockCheck';

const MOVE_STEP_MM = 50;

export type ListRow = { kind: 'single'; cab: CabinetObject } | { kind: 'group'; groupId: string; name: string; cabs: CabinetObject[] };

const frontSummary = (c: CabinetObject): string =>
  zonesOf(c)
    .slice()
    .reverse() // top -> bottom, the way the cabinet is read
    .map((z) =>
      z.kind === 'DOORS' ? `أبواب ×${z.count ?? 1}`
      : z.kind === 'DRAWERS' ? `أدراج ×${z.count ?? 1}`
      : z.kind === 'APPLIANCE' ? APPLIANCES[z.appliance ?? 'OVEN'].label
      : z.kind === 'APRON' ? 'لوح ثابت'
      : 'مفتوح')
    .join(' + ');

export interface InstalledUnitsPanelProps {
  cabinets: CabinetObject[];
  listRows: ListRow[];
  fits: Record<string, FitState>;
  fitClass: (id: string, isEditing: boolean, isActive?: boolean) => string;
  editing: CabinetObject | null;
  activeCabinetId: string;
  setActiveCabinetId: (id: string) => void;
  stockShortages: ReturnType<typeof checkStock>;
  layoutNotice: string | null;
  layoutRuns: RunId[];
  onAutoArrange: () => void;
  onEditCabinet: (id: string) => void;
  onDeleteFromList: (id: string) => void;
  onSetCabinetPosition: (id: string, positionX: number) => void;
  onNudgeCabinet: (id: string, deltaMm: number) => void;
  onMoveToRun: (id: string, run: RunId) => void;
}

export default function InstalledUnitsPanel(props: InstalledUnitsPanelProps) {
  const { cabinets, listRows, fits, fitClass, editing, activeCabinetId, setActiveCabinetId, stockShortages, layoutNotice, layoutRuns } = props;
  const handleAutoArrange = props.onAutoArrange, handleEditCabinet = props.onEditCabinet, handleDeleteFromList = props.onDeleteFromList;
  const setCabinetPosition = props.onSetCabinetPosition, nudgeCabinet = props.onNudgeCabinet, moveToRun = props.onMoveToRun;
  return (
    <>
            {/* الوحدات المثبّتة: تعديل وحذف دائمان (لا يتطلبان النقر على الخزانة في المشهد) */}
            <div className="border-t border-slate-100 pt-2 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-[11px]">🗂️ الوحدات المثبّتة ({cabinets.length})</span>
                {cabinets.length > 1 && (
                  <button type="button" onClick={handleAutoArrange} title="ترصّ الوحدات متجاورة من بداية كل جدار حسب ترتيبها الحالي (زاوية L تبقى مكانها)" className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[10px] font-bold cursor-pointer">⟲ ترتيب تلقائي</button>
                )}
              </div>
              {stockShortages.length > 0 && (
                <div className="text-[9px] leading-snug rounded p-1 border text-amber-900 bg-amber-50 border-amber-300 space-y-0.5">
                  <span className="font-bold block">📦 المخزون لا يكفي هذه المطبخ ({stockShortages.length}):</span>
                  {stockShortages.slice(0, 4).map((s) => (
                    <span key={`${s.kind}-${s.itemId}`} className="block" style={{ direction: 'rtl' }}>
                      {s.kind === 'SHEET' ? '🪵 ألواح' : s.kind === 'EDGE_BAND' ? '🎗️ شريط حواف' : '🔩 عتاد'} — {s.label}: المطلوب {s.required} · المتوفر {s.available} · الناقص <b>{s.shortfall}</b>
                    </span>
                  ))}
                  {stockShortages.length > 4 && <span className="block text-slate-600">… و{stockShortages.length - 4} أخرى (تجدها كاملة في تصدير BOM)</span>}
                </div>
              )}
              {cabinets.some((c) => fits[c.id] === 'OUT_OF_BOUNDS') && (
                <span className="block text-[9px] leading-snug rounded p-1 border text-red-900 bg-red-100 border-red-300">🚧 خارج الجدار: وحدة تتجاوز نهاية جدارها (أو بدايته). قصّرها أو حرّكها داخله، أو أطل الجدار من «شكل المطبخ».</span>
              )}
              {cabinets.some((c) => fits[c.id] === 'OVERLAP') && (
                <span className="block text-[9px] leading-snug rounded p-1 border text-red-800 bg-red-50 border-red-200">🔴 وحدات متداخلة: الأحمر يعني أن وحدة تأخذ مكان أخرى. حرّكها أو اضغط «ترتيب تلقائي».</span>
              )}
              {layoutNotice && <span className="block text-[9px] leading-snug rounded p-1 border text-amber-900 bg-amber-50 border-amber-300">{layoutNotice}</span>}
              <span className="block text-[9px] text-slate-500">الإطار الأخضر: وحدة ملاصقة لجارتها. الأحمر: تداخل.</span>
              {cabinets.length === 0 && <span className="text-[10px] text-slate-400 block">لا توجد وحدات بعد.</span>}
              {listRows.map((row) => row.kind === 'group' ? (
                <div key={row.groupId} className="border border-indigo-200 bg-indigo-50/40 rounded p-1 text-[10px] space-y-1">
                  <div className="flex items-center justify-between gap-1">
                    <div className="min-w-0">
                      <div className="font-bold truncate" title={row.name}>📐 {row.name}</div>
                      <div className="text-slate-500 font-mono" style={{ direction: 'ltr', textAlign: 'right' }}>{row.cabs.length} boxes · {row.cabs[0].category === 'WALL_UNIT' ? 'wall' : 'base'} · {row.cabs.reduce((s, x) => s + x.calculatedCostDA, 0).toLocaleString('fr-DZ')} دج</div>
                    </div>
                    <button type="button" onClick={() => handleDeleteFromList(row.cabs[0].id)} title="حذف الزاوية كلها" className="px-1.5 py-0.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer">🗑</button>
                  </div>
                  {row.cabs.map((c) => (
                    <div key={c.id} onClick={() => setActiveCabinetId(c.id)} className={`flex items-center justify-between gap-1 border rounded px-1 py-0.5 cursor-pointer ${fitClass(c.id, c.id === editing?.id)}`}>
                      <span className="truncate" title={c.name}>{c.name.split(' — ')[1] ?? c.name} <span className="text-slate-400 font-mono">· {RUN_LABELS[runOf(c)]} · {c.width}</span></span>
                      <button type="button" onClick={(e) => { e.stopPropagation(); handleEditCabinet(c.id); }} title="تعديل" className="px-1 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer">✏️</button>
                    </div>
                  ))}
                </div>
              ) : (
                (() => { const c = row.cab; return (
                <div key={c.id} className={`flex items-center justify-between gap-1 border rounded p-1 text-[10px] ${fitClass(c.id, c.id === editing?.id, c.id === activeCabinetId)}`}>
                  <div className="min-w-0">
                    <div className="font-bold truncate" title={c.name}>{c.name}{layoutRuns.length > 1 || runOf(c) !== 'A' ? <span className="text-slate-400 font-normal"> · {RUN_LABELS[runOf(c)]}</span> : null}</div>
                    <div className="text-slate-500 font-mono" style={{ direction: 'ltr', textAlign: 'right' }}>{c.width}×{c.height}×{c.depth} · {frontSummary(c)} · {c.calculatedCostDA.toLocaleString('fr-DZ')} دج</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <div className="flex items-center gap-0.5" title="موضع الوحدة على جدارها (مم)" style={{ direction: 'ltr' }}>
                      <button type="button" onClick={() => nudgeCabinet(c.id, -MOVE_STEP_MM)} className="px-1 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer">◀</button>
                      <CommitNumber value={c.positionX} onCommit={(v) => setCabinetPosition(c.id, v)} />
                      <button type="button" onClick={() => nudgeCabinet(c.id, MOVE_STEP_MM)} className="px-1 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer">▶</button>
                    </div>
                    {layoutRuns.length > 1 && (
                      <select value={runOf(c)} onChange={(e) => moveToRun(c.id, e.target.value as RunId)} title="الجدار" className="border bg-white rounded p-0.5 text-[10px]">
                        {layoutRuns.map((r) => (<option key={r} value={r}>{r}</option>))}
                      </select>
                    )}
                    <button type="button" onClick={() => handleEditCabinet(c.id)} title="تعديل" className="px-1.5 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-100 cursor-pointer">✏️</button>
                    <button type="button" onClick={() => handleDeleteFromList(c.id)} title="حذف" className="px-1.5 py-0.5 rounded border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 cursor-pointer">🗑</button>
                  </div>
                </div>
                ); })()
              ))}
            </div>
    </>
  );
}
