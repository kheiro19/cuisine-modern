// The cabinet-form section of the control panel: the family and starting point, the L-corner builder and its
// three dimensions, what the cabinet stands on, and its back. Presentational — App owns the draft and the corner.
import type { Dispatch, SetStateAction } from 'react';
import type { CabinetDraft, CabinetSubtype } from '../../math/cabinetPresets';
import { resolveDraft, SUBTYPE_PRESETS } from '../../math/cabinetPresets';
import type { CabinetBase, CabinetObject } from '../../types/flatma';
import type { baseOf } from '../../math/base';
import type { CornerGroupDims, CornerRole } from '../../math/lCorner';
import { CORNER_ROLE_LABELS, L_CORNER_LIMITS, cornerFitsWalls, cornerGroupSpan, lCornerSpan } from '../../math/lCorner';
import { cornerDeckPieceOf } from '../../math/cornerDeck';
import { clampInt } from '../../math/utils';
import { wallLengthOf } from '../../math/kitchenLayout';
import { BACK, LIMITS } from '../../math/constants';
import type { BaseType } from '../../types/flatma';
import { BASE_TYPE_LABELS } from '../../math/base';
import { BACK_PANEL_LABELS, BACK_PANEL_MODES, backPanelModeOf, backRailDepthOf } from '../../math/backPanel';
import type { BackPanelMode } from '../../math/backPanel';
import { FAMILIES, FAMILY_ORDER, templatesOf } from '../../rules';
import type { FamilyId } from '../../rules';
import { BASE } from '../../math/constants';
import type { KitchenLayout } from '../../math/kitchenLayout';
import type { InjectedWoodMaterial } from '../../types/flatma';

export interface CabinetFormPanelProps {
  draft: CabinetDraft;
  resolved: ReturnType<typeof resolveDraft>;
  family: FamilyId;
  onFamilyChange: (f: FamilyId) => void;
  onSubtypeChange: (s: CabinetSubtype) => void;
  isCornerBuilder: boolean;
  editing: CabinetObject | null;
  editingCornerRole: CornerRole | null;
  cornerDims: CornerGroupDims | null;
  setCornerDims: Dispatch<SetStateAction<CornerGroupDims | null>>;
  armA: number;
  setArmA: Dispatch<SetStateAction<number>>;
  armB: number;
  setArmB: Dispatch<SetStateAction<number>>;
  cornerWall: 'B' | 'C' | undefined;
  setCornerWall: Dispatch<SetStateAction<'B' | 'C'>>;
  cornerWallList: Array<'B' | 'C'>;
  cornerTaken: (wall: 'B' | 'C') => boolean;
  cornerDepth: number;
  cornerArm: (v: number) => number;
  cornerDimKeyOf: (role: CornerRole) => keyof Omit<CornerGroupDims, 'wall'>;
  layout: KitchenLayout;
  baseNow: ReturnType<typeof baseOf>;
  setBase: (fields: Partial<CabinetBase>) => void;
  setBaseType: (v: string) => void;
  onApplyBaseToAll: () => void;
  onApplyBackToAll: () => void;
  patchDraft: (fields: Partial<CabinetDraft>) => void;
  normalizeDraft: () => void;
  numOrUndef: (v: string) => number | undefined;
  woods: InjectedWoodMaterial[];
  cabinets: CabinetObject[];
}

export default function CabinetFormPanel(props: CabinetFormPanelProps) {
  const { draft, resolved, family, isCornerBuilder, editing, editingCornerRole, cornerDims, armA, armB, cornerWall, cornerWallList, cornerDepth, layout, baseNow, woods, cabinets } = props;
  const handleFamilyChange = props.onFamilyChange, handleSubtypeChange = props.onSubtypeChange;
  const { setCornerDims, setArmA, setArmB, setCornerWall, cornerTaken, cornerArm, cornerDimKeyOf } = props;
  const { setBase, setBaseType, patchDraft, normalizeDraft, numOrUndef } = props;
  const applyBaseToAll = props.onApplyBaseToAll, applyBackToAll = props.onApplyBackToAll;
  return (
    <>
            {/* العائلة (4 أنواع) ثم قالب جاهز اختياري: القالب يضبط الخزانة الحقيقية فقط، وكل شيء بعده قابل للتعديل */}
            <div className="space-y-1">
              <div className="grid grid-cols-3 gap-1">
                {FAMILY_ORDER.map((f) => (
                  <button key={f} type="button" onClick={() => handleFamilyChange(f)} className={`rounded-md border p-1.5 text-[11px] font-bold cursor-pointer ${family === f ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{FAMILIES[f].label}</button>
                ))}
              </div>
              <select value={resolved.subtype} onChange={(e) => handleSubtypeChange(e.target.value as CabinetSubtype)} className="w-full border bg-white rounded-md p-1.5 font-medium text-xs focus:outline-none">
                {templatesOf(family).map((s) => (
                  <option key={s} value={s}>{SUBTYPE_PRESETS[s].label}</option>
                ))}
              </select>
            </div>

            {/* زاوية L: ذراعان على جدارين. الأبعاد والأقسام تُحدَّد هنا لا من الاستمارة */}
            {isCornerBuilder && (
              <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 space-y-1.5">
                <span className="font-bold text-[11px] block">📐 زاوية L: ذراعان على جدارين</span>
                {cornerWallList.length === 0 ? (
                  <span className="block text-[10px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded p-1">هذه الزاوية تحتاج مطبخاً بجدارين. اختر «شكل L» أو «شكل U» من لوحة «شكل المطبخ» أعلاه.</span>
                ) : (
                  <>
                    {cornerWallList.length === 2 && (
                      <div className="grid grid-cols-2 gap-1">
                        {cornerWallList.map((w) => (
                          <button key={w} type="button" onClick={() => setCornerWall(w)} className={`rounded-md border p-1 text-[10px] font-bold cursor-pointer ${cornerWall === w ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>
                            زاوية {w === 'B' ? 'اليسار' : 'اليمين'}{cornerTaken(w) ? ' ✓' : ''}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-1 text-[10px]">
                      <label className="flex items-center justify-between gap-1"><span>عرض الذراع الخلفي</span>
                        <input type="number" min={L_CORNER_LIMITS.ARM_MM[0]} max={L_CORNER_LIMITS.ARM_MM[1]} step={50} value={armA} onChange={(e) => setArmA(Number(e.target.value))} onBlur={() => setArmA(cornerArm(armA))} className="w-14 px-1 py-0.5 border border-slate-300 rounded font-mono text-center" style={{ direction: 'ltr' }} /></label>
                      <label className="flex items-center justify-between gap-1"><span>عرض الذراع الجانبي</span>
                        <input type="number" min={L_CORNER_LIMITS.ARM_MM[0]} max={L_CORNER_LIMITS.ARM_MM[1]} step={50} value={armB} onChange={(e) => setArmB(Number(e.target.value))} onBlur={() => setArmB(cornerArm(armB))} className="w-14 px-1 py-0.5 border border-slate-300 rounded font-mono text-center" style={{ direction: 'ltr' }} /></label>
                    </div>
                    <span className="block text-[9px] text-slate-500" style={{ direction: 'ltr', textAlign: 'right' }}>
                      {(() => { const sp = lCornerSpan({ depthMm: cornerDepth, armAMm: cornerArm(armA), armBMm: cornerArm(armB) }); return `${sp.alongA} × ${sp.alongSide} mm · ${cornerDepth}`; })()}
                    </span>
                    <span className="block text-[9px] leading-snug text-emerald-800 bg-emerald-50 border border-emerald-200 rounded p-1">
                      {(() => {
                        // The three boxes stand on ONE board, cut in an L (math/cornerDeck.ts): the panel says what the shop will cut.
                        const board = woods.find((w) => w.id === resolved.carcaseMaterialId)?.thickness ?? 18;
                        const p = cornerDeckPieceOf({ depthMm: cornerDepth, armAMm: cornerArm(armA), armBMm: cornerArm(armB), boardMm: board });
                        return `🟩 قاعدة واحدة L بين الصناديق الثلاثة: ${p.spanXMm}×${p.spanYMm} خارجياً، عرض الرجل ${p.legsMm}، من لوح ${board} مم — تُقصّ قطعة واحدة ويبقى مربع ${p.cutOutXMm}×${p.cutOutYMm} قصاصة.`;
                      })()}
                    </span>
                    {cornerWall && cornerTaken(cornerWall) && (
                      <span className="block text-[9px] leading-snug rounded p-1 border text-amber-800 bg-amber-50 border-amber-200">توجد زاوية من هذا المستوى على هذا الجدار. احذفها أولاً لتغيير مقاساتها.</span>
                    )}
                    {layout.type === 'U' && layout.widthMm < 2 * lCornerSpan({ depthMm: cornerDepth, armAMm: cornerArm(armA), armBMm: cornerArm(armB) }).alongA && (
                      <span className="block text-[9px] leading-snug rounded p-1 border text-amber-800 bg-amber-50 border-amber-200">⚠️ الجدار الخلفي أقصر من زاويتين معاً: ستتداخل الزاويتان.</span>
                    )}
                  </>
                )}
              </div>
            )}

            {/* مقاسات الزاوية: ثلاثة أرقام، كلها قابلة للتعديل في أي وقت — والمربع والذراعان يتحركون معاً */}
            {editing && cornerDims && editingCornerRole && (() => {
              const role = editingCornerRole;
              const mine = cornerDimKeyOf(role);
              // The box in the form shows its OWN number from the header (they are one edit); the other two from the panel.
              const valueOf = (k: keyof Omit<CornerGroupDims, 'wall'>) => (k === mine ? Math.round(resolved[k === 'depthMm' ? 'depth' : 'width']) : cornerDims[k]);
              const set = (k: keyof Omit<CornerGroupDims, 'wall'>, v: number) => {
                const n = k === 'depthMm' ? clampInt(v, L_CORNER_LIMITS.ARM_MM[0], L_CORNER_LIMITS.ARM_MM[1], cornerDims[k]) : cornerArm(v);
                setCornerDims({ ...cornerDims, [k]: n });
                if (k === mine) patchDraft(k === 'depthMm' ? { depth: n, width: role === 'SQUARE' ? n : draft.width } : { width: n });
                if (k === 'depthMm' && role !== 'SQUARE') patchDraft({ depth: n });
              };
              const shown: CornerGroupDims = { ...cornerDims, [mine]: valueOf(mine) };
              const span = cornerGroupSpan(shown);
              const backWall = wallLengthOf(layout, 'A');
              const sideWall = wallLengthOf(layout, cornerDims.wall);
              const fits = cornerFitsWalls(span, backWall, sideWall);
              const num = "w-16 px-1 py-0.5 border rounded font-mono text-center text-[11px]" + (fits ? " border-indigo-300" : " border-red-400 bg-red-50");
              return (
                <div className="rounded border border-indigo-300 bg-indigo-50 p-1.5 space-y-1" data-testid="corner-dims">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold text-indigo-900">📐 مقاسات الزاوية</span>
                    <span className="text-[9px] text-indigo-700">{CORNER_ROLE_LABELS[role]} هي المفتوحة الآن</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="flex items-center gap-1 text-[10px] font-bold text-indigo-900" title="ضلع المربع = عمق كل صناديق الزاوية">
                      <span>المربع</span>
                      <input type="number" min={L_CORNER_LIMITS.ARM_MM[0]} max={L_CORNER_LIMITS.ARM_MM[1]} step={10} aria-label="مربع الزاوية (مم)" value={shown.depthMm}
                        onChange={(e) => set('depthMm', Number(e.target.value))} onBlur={() => set('depthMm', shown.depthMm)} className={num} style={{ direction: 'ltr' }} />
                      <span className="text-[9px]">مم</span>
                    </label>
                    <label className="flex items-center gap-1 text-[10px] font-bold text-indigo-900" title="عرض الذراع على الجدار الخلفي (عرض بابه)">
                      <span>الذراع الخلفي</span>
                      <input type="number" min={L_CORNER_LIMITS.ARM_MM[0]} max={L_CORNER_LIMITS.ARM_MM[1]} step={10} aria-label="عرض الذراع الخلفي (مم)" value={shown.armAMm}
                        onChange={(e) => set('armAMm', Number(e.target.value))} onBlur={() => set('armAMm', shown.armAMm)} className={num} style={{ direction: 'ltr' }} />
                      <span className="text-[9px]">مم</span>
                    </label>
                    <label className="flex items-center gap-1 text-[10px] font-bold text-indigo-900" title="عرض الذراع على الجدار الجانبي (عرض بابه)">
                      <span>الذراع الجانبي</span>
                      <input type="number" min={L_CORNER_LIMITS.ARM_MM[0]} max={L_CORNER_LIMITS.ARM_MM[1]} step={10} aria-label="عرض الذراع الجانبي (مم)" value={shown.armBMm}
                        onChange={(e) => set('armBMm', Number(e.target.value))} onBlur={() => set('armBMm', shown.armBMm)} className={num} style={{ direction: 'ltr' }} />
                      <span className="text-[9px]">مم</span>
                    </label>
                  </div>
                  <span className={fits ? "block text-[9px] leading-snug text-indigo-800" : "block text-[9px] leading-snug font-bold text-red-700"}>
                    {fits
                      ? `يحتاج ${Math.round(span.alongA)} مم على الجدار الخلفي (المتاح ${Math.round(backWall)}) و${Math.round(span.alongSide)} مم على الجانبي (المتاح ${Math.round(sideWall)}). المربع والذراعان صناديق ثلاثة تتحرك معاً بخزنة واحدة.`
                      : `⚠️ لا يدخل: ${Math.round(span.alongA)} / ${Math.round(backWall)} مم على الخلفي و${Math.round(span.alongSide)} / ${Math.round(sideWall)} مم على الجانبي. قلّل المربع أو أحد الذراعين.`}
                  </span>
                  <span className="block text-[9px] leading-snug text-indigo-700">العرض في الأعلى (W) هو رقم هذا الصندوق نفسه: تعديله هنا وتعديله هناك شيء واحد.</span>
                </div>
              );
            })()}
            <div className={isCornerBuilder ? 'hidden' : 'contents'}>
            <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-50 p-1.5 rounded border" style={{ direction: 'ltr' }}>
              <div>W:<input type="number" aria-label="العرض" min={LIMITS.WIDTH_MM[0]} max={LIMITS.WIDTH_MM[1]} value={draft.width} onChange={(e) => patchDraft({ width: Number(e.target.value) })} onBlur={normalizeDraft} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
              <div>H:<input type="number" aria-label="الارتفاع" min={LIMITS.HEIGHT_MM[0]} max={LIMITS.HEIGHT_MM[1]} value={draft.height} onChange={(e) => patchDraft({ height: Number(e.target.value) })} onBlur={normalizeDraft} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
              <div>D:<input type="number" aria-label="العمق" min={LIMITS.DEPTH_MM[0]} max={LIMITS.DEPTH_MM[1]} value={draft.depth} onChange={(e) => patchDraft({ depth: Number(e.target.value) })} onBlur={normalizeDraft} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
            </div>
            </div>

            {/* القاعدة: أرجل أو وزرة أو قاعدة خشبية تحت الخزانة السفلية. الارتفاع الكلي ثابت: القاعدة تُؤخذ منه */}
            {resolved.category === 'BASE_UNIT' && (
              <div className="space-y-1.5 bg-slate-50 p-1.5 rounded border">
                <div className="flex items-center justify-between gap-1">
                  <span className="font-bold text-[10px]">🦶 القاعدة (الأرجل / الوزرة / قاعدة خشبية)</span>
                  <select value={draft.base?.type ?? 'LEGACY'} onChange={(e) => setBaseType(e.target.value)} className="border bg-white rounded p-0.5 text-[11px]">
                    {!draft.base && <option value="LEGACY">كما كانت (4 أرجل بلا رسم)</option>}
                    {(['NONE', 'LEGS', 'PLINTH', 'WOOD'] as BaseType[]).map((t) => (<option key={t} value={t}>{BASE_TYPE_LABELS[t]}</option>))}
                  </select>
                </div>
                {draft.base && draft.base.type !== 'NONE' && (
                  <div className="grid grid-cols-2 gap-1 text-[10px]">
                    <label className="flex items-center justify-between gap-1"><span>ارتفاع القاعدة (مم)</span>
                      <input type="number" min={BASE.HEIGHT_MM[0]} max={BASE.HEIGHT_MM[1]} step={10} value={draft.base.heightMm ?? ''} placeholder={String(baseNow.heightMm || BASE.DEFAULT_HEIGHT_MM)}
                        onChange={(e) => setBase({ heightMm: numOrUndef(e.target.value) })} className="w-14 px-1 py-0.5 border border-slate-300 rounded font-mono text-center" style={{ direction: 'ltr' }} /></label>
                    {(draft.base.type === 'LEGS' || draft.base.type === 'PLINTH') && (
                      <label className="flex items-center justify-between gap-1"><span>عدد الأرجل</span>
                        <select value={draft.base.legCount ?? 0} onChange={(e) => setBase({ legCount: Number(e.target.value) || undefined })} className="border bg-white rounded p-0.5 text-[11px]">
                          <option value={0}>{`تلقائي (${baseNow.legCountAuto ? baseNow.legCount : resolved.width > BASE.LEGS_WIDE_ABOVE_MM ? BASE.LEGS_AUTO_WIDE : BASE.LEGS_AUTO})`}</option>
                          {Array.from({ length: BASE.LEGS_RANGE[1] - BASE.LEGS_RANGE[0] + 1 }, (_, k) => BASE.LEGS_RANGE[0] + k).map((n) => (<option key={n} value={n}>{n}</option>))}
                        </select></label>
                    )}
                    {(draft.base.type === 'PLINTH' || draft.base.type === 'WOOD') && (
                      <label className="flex items-center justify-between gap-1"><span>ارتداد الأمام (مم)</span>
                        <input type="number" min={BASE.FRONT_SETBACK_MM[0]} max={BASE.FRONT_SETBACK_MM[1]} step={5} value={draft.base.frontSetbackMm ?? ''} placeholder={String(baseNow.frontSetbackMm || BASE.DEFAULT_PLINTH_SETBACK_MM)}
                          onChange={(e) => setBase({ frontSetbackMm: numOrUndef(e.target.value) })} className="w-14 px-1 py-0.5 border border-slate-300 rounded font-mono text-center" style={{ direction: 'ltr' }} /></label>
                    )}
                    {draft.base.type === 'WOOD' && (
                      <label className="flex items-center justify-between gap-1"><span>ارتداد الخلف (مم)</span>
                        <input type="number" min={BASE.BACK_SETBACK_MM[0]} max={BASE.BACK_SETBACK_MM[1]} step={5} value={draft.base.backSetbackMm ?? ''} placeholder={String(BASE.DEFAULT_WOOD_BACK_SETBACK_MM)}
                          onChange={(e) => setBase({ backSetbackMm: numOrUndef(e.target.value) })} className="w-14 px-1 py-0.5 border border-slate-300 rounded font-mono text-center" style={{ direction: 'ltr' }} /></label>
                    )}
                    {draft.base.type === 'PLINTH' && (
                      <label className="col-span-2 flex items-center justify-between gap-1"><span>مادة الوزرة</span>
                        <select value={draft.base.plinthMaterial ?? 'PVC'} onChange={(e) => setBase({ plinthMaterial: e.target.value as 'PVC' | 'BOARD' })} className="border bg-white rounded p-0.5 text-[11px]">
                          <option value="PVC">PVC من المخزن (مع مطاط)</option>
                          <option value="BOARD">لوح من خامة الهيكل</option>
                        </select></label>
                    )}
                  </div>
                )}
                {draft.base && baseNow.ignored && (
                  <span className="block text-[9px] leading-snug rounded p-1 border text-amber-800 bg-amber-50 border-amber-200">
                    {baseNow.ignored === 'APPLIANCE_BAY' && 'الجهاز يقف على أرجله الخاصة، فلا تُطبَّق قاعدة تحت هذه الخزانة.'}
                    {baseNow.ignored === 'TOO_LOW' && 'الخزانة قصيرة جداً: لا تتسع لقاعدة (يبقى للجسم 10 سم على الأقل).'}
                  </span>
                )}
                <span className="block text-[9px] text-slate-500" style={{ direction: 'ltr', textAlign: 'right' }}>
                  {baseNow.legacy ? `${resolved.height} mm · legacy` : `${resolved.height} mm = base ${baseNow.heightMm} + body ${resolved.height - baseNow.heightMm}`}
                </span>
                {cabinets.some((c) => c.category === 'BASE_UNIT') && resolved.base && (
                  <button type="button" onClick={applyBaseToAll} title="يضع هذه القاعدة على كل الخزائن السفلية الموجودة في المطبخ" className="w-full rounded border border-slate-300 bg-white hover:bg-slate-100 text-[10px] font-bold py-0.5 cursor-pointer">⟲ تعميم على كل الخزائن السفلية</button>
                )}
              </div>
            )}

            {/* خلفية الخزانة: HDF أو عارضتان من لوح الهيكل أو لوح كامل مثل باقي قطع الهيكل (math/backPanel.ts) */}
            <div className="space-y-1 bg-slate-50 p-1.5 rounded border">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-[10px]">🧱 خلفية الخزانة</span>
                <span className="text-[9px] text-slate-500">{(draft.backPanel ?? 'HDF') === 'HDF' ? 'ملصوقة على الظهر' : (draft.backPanel ?? 'HDF') === 'RAILS' ? 'من لوح الهيكل' : 'داخل الظهر'}</span>
              </div>
              <div className="flex flex-wrap gap-1" role="group" aria-label="خلفية الخزانة">
                {BACK_PANEL_MODES.map((mode: BackPanelMode) => {
                  const on = backPanelModeOf(draft) === mode;
                  return (
                    <button key={mode} type="button" aria-pressed={on}
                      onClick={() => patchDraft({ backPanel: mode, ...(mode !== 'RAILS' ? { backRailDepthMm: undefined } : {}) })}
                      className={`px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer ${on ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'}`}>
                      {BACK_PANEL_LABELS[mode]}
                    </button>
                  );
                })}
              </div>
              {backPanelModeOf(draft) === 'RAILS' && (
                <label className="flex items-center justify-between gap-1 text-[10px]">
                  <span>عرض العارضة (مم)</span>
                  <input type="number" aria-label="عرض عارضة الخلفية (مم)" min={BACK.RAIL_DEPTH_RANGE_MM[0]} max={BACK.RAIL_DEPTH_RANGE_MM[1]} step={10}
                    value={draft.backRailDepthMm ?? ''} placeholder={String(BACK.RAIL_DEPTH_MM)}
                    onChange={(e) => patchDraft({ backRailDepthMm: numOrUndef(e.target.value) })} onBlur={normalizeDraft}
                    className="w-16 px-1 py-0.5 border border-slate-300 rounded font-mono text-center" style={{ direction: 'ltr' }} />
                </label>
              )}
              <span className="block text-[9px] leading-snug text-slate-600">
                {backPanelModeOf(draft) === 'HDF'
                  ? 'لوح HDF ٣ مم ملصوق على الوجه الخلفي، يغطّي الجزء المغلق فقط. الخيار الافتراضي: أخفّ وأرخص، ويُقصّ من لوح HDF.'
                  : backPanelModeOf(draft) === 'RAILS'
                    ? `عارضتان من لوح الهيكل (${backRailDepthOf(draft)} مم عرضاً): واحدة على لوح القاع وأخرى تحت السقف/العارضتين العلويتين. بلا ظهر — أعمق داخل وأرخص، لكن الغبار والسلك يظهران من الخلف.`
                    : 'لوح من خامة الهيكل بنفس سُمكه، مقصوص بين الجانبين وداخل الظهر: أقوى ظهر. يأكل سُمك اللوح من العمق الداخلي، فتقصر الأرفف والحواجز ولوحات المفصلات تلقائياً.'}
              </span>
              {cabinets.length > 0 && (
                <button type="button" onClick={applyBackToAll} title="يضع هذه الخلفية على كل خزائن المطبخ" className="w-full rounded border border-slate-300 bg-white hover:bg-slate-100 text-[10px] font-bold py-0.5 cursor-pointer">⟲ تعميم على كل الخزائن</button>
              )}
            </div>

    </>
  );
}
