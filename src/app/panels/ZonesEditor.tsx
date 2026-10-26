// The zones editor of the control panel: the stack of zones that IS the cabinet — kinds, fronts, the vertical
// board and the merged column, the wall hanging, the opening mode and Gola channels — plus the install action and
// the design issues under it. Presentational: App owns the draft, this panel edits it through callbacks.
import type { CabinetDraft, resolveDraft } from '../../math/cabinetPresets';
import type { priceCabinet } from '../../math/partsEngine';
import type { CabinetObject, CabinetZone, EdgeBandRoll, InjectedHardwareItem, InjectedWoodMaterial, ZoneKind } from '../../types/flatma';
import type { WallMountRef } from '../../math/kitchenLayout';
import React from 'react';
import { fitCabinetToAppliance, soleZoneGola } from '../../math/cabinetPresets';
import { libraryAppliances } from '../../math/applianceModels';
import { CORNER, LIMITS, PANEL } from '../../math/constants';
import { bandPricePerMeterDA } from '../../math/edgeBand';
import { clampCornerFillerMm } from '../../math/lCorner';
import { APPLIANCES, ZONE_LABELS, hingeSidesOf, isOpenCarcase, sharedHingeEdgesOf } from '../../math/zones';
import { OPEN_BAY_APPLIANCES } from '../../rules/appliances';
import { COLUMN_FILLS, FILL_LABELS, canSplitZone, suggestFill } from '../../math/columns';
import { KINEMATICS, canUseGola } from '../../rules';
import type { KinematicId, KinematicSpec } from '../../rules';
import { wallBottomMmOf } from '../../math/kitchenLayout';
import type { ApplianceKind, ColumnFillChoice, OpeningMode } from '../../types/flatma';


const ZONE_KINDS: ZoneKind[] = ['DOORS', 'DRAWERS', 'OPEN', 'APPLIANCE', 'APRON'];

/** A zone of another kind starts from sensible values (an appliance zone from the appliance's own niche height). */
const zoneOfKind = (kind: ZoneKind, previous: CabinetZone): CabinetZone => {
  // What the zone chose for its own fronts (sheet, band roll, opening mode) survives a change of kind; resolveDraft drops what the new kind cannot use.
  const own: Partial<CabinetZone> = {
    ...(previous.frontMaterialId ? { frontMaterialId: previous.frontMaterialId } : {}),
    ...(previous.frontEdgeRollId ? { frontEdgeRollId: previous.frontEdgeRollId } : {}),
    ...(previous.openingMode ? { openingMode: previous.openingMode } : {}),
    ...(previous.grainDirection ? { grainDirection: previous.grainDirection } : {}),
    ...(previous.grainFlip ? { grainFlip: true } : {}),
  };
  if (kind === 'DOORS') return { kind, count: previous.count ?? 2, shelves: 0, ...own };
  if (kind === 'DRAWERS') return { kind, count: previous.count ?? 2, ...own };
  if (kind === 'OPEN') return { kind, shelves: 2 };
  if (kind === 'APPLIANCE') return { kind, appliance: 'OVEN', heightMm: APPLIANCES.OVEN.nicheHeightMm };
  return { kind: 'APRON', heightMm: 150, ...own };
};

const FRONT_COUNT_OPTIONS = Array.from(
  { length: LIMITS.FRONT_ELEMENTS[1] - LIMITS.FRONT_ELEMENTS[0] + 1 },
  (_, i) => LIMITS.FRONT_ELEMENTS[0] + i,
);

export interface ZonesEditorProps {
  draft: CabinetDraft;
  resolved: ReturnType<typeof resolveDraft>;
  previewPricing: ReturnType<typeof priceCabinet>;
  isCornerBuilder: boolean;
  editing: CabinetObject | null;
  woods: InjectedWoodMaterial[];
  edgeRolls: EdgeBandRoll[];
  doorOptions: InjectedHardwareItem[];
  drawerOptions: InjectedHardwareItem[];
  hasDoorZone: boolean;
  hasDrawerZone: boolean;
  isLift: boolean;
  golaAllowed: boolean;
  designIssues: ReturnType<typeof priceCabinet>['issues'];
  blockingIssues: ReturnType<typeof priceCabinet>['issues'];
  canSave: boolean;
  canAddNow: boolean;
  wallRef: WallMountRef;
  cornerWall: 'B' | 'C' | undefined;
  cornerFillerMm: number | undefined;
  cornerFillerSides: Array<'LEFT' | 'RIGHT'> | undefined;
  setCornerFillerMm: (f: number | undefined) => void;
  setCornerFillerSides: (s: Array<'LEFT' | 'RIGHT'> | undefined) => void;
  onCancelEdit: () => void;
  patchDraft: (fields: Partial<CabinetDraft>) => void;
  normalizeDraft: () => void;
  baseZones: () => CabinetZone[];
  updateZone: (i: number, fields: Partial<CabinetZone>) => void;
  replaceZone: (i: number, zone: CabinetZone) => void;
  addZone: () => void;
  moveZone: (i: number, delta: number) => void;
  removeZone: (i: number) => void;
  onSaveCabinet: () => void;
  onExportFactoryBOM: () => void;
  onPrintCustomerInvoice: () => void;
}

export default function ZonesEditor(props: ZonesEditorProps) {
  const { draft, resolved, previewPricing, isCornerBuilder, editing, woods, edgeRolls, doorOptions, drawerOptions, hasDoorZone, hasDrawerZone, isLift, golaAllowed, designIssues, blockingIssues, canSave, canAddNow, wallRef, cornerWall } = props;
  const { patchDraft, normalizeDraft, baseZones, updateZone, replaceZone, addZone, moveZone, removeZone, cornerFillerMm, cornerFillerSides, setCornerFillerMm, setCornerFillerSides, onCancelEdit } = props;
  const handleSaveCabinet = props.onSaveCabinet, handleExportFactoryBOM = props.onExportFactoryBOM, handlePrintCustomerInvoice = props.onPrintCustomerInvoice;
  return (
    <>
            {/* الأقسام: كل خزانة = كومة أقسام من الأسفل للأعلى، تُعرض هنا من الأعلى للأسفل */}
            <div className="space-y-1.5 bg-slate-50 p-1.5 rounded border">
              {editing?.cornerSide && (() => {
                // The FIXED filler panels of a corner box (math/cornerFiller.ts): the corner side (what makes a drawer pass beside
                // the neighbour's closed door) and/or the far side, for looks alone. Both are INSIDE the box: nothing on the wall moves.
                const frontThMm = woods.find((m) => m.id === resolved.frontMaterialId)?.thickness ?? (editing.frontThickness || 18);
                const boxWidth = Math.round((editing.width - (editing.cornerExtensionMm ?? 0)) * 10) / 10;
                const clamp = (v: number) => clampCornerFillerMm(v, frontThMm);
                const autoCorner = Math.round((frontThMm + CORNER.DRAWER_CLEARANCE_MM) * 10) / 10;
                const autoLook = frontThMm;
                const chosen = cornerFillerMm;
                const sides = cornerFillerSides;                       // undefined = automatic
                const on = (side: 'LEFT' | 'RIGHT') => (sides ? sides.includes(side) : side === editing.cornerSide);
                const widthOn = (side: 'LEFT' | 'RIGHT') => (on(side) ? clamp(chosen ?? (side === editing.cornerSide ? autoCorner : autoLook)) : 0);
                const toggle = (side: 'LEFT' | 'RIGHT') => {
                  const base: Array<'LEFT' | 'RIGHT'> = sides ? [...sides] : (editing.cornerSide ? [editing.cornerSide] : []);
                  setCornerFillerSides(base.includes(side) ? base.filter((x) => x !== side) : [...base, side]);
                };
                const setPreset = (value: 'AUTO' | 'NONE' | 'LEFT' | 'RIGHT' | 'BOTH') => {
                  if (value === 'AUTO') return setCornerFillerSides(undefined);
                  if (value === 'NONE') return setCornerFillerSides([]);
                  if (value === 'BOTH') return setCornerFillerSides(['LEFT', 'RIGHT']);
                  setCornerFillerSides([value]);
                };
                const sidesKey = sides === undefined ? 'AUTO' : sides.length === 0 ? 'NONE' : sides.length === 2 ? 'BOTH' : sides[0];
                const anyPanel = on('LEFT') || on('RIGHT');
                // the front spans from the left panel edge to the right one; the 0.5 outer reveal only where no panel stands
        const frontMm = Math.round((Math.min(boxWidth - 0.5, boxWidth - widthOn('RIGHT')) - Math.max(0.5, widthOn('LEFT'))) * 10) / 10;
                const btn = (active: boolean) => `px-1.5 py-0.5 rounded border text-[9px] font-bold cursor-pointer ${active ? 'bg-amber-600 text-white border-amber-600' : 'bg-white text-amber-900 border-amber-300 hover:bg-amber-100'}`;
                return (
                  <div className="rounded border border-amber-300 bg-amber-50 p-1.5 space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-amber-900">ضلفة الزاوية الثابتة</span>
                      <span className="text-[9px] text-amber-700">جهة الزاوية: {editing.cornerSide === 'LEFT' ? 'يسار' : 'يمين'}</span>
                    </div>
                    <div className="flex flex-wrap gap-1" role="group" aria-label="جهات ضلفة الزاوية">
                      {([['AUTO', 'تلقائي'], ['NONE', 'بلا ضلفة'], ['LEFT', 'اليسرى'], ['RIGHT', 'اليمنى'], ['BOTH', 'الجهتان']] as const).map(([value, label]) => (
                        <button key={value} type="button" onClick={() => setPreset(value)} className={btn(sidesKey === value)} aria-pressed={sidesKey === value}>{label}</button>
                      ))}
                    </div>
                    {sides !== undefined && (
                      <div className="flex flex-wrap gap-1">
                        <button type="button" onClick={() => toggle('LEFT')} className={btn(on('LEFT'))} aria-pressed={on('LEFT')}>ضلفة يسرى</button>
                        <button type="button" onClick={() => toggle('RIGHT')} className={btn(on('RIGHT'))} aria-pressed={on('RIGHT')}>ضلفة يمنى</button>
                      </div>
                    )}
                    <label className="flex items-center gap-1 text-[10px] font-bold text-amber-900" title="ضلفة ثابتة من أسفل الهيكل إلى أعلاه، بسُمك الواجهات ومادتها، تُقتطع من عرض الذراع">
                      <span>العرض (مم)</span>
                      <input
                        type="number" min={frontThMm} max={CORNER.FILLER_MAX_MM} step={0.5} aria-label="ضلفة الزاوية الثابتة (مم)"
                        value={chosen ?? ''} placeholder={`تلقائي ${autoCorner}`} disabled={!anyPanel}
                        onChange={(e) => setCornerFillerMm(e.target.value === '' ? undefined : clamp(Number(e.target.value) || 0))}
                        className="w-16 px-1 py-0.5 border border-amber-300 rounded font-mono text-center text-[11px] disabled:opacity-40"
                        style={{ direction: 'ltr' }}
                      />
                      <button type="button" onClick={() => setCornerFillerMm(undefined)} className="px-1 rounded border border-amber-300 bg-white text-[9px] text-amber-800 hover:bg-amber-100 cursor-pointer">تلقائي</button>
                    </label>
                    <span className="block text-[9px] leading-snug text-amber-800">
                      {anyPanel
                        ? `اليسرى ${widthOn('LEFT')} · اليمنى ${widthOn('RIGHT')} مم من عرض ${boxWidth} ⇒ الواجهة ${frontMm} مم. العرض من ${frontThMm} (سُمك الباب المواجه) إلى ${CORNER.FILLER_MAX_MM} مم.`
                        : `بلا ضلفة: الواجهة تستعمل عرض الذراع كاملاً (${boxWidth} مم). اضغط «اليسرى» أو «اليمنى» أو «الجهتان» لإضافة ضلفة ثابتة.`}
                    </span>
                  </div>
                );
              })()}              <div className={isCornerBuilder ? 'hidden' : 'contents'}>
              <div className="flex items-center justify-between">
                <span className="font-bold text-[10px]">الأقسام (من الأعلى للأسفل):</span>
                <button type="button" onClick={addZone} disabled={resolved.zones.length >= LIMITS.ZONES[1]} className="px-2 py-0.5 rounded border border-indigo-300 bg-white text-indigo-700 text-[10px] font-bold hover:bg-indigo-50 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed">➕ قسم</button>
              </div>

              {resolved.zones.map((z, i) => ({ z, i })).reverse().map(({ z, i }) => {
                const band = previewPricing.model.layout.bands[i];
                const raw = baseZones()[i];
                return (
                  <div key={i} className="bg-white border rounded p-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <select aria-label="نوع القسم" value={z.kind} onChange={(e) => replaceZone(i, zoneOfKind(e.target.value as ZoneKind, z))} className="border bg-white rounded p-0.5 text-[11px] font-bold">
                        {ZONE_KINDS.map((k) => (
                          <option key={k} value={k} disabled={k === 'DRAWERS' && resolved.category === 'WALL_UNIT'}>{ZONE_LABELS[k]}</option>
                        ))}
                      </select>
                      {(z.kind === 'DOORS' || z.kind === 'DRAWERS') && (
                        <label className="flex items-center gap-1 text-[10px] font-bold">
                          {z.kind === 'DOORS' ? 'عدد الأبواب' : 'عدد الأدراج'}
                          <select value={z.count ?? 1} onChange={(e) => updateZone(i, { count: Number(e.target.value) })} className="border bg-white rounded p-0.5 text-[11px]" style={{ direction: 'ltr' }}>
                            {FRONT_COUNT_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
                          </select>
                        </label>
                      )}
                      {z.kind === 'DOORS' && !z.split && (
                        <label className="flex items-center gap-1 text-[10px] font-bold" title="المفصلات على أي جهة من الباب؛ الباب يُفتح من الجهة المقابلة">
                          المفصلات (كل الأبواب)
                          <select value={z.hingeSide ?? 'AUTO'} onChange={(e) => updateZone(i, { hingeSide: e.target.value === 'AUTO' ? undefined : (e.target.value as 'LEFT' | 'RIGHT') })} className="border bg-white rounded p-0.5 text-[11px]">
                            <option value="AUTO">تلقائي</option>
                            <option value="LEFT">يسار</option>
                            <option value="RIGHT">يمين</option>
                          </select>
                        </label>
                      )}
                      {z.kind === 'DOORS' && !z.split && (z.count ?? 1) >= 1 && (() => {
                        const n = Math.max(1, Math.round(z.count ?? 1));
                        const effective = hingeSidesOf(n, z.hingeSide); // what AUTO means here: the zone's side, else alternating
                        const chosen = hingeSidesOf(n, z.hingeSide, z.hingeSides);
                        const sharedEdges = sharedHingeEdgesOf(chosen);
                        const sideName = (v: 'LEFT' | 'RIGHT') => (v === 'LEFT' ? 'يسار' : 'يمين');
                        return (
                          <div className="basis-full rounded border border-slate-200 bg-white p-1 space-y-1">
                            <span className="font-bold text-slate-600 block">جهة المفصلات لكل باب (من اليسار إلى اليمين كما تراها من الأمام):</span>
                            <div className="flex flex-wrap gap-1">
                              {Array.from({ length: n }, (_, k) => (
                                <label key={k} className="flex items-center gap-1 font-bold border rounded px-1 py-0.5 bg-slate-50">
                                  باب {k + 1}
                                  <select
                                    value={z.hingeSides?.[k] ?? 'AUTO'}
                                    onChange={(e) => {
                                      const next = Array.from({ length: n }, (_, j) => z.hingeSides?.[j] ?? 'AUTO') as Array<'LEFT' | 'RIGHT' | 'AUTO'>;
                                      next[k] = e.target.value as 'LEFT' | 'RIGHT' | 'AUTO';
                                      updateZone(i, { hingeSides: next.every((v) => v === 'AUTO') ? undefined : next });
                                    }}
                                    className="border bg-white rounded p-0.5 text-[11px]"
                                  >
                                    <option value="AUTO">{`تلقائي (${sideName(effective[k])})`}</option>
                                    <option value="LEFT">مفصلات يسار</option>
                                    <option value="RIGHT">مفصلات يمين</option>
                                  </select>
                                </label>
                              ))}
                            </div>
                            {sharedEdges.length > 0 && (
                              <label className="flex items-center gap-1 font-bold" title="بابان مفصلاتهما على الحافة نفسها: لوح لكل باب (لوحان متلاحمان)، أو لوح واحد يحمل مفصلات البابين">
                                <input type="checkbox" checked={!!z.sharedHingeBoard} onChange={(e) => updateZone(i, { sharedHingeBoard: e.target.checked ? true : undefined })} />
                                لوح مفصلات واحد مشترك بين البابين <span className="font-normal text-slate-500">(الافتراضي: لوح لكل باب)</span>
                              </label>
                            )}
                          </div>
                        );
                      })()}
                      {z.kind === 'APPLIANCE' && (
                        <select
                          value={z.appliance ?? 'OVEN'}
                          onChange={(e) => { const a = e.target.value as ApplianceKind; replaceZone(i, { kind: 'APPLIANCE', appliance: a, heightMm: APPLIANCES[a].nicheHeightMm }); }}
                          className="border bg-white rounded p-0.5 text-[11px]"
                        >
                          {(Object.keys(APPLIANCES) as ApplianceKind[]).map((a) => (<option key={a} value={a}>{APPLIANCES[a].label}</option>))}
                        </select>
                      )}
                      <span className="flex gap-0.5 mr-auto" style={{ direction: 'ltr' }}>
                        <button type="button" title="نقل القسم للأعلى" disabled={i === resolved.zones.length - 1} onClick={() => moveZone(i, 1)} className="w-5 h-5 text-[10px] rounded border bg-white hover:bg-slate-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">↑</button>
                        <button type="button" title="نقل القسم للأسفل" disabled={i === 0} onClick={() => moveZone(i, -1)} className="w-5 h-5 text-[10px] rounded border bg-white hover:bg-slate-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">↓</button>
                        <button type="button" title="حذف القسم" disabled={resolved.zones.length <= 1} onClick={() => removeZone(i)} className="w-5 h-5 text-[10px] rounded border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed">✕</button>
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px]">
                      <label className="flex items-center gap-1 font-bold">
                        الارتفاع
                        <input type="number" min={LIMITS.ZONE_HEIGHT_MM[0]} max={LIMITS.ZONE_HEIGHT_MM[1]} placeholder="تلقائي" value={raw?.heightMm ?? ''} onChange={(e) => updateZone(i, { heightMm: e.target.value === '' ? undefined : Number(e.target.value) })} onBlur={normalizeDraft} className="w-16 border p-0.5 text-center bg-white rounded" style={{ direction: 'ltr' }} />
                      </label>
                      {(z.kind === 'DOORS' || z.kind === 'OPEN') && (
                        <label className="flex items-center gap-1 font-bold">
                          رفوف
                          <input type="number" min={LIMITS.SHELVES[0]} max={LIMITS.SHELVES[1]} value={raw?.shelves ?? 0} onChange={(e) => updateZone(i, { shelves: Number(e.target.value) })} onBlur={normalizeDraft} className="w-10 border p-0.5 text-center bg-white rounded" style={{ direction: 'ltr' }} />
                        </label>
                      )}
                      {z.kind === 'APPLIANCE' && !!z.appliance && OPEN_BAY_APPLIANCES.includes(z.appliance) && (
                        <label className="flex items-center gap-1 font-bold">
                          <input type="checkbox" checked={!!z.panelFront} onChange={(e) => updateZone(i, { panelFront: e.target.checked })} />
                          واجهة لوح
                        </label>
                      )}
                      {z.kind === 'APPLIANCE' && !!z.appliance && (
                        <div className="basis-full flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-slate-200 bg-slate-50 p-1">
                          <span className="font-bold text-slate-600">مقاس الجهاز (مم):</span>
                          {(['w', 'h', 'd'] as const).map((k) => (
                            <label key={k} className="flex items-center gap-1 font-bold">
                              {k === 'w' ? 'عرض' : k === 'h' ? 'ارتفاع' : 'عمق'}
                              <input
                                type="number"
                                min={50}
                                max={2700}
                                placeholder={String(APPLIANCES[z.appliance!][k === 'w' ? 'nicheWidthMm' : k === 'h' ? 'nicheHeightMm' : 'nicheDepthMm'])}
                                value={raw?.applianceSizeMm?.[k] ?? ''}
                                onChange={(e) => updateZone(i, { applianceSizeMm: { ...raw?.applianceSizeMm, [k]: e.target.value === '' ? undefined : Number(e.target.value) } })}
                                onBlur={normalizeDraft}
                                className="w-14 border p-0.5 text-center bg-white rounded"
                              />
                            </label>
                          ))}
                          <select
                            value={z.libraryApplianceId ?? ''}
                            onChange={(e) => {
                              const entry = libraryAppliances().find((x) => x.item.id === e.target.value);
                              if (!entry) return updateZone(i, { libraryApplianceId: undefined });
                              replaceZone(i, { ...(raw ?? z), kind: 'APPLIANCE', appliance: entry.kind, libraryApplianceId: entry.item.id, applianceSizeMm: { w: entry.item.sizeMm.w, h: entry.item.sizeMm.h, d: entry.item.sizeMm.d } });
                            }}
                            className="border bg-white rounded p-0.5 max-w-[190px]"
                            aria-label="جهاز من مكتبة الأجهزة"
                          >
                            <option value="">جهاز من المكتبة...</option>
                            {libraryAppliances().map(({ item }) => (
                              <option key={item.id} value={item.id}>{item.nameAr} ({item.sizeMm.w}×{item.sizeMm.h}×{item.sizeMm.d})</option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => patchDraft(fitCabinetToAppliance({ width: resolved.width, height: resolved.height, depth: resolved.depth, zones: resolved.zones }, woods.find((w) => w.id === resolved.carcaseMaterialId)?.thickness ?? 18))}
                            className="px-2 py-0.5 rounded bg-indigo-600 hover:bg-indigo-700 text-white font-bold cursor-pointer"
                          >
                            ضبط الخزانة على الجهاز
                          </button>
                        </div>
                      )}
                      {band && <span className="text-slate-500">الفتحة الفعلية: {Math.round(band.openingHeightMm)} مم</span>}
                      {(() => {
                        // The mechanisms a zone can DECLARE itself (rules/kinematics.ts: selectedBy ZONE). A hinge, a lift or a
                        // runner is chosen through the stock item instead, so it is not offered here. Only MODELLED ones are
                        // offered: a PLANNED mechanism would promise a movement the 3D does not draw.
                        const declared = (Object.values(KINEMATICS) as KinematicSpec[])
                          .filter((k) => k.selectedBy === 'ZONE' && k.status === 'MODELLED' && k.zoneKinds.includes(z.kind) && k.categories.includes(resolved.category));
                        if (declared.length === 0 && !z.kinematic) return null;
                        const current = z.kinematic ? KINEMATICS[z.kinematic] : undefined;
                        return (
                          <label className="flex items-center gap-1 font-bold">
                            آلية القسم
                            <select
                              aria-label="آلية القسم"
                              value={z.kinematic ?? ''}
                              onChange={(e) => updateZone(i, { kinematic: (e.target.value || undefined) as KinematicId | undefined })}
                              className="border bg-white rounded p-0.5 text-[10px] font-normal"
                            >
                              <option value="">افتراضي ({z.kind === 'DOORS' ? 'مفصلات / رفع' : 'سكك أدراج'})</option>
                              {declared.map((k) => (<option key={k.id} value={k.id}>{k.label}</option>))}
                            </select>
                            {current && current.status === 'PLANNED' && <span className="text-amber-700 font-normal">(غير مجسَّدة بعد)</span>}
                          </label>
                        );
                      })()}
                      {z.kind === 'APPLIANCE' && z.appliance && <span className="text-slate-500">الجهاز يوفره الزبون · {APPLIANCES[z.appliance].note}</span>}
                    </div>
                    {(z.kind === 'DOORS' || z.kind === 'DRAWERS' || z.kind === 'APRON' || (z.kind === 'APPLIANCE' && !!z.panelFront)) && (() => {
                      // Full control of THIS zone's fronts: the way they open, their sheet (= their thickness) and their edge band.
                      // Every choice left on "like the cabinet" follows the cabinet-wide setting below.
                      const canOpen = z.kind === 'DOORS' || z.kind === 'DRAWERS';
                      const modeName = (m: OpeningMode) => (m === 'GOLA' ? 'Gola' : m === 'PUSH' ? 'Push' : 'مقبض');
                      const cabSheet = woods.find((m) => m.id === resolved.frontMaterialId);
                      const effSheet = (z.frontMaterialId ? woods.find((m) => m.id === z.frontMaterialId) : undefined) ?? cabSheet;
                      const cabRoll = edgeRolls.find((r) => r.id === resolved.frontEdgeRollId);
                      const effRoll = z.frontEdgeRollId === 'NONE' ? undefined : (z.frontEdgeRollId ? edgeRolls.find((r) => r.id === z.frontEdgeRollId) : undefined) ?? cabRoll;
                      const effMode: OpeningMode = z.openingMode ?? resolved.openingMode;
                      return (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded border border-indigo-100 bg-indigo-50/50 p-1 text-[10px]">
                          <span className="font-bold text-indigo-700">واجهات هذا القسم:</span>
                          {canOpen && (
                            <label className="flex items-center gap-1 font-bold">
                              نمط الفتح
                              <select
                                aria-label="نمط فتح القسم"
                                value={z.openingMode ?? ''}
                                onChange={(e) => updateZone(i, { openingMode: e.target.value ? (e.target.value as OpeningMode) : undefined })}
                                className="border bg-white rounded p-0.5 text-[10px] font-normal"
                              >
                                <option value="">{`مثل الخزانة (${modeName(resolved.openingMode)})`}</option>
                                <option value="HANDLE">مقبض</option>
                                <option value="GOLA" disabled={!canUseGola(resolved.category, [z])}>Gola (قناة)</option>
                                <option value="PUSH">فتح بالضغط (Push)</option>
                              </select>
                            </label>
                          )}
                          <label className="flex items-center gap-1 font-bold">
                            خامة الواجهات (السمك)
                            <select
                              aria-label="خامة واجهات القسم"
                              value={z.frontMaterialId ?? ''}
                              disabled={!canSave}
                              onChange={(e) => updateZone(i, { frontMaterialId: e.target.value || undefined })}
                              className="border bg-white rounded p-0.5 text-[10px] font-normal max-w-[190px]"
                            >
                              <option value="">{`مثل الخزانة (${cabSheet ? `${cabSheet.thickness}مم` : '—'})`}</option>
                              {woods.map((m) => (<option key={m.id} value={m.id}>{m.brand} · {m.type} · {m.thickness}مم</option>))}
                            </select>
                          </label>
                          <label className="flex items-center gap-1 font-bold">
                            شريط الحافة
                            <select
                              aria-label="شريط حافة واجهات القسم"
                              value={z.frontEdgeRollId ?? ''}
                              disabled={!canSave || edgeRolls.length === 0}
                              onChange={(e) => updateZone(i, { frontEdgeRollId: e.target.value || undefined })}
                              className="border bg-white rounded p-0.5 text-[10px] font-normal max-w-[190px]"
                            >
                              <option value="">{`مثل الخزانة (${cabRoll ? `${cabRoll.thickness}مم` : 'بدون'})`}</option>
                              <option value="NONE">بدون شريط</option>
                              {edgeRolls.map((r) => (<option key={r.id} value={r.id}>{r.brand} · {r.thickness}مم × {r.width}مم · {Math.round(bandPricePerMeterDA(r))} دج/م</option>))}
                            </select>
                          </label>
                          <label className="flex items-center gap-1 font-bold">
                            عروق الخشب
                            <select
                              aria-label="اتجاه عروق واجهات القسم"
                              value={z.grainDirection ?? ''}
                              onChange={(e) => updateZone(i, { grainDirection: e.target.value ? (e.target.value as 'vertical' | 'horizontal') : undefined })}
                              className="border bg-white rounded p-0.5 text-[10px] font-normal"
                            >
                              <option value="">تلقائي (باب ↕ · درج ↔)</option>
                              <option value="vertical">عمودي ↕</option>
                              <option value="horizontal">أفقي ↔</option>
                            </select>
                          </label>
                          <label className="flex items-center gap-1 font-bold" title="تدوير الخامة 180°: العروق تسري بالاتجاه المعاكس">
                            <input
                              type="checkbox"
                              aria-label="عكس عروق واجهات القسم"
                              checked={!!z.grainFlip}
                              onChange={(e) => updateZone(i, { grainFlip: e.target.checked || undefined })}
                            />
                            عكس العروق 180°
                          </label>
                          <span className="text-slate-500">
                            الفعلي: السمك {effSheet ? `${effSheet.thickness} مم` : '—'} · الشريط {effRoll ? `${effRoll.thickness} مم` : 'بدون'}{canOpen ? ` · ${modeName(effMode)}` : ''}
                          </span>
                        </div>
                      );
                    })()}
                    {canSplitZone(z) && !isOpenCarcase(resolved.zones) && (() => {
                      const sp = band?.split;
                      const fillW = sp ? Math.round(sp.fill.innerHiMm - sp.fill.innerLoMm) : undefined;
                      return (
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] border-t pt-0.5">
                          <label className="flex items-center gap-1 font-bold">
                            <input type="checkbox" checked={!!z.split} onChange={(e) => updateZone(i, { split: e.target.checked ? { mainSide: 'LEFT', fill: 'AUTO' } : undefined })} />
                            لوح عمودي (عمودان)
                          </label>
                          {z.split && (
                            <>
                              <select value={z.split.mainSide} onChange={(e) => updateZone(i, { split: { ...z.split!, mainSide: e.target.value === 'RIGHT' ? 'RIGHT' : 'LEFT' } })} className="border bg-white rounded p-0.5 text-[10px]">
                                <option value="LEFT">{z.kind === 'APPLIANCE' ? 'الجهاز يسارًا' : 'الأبواب يسارًا'}</option>
                                <option value="RIGHT">{z.kind === 'APPLIANCE' ? 'الجهاز يمينًا' : 'الأبواب يمينًا'}</option>
                              </select>
                              {z.kind === 'DOORS' && (
                                <label className="flex items-center gap-1 font-bold">
                                  عرض عمود الأبواب
                                  <input type="number" min={20} placeholder="تلقائي" value={z.split.mainWidthMm ?? ''} onChange={(e) => updateZone(i, { split: { ...z.split!, mainWidthMm: e.target.value === '' ? undefined : Number(e.target.value) } })} onBlur={normalizeDraft} className="w-14 border p-0.5 text-center bg-white rounded" style={{ direction: 'ltr' }} />
                                </label>
                              )}
                              {band?.join && band.join.lowIndex !== i ? (
                                <span className="font-bold text-indigo-700">العمود الآخر: مدموج مع القسم {band.join.lowIndex + 1} (يتبع اختياره)</span>
                              ) : (
                                <label className="flex items-center gap-1 font-bold">
                                  العمود الآخر
                                  <select value={z.split.fill ?? 'AUTO'} onChange={(e) => updateZone(i, { split: { ...z.split!, fill: e.target.value as ColumnFillChoice } })} className="border bg-white rounded p-0.5 text-[10px] font-normal">
                                    <option value="AUTO">{`تلقائي${fillW !== undefined ? ` (${FILL_LABELS[suggestFill(fillW)]})` : ''}`}</option>
                                    {COLUMN_FILLS.map((f) => (<option key={f} value={f}>{FILL_LABELS[f]}</option>))}
                                  </select>
                                </label>
                              )}
                              {i > 0 && resolved.zones[i - 1].split && (
                                <label
                                  className={`flex items-center gap-1 font-bold ${resolved.zones[i - 1].split!.mainSide !== z.split.mainSide ? 'opacity-50' : ''}`}
                                  title="يصبح العمود الآخر عموداً واحداً يجمع القسمين: لوح عمودي واحد، ولا يمرّ الرف الأفقي عبر هذا الجانب، وواجهة واحدة تغطيهما."
                                >
                                  <input
                                    type="checkbox"
                                    checked={!!z.split.joinBelow}
                                    disabled={resolved.zones[i - 1].split!.mainSide !== z.split.mainSide}
                                    onChange={(e) => updateZone(i, { split: { ...z.split!, joinBelow: e.target.checked ? true : undefined } })}
                                  />
                                  دمج العمود الآخر مع القسم {i} (بلا رف فاصل في هذا الجانب)
                                  {resolved.zones[i - 1].split!.mainSide !== z.split.mainSide && <span className="font-normal text-slate-500"> — يلزم أن يكون الجهازان على الجهة نفسها</span>}
                                </label>
                              )}
                              {sp && <span className="text-slate-500">عمود {z.kind === 'APPLIANCE' ? 'الجهاز' : 'الأبواب'} {Math.round(sp.main.innerHiMm - sp.main.innerLoMm)} مم · الباقي {fillW} مم ← {FILL_LABELS[sp.fill.fill ?? 'PANEL']}</span>}
                              {!sp && <span className="text-red-600 font-bold">لا مكان للوح: وسّع الخزانة أو قلّل عرض عمود الأبواب</span>}
                            </>
                          )}
                        </div>
                      );
                    })()}
                  </div>
                );
              })}
              </div>

              {resolved.zones.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[10px] whitespace-nowrap">الفاصل بين الأقسام:</span>
                  <select value={resolved.dividerBoards} onChange={(e) => patchDraft({ dividerBoards: Number(e.target.value) === 2 ? 2 : 1 })} className="flex-1 min-w-0 border bg-white rounded p-1 text-[11px]">
                    <option value={1}>لوح واحد مشترك</option>
                    <option value={2}>لوحان متلاحمان</option>
                  </select>
                </div>
              )}

              {resolved.category === 'WALL_UNIT' && (() => {
                // Where THIS wall unit hangs: the standard gap above the worktop, its own gap, from the ceiling, or from the floor.
                const mount = draft.wallMount;
                const bottom = wallBottomMmOf({ height: resolved.height, wallMount: resolved.wallMount }, wallRef);
                const top = bottom + resolved.height;
                const over = top - wallRef.roomHeightMm;
                const startFor = (from: 'COUNTER' | 'CEILING' | 'FLOOR') => (from === 'CEILING' ? 0 : from === 'COUNTER' ? wallRef.defaultGapMm : Math.max(0, Math.round(bottom)));
                return (
                  <div className="space-y-1 bg-sky-50/60 border border-sky-100 rounded p-1.5">
                    <span className="block font-bold text-[10px]">📏 تعليق الخزانة العلوية</span>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px]">
                      <select
                        aria-label="طريقة تعليق الخزانة"
                        value={mount?.from ?? 'DEFAULT'}
                        onChange={(e) => {
                          const v = e.target.value;
                          patchDraft({ wallMount: v === 'DEFAULT' ? undefined : { from: v as 'COUNTER' | 'CEILING' | 'FLOOR', mm: startFor(v as 'COUNTER' | 'CEILING' | 'FLOOR') } });
                        }}
                        className="border bg-white rounded p-0.5 text-[10px]"
                      >
                        <option value="DEFAULT">{`القياسي: ${wallRef.defaultGapMm} مم فوق سطح العمل`}</option>
                        <option value="COUNTER">فراغ خاص فوق سطح العمل</option>
                        <option value="CEILING">معلّقة من السقف (نحو الأسفل)</option>
                        <option value="FLOOR">ارتفاع من الأرض</option>
                      </select>
                      {mount && (
                        <label className="flex items-center gap-1 font-bold">
                          {mount.from === 'CEILING' ? 'البعد عن السقف' : mount.from === 'FLOOR' ? 'الارتفاع عن الأرض' : 'الفراغ فوق السطح'} (مم)
                          <input
                            type="number"
                            min={0}
                            max={4000}
                            step={10}
                            value={mount.mm}
                            onChange={(e) => patchDraft({ wallMount: { from: mount.from, mm: Number(e.target.value) || 0 } })}
                            className="w-16 px-1 py-0.5 border border-slate-300 rounded text-[11px] font-mono text-center"
                            style={{ direction: 'ltr' }}
                          />
                        </label>
                      )}
                      <button
                        type="button"
                        onClick={() => patchDraft({ height: 400, wallMount: { from: 'CEILING', mm: 0 } })}
                        className="px-1.5 py-0.5 rounded border border-sky-300 bg-white text-sky-800 font-bold cursor-pointer hover:bg-sky-100"
                        title="خزانة ارتفاعها 40 سم ملاصقة للسقف"
                      >
                        علوية 40 سم من السقف
                      </button>
                    </div>
                    <span className={`block text-[9px] leading-snug ${over > 0.5 ? 'text-red-700 font-bold' : 'text-slate-600'}`}>
                      أسفل الخزانة عند {Math.round(bottom)} مم · أعلاها عند {Math.round(top)} مم · السقف عند {Math.round(wallRef.roomHeightMm)} مم
                      {over > 0.5 ? ` ⛔ تتجاوز السقف بـ ${Math.round(over)} مم` : ''}
                      {bottom < wallRef.counterTopMm - 0.5 ? ' ⚠️ أسفلها تحت سطح العمل' : ''}
                    </span>
                  </div>
                );
              })()}

              <div className={isCornerBuilder ? 'hidden' : 'contents'}>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[10px] whitespace-nowrap" title="الافتراضي لكل الأقسام؛ كل قسم يستطيع اختيار نمطه الخاص من بطاقته">نمط الفتح (للخزانة):</span>
                <select value={resolved.openingMode} onChange={(e) => patchDraft({ openingMode: e.target.value as OpeningMode, golaSlots: [] })} className="flex-1 min-w-0 border bg-white rounded p-1 text-[11px]">
                  <option value="HANDLE">مقبض</option>
                  <option value="GOLA" disabled={!golaAllowed}>Gola (قناة){golaAllowed ? '' : ' — يلزم قسم أبواب أو أدراج'}</option>
                  <option value="PUSH" disabled={!hasDoorZone && !hasDrawerZone}>فتح بالضغط (Push)</option>
                </select>
              </div>

              {hasDoorZone && (
                <label className="flex items-center gap-1 text-[10px] font-bold">
                  <input type="checkbox" checked={resolved.frontStyle === 'GLASS'} onChange={(e) => patchDraft({ frontStyle: e.target.checked ? 'GLASS' : 'SOLID' })} />
                  أبواب زجاجية (إطار ألمنيوم + زجاج)
                </label>
              )}
              </div>

              {hasDoorZone && (doorOptions.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[10px] whitespace-nowrap">عتاد الأبواب:</span>
                  <select value={resolved.hardwareItemId} onChange={(e) => patchDraft({ hardwareItemId: e.target.value })} className="flex-1 min-w-0 border bg-white rounded p-1 text-[11px]">
                    {doorOptions.map((h) => (<option key={h.id} value={h.id}>{h.brand} — {h.modelType}</option>))}
                  </select>
                </div>
              ) : (
                <span className="block text-[9px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded p-1">⚠️ لا يوجد في المخزن مفصلات{resolved.category === 'WALL_UNIT' ? ' أو رافعة' : ''}: لن تُسعَّر الأبواب.</span>
              ))}
              {isLift && <span className="block text-[9px] text-slate-500">رافعة: كل باب يرتفع بعدّته المستقلة (بابان = رافعتان).</span>}

              {hasDrawerZone && (drawerOptions.length > 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-[10px] whitespace-nowrap">سكك الأدراج:</span>
                  <select value={resolved.drawerHardwareItemId} onChange={(e) => patchDraft({ drawerHardwareItemId: e.target.value })} className="flex-1 min-w-0 border bg-white rounded p-1 text-[11px]">
                    {drawerOptions.map((h) => (<option key={h.id} value={h.id}>{h.brand} — {h.modelType}</option>))}
                  </select>
                </div>
              ) : (
                <span className="block text-[9px] leading-snug text-amber-800 bg-amber-50 border border-amber-200 rounded p-1">⚠️ لا توجد سكك أدراج في المخزن: لن تُسعَّر.</span>
              ))}

              {resolved.zones.some((z) => (z.openingMode ?? resolved.openingMode) === 'GOLA' && canUseGola(resolved.category, [z])) && !(soleZoneGola(resolved.zones, resolved.openingMode) && resolved.zones[0].kind === 'DRAWERS') && (
                <p className="text-[10px] text-slate-500 leading-snug">
                  قناة Gola واحدة لكل قسم أبواب أو أدراج: فوق الأبواب في السفلية، وتحتها في العلوية وفي الأبواب التي يعلو حافتها {PANEL.GOLA_REACH_MM / 1000} م. تنقص {PANEL.GOLA_OFFSET_MM} مم من ارتفاع واجهات القسم.
                </p>
              )}

              {/* Gola placement: for drawers the user decides exactly where each channel goes */}
              {soleZoneGola(resolved.zones, resolved.openingMode) && resolved.zones[0].kind === 'DRAWERS' && (() => {
                const n = resolved.zones[0].count ?? 1;
                return (
                  <div className="bg-white border rounded p-1.5 space-y-1">
                    <span className="block font-bold text-[10px]">مواضع الـ Gola (اضغط الشريط لتفعيله / إلغائه):</span>
                    <div className="flex items-stretch gap-3" style={{ direction: 'ltr' }}>
                      <div className="flex flex-col w-24 flex-shrink-0">
                        {Array.from({ length: n }).map((_, k) => {
                          const active = resolved.golaSlots.includes(k);
                          return (
                            <React.Fragment key={k}>
                              <button
                                type="button"
                                title={k === 0 ? 'Gola في أعلى الخزانة (فوق الدرج 1)' : `Gola بين الدرج ${k} والدرج ${k + 1}`}
                                onClick={() => {
                                  const next = active ? resolved.golaSlots.filter((x) => x !== k) : [...resolved.golaSlots, k].sort((a, b) => a - b);
                                  patchDraft({ golaSlots: next });
                                }}
                                className={`h-3.5 my-0.5 rounded-sm border text-[8px] leading-none font-bold cursor-pointer transition-colors ${active ? 'bg-slate-800 border-slate-800 text-white' : 'bg-white border-dashed border-slate-300 text-slate-400 hover:bg-slate-100'}`}
                              >
                                {active ? 'GOLA' : '+'}
                              </button>
                              <div className="h-6 rounded-sm border border-slate-300 bg-amber-50 text-[9px] font-bold text-slate-500 flex items-center justify-center">درج {k + 1}</div>
                            </React.Fragment>
                          );
                        })}
                      </div>
                      <div className="text-[9px] leading-snug text-slate-500 self-center">
                        الأعلى = الدرج 1. كل شريط Gola ينقص {PANEL.GOLA_OFFSET_MM} مم من ارتفاع الواجهات، ويُوزَّع الباقي بالتساوي على الأدراج.
                        <br />
                        <span className="font-bold text-slate-700">المفعّل: {resolved.golaSlots.length}</span>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="space-y-1 bg-slate-50 p-1.5 rounded border">
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[10px] whitespace-nowrap w-14">الهيكل:</span>
                <select value={resolved.carcaseMaterialId} onChange={(e) => patchDraft({ carcaseMaterialId: e.target.value })} disabled={!canSave} className="flex-1 min-w-0 border bg-white rounded p-1 text-[11px]">
                  {woods.map((m) => (
                    <option key={m.id} value={m.id}>{m.brand} · {m.type} · {m.thickness}مم</option>
                  ))}
                </select>
                <select
                  value={resolved.carcaseEdgeRollId}
                  onChange={(e) => patchDraft({ carcaseEdgeRollId: e.target.value })}
                  disabled={!canSave || edgeRolls.length === 0}
                  title="شريط الحافة (edge band) من المخزن: سمكه يُطرح من مقاسات القص وثمنه يدخل في التكلفة"
                  className="w-44 flex-shrink-0 border bg-white rounded p-1 text-[11px]"
                >
                  <option value="">{edgeRolls.length === 0 ? 'لا يوجد شريط حافة في المخزن' : '— بدون شريط حافة —'}</option>
                  {edgeRolls.map((r) => (
                    <option key={r.id} value={r.id}>{r.brand} · {r.thickness}مم × {r.width}مم · {Math.round(bandPricePerMeterDA(r))} دج/م</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[10px] whitespace-nowrap w-14">الواجهات:</span>
                <select value={resolved.frontMaterialId} onChange={(e) => patchDraft({ frontMaterialId: e.target.value })} disabled={!canSave} className="flex-1 min-w-0 border bg-white rounded p-1 text-[11px]">
                  {woods.map((m) => (
                    <option key={m.id} value={m.id}>{m.brand} · {m.type} · {m.thickness}مم</option>
                  ))}
                </select>
                <select
                  value={resolved.frontEdgeRollId}
                  onChange={(e) => patchDraft({ frontEdgeRollId: e.target.value })}
                  disabled={!canSave || edgeRolls.length === 0}
                  title="شريط الحافة (edge band) من المخزن: سمكه يُطرح من مقاسات القص وثمنه يدخل في التكلفة"
                  className="w-44 flex-shrink-0 border bg-white rounded p-1 text-[11px]"
                >
                  <option value="">{edgeRolls.length === 0 ? 'لا يوجد شريط حافة في المخزن' : '— بدون شريط حافة —'}</option>
                  {edgeRolls.map((r) => (
                    <option key={r.id} value={r.id}>{r.brand} · {r.thickness}مم × {r.width}مم · {Math.round(bandPricePerMeterDA(r))} دج/م</option>
                  ))}
                </select>
              </div>
              <span className="block text-[9px] leading-snug text-slate-500">
                اختر لفّة شريط الحافة من المخزن: سمكها يُطرح من مقاسات القص وثمنها (سعر اللفّة ÷ طولها × الأمتار المستعملة) يدخل في التكلفة والفاتورة. الواجهات: الحافة على الجوانب الأربعة (العرض والارتفاع − 2×الحافة). الهيكل: الحافة الأمامية فقط (العمق − الحافة).
              </span>
            </div>

            <div className="bg-slate-50 border rounded p-1.5 space-y-1">
              <div className="flex items-center justify-between text-[11px] font-bold">
                <span>التكلفة التقديرية للتصنيع</span>
                <span className="font-mono" style={{ direction: 'ltr' }}>{previewPricing.totalDA.toLocaleString('fr-DZ')} دج</span>
              </div>
              <div className="text-[9px] text-slate-500">نفس الرقم الذي يجمعه تقرير BOM لهذه الخزانة (ألواح + شريط حافة + عتاد).</div>
              {designIssues.map((i, k) => (
                <span key={k} className={`block text-[9px] leading-snug rounded p-1 border ${i.severity === 'error' ? 'text-red-800 bg-red-50 border-red-200' : 'text-amber-800 bg-amber-50 border-amber-200'}`}>
                  {i.severity === 'error' ? '⛔' : '⚠️'} {i.message}
                </span>
              ))}
            </div>

            <div className="pt-1 space-y-1.5">
              <button type="button" disabled={!canAddNow} title={blockingIssues.length > 0 ? 'أصلح الأخطاء المعلَّمة بـ ⛔ أولاً' : isCornerBuilder && !cornerWall ? 'اختر مطبخ L أو U أولاً' : undefined} onClick={handleSaveCabinet} className={`w-full text-white font-bold py-1.5 rounded-lg text-[11px] shadow-xs ${canAddNow ? 'bg-indigo-600 hover:bg-indigo-700 cursor-pointer' : 'bg-slate-400 cursor-not-allowed'}`}>
                {editing ? '💾 تحديث الوحدة المحددة' : isCornerBuilder ? '➕ إضافة زاوية L إلى المطبخ' : '➕ حقن وتثبيت الوحدة في المطبخ'}
              </button>
              {editing && (
                <button type="button" onClick={onCancelEdit} className="w-full bg-white border border-slate-300 text-slate-700 font-bold py-1 rounded-lg text-[11px] hover:bg-slate-50 cursor-pointer">
                  ✖ إلغاء التعديل
                </button>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={handleExportFactoryBOM} className="bg-slate-900 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer">🏭 تقرير BOM</button>
                <button type="button" onClick={handlePrintCustomerInvoice} className="bg-emerald-600 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-emerald-700 transition-colors cursor-pointer">🧾 الفاتورة</button>
              </div>
            </div>

    </>
  );
}
