// src/App.tsx
import { useState, useMemo } from 'react';
import { useFurniture } from './context/FurnitureContext';
import { useProjectFile } from './project/useProjectFile';
import ProjectToolbar from './project/ProjectToolbar';
import type { ProjectData } from './project/projectFile';
import { useAccessories } from './components/useAccessories';
import StockPanel from './app/panels/StockPanel';
import ShowcasePanel from './app/panels/ShowcasePanel';
import AtomicPanel from './app/panels/AtomicPanel';
import LayoutPanel from './app/panels/LayoutPanel';
import InstalledUnitsPanel from './app/panels/InstalledUnitsPanel';
import CabinetFormPanel from './app/panels/CabinetFormPanel';
import ZonesEditor from './app/panels/ZonesEditor';
import type { ListRow } from './app/panels/InstalledUnitsPanel';
import { generateFactoryBOMReport, convertBOMToCSVString } from './math/bomEngine';
import { checkStock } from './math/stockCheck';
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
  frontHardwareNeedsOf,
  resolveDraft,
} from './math/cabinetPresets';
import {
  DEFAULT_LAYOUT, DEFAULT_WALL_GAP_MM, DEPTH_LIMITS_MM, DEFAULT_ROOM_DEPTH_MM, DEFAULT_ROOM_HEIGHT_MM, HEIGHT_LIMITS_MM, KitchenLayout, RUN_LABELS, WALL_GAP_LIMITS_MM, WIDTH_LIMITS_MM,
  autoArrange, clampOnWall, cornerClearanceMm, cornerWalls, fitStates, placeAlongWall, runOf, runsOf, wallLengthOf, wallMountIssues,
} from './math/kitchenLayout';
import { cornerDeckOf, cornerDimsOf, cornerFitsWalls, cornerGroupSpan, L_CORNER_LIMITS, lCornerCabinets, relayoutCornerGroup, withCornerExtension } from './math/lCorner';
import type { CornerGroupDims, CornerRole } from './math/lCorner';
import { CORNER, COUNTERTOP, LAYOUT } from './math/constants';
import { BACK_PANEL_LABELS } from './math/backPanel';
import { carriesCountertop, clampCountertopSettings, countertopDepthMm, COUNTERTOP_DEFAULT } from './math/countertop';
import { useTextureCatalog } from './data/textureCatalog';
import { frontPanelCount } from './math/zones';
import type { CountertopSettings } from './math/countertop';
import { clampInt, uid } from './math/utils';
import { baseOf } from './math/base';
import { BaseType, CabinetBase, CabinetCategory, CabinetObject, CabinetZone, RunId } from './types/flatma';
import { priceCabinet } from './math/partsEngine';
import { FAMILIES, FamilyId, canUseGola, kinematicOfHardware, liftZoneIsTop, templatesOf } from './rules';

// One model of a cabinet for the whole screen: the form edits a CabinetDraft, the "3D ATOMIC WORKSPACE" renders that
// draft with the same assembly components as the "3D EXECUTIVE SHOWCASE", and "inject" stores exactly that object.
// (The former flat-rectangle board generator was removed: the preview now renders the real cabinet.)



/** A number box that commits on Enter or when it loses focus (a move is one undo step, not one per typed digit). */

export default function App() {
  const {
    cabinets,
    baselineInventory,
    activeCabinetId,
    setActiveCabinetId,
    addCabinet,
    addCabinets,
    deleteCabinets,
    moveCabinets,
    updateCabinet,
    updateManyCabinets,
    patchCabinets,
    triggerUndo,
    canUndo,
    loadProject,
  } = useFurniture();

  // 🧾 The stock checks and the BOM read the stock AS ENTERED (before this project), never the shelf already relieved by it:
  // the live hardware count is spent as cabinets are added, so reading it here would count the same pieces twice.
  const woods = baselineInventory.woodPanels;
  const edgeRolls = baselineInventory.edgeBandRolls ?? [];
  const hardwareItems = baselineInventory.hardwareItems;

  const [hardwareSettings] = useState({ carcaseThickness: 18, frontThickness: 18, wallSplashHeight: 600 });
  const [countertopPath] = useState([{ x: 0, zOffset: 0 }, { x: 2400, zOffset: 0 }]);
  // The worktop slab: shown or hidden, 20–40 mm thick, 580–650 mm deep. Drawn and dimensioned — never priced.
  const [countertop, setCountertop] = useState<CountertopSettings>(COUNTERTOP_DEFAULT);
  const setCountertopSettings = (fields: Partial<CountertopSettings>) => setCountertop((v) => clampCountertopSettings({ ...v, ...fields }));


  // How far the fronts reach from the wall (carcase + door + nosing). The slab is NEVER stretched to it any more: the number
  // typed is the number drawn, and when it stops short the panel says by how many millimetres and offers the one click that
  // covers it. One number in, one slab out.
  const countertopShort = useMemo(() => {
    const bases = cabinets.filter((c) => carriesCountertop(c));
    if (bases.length === 0) return null;
    const zBack = Math.min(...bases.map((c) => -c.positionZ));
    const zFront = Math.max(...bases.map((c) => c.depth + c.frontThickness - c.positionZ)) + LAYOUT.COUNTERTOP_FRONT_OVERHANG_MM;
    const { depthMm, shortByMm } = countertopDepthMm(countertop.depthMm, zFront - zBack);
    void depthMm;
    if (shortByMm <= 0) return null;
    const needed = Math.round(zFront - zBack);
    return { neededMm: needed, shortByMm, canCover: needed <= COUNTERTOP.DEPTH_MM[1] };
  }, [cabinets, countertop.depthMm]);
  // The finishes of the Workshop Matrix (public/textures), the same shelf the fronts pick from.
  const localTextures = useTextureCatalog();
  const [countertopFinishOpen, setCountertopFinishOpen] = useState(false);

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
  const layout = useMemo<KitchenLayout>(() => ({
    ...rawLayout,
    widthMm: clampInt(rawLayout.widthMm, WIDTH_LIMITS_MM[0], WIDTH_LIMITS_MM[1], DEFAULT_LAYOUT.widthMm),
    // Side walls (L / U) are as long as the room is deep: this is what stops a unit from leaving the room.
    depthMm: clampInt(rawLayout.depthMm ?? DEFAULT_ROOM_DEPTH_MM, DEPTH_LIMITS_MM[0], DEPTH_LIMITS_MM[1], DEFAULT_ROOM_DEPTH_MM),
    // Floor to ceiling, and the standard gap between the worktop and the wall units (a wall unit may choose its own).
    heightMm: clampInt(rawLayout.heightMm ?? DEFAULT_ROOM_HEIGHT_MM, HEIGHT_LIMITS_MM[0], HEIGHT_LIMITS_MM[1], DEFAULT_ROOM_HEIGHT_MM),
    wallGapMm: clampInt(rawLayout.wallGapMm ?? DEFAULT_WALL_GAP_MM, WALL_GAP_LIMITS_MM[0], WALL_GAP_LIMITS_MM[1], DEFAULT_WALL_GAP_MM),
  }), [rawLayout]);
  const { accessories, add: addAccessory, nudge: nudgeAccessory, remove: removeAccessory, changeFinish: changeAccessoryFinish, clear: clearAccessories, replace: replaceAccessories } = useAccessories(cabinets, layout.wallGapMm ?? DEFAULT_WALL_GAP_MM, layout.heightMm);

  // ---- project files: new / open / save on the user's device (src/project) -----------------------------------
  // The saved state is exactly what reopening must reproduce: the cabinets, the stock AS ENTERED (the live shelf
  // is derived from it), the room, the worktop slab and the accessories. Everything else (draft, selection) is
  // session furniture and stays out of the file.
  const projectData = useMemo<ProjectData>(() => ({
    cabinets,
    baselineInventory,
    layout,
    counterTop: countertop,
    accessories,
  }), [cabinets, baselineInventory, layout, countertop, accessories]);
  const applyProject = (data: ProjectData) => {
    loadProject(data.cabinets, data.baselineInventory);
    setRawLayout(data.layout);
    setCountertop(clampCountertopSettings(data.counterTop));
    replaceAccessories(data.accessories);
    setEditingId(null);
    setLayoutNotice(null);
  };
  const resetProject = () => {
    loadProject([], baselineInventory); // a new project keeps the workshop's stock, as entered
    setRawLayout(DEFAULT_LAYOUT);
    setCountertop(COUNTERTOP_DEFAULT);
    clearAccessories();
    setEditingId(null);
    setLayoutNotice(null);
  };
  const project = useProjectFile({ data: projectData, apply: applyProject, reset: resetProject });
  // Where the worktop and the ceiling are: what a wall unit's place (standard gap, from the ceiling, from the floor) is measured from.
  const wallRef = useMemo(() => {
    const counters = cabinets.filter(carriesCountertop);
    const baseHeight = counters.length > 0 ? Math.max(...counters.map((c) => c.height)) : LAYOUT.DEFAULT_BASE_HEIGHT_MM;
    return { counterTopMm: baseHeight + countertop.thicknessMm, defaultGapMm: layout.wallGapMm ?? DEFAULT_WALL_GAP_MM, roomHeightMm: layout.heightMm ?? DEFAULT_ROOM_HEIGHT_MM };
  }, [cabinets, countertop.thicknessMm, layout.wallGapMm, layout.heightMm]);
  const wallIssues = useMemo(() => wallMountIssues(cabinets, wallRef), [cabinets, wallRef]);
  /** Why the last add / move was refused (a full wall, a unit wider than its wall). Cleared on the next success. */
  const [layoutNotice, setLayoutNotice] = useState<string | null>(null);
  // Width of the FIXED filler panel that closes the corner side of an L-corner arm (math/cornerFiller.ts). undefined = automatic
  // (front thickness + 1.5 mm). Kept beside the draft because the draft is the cabinet's geometry, not its corner details.
  const [cornerFillerMm, setCornerFillerMm] = useState<number | undefined>(undefined);  // Which sides of the corner box carry a fixed filler (math/cornerFiller.ts). undefined = automatic (the corner side, when a
  // front slides out); [] = none. Both sides can carry one: the far side is for looks, the corner side is what makes the drawer
  // pass beside the neighbour's closed door.
  const [cornerFillerSides, setCornerFillerSides] = useState<Array<'LEFT' | 'RIGHT'> | undefined>(undefined);
  // The numbers a corner was built with (the square's side and the two arms). They used to be frozen at creation: the form
  // showed the corner's W/D but the save wrote the OLD width back, and the other two boxes never moved, so widening an arm
  // opened a gap at the door side. Read here when the edit opens, then re-applied to all three boxes by relayoutCornerGroup.
  const [cornerDims, setCornerDims] = useState<CornerGroupDims | null>(null);
  const layoutRuns = runsOf(layout);
  const [activeRunRaw, setActiveRun] = useState<RunId>('A');
  const activeRun: RunId = layoutRuns.includes(activeRunRaw) ? activeRunRaw : 'A'; // the wall a new cabinet is added on
  const handleLayoutChange = (fields: Partial<KitchenLayout>) => setRawLayout((prev) => ({ ...prev, ...fields }));

  // The L corner: arm widths (the width of each door) and the level (floor or wall).
  const [armA, setArmA] = useState<number>(450);
  const [armB, setArmB] = useState<number>(450);
  const [cornerWallRaw, setCornerWall] = useState<'B' | 'C'>('B');
  const cornerArm = (v: number) => clampInt(v, L_CORNER_LIMITS.ARM_MM[0], L_CORNER_LIMITS.ARM_MM[1], 450);
  const fits = useMemo(() => fitStates(cabinets, layout, wallRef), [cabinets, layout, wallRef]);
  // Does the workshop really have the boards, the edge-band metres and the pieces this kitchen needs? (math/stockCheck.ts)
  const stockShortages = useMemo(() => checkStock(cabinets, woods, hardwareItems, edgeRolls), [cabinets, woods, hardwareItems, edgeRolls]);

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
    if (isCornerBuilder) {
      const arm = draftToPreviewCabinet({ ...resolved, width: cornerArm(armA), depth: cornerDepth, zones: resolved.zones.map((z) => (z.kind === 'DOORS' ? { ...z, hingeSide: 'RIGHT' as const } : z)) }, woods);
      return { ...arm, omitSides: ['LEFT' as const] };
    }
    const base = draftToPreviewCabinet(resolved, woods);
    // An arm of a corner shows ALREADY WIDENED while it is being edited: what the 3D draws is what the save will store, filler
    // included (math/cornerFiller.ts). `withCornerExtension` subtracts the stored extension first, so editing twice changes nothing.
    if (!editing?.cornerSide) return base;
    const frontTh = woods.find((m) => m.id === resolved.frontMaterialId)?.thickness ?? (editing.frontThickness || 18);
    const ext = withCornerExtension(
      { ...base, cornerSide: editing.cornerSide, run: editing.run, cornerExtensionMm: editing.cornerExtensionMm, cornerFillerMm, cornerFillerSides },
      resolved.zones,
      frontTh,
    );
    // The open side, the role and the shared L bottom belong to the preview too: without them the 3D showed a closed box and
    // a drawer box centred on the full width — a picture the save would never produce.
    return { ...base, width: ext.width, cornerSide: editing.cornerSide, cornerFillerMm, cornerFillerSides, omitSides: editing.omitSides, cornerRole: editing.cornerRole, cornerGroupDeckMm: editing.cornerGroupDeckMm, run: editing.run };
  }, [resolved, woods, isCornerBuilder, armA, cornerDepth, editing, cornerFillerMm, cornerFillerSides]);
  // ---- the corner's own numbers, while it is being edited ---------------------------------------------------------
  // The box in the form is one of three, and its width is not its own: it is the arm's. So the form shows the three
  // numbers of the corner (square, arm along the back wall, arm along the side wall) and every one of them can be typed,
  // at any time, in any size. `cornerDimsOf` reads them back from the boxes; `relayoutCornerGroup` puts the three boxes
  // back on the wall from them in ONE write, which is what keeps the doors of the arms shut against each other.
  const editingCornerRole: CornerRole | null = editing && cornerDims
    ? (editing.cornerRole ?? (Math.abs(editing.width - editing.depth) < 0.5 ? 'SQUARE' : 'ARM_A'))
    : null;
  /** The field of the corner panel that stands for the box the form has open (its W is that number, not a width of its own). */
  const cornerDimKeyOf = (role: CornerRole): keyof Omit<CornerGroupDims, 'wall'> =>
    role === 'ARM_A' ? 'armAMm' : role === 'ARM_B' ? 'armBMm' : 'depthMm';

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
    // `panels` is the honest answer to «is there a front at all?»: a washing-machine / dishwasher bay under the worktop is an
    // open niche with no front panel, so the atomic view must not ask it for a band (math/zones.frontPanelCount).
    return { front: { ...info('front', previewCabinet.frontEdgeRollId), panels: frontPanelCount(previewPricing.parts) }, carcase: info('carcase', previewCabinet.carcaseEdgeRollId) };
  }, [previewPricing, previewCabinet, edgeRolls]);
  const DESIGN_ISSUES = ['ZONES_TOO_TALL', 'APPLIANCE_TOO_NARROW', 'APPLIANCE_TOO_SHALLOW', 'APPLIANCE_ZONE_TOO_SHORT', 'APPLIANCE_ZONE_WIDE', 'SPLIT_NO_ROOM', 'DOORS_TOO_NARROW', 'SHELVES_TOO_CLOSE', 'GOLA_ZONE_TOO_SHORT', 'GOLA_NOT_WITH_INSET', 'LIFT_ZONE_NOT_TOP', 'NO_FRONT_HARDWARE', 'NO_PUSH_ITEM', 'NO_GOLA_ITEM', 'NO_CARCASE_MATERIAL', 'NO_FRONT_MATERIAL'];
  const designIssues = previewPricing.issues.filter((i) => DESIGN_ISSUES.includes(i.code));

  const patchDraft = (fields: Partial<CabinetDraft>) => setDraft((prev) => ({ ...prev, ...fields }));
  // ---- the base under a floor unit: legs / plinth / wooden frame (math/base.ts) ----------------------------------------------
  const setBase = (fields: Partial<CabinetBase>) => setDraft((prev) => ({ ...prev, base: { ...(prev.base ?? { type: 'NONE' as BaseType }), ...fields } }));
  const setBaseType = (v: string) => setDraft((prev) => ({ ...prev, base: v === 'LEGACY' ? undefined : { ...(prev.base ?? {}), type: v as BaseType } }));
  const numOrUndef = (v: string): number | undefined => (v.trim() === '' || !Number.isFinite(Number(v)) ? undefined : Number(v));
  const normalizeDraft = () => setDraft((prev) => resolveDraft(prev, woods, hardwareItems, edgeRolls));

  const handleSubtypeChange = (subtype: CabinetSubtype) =>
    setDraft((prev) =>
      draftFromPreset(subtype, { carcaseMaterialId: prev.carcaseMaterialId, frontMaterialId: prev.frontMaterialId, carcaseEdgeRollId: prev.carcaseEdgeRollId, frontEdgeRollId: prev.frontEdgeRollId, base: prev.base }),
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
  const baseNow = useMemo(() => baseOf(previewCabinet), [previewCabinet]); // what the chosen base really is (limits, defaults, ignored)
  const applyBaseToAll = () => {
    const ids = cabinets.filter((c) => c.category === 'BASE_UNIT').map((c) => c.id);
    if (ids.length === 0 || !resolved.base) return;
    if (!window.confirm(`تطبيق هذه القاعدة على كل الخزائن السفلية (${ids.length})؟`)) return;
    updateManyCabinets(ids, { base: { ...resolved.base } });
  };
  /** One back for the whole kitchen: the same three choices, written to every cabinet at once. */
  const applyBackToAll = () => {
    const ids = cabinets.map((c) => c.id);
    if (ids.length === 0) return;
    const mode = draft.backPanel ?? 'HDF';
    const label = BACK_PANEL_LABELS[mode];
    if (!window.confirm(`تطبيق خلفية «${label}» على كل الخزائن (${ids.length})؟`)) return;
    updateManyCabinets(ids, { backPanel: mode, backRailDepthMm: mode === 'RAILS' ? draft.backRailDepthMm : undefined });
  };
  const canInject = canSave && blockingIssues.length === 0;
  // A corner needs a wall that forms it (L or U layout) and no corner of this level already on that wall.
  const canAddNow = canInject && (!isCornerBuilder || (!!cornerWall && !cornerTaken(cornerWall)));

  /** The sentence about the fixed filler of a corner arm: the same words whether the arm is edited alone or inside its corner. */
  const cornerArmNotice = (
    ext: { width: number; cornerFillers: { left: number; right: number } },
    zones: ReadonlyArray<CabinetZone>,
  ): string | null => {
    const { left, right } = ext.cornerFillers;
    const both = left > 0 && right > 0;
    const where = both ? 'على الجهتين' : left > 0 ? 'على الجهة اليسرى' : 'على الجهة اليمنى';
    const panelMm = both ? left : left > 0 ? left : right;
    const slides = zones.some((z) => z.kind === 'DRAWERS' || z.split?.fill === 'PULL_OUT');
    const frontMm = Math.round((Math.min(ext.width - 0.5, ext.width - right) - Math.max(0.5, left)) * 10) / 10;
    if (left > 0 || right > 0) {
      return `🖇️ ضلفة زاوية ثابتة بعرض ${panelMm} مم ${where} من أسفل الهيكل إلى أعلاه${slides ? `، والدرج يمرّ أمامها بفراغ ${CORNER.DRAWER_CLEARANCE_MM} مم` : ' — للجمال فقط، لا أدراج في هذا الذراع'}. عرض الذراع ${ext.width} مم · الواجهة ${frontMm} مم.`;
    }
    if (slides) return `↔️ بلا ضلفة: عرض الذراع ${ext.width} مم، والدرج يصل إلى حافة الزاوية أمام باب الذراع الآخر.`;
    return null;
  };

  const handleSaveCabinet = () => {
    if (!canAddNow) return;
    if (isCornerBuilder) { if (cornerWall) handleAddLCorner(cornerWall); return; }
    if (editing) {
      const patch = draftToCabinetPatch(resolved);
      // The corner side of an arm that carries drawers is closed by a FIXED filler INSIDE the arm's width (math/cornerFiller.ts):
      // the arm itself never grows, so nothing on the wall moves. A width an older version had widened is given back here too.
      const frontTh = woods.find((m) => m.id === resolved.frontMaterialId)?.thickness ?? (editing.frontThickness || 18);
      const corner = editing.cornerSide
        ? withCornerExtension({ ...editing, cornerFillerMm, cornerFillerSides }, resolved.zones, frontTh)
        : null;
      // `cornerFillerMm` / `cornerFillerSides` are written back as the user left them (undefined = automatic), so changing the
      // door thickness later moves the filler with it instead of freezing the number that happened to be right that day.
      const savedPatch = corner
        ? { ...patch, width: corner.width, positionX: corner.positionX, cornerExtensionMm: 0, cornerFillerMm, cornerFillerSides }
        : patch;
      // ── a box of an L corner: the corner has THREE numbers, and changing any one of them moves all three boxes ─────
      // Before this, the boxes kept the sizes they were born with: the form showed the corner's W and D, the save wrote the
      // box's old width back, and the other two boxes never moved — so a wider arm left the door side hanging in the air.
      const groupCabs = editing.groupId ? cabinets.filter((c) => c.groupId === editing.groupId) : [];
      type CornerSave = { refused: string } | { patches: Array<{ id: string; fields: Partial<CabinetObject> }>; dims: CornerGroupDims };
      const cornerBox: CornerSave | null = groupCabs.length === 3 && cornerDims !== null && editingCornerRole !== null ? (() => {
        const role = editingCornerRole;
        // The box the form has open gives its own slot: its W is the arm's width (the square's is its depth), so typing in
        // the header and typing in the corner panel are ONE edit and can never disagree.
        const dims: CornerGroupDims = {
          wall: cornerDims.wall,
          depthMm: Math.round(role === 'SQUARE' ? resolved.width : resolved.depth),
          armAMm: Math.round(role === 'ARM_A' ? resolved.width : cornerDims.armAMm),
          armBMm: Math.round(role === 'ARM_B' ? resolved.width : cornerDims.armBMm),
        };
        const span = cornerGroupSpan(dims);
        const backWall = wallLengthOf(layout, 'A');
        const sideWall = wallLengthOf(layout, dims.wall);
        if (!cornerFitsWalls(span, backWall, sideWall)) {
          return { refused: `⛔ مقاسات الزاوية هذه تحتاج ${Math.round(span.alongA)} مم على الجدار الخلفي (المتاح ${Math.round(backWall)}) و${Math.round(span.alongSide)} مم على الجدار الجانبي (المتاح ${Math.round(sideWall)}). لم يُغيَّر شيء: قلّل المربع أو أحد الذراعين.` };
        }
        // All three boxes, from the three numbers: width, depth, run and start on the wall (math/lCorner.ts).
        const placed = relayoutCornerGroup(groupCabs, dims, backWall);
        const byId = new Map(placed.map((x) => [x.id, x]));
        const projected = cabinets.map((c) => {
          const at = byId.get(c.id);
          if (!at) return c;
          return { ...c, ...(c.id === editing.id ? patch : {}), width: at.width, depth: at.depth, positionX: at.positionX, run: at.run, cornerExtensionMm: 0 };
        });
        // ONE L bottom for the three (math/lCorner.ts): re-read from the boxes as they will be, written on all three.
        const deck = cornerDeckOf(projected.filter((c) => c.groupId === editing.groupId));
        return {
          patches: projected.filter((c) => byId.has(c.id)).map((c) => ({
            id: c.id,
            fields: {
              ...(c.id === editing.id ? patch : {}),
              width: c.width,
              depth: c.depth,
              positionX: c.positionX,
              run: c.run,
              cornerExtensionMm: 0,
              ...(c.id === editing.id && editing.cornerSide ? { cornerFillerMm, cornerFillerSides } : {}),
              ...(deck ? { cornerGroupDeckMm: deck } : {}),
            } as Partial<CabinetObject>,
          })),
          dims,
        };
      })() : null;
      if (cornerBox && 'refused' in cornerBox) { setLayoutNotice(cornerBox.refused); return; }
      if (cornerBox) {
        // One write, one undo step: the three boxes are one unit and must never be seen half-resized.
        patchCabinets(cornerBox.patches);
        setCornerDims(cornerBox.dims);
        // What the arm really is after the save (the filler is re-read on the NEW width): the same sentence as before.
        const mine = cornerBox.patches.find((x) => x.id === editing.id)?.fields;
        const after = withCornerExtension({ ...editing, ...patch, width: mine?.width ?? editing.width, positionX: mine?.positionX ?? editing.positionX, cornerExtensionMm: 0, cornerFillerMm, cornerFillerSides }, resolved.zones, frontTh);
        const spanNow = cornerGroupSpan(cornerBox.dims);
        const group = `📐 الزاوية ${cornerBox.dims.depthMm} × (${cornerBox.dims.armAMm} + ${cornerBox.dims.armBMm}): تشغل ${Math.round(spanNow.alongA)} مم على الجدار الخلفي و${Math.round(spanNow.alongSide)} مم على الجانبي، والصناديق الثلاثة تحرّكت معاً.`;
        setLayoutNotice([cornerArmNotice(after, resolved.zones), group].filter(Boolean).join(' '));
        setEditingId(null);
        return;
      }
      // The three boxes of a corner stand on ONE L bottom (math/lCorner.ts): an arm edited here changes the piece itself, so
      // the group's deck is worked out again from the boxes as they will be, and written on all three (one board, one cut).
      const groupIds = groupCabs.map((c) => c.id);
      const nextGroup = groupIds.length
        ? cabinets.filter((c) => c.groupId === editing.groupId).map((c) => (c.id === editing.id ? { ...c, ...savedPatch } : c))
        : [];
      const deckNow = nextGroup.length ? cornerDeckOf(nextGroup) : null;
      const deckSame = nextGroup.every((c) => (c.cornerGroupDeckMm?.armAMm ?? null) === (deckNow?.armAMm ?? null) && (c.cornerGroupDeckMm?.armBMm ?? null) === (deckNow?.armBMm ?? null));
      updateCabinet(editing.id, deckNow && !deckSame ? { ...savedPatch, cornerGroupDeckMm: deckNow } : savedPatch);
      if (groupIds.length && deckNow && !deckSame) updateManyCabinets(groupIds.filter((id) => id !== editing.id), { cornerGroupDeckMm: deckNow });
      if (corner) setLayoutNotice(cornerArmNotice(corner, resolved.zones));
      setEditingId(null);
      return;
    }
    // A side wall starts after whatever stands in its corner on the back wall; a straight kitchen starts at 0 as it always did.
    const from = cornerClearanceMm(cabinets, layout, activeRun, resolved.category);
    const place = placeAlongWall(cabinets, layout, activeRun, resolved.category, resolved.width, from);
    if (!place.ok) {
      setLayoutNotice(place.reason === 'TOO_WIDE'
        ? `⛔ عرض هذه الخزانة (${resolved.width} مم) أكبر من المساحة المتاحة على ${RUN_LABELS[activeRun]} (${Math.round(place.freeMm)} مم).`
        : `⛔ لا توجد مساحة فارغة كافية على ${RUN_LABELS[activeRun]}: المتبقي ${Math.round(place.freeMm)} مم والمطلوب ${resolved.width} مم. حرّك الوحدات أو أطل الجدار.`);
      return;
    }
    setLayoutNotice(null);
    addCabinet({
      ...draftToNewCabinet(resolved, {
        id: uid('cab'),
        name: `${preset.label} #${cabinets.length + 1}`,
        positionX: place.positionX,
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
  const nudgeCabinet = (id: string, deltaMm: number) => {
    const cab = cabinets.find((c) => c.id === id);
    if (!cab) return;
    const x = clampOnWall(cab.positionX + deltaMm, cab.width, wallLengthOf(layout, runOf(cab)));
    moveCabinets([{ id, positionX: x }]);
  };
  /** Another wall: the unit goes to the first free place there (after the corner, if something stands in it). */
  const moveToRun = (id: string, run: RunId) => {
    const cab = cabinets.find((c) => c.id === id);
    if (!cab || runOf(cab) === run) return;
    const others = cabinets.filter((c) => c.id !== id);
    const place = placeAlongWall(others, layout, run, cab.category, cab.width, cornerClearanceMm(others, layout, run, cab.category));
    if (!place.ok) {
      setLayoutNotice(place.reason === 'TOO_WIDE'
        ? `⛔ عرض هذه الخزانة (${cab.width} مم) أكبر من المساحة المتاحة على ${RUN_LABELS[run]} (${Math.round(place.freeMm)} مم).`
        : `⛔ لا توجد مساحة فارغة كافية على ${RUN_LABELS[run]}: المتبقي ${Math.round(place.freeMm)} مم فقط.`);
      return;
    }
    setLayoutNotice(null);
    moveCabinets([{ id, run, positionX: place.positionX }]);
  };
  /** A typed position is clamped like a dragged one: a unit never leaves its wall. */
  const setCabinetPosition = (id: string, positionX: number) => {
    const cab = cabinets.find((c) => c.id === id);
    if (!cab) return;
    moveCabinets([{ id, positionX: clampOnWall(positionX, cab.width, wallLengthOf(layout, runOf(cab))) }]);
  };
  /** Auto arrange packs the units from the start of each wall; if the row is longer than the wall, nothing moves. */
  const handleAutoArrange = () => {
    const moves = autoArrange(cabinets, layout);
    const overflow = moves
      .map((m) => ({ m, cab: cabinets.find((c) => c.id === m.id) }))
      .find(({ m, cab }) => cab && m.positionX + cab.width > wallLengthOf(layout, runOf(cab)) + 0.5);
    if (overflow?.cab) {
      setLayoutNotice(`⛔ الترتيب التلقائي يتطلب ${Math.round(overflow.m.positionX + overflow.cab.width)} مم على ${RUN_LABELS[runOf(overflow.cab)]}، والجدار ${Math.round(wallLengthOf(layout, runOf(overflow.cab)))} مم فقط. لم يُحرَّك شيء.`);
      return;
    }
    setLayoutNotice(null);
    moveCabinets(moves);
  };

  const handleEditCabinet = (id: string) => {
    const cab = cabinets.find((c) => c.id === id);
    if (!cab) return;
    setEditingId(id);
    setActiveCabinetId(id);
    setCornerFillerMm(cab.cornerFillerMm);
    setCornerFillerSides(cab.cornerFillerSides);
    // A box of an L corner opens with the corner's THREE numbers (the square and both arms), read from the group — so the
    // panel below can resize the corner instead of only the one box the list happened to open.
    setCornerDims(cab.groupId ? cornerDimsOf(cabinets.filter((c) => c.groupId === cab.groupId)) : null);
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
  const handleDeleteFromCanvas = (id: string) => {
    const cab = cabinets.find((c) => c.id === id);
    const ids = cab?.groupId ? cabinets.filter((c) => c.groupId === cab.groupId).map((c) => c.id) : [id];
    deleteCabinets(ids);
    if (editingId && ids.includes(editingId)) setEditingId(null);
  };
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
    fits[id] === 'OUT_OF_BOUNDS' ? 'border-red-600 bg-red-50'
    : fits[id] === 'OVERLAP' ? 'border-red-500 bg-red-50'
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

      {/* 💾 ملف المشروع: جديد / فتح / حفظ على جهاز المستخدم + الاسترجاع التلقائي (src/project) */}
      <div className="w-full border border-[#E4E4E7] bg-white rounded-xl px-4 py-2 mb-3 shadow-3xs">
        <ProjectToolbar
          name={project.name} onName={project.setName} dirty={project.dirty} lastSavedAt={project.lastSavedAt}
          inPlace={project.inPlace} status={project.status} onClearStatus={project.clearStatus}
          onNew={project.newProject} onOpen={project.open} onSave={project.save} onSaveAs={project.saveAs}
          recovery={project.recovery} onRecover={project.recover} onDismissRecovery={project.dismissRecovery}
        />
      </div>

      {/* 🔳 الشاشة المدمجة الحركية بنظام النوافذ المتبادلة */}
      <div className={`w-full grid ${gridLayoutClass} gap-3 items-stretch flex-1`}>
        
        {/* 📋 الجناح الأول: المخازن والتسعير الصافي */}
        {!isWorkspaceMinimized && <StockPanel />}
        {/* 💻 الجناح الثاني المدمج: ورشة تفكيك الألواح الفردية بالمليمتر */}
        {!isWorkspaceMinimized && (
          <AtomicPanel
            previewCabinet={previewCabinet} showFronts={showFronts} isXRayMode={isXRayMode}
            woodPanels={woods} hardwareItems={hardwareItems} edges={previewEdges}
            editing={editing} presetNote={preset.note} canSave={canSave} isCornerBuilder={isCornerBuilder}
            isShowroomMinimized={isShowroomMinimized}
            onMinimizeWorkspace={() => { setIsWorkspaceMinimized(true); setIsShowroomMinimized(false); }}
          />
        )}
        <ShowcasePanel
          cabinets={cabinets} hardwareSettings={hardwareSettings} layout={layout}
          showFronts={showFronts} setShowFronts={setShowFronts} isXRayMode={isXRayMode} setIsXRayMode={setIsXRayMode}
          isWorkspaceMinimized={isWorkspaceMinimized} isShowroomMinimized={isShowroomMinimized}
          setIsWorkspaceMinimized={setIsWorkspaceMinimized} setIsShowroomMinimized={setIsShowroomMinimized}
          countertop={countertop} setCountertopSettings={setCountertopSettings} countertopShort={countertopShort}
          countertopPath={countertopPath} countertopFinishOpen={countertopFinishOpen} setCountertopFinishOpen={setCountertopFinishOpen}
          localTextures={localTextures} woodPanels={woods} hardwareItems={hardwareItems} accessories={accessories}
          onApplyTextureOverride={handleApplyTexture} onDeleteCabinet={handleDeleteFromCanvas}
          onAddAccessory={addAccessory} onNudgeAccessory={nudgeAccessory} onRemoveAccessory={removeAccessory}
          onFinishAccessory={changeAccessoryFinish} onClearAccessories={clearAccessories}
        />

        {/* 🛠️ الجناح الرابع والأخير: لوحة التحكم الـ 24 طرازاً وحقن العقد */}
        {!isWorkspaceMinimized && (
          <div className="xl:col-span-1 flex flex-col space-y-3 bg-white border border-slate-200 rounded-xl p-3 shadow-3xs text-right text-xs animate-fade-in max-h-[750px] overflow-y-auto" style={{ direction: 'rtl' }}>
            <span className="font-bold text-slate-900 block border-b border-slate-100 pb-1 text-sm">🛠️ الموديلات البرامترية والـ CNC</span>

            <LayoutPanel layout={layout} rawLayout={rawLayout} onLayoutChange={handleLayoutChange} wallIssues={wallIssues} layoutRuns={layoutRuns} activeRun={activeRun} setActiveRun={setActiveRun} />
            <CabinetFormPanel
              draft={draft} resolved={resolved} family={family} onFamilyChange={handleFamilyChange} onSubtypeChange={handleSubtypeChange}
              isCornerBuilder={isCornerBuilder} editing={editing} editingCornerRole={editingCornerRole} cornerDims={cornerDims} setCornerDims={setCornerDims}
              armA={armA} setArmA={setArmA} armB={armB} setArmB={setArmB} cornerWall={cornerWall} setCornerWall={setCornerWall}
              cornerWallList={cornerWallList} cornerTaken={cornerTaken} cornerDepth={cornerDepth} cornerArm={cornerArm} cornerDimKeyOf={cornerDimKeyOf}
              layout={layout} baseNow={baseNow} setBase={setBase} setBaseType={setBaseType} onApplyBaseToAll={applyBaseToAll} onApplyBackToAll={applyBackToAll}
              patchDraft={patchDraft} normalizeDraft={normalizeDraft} numOrUndef={numOrUndef} woods={woods} cabinets={cabinets}
            />
            <ZonesEditor
              draft={draft} resolved={resolved} previewPricing={previewPricing} isCornerBuilder={isCornerBuilder} editing={editing}
              woods={woods} edgeRolls={edgeRolls} doorOptions={doorOptions} drawerOptions={drawerOptions}
              hasDoorZone={hasDoorZone} hasDrawerZone={hasDrawerZone} isLift={isLift} golaAllowed={golaAllowed}
              designIssues={designIssues} blockingIssues={blockingIssues} canSave={canSave} canAddNow={canAddNow} wallRef={wallRef}
              cornerWall={cornerWall} patchDraft={patchDraft} normalizeDraft={normalizeDraft} baseZones={baseZones}
              updateZone={updateZone} replaceZone={replaceZone} addZone={addZone} moveZone={moveZone} removeZone={removeZone}
              cornerFillerMm={cornerFillerMm} cornerFillerSides={cornerFillerSides} setCornerFillerMm={setCornerFillerMm} setCornerFillerSides={setCornerFillerSides}
              onCancelEdit={() => { setEditingId(null); setCornerDims(null); }}
              onSaveCabinet={handleSaveCabinet} onExportFactoryBOM={handleExportFactoryBOM} onPrintCustomerInvoice={handlePrintCustomerInvoice}
            />
            <InstalledUnitsPanel
              cabinets={cabinets} listRows={listRows} fits={fits} fitClass={fitClass} editing={editing}
              activeCabinetId={activeCabinetId} setActiveCabinetId={setActiveCabinetId} stockShortages={stockShortages}
              layoutNotice={layoutNotice} layoutRuns={layoutRuns} onAutoArrange={handleAutoArrange}
              onEditCabinet={handleEditCabinet} onDeleteFromList={handleDeleteFromList} onSetCabinetPosition={setCabinetPosition}
              onNudgeCabinet={nudgeCabinet} onMoveToRun={moveToRun}
            />
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
