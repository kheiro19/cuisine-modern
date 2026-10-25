// The kitchen-shape section of the control panel: straight / L / U, the wall lengths, the room height, the
// standard gap above the worktop, and the wall a new cabinet is added on. Presentational — App owns the layout.
import type { Dispatch, SetStateAction } from 'react';
import type { KitchenLayout, WallMountIssue } from '../../math/kitchenLayout';
import { DEPTH_LIMITS_MM, HEIGHT_LIMITS_MM, LAYOUT_LABELS, RUN_LABELS, WALL_GAP_LIMITS_MM, WIDTH_LIMITS_MM, DEFAULT_ROOM_HEIGHT_MM, DEFAULT_WALL_GAP_MM, DEFAULT_ROOM_DEPTH_MM } from '../../math/kitchenLayout';
import type { LayoutType } from '../../math/kitchenLayout';
import type { RunId } from '../../types/flatma';

export interface LayoutPanelProps {
  layout: KitchenLayout;
  rawLayout: KitchenLayout;
  onLayoutChange: (fields: Partial<KitchenLayout>) => void;
  wallIssues: WallMountIssue[];
  layoutRuns: RunId[];
  activeRun: RunId;
  setActiveRun: Dispatch<SetStateAction<RunId>>;
}

export default function LayoutPanel({ layout, rawLayout, onLayoutChange, wallIssues, layoutRuns, activeRun, setActiveRun }: LayoutPanelProps) {
  const handleLayoutChange = onLayoutChange;
  return (
    <>
            {/* 🏠 شكل المطبخ: مستقيم أو L أو U، والجدار الذي تُضاف عليه الخزانة، وخزانة الزاوية L الحقيقية */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 space-y-1.5">
              <span className="font-bold text-[11px] block">🏠 شكل المطبخ</span>
              <div className="grid grid-cols-3 gap-1">
                {(['STRAIGHT', 'L', 'U'] as LayoutType[]).map((t) => (
                  <button key={t} type="button" onClick={() => handleLayoutChange({ type: t })} className={`rounded-md border p-1.5 text-[11px] font-bold cursor-pointer ${layout.type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{LAYOUT_LABELS[t]}</button>
                ))}
              </div>
              <label className="flex items-center justify-between gap-2 text-[10px]">
                <span>{layout.type === 'STRAIGHT' ? 'طول الجدار (مم)' : 'طول الجدار الخلفي (مم)'}</span>
                <input type="number" min={WIDTH_LIMITS_MM[0]} max={WIDTH_LIMITS_MM[1]} step={100} value={rawLayout.widthMm}
                  onChange={(e) => handleLayoutChange({ widthMm: Number(e.target.value) })}
                  onBlur={() => handleLayoutChange({ widthMm: layout.widthMm })}
                  className="w-20 px-1 py-0.5 border border-slate-300 rounded text-[11px] font-mono text-center" style={{ direction: 'ltr' }} />
              </label>
              <label className="flex items-center justify-between gap-2 text-[10px]">
                <span>ارتفاع الغرفة (من الأرض إلى السقف، مم)</span>
                <input type="number" min={HEIGHT_LIMITS_MM[0]} max={HEIGHT_LIMITS_MM[1]} step={50} value={rawLayout.heightMm ?? DEFAULT_ROOM_HEIGHT_MM}
                  onChange={(e) => handleLayoutChange({ heightMm: Number(e.target.value) })}
                  onBlur={() => handleLayoutChange({ heightMm: layout.heightMm })}
                  className="w-20 px-1 py-0.5 border border-slate-300 rounded text-[11px] font-mono text-center" style={{ direction: 'ltr' }} />
              </label>
              <label className="flex items-center justify-between gap-2 text-[10px]">
                <span title="الفراغ القياسي بين سطح العمل وأسفل الخزائن العلوية؛ كل خزانة علوية تستطيع اختيار تعليقها الخاص من نموذجها">الفراغ القياسي فوق سطح العمل (مم)</span>
                <input type="number" min={WALL_GAP_LIMITS_MM[0]} max={WALL_GAP_LIMITS_MM[1]} step={10} value={rawLayout.wallGapMm ?? DEFAULT_WALL_GAP_MM}
                  onChange={(e) => handleLayoutChange({ wallGapMm: Number(e.target.value) })}
                  onBlur={() => handleLayoutChange({ wallGapMm: layout.wallGapMm })}
                  className="w-20 px-1 py-0.5 border border-slate-300 rounded text-[11px] font-mono text-center" style={{ direction: 'ltr' }} />
              </label>
              {wallIssues.length > 0 && (
                <ul className="space-y-0.5 text-[9px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded p-1">
                  {wallIssues.map((w) => (<li key={`${w.cabinetId}-${w.code}`}>⚠️ {w.message}</li>))}
                </ul>
              )}
              {layout.type !== 'STRAIGHT' && (
                <label className="flex items-center justify-between gap-2 text-[10px]">
                  <span>عمق الغرفة = طول الجدار الجانبي (مم)</span>
                  <input type="number" min={DEPTH_LIMITS_MM[0]} max={DEPTH_LIMITS_MM[1]} step={100} value={rawLayout.depthMm ?? DEFAULT_ROOM_DEPTH_MM}
                    onChange={(e) => handleLayoutChange({ depthMm: Number(e.target.value) })}
                    onBlur={() => handleLayoutChange({ depthMm: layout.depthMm })}
                    className="w-20 px-1 py-0.5 border border-slate-300 rounded text-[11px] font-mono text-center" style={{ direction: 'ltr' }} />
                </label>
              )}
              {layout.type === 'L' && (
                <div className="grid grid-cols-2 gap-1">
                  {(['LEFT', 'RIGHT'] as const).map((side) => (
                    <button key={side} type="button" onClick={() => handleLayoutChange({ lSide: side })} className={`rounded-md border p-1 text-[10px] font-bold cursor-pointer ${layout.lSide === side ? 'bg-indigo-100 border-indigo-400 text-indigo-900' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                      {side === 'LEFT' ? 'الجدار الجانبي على اليسار' : 'الجدار الجانبي على اليمين'}
                    </button>
                  ))}
                </div>
              )}
              {layoutRuns.length > 1 && (
                <div className="space-y-0.5">
                  <span className="text-[10px] text-slate-600 block">الجدار الذي تُضاف عليه الخزانة الجديدة:</span>
                  <div className={`grid gap-1 ${layoutRuns.length === 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                    {layoutRuns.map((r) => (
                      <button key={r} type="button" onClick={() => setActiveRun(r)} className={`rounded-md border p-1 text-[10px] font-bold cursor-pointer ${activeRun === r ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{RUN_LABELS[r]}</button>
                    ))}
                  </div>
                </div>
              )}
              {/* مخطط صغير: الجدران المستعملة بلون واضح، والزوايا نقاط برتقالية. لا يبني شيئاً، فقط يوضّح أن هذا مطبخ بزوايا. */}
              <div className="border-t border-indigo-100 pt-1.5 space-y-0.5">
                <svg viewBox="0 0 160 96" className="w-full h-20" role="img" aria-label="مخطط المطبخ">
                  {([['A', 20, 12, 140, 12], ['B', 20, 12, 20, 84], ['C', 140, 12, 140, 84]] as Array<[RunId, number, number, number, number]>).map(([r, x1, y1, x2, y2]) => {
                    const on = layoutRuns.includes(r);
                    return <line key={r} x1={x1} y1={y1} x2={x2} y2={y2} stroke={on ? '#4f46e5' : '#cbd5e1'} strokeWidth={on ? 5 : 2} strokeDasharray={on ? undefined : '4 3'} strokeLinecap="round" />;
                  })}
                  {layoutRuns.includes('B') && <circle cx={20} cy={12} r={6} fill="#f59e0b" />}
                  {layoutRuns.includes('C') && <circle cx={140} cy={12} r={6} fill="#f59e0b" />}
                  <text x={80} y={28} textAnchor="middle" fontSize={9} fill="#64748b">A</text>
                  <text x={32} y={52} textAnchor="middle" fontSize={9} fill="#64748b">B</text>
                  <text x={128} y={52} textAnchor="middle" fontSize={9} fill="#64748b">C</text>
                </svg>
                <span className="block text-[10px] leading-snug text-slate-600">
                  {layout.type === 'STRAIGHT' && 'جدار واحد: لا توجد زوايا.'}
                  {layout.type === 'L' && 'مطبخ L: جداران يلتقيان في زاوية واحدة (●). خزانة الزاوية تُضاف من أنواع الخزائن: «سفلية زاوية L» و«علوية زاوية L».'}
                  {layout.type === 'U' && 'مطبخ U: ثلاثة جدران وزاويتان (●). خزانتا الزاويتين تُضافان من أنواع الخزائن: «سفلية زاوية L» و«علوية زاوية L».'}
                </span>
              </div>
            </div>

    </>
  );
}
