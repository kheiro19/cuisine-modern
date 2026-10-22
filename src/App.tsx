// src/App.tsx
import React, { useEffect, useState, useMemo } from 'react';
import { useFurniture } from './context/FurnitureContext';
import InventoryManager from './components/InventoryManager';
import Kitchen3DCanvas from './components/Kitchen3DCanvas';
import AccessoryLibrary from './components/AccessoryLibrary';
import { useAccessories } from './components/useAccessories';
import CabinetPreview3D from './components/CabinetPreview3D';
import { generateFactoryBOMReport, convertBOMToCSVString } from './math/bomEngine';
import { generateCustomerInvoice, formatCustomerInvoiceText } from './math/invoiceEngine';
import {
  CabinetDraft,
  CabinetSubtype,
  SUBTYPE_PRESETS,
  cabinetToDraft,
  doorHardwareCategories,
  drawerHardwareCategories,
  draftFromPreset,
  draftToCabinetPatch,
  draftToNewCabinet,
  draftToPreviewCabinet,
  fitCabinetToAppliance,
  frontHardwareNeedsOf,
  resolveDraft,
} from './math/cabinetPresets';
import { libraryAppliances } from './math/applianceModels';
import {
  DEFAULT_LAYOUT, KitchenLayout, LAYOUT_LABELS, LayoutType, RUN_LABELS, WIDTH_LIMITS_MM,
  autoArrange, cornerClearanceMm, cornerWalls, fitStates, nextFreeX, runOf, runsOf,
} from './math/kitchenLayout';
import { L_CORNER_LIMITS, lCornerCabinets, lCornerSpan } from './math/lCorner';
import { LIMITS, PANEL } from './math/constants';
import { bandPricePerMeterDA } from './math/edgeBand';
import { clampInt, uid } from './math/utils';
import { ApplianceKind, CabinetCategory, CabinetObject, CabinetZone, ColumnFillChoice, OpeningMode, RunId, ZoneKind } from './types/flatma';
import { APPLIANCES, ZONE_LABELS, isOpenCarcase, zonesOf } from './math/zones';
import { OPEN_BAY_APPLIANCES } from './rules/appliances';
import { COLUMN_FILLS, FILL_LABELS, canSplitZone, suggestFill } from './math/columns';
import { priceCabinet } from './math/partsEngine';
import { FAMILIES, FAMILY_ORDER, FamilyId, KINEMATICS, canUseGola, kinematicOfHardware, liftZoneIsTop, templatesOf } from './rules';

// One model of a cabinet for the whole screen: the form edits a CabinetDraft, the "3D ATOMIC WORKSPACE" renders that
// draft with the same assembly components as the "3D EXECUTIVE SHOWCASE", and "inject" stores exactly that object.
// (The former flat-rectangle board generator was removed: the preview now renders the real cabinet.)

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

const ZONE_KINDS: ZoneKind[] = ['DOORS', 'DRAWERS', 'OPEN', 'APPLIANCE', 'APRON'];

/** A zone of another kind starts from sensible values (an appliance zone from the appliance's own niche height). */
const zoneOfKind = (kind: ZoneKind, previous: CabinetZone): CabinetZone => {
  if (kind === 'DOORS') return { kind, count: previous.count ?? 2, shelves: 0 };
  if (kind === 'DRAWERS') return { kind, count: previous.count ?? 2 };
  if (kind === 'OPEN') return { kind, shelves: 2 };
  if (kind === 'APPLIANCE') return { kind, appliance: 'OVEN', heightMm: APPLIANCES.OVEN.nicheHeightMm };
  return { kind: 'APRON', heightMm: 150 };
};

const FRONT_COUNT_OPTIONS = Array.from(
  { length: LIMITS.FRONT_ELEMENTS[1] - LIMITS.FRONT_ELEMENTS[0] + 1 },
  (_, i) => LIMITS.FRONT_ELEMENTS[0] + i,
);

/** A number box that commits on Enter or when it loses focus (a move is one undo step, not one per typed digit). */
function CommitNumber({ value, onCommit, title }: { value: number; onCommit: (v: number) => void; title?: string }) {
  const [text, setText] = useState<string>(String(value));
  useEffect(() => { setText(String(value)); }, [value]);
  const commit = () => {
    const n = Number(text);
    if (Number.isFinite(n) && Math.round(n) !== value) onCommit(Math.round(n));
    else setText(String(value));
  };
  return (
    <input type="number" min={0} step={10} value={text} title={title}
      onChange={(e) => setText(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
      className="w-14 px-1 py-0.5 border border-slate-300 rounded text-[10px] font-mono text-center" style={{ direction: 'ltr' }} />
  );
}

export default function App() {
  const {
    cabinets,
    inventory,
    activeCabinetId,
    setActiveCabinetId,
    addCabinet,
    addCabinets,
    deleteCabinets,
    moveCabinets,
    updateCabinet,
    updateManyCabinets,
    triggerUndo,
    canUndo,
  } = useFurniture();

  const woods = inventory.woodPanels;
  const edgeRolls = inventory.edgeBandRolls ?? [];
  const hardwareItems = inventory.hardwareItems;

  const [hardwareSettings] = useState({ carcaseThickness: 18, frontThickness: 18, wallSplashHeight: 600 });
  const [countertopPath] = useState([{ x: 0, zOffset: 0 }, { x: 2400, zOffset: 0 }]);

  const { accessories, add: addAccessory, nudge: nudgeAccessory, remove: removeAccessory, changeFinish: changeAccessoryFinish, clear: clearAccessories } = useAccessories(cabinets, hardwareSettings.wallSplashHeight);

  const [showFronts, setShowFronts] = useState<boolean>(true);
  const [isXRayMode, setIsXRayMode] = useState<boolean>(false);

  const [bomReportText, setBomReportText] = useState<string>('');
  const [invoiceText, setInvoiceText] = useState<string>('');

  const [isWorkspaceMinimized, setIsWorkspaceMinimized] = useState<boolean>(false);
  const [isShowroomMinimized, setIsShowroomMinimized] = useState<boolean>(false);

  // ---- the cabinet being designed (form + preview) --------------------------------------------------------------
  const [draft, setDraft] = useState<CabinetDraft>(() => draftFromPreset('Standard_Base'));
  const [editingId, setEditingId] = useState<string | null>(null);
  const editing = editingId ? cabinets.find((c) => c.id === editingId) ?? null : null;

  // ---- the shape of the kitchen: straight, L or U (math/kitchenLayout.ts) ---------------------------------------
  const [rawLayout, setRawLayout] = useState<KitchenLayout>(DEFAULT_LAYOUT);
  const layout = useMemo<KitchenLayout>(() => ({ ...rawLayout, widthMm: clampInt(rawLayout.widthMm, WIDTH_LIMITS_MM[0], WIDTH_LIMITS_MM[1], DEFAULT_LAYOUT.widthMm) }), [rawLayout]);
  const layoutRuns = runsOf(layout);
  const [activeRunRaw, setActiveRun] = useState<RunId>('A');
  const activeRun: RunId = layoutRuns.includes(activeRunRaw) ? activeRunRaw : 'A'; // the wall a new cabinet is added on
  const handleLayoutChange = (fields: Partial<KitchenLayout>) => setRawLayout((prev) => ({ ...prev, ...fields }));

  // The L corner: arm widths (the width of each door) and the level (floor or wall).
  const [armA, setArmA] = useState<number>(450);
  const [armB, setArmB] = useState<number>(450);
  const [cornerWallRaw, setCornerWall] = useState<'B' | 'C'>('B');
  const cornerArm = (v: number) => clampInt(v, L_CORNER_LIMITS.ARM_MM[0], L_CORNER_LIMITS.ARM_MM[1], 450);
  const fits = useMemo(() => fitStates(cabinets, layout), [cabinets, layout]);

  // The form keeps the raw typed values; this is the consistent version used for the preview and for saving.
  const resolved = useMemo(() => resolveDraft(draft, woods, hardwareItems, edgeRolls), [draft, woods, hardwareItems, edgeRolls]);
  const preset = SUBTYPE_PRESETS[resolved.subtype];
  // A real L corner type is built as three boxes on the two walls of a corner (math/lCorner.ts), not from the form's size and zones.
  const isCornerBuilder = !!preset.lCorner && !editing;
  const cornerCategory: CabinetCategory = resolved.category;
  const cornerDepth = (cornerCategory === 'WALL_UNIT' ? FAMILIES.WALL : FAMILIES.BASE).dims.depth;
  const cornerWallList = cornerWalls(layout);
  const cornerWall: 'B' | 'C' | undefined = cornerWallList.includes(cornerWallRaw) ? cornerWallRaw : cornerWallList[0];
  const cornerTaken = (wall: 'B' | 'C') => cabinets.some((c) => !!c.groupId && c.category === cornerCategory && runOf(c) === wall);
  // The preview of a corner shows ONE arm (the whole L appears in the showroom once it is added).
  const previewCabinet = useMemo(() => {
    if (!isCornerBuilder) return draftToPreviewCabinet(resolved, woods);
    const arm = draftToPreviewCabinet({ ...resolved, width: cornerArm(armA), depth: cornerDepth, zones: resolved.zones.map((z) => (z.kind === 'DOORS' ? { ...z, hingeSide: 'RIGHT' as const } : z)) }, woods);
    return { ...arm, omitSides: ['LEFT' as const] };
  }, [resolved, woods, isCornerBuilder, armA, cornerDepth]);

  // Hinge / lift picker for hinged or lifting doors; runner picker for drawers AND pull-out frames (rules/kinematics.ts).
  const needs = frontHardwareNeedsOf(resolved, woods, resolved.carcaseMaterialId); // a split's small door / spice rack counts
  const hasDoorZone = needs.doors;
  const hasDrawerZone = needs.drawers;
  const doorOptions = hardwareItems.filter((h) => doorHardwareCategories(resolved.category).includes(h.category) && (liftZoneIsTop(resolved.zones) || h.category !== 'Overhead Lift Systems')); // a lift only fits the top doors zone
  const drawerOptions = hardwareItems.filter((h) => drawerHardwareCategories().includes(h.category));
  const isLift = kinematicOfHardware(hardwareItems.find((h) => h.id === resolved.hardwareItemId))?.id === 'LIFT';
  const golaAllowed = canUseGola(resolved.category, resolved.zones); // rules/openings.ts

  // The preview is priced by the very function the BOM sums, so this figure is the BOM figure.
  const previewPricing = useMemo(() => priceCabinet(previewCabinet, woods, hardwareItems, edgeRolls), [previewCabinet, woods, hardwareItems, edgeRolls]);
  // The edge band the pricing really uses (roll, else the sheet's own band), so the dimension lines show the real cut sizes.
  const previewEdges = useMemo(() => {
    const info = (role: 'front' | 'carcase', rollId?: string) => {
      const part = previewPricing.parts.find((p) => p.role === role && p.edge !== 'NONE');
      const roll = rollId ? edgeRolls.find((r) => r.id === rollId) : undefined;
      return { mm: part?.edgeMm ?? 0, label: roll?.brand ?? '', chosen: !!roll };
    };
    return { front: info('front', previewCabinet.frontEdgeRollId), carcase: info('carcase', previewCabinet.carcaseEdgeRollId) };
  }, [previewPricing, previewCabinet, edgeRolls]);
  const DESIGN_ISSUES = ['ZONES_TOO_TALL', 'APPLIANCE_TOO_NARROW', 'APPLIANCE_TOO_SHALLOW', 'APPLIANCE_ZONE_TOO_SHORT', 'APPLIANCE_ZONE_WIDE', 'SPLIT_NO_ROOM', 'DOORS_TOO_NARROW', 'SHELVES_TOO_CLOSE', 'GOLA_ZONE_TOO_SHORT', 'GOLA_NOT_WITH_INSET', 'LIFT_ZONE_NOT_TOP', 'NO_FRONT_HARDWARE', 'NO_PUSH_ITEM', 'NO_GOLA_ITEM', 'NO_CARCASE_MATERIAL', 'NO_FRONT_MATERIAL'];
  const designIssues = previewPricing.issues.filter((i) => DESIGN_ISSUES.includes(i.code));

  const patchDraft = (fields: Partial<CabinetDraft>) => setDraft((prev) => ({ ...prev, ...fields }));
  const normalizeDraft = () => setDraft((prev) => resolveDraft(prev, woods, hardwareItems, edgeRolls));

  const handleSubtypeChange = (subtype: CabinetSubtype) =>
    setDraft((prev) =>
      draftFromPreset(subtype, { carcaseMaterialId: prev.carcaseMaterialId, frontMaterialId: prev.frontMaterialId, carcaseEdgeRollId: prev.carcaseEdgeRollId, frontEdgeRollId: prev.frontEdgeRollId }),
    );

  // The three families (rules/families.ts): switching family loads that family's first ready template.
  const family: FamilyId = preset.family;
  const handleFamilyChange = (f: FamilyId) => handleSubtypeChange(templatesOf(f)[0]);

  // ---- zones editor: edits go to the raw draft (typing is never fought); display uses the resolved one -------------
  const baseZones = (): CabinetZone[] => (draft.zones.length === resolved.zones.length ? draft.zones : resolved.zones);
  const setZones = (next: CabinetZone[]) => patchDraft({ zones: next });
  const updateZone = (i: number, fields: Partial<CabinetZone>) => setZones(baseZones().map((z, k) => (k === i ? { ...z, ...fields } : z)));
  const replaceZone = (i: number, zone: CabinetZone) => setZones(baseZones().map((z, k) => (k === i ? zone : z)));
  const moveZone = (i: number, delta: number) => {
    const zs = baseZones().slice();
    const j = i + delta;
    if (j < 0 || j >= zs.length) return;
    [zs[i], zs[j]] = [zs[j], zs[i]];
    setZones(zs);
  };
  const removeZone = (i: number) => { if (baseZones().length > 1) setZones(baseZones().filter((_, k) => k !== i)); };
  const addZone = () => setZones([...baseZones(), { kind: 'DOORS', count: 2, shelves: 0 }]);

  const canSave = woods.length > 0;
  // A design ERROR (zones taller than the cabinet...) would draw fronts outside the carcase and cut parts that do not fit.
  const blockingIssues = designIssues.filter((i) => i.severity === 'error');
  const canInject = canSave && blockingIssues.length === 0;
  // A corner needs a wall that forms it (L or U layout) and no corner of this level already on that wall.
  const canAddNow = canInject && (!isCornerBuilder || (!!cornerWall && !cornerTaken(cornerWall)));

  const handleSaveCabinet = () => {
    if (!canAddNow) return;
    if (isCornerBuilder) { if (cornerWall) handleAddLCorner(cornerWall); return; }
    if (editing) {
      updateCabinet(editing.id, draftToCabinetPatch(resolved));
      setEditingId(null);
      return;
    }
    // A side wall starts after whatever stands in its corner on the back wall; a straight kitchen starts at 0 as it always did.
    const from = cornerClearanceMm(cabinets, layout, activeRun, resolved.category);
    addCabinet({
      ...draftToNewCabinet(resolved, {
        id: uid('cab'),
        name: `${preset.label} #${cabinets.length + 1}`,
        positionX: nextFreeX(cabinets, activeRun, resolved.category, resolved.width, from),
      }),
      ...(activeRun !== 'A' ? { run: activeRun } : {}),
    });
  };

  /** A real L corner on a side wall: the square and the two arms, as one unit (math/lCorner.ts). */
  const handleAddLCorner = (wall: 'B' | 'C') => {
    if (!canInject || cornerTaken(wall)) return;
    const groups = new Set(cabinets.map((c) => c.groupId).filter(Boolean)).size;
    addCabinets(lCornerCabinets(
      { category: cornerCategory, wall, roomWidthMm: layout.widthMm, depthMm: cornerDepth, armAMm: cornerArm(armA), armBMm: cornerArm(armB) },
      { draft: resolved, woods, hardware: hardwareItems, edgeRolls, groupId: uid('lc'), newId: () => uid('cab'), name: `خزانة زاوية L ${cornerCategory === 'WALL_UNIT' ? 'علوية' : 'سفلية'} #${groups + 1}` },
    ));
  };

  // ---- moving the units: the arrows move 5 cm, the box takes any distance (from the left end on the back wall, from the corner on a side wall)
  const MOVE_STEP_MM = 50;
  const nudgeCabinet = (id: string, deltaMm: number) => {
    const cab = cabinets.find((c) => c.id === id);
    if (cab) moveCabinets([{ id, positionX: Math.max(0, cab.positionX + deltaMm) }]);
  };
  /** Another wall: the unit goes to the first free place there (after the corner, if something stands in it). */
  const moveToRun = (id: string, run: RunId) => {
    const cab = cabinets.find((c) => c.id === id);
    if (!cab || runOf(cab) === run) return;
    const others = cabinets.filter((c) => c.id !== id);
    const x = nextFreeX(others, run, cab.category, cab.width, cornerClearanceMm(others, layout, run, cab.category));
    moveCabinets([{ id, run, positionX: x }]);
  };
  const handleAutoArrange = () => moveCabinets(autoArrange(cabinets, layout));

  const handleEditCabinet = (id: string) => {
    const cab = cabinets.find((c) => c.id === id);
    if (!cab) return;
    setEditingId(id);
    setActiveCabinetId(id);
    setDraft(cabinetToDraft(cab));
  };

  const handleDeleteFromList = (id: string) => {
    const cab = cabinets.find((c) => c.id === id);
    if (!cab) return;
    // The boxes of an L corner are one unit: deleting one deletes the group.
    const ids = cab.groupId ? cabinets.filter((c) => c.groupId === cab.groupId).map((c) => c.id) : [id];
    const label = cab.groupId ? cab.name.split(' — ')[0] : cab.name;
    if (!window.confirm(`حذف الخزانة «${label}» نهائياً؟`)) return;
    deleteCabinets(ids);
    if (editingId && ids.includes(editingId)) setEditingId(null);
  };

  /** Texture picked in the showcase: look only, stored apart from the stock material. Empty path = back to stock. */
  const handleApplyTexture = (cabinetId: string, texturePath: string, finishType: string, applyToAll: boolean) => {
    const override = texturePath ? { path: texturePath, finishType: finishType || undefined } : undefined;
    updateManyCabinets(applyToAll ? cabinets.map((c) => c.id) : [cabinetId], { frontTextureOverride: override });
  };

  const handleExportFactoryBOM = () => {
    if (cabinets.length === 0) return;
    const report = generateFactoryBOMReport(cabinets, woods, hardwareItems, edgeRolls);
    setBomReportText(convertBOMToCSVString(report));
    setInvoiceText('');
  };

  const handlePrintCustomerInvoice = () => {
    if (cabinets.length === 0) return;
    const report = generateFactoryBOMReport(cabinets, woods, hardwareItems, edgeRolls);
    setInvoiceText(formatCustomerInvoiceText(generateCustomerInvoice(report)));
    setBomReportText('');
  };

  // The installed units as the list shows them: an L corner (a group) is one row, everything else one row per cabinet.
  type ListRow = { kind: 'single'; cab: CabinetObject } | { kind: 'group'; groupId: string; name: string; cabs: CabinetObject[] };
  const listRows = useMemo<ListRow[]>(() => {
    const rows: ListRow[] = [];
    const seen = new Set<string>();
    cabinets.forEach((c) => {
      if (!c.groupId) { rows.push({ kind: 'single', cab: c }); return; }
      if (seen.has(c.groupId)) return;
      seen.add(c.groupId);
      const cabs = cabinets.filter((x) => x.groupId === c.groupId);
      rows.push({ kind: 'group', groupId: c.groupId, name: c.name.split(' — ')[0], cabs });
    });
    return rows;
  }, [cabinets]);
  // Red = takes the place of another unit; green = flush against its neighbour; the editing / active frame otherwise.
  const fitClass = (id: string, isEditing: boolean, isActive = false): string =>
    fits[id] === 'OVERLAP' ? 'border-red-500 bg-red-50'
    : isEditing ? 'border-indigo-500 bg-indigo-50'
    : fits[id] === 'TOUCHING' ? 'border-emerald-500 bg-emerald-50'
    : isActive ? 'border-slate-400 bg-slate-50' : 'border-slate-200';

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
          <h1 className="text-xs font-bold uppercase text-slate-900 tracking-wider">FLATMA Sketch <span className="text-indigo-600">x Screen Fusion Pro</span></h1>
        </div>
        <button type="button" disabled={!canUndo} onClick={triggerUndo} className={`px-3 py-1 rounded-md border text-[11px] font-bold ${canUndo ? 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}>
          ↩️ تراجع خطوة
        </button>
      </header>

      {/* 🔳 الشاشة المدمجة الحركية بنظام النوافذ المتبادلة */}
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
            <div className="absolute inset-x-0 top-9 bottom-0">
              <CabinetPreview3D
                cabinet={previewCabinet}
                showFronts={showFronts}
                isXRayMode={isXRayMode}
                woodPanels={woods}
                hardwareItems={hardwareItems}
                edges={previewEdges}
              />
            </div>
            {editing && (
              <span className="absolute top-3 left-44 z-30 text-[9px] font-bold bg-amber-500 text-white px-2 py-0.5 rounded shadow-sm max-w-[160px] truncate">
                ✏️ تعديل: {editing.name}
              </span>
            )}
            {(preset.note || !canSave) && (
              <div className="absolute top-10 left-3 right-3 z-30 flex flex-col gap-1">
                {preset.note && (
                  <span className="text-[9px] leading-snug bg-amber-100/95 text-amber-900 border border-amber-300 rounded px-2 py-1" style={{ direction: 'rtl' }}>
                    ⚠️ {preset.note}
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
              <button type="button" onClick={() => { setIsShowroomMinimized(true); setIsWorkspaceMinimized(false); }} className="absolute top-3 right-3 z-40 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded px-2 py-0.5 font-mono text-[10px] font-bold transition-all cursor-pointer shadow-xs" title="تقليص صالة العرض وتركيز باحة العين على تفكيك الألواح">
                🗕 Minimize 3D Showcase
              </button>
            )}

                        {/* أزرار الرؤية الجبرية المدمجة (X-Ray + حذف الواجهات) */}
            <div className="absolute top-3 left-32 z-40 flex bg-slate-900/80 backdrop-blur-xs px-2 py-1 rounded-lg border border-slate-700 space-x-2 shadow-md">
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
              <Kitchen3DCanvas
                cabinets={cabinets}
                hardware={hardwareSettings}
                showFronts={showFronts}
                isXRayMode={isXRayMode}
                countertopPath={countertopPath}
                layout={layout}
                woodPanels={woods}
                hardwareItems={hardwareItems}
                accessories={accessories}
                onApplyTextureOverride={handleApplyTexture}
                onDeleteCabinet={(id) => {
                  const cab = cabinets.find((c) => c.id === id);
                  const ids = cab?.groupId ? cabinets.filter((c) => c.groupId === cab.groupId).map((c) => c.id) : [id];
                  deleteCabinets(ids);
                  if (editingId && ids.includes(editingId)) setEditingId(null);
                }}
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

        {/* 🛠️ الجناح الرابع والأخير: لوحة التحكم الـ 24 طرازاً وحقن العقد */}
        {!isWorkspaceMinimized && (
          <div className="xl:col-span-1 flex flex-col space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs text-right text-xs animate-fade-in max-h-[750px] overflow-y-auto" style={{ direction: 'rtl' }}>
            <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1 text-sm">🛠️ الموديلات البرامترية والـ CNC</span>

            {/* 🏠 شكل المطبخ: مستقيم أو L أو U، والجدار الذي تُضاف عليه الخزانة، وخزانة الزاوية L الحقيقية */}
            <div className="bg-indigo-50/60 border border-indigo-100 rounded-lg p-2 space-y-1.5">
              <span className="font-bold text-[11px] block">🏠 شكل المطبخ</span>
              <div className="grid grid-cols-3 gap-1">
                {(['STRAIGHT', 'L', 'U'] as LayoutType[]).map((t) => (
                  <button key={t} type="button" onClick={() => handleLayoutChange({ type: t })} className={`rounded-md border p-1.5 text-[11px] font-bold cursor-pointer ${layout.type === t ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 hover:bg-slate-50'}`}>{LAYOUT_LABELS[t]}</button>
                ))}
              </div>
              {layout.type !== 'STRAIGHT' && (
                <label className="flex items-center justify-between gap-2 text-[10px]">
                  <span>طول الجدار الخلفي (مم)</span>
                  <input type="number" min={WIDTH_LIMITS_MM[0]} max={WIDTH_LIMITS_MM[1]} step={100} value={rawLayout.widthMm}
                    onChange={(e) => handleLayoutChange({ widthMm: Number(e.target.value) })}
                    onBlur={() => handleLayoutChange({ widthMm: layout.widthMm })}
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

            <div className={isCornerBuilder ? 'hidden' : 'contents'}>
            <div className="grid grid-cols-3 gap-1 text-[10px] bg-slate-50 p-1.5 rounded border" style={{ direction: 'ltr' }}>
              <div>W:<input type="number" min={LIMITS.WIDTH_MM[0]} max={LIMITS.WIDTH_MM[1]} value={draft.width} onChange={(e) => patchDraft({ width: Number(e.target.value) })} onBlur={normalizeDraft} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
              <div>H:<input type="number" min={LIMITS.HEIGHT_MM[0]} max={LIMITS.HEIGHT_MM[1]} value={draft.height} onChange={(e) => patchDraft({ height: Number(e.target.value) })} onBlur={normalizeDraft} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
              <div>D:<input type="number" min={LIMITS.DEPTH_MM[0]} max={LIMITS.DEPTH_MM[1]} value={draft.depth} onChange={(e) => patchDraft({ depth: Number(e.target.value) })} onBlur={normalizeDraft} className="w-full border p-0.5 text-center bg-white font-bold rounded" /></div>
            </div>
            </div>

            {/* الأقسام: كل خزانة = كومة أقسام من الأسفل للأعلى، تُعرض هنا من الأعلى للأسفل */}
            <div className="space-y-1.5 bg-slate-50 p-1.5 rounded border">
              <div className={isCornerBuilder ? 'hidden' : 'contents'}>
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
                      <select value={z.kind} onChange={(e) => replaceZone(i, zoneOfKind(e.target.value as ZoneKind, z))} className="border bg-white rounded p-0.5 text-[11px] font-bold">
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
                          المفصلات
                          <select value={z.hingeSide ?? 'AUTO'} onChange={(e) => updateZone(i, { hingeSide: e.target.value === 'AUTO' ? undefined : (e.target.value as 'LEFT' | 'RIGHT') })} className="border bg-white rounded p-0.5 text-[11px]">
                            <option value="AUTO">تلقائي</option>
                            <option value="LEFT">يسار</option>
                            <option value="RIGHT">يمين</option>
                          </select>
                        </label>
                      )}
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
                      {z.kinematic && <span className={KINEMATICS[z.kinematic].status === 'PLANNED' ? 'text-amber-700' : 'text-slate-500'}>الحركة: {KINEMATICS[z.kinematic].label}{KINEMATICS[z.kinematic].status === 'PLANNED' ? ' (غير مجسَّدة بعد)' : ''}</span>}
                      {z.kind === 'APPLIANCE' && z.appliance && <span className="text-slate-500">الجهاز يوفره الزبون · {APPLIANCES[z.appliance].note}</span>}
                    </div>
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
                              <label className="flex items-center gap-1 font-bold">
                                العمود الآخر
                                <select value={z.split.fill ?? 'AUTO'} onChange={(e) => updateZone(i, { split: { ...z.split!, fill: e.target.value as ColumnFillChoice } })} className="border bg-white rounded p-0.5 text-[10px] font-normal">
                                  <option value="AUTO">{`تلقائي${fillW !== undefined ? ` (${FILL_LABELS[suggestFill(fillW)]})` : ''}`}</option>
                                  {COLUMN_FILLS.map((f) => (<option key={f} value={f}>{FILL_LABELS[f]}</option>))}
                                </select>
                              </label>
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

              <div className={isCornerBuilder ? 'hidden' : 'contents'}>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-[10px] whitespace-nowrap">نمط الفتح:</span>
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

              {resolved.openingMode === 'GOLA' && !(resolved.zones.length === 1 && resolved.zones[0].kind === 'DRAWERS') && (
                <p className="text-[10px] text-slate-500 leading-snug">
                  قناة Gola واحدة لكل قسم أبواب أو أدراج: فوق الأبواب في السفلية، وتحتها في العلوية وفي الأبواب التي يعلو حافتها {PANEL.GOLA_REACH_MM / 1000} م. تنقص {PANEL.GOLA_OFFSET_MM} مم من ارتفاع واجهات القسم.
                </p>
              )}

              {/* Gola placement: for drawers the user decides exactly where each channel goes */}
              {resolved.openingMode === 'GOLA' && resolved.zones.length === 1 && resolved.zones[0].kind === 'DRAWERS' && (() => {
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
                <button type="button" onClick={() => setEditingId(null)} className="w-full bg-white border border-slate-300 text-slate-700 font-bold py-1 rounded-lg text-[11px] hover:bg-slate-50 cursor-pointer">
                  ✖ إلغاء التعديل
                </button>
              )}
              <div className="grid grid-cols-2 gap-1.5">
                <button type="button" onClick={handleExportFactoryBOM} className="bg-slate-900 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer">🏭 تقرير BOM</button>
                <button type="button" onClick={handlePrintCustomerInvoice} className="bg-emerald-600 text-white font-mono font-bold text-[9px] py-1 rounded hover:bg-emerald-700 transition-colors cursor-pointer">🧾 الفاتورة</button>
              </div>
            </div>

            {/* الوحدات المثبّتة: تعديل وحذف دائمان (لا يتطلبان النقر على الخزانة في المشهد) */}
            <div className="border-t border-slate-100 pt-2 space-y-1">
              <div className="flex items-center justify-between gap-1">
                <span className="font-bold text-[11px]">🗂️ الوحدات المثبّتة ({cabinets.length})</span>
                {cabinets.length > 1 && (
                  <button type="button" onClick={handleAutoArrange} title="ترصّ الوحدات متجاورة من بداية كل جدار حسب ترتيبها الحالي (زاوية L تبقى مكانها)" className="px-2 py-0.5 rounded border border-slate-300 bg-white hover:bg-slate-50 text-[10px] font-bold cursor-pointer">⟲ ترتيب تلقائي</button>
                )}
              </div>
              {cabinets.some((c) => fits[c.id] === 'OVERLAP') && (
                <span className="block text-[9px] leading-snug rounded p-1 border text-red-800 bg-red-50 border-red-200">🔴 وحدات متداخلة: الأحمر يعني أن وحدة تأخذ مكان أخرى. حرّكها أو اضغط «ترتيب تلقائي».</span>
              )}
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
                      <CommitNumber value={c.positionX} onCommit={(v) => moveCabinets([{ id: c.id, positionX: v }])} />
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
          </div>
        )}

      </div>

      {/* الكونسول السفلي التفاعلي للمستندات والتقارير */}
      {(bomReportText || invoiceText) && (
        <div className="w-full mt-3 bg-slate-900 text-slate-100 rounded-xl border border-slate-800 p-3 font-mono text-xs text-left shadow-md max-h-36 overflow-y-auto animate-fade-in">
          <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed">{bomReportText || invoiceText}</pre>
        </div>
      )}

    </div>
  );
}
