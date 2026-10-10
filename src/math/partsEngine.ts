// src/math/partsEngine.ts
// SINGLE SOURCE OF TRUTH for a cabinet: its parts, the hardware it needs, the edge band it consumes and what all that
// costs. costEngine, bomEngine, stockDelta and the 3D assemblies all read this, so the price, the cutting list, the
// stock and the picture cannot disagree (before, the BOM total and the sum of its own rows differed by 32-44 %).
//
// Conventions kept from the old BOM so existing cabinets keep their numbers:
//  - carcase boards (sides, bottom, roof, dividers, shelves): edge band on the FRONT edge only -> cut depth = depth - e
//  - top rails of base units: no band
//  - facades: band on all 4 edges -> cut width and height each - 2e
//  - board cost is prorated on the FINISHED area; edge band is priced apart, by the metre.
import {
  CabinetObject,
  EdgeBandRoll,
  InjectedHardwareItem,
  InjectedWoodMaterial,
} from '../types/flatma';
import { EDGE, FASTENER_STOCK, PANEL } from './constants';
import { drawerBoxDims, minDrawerFrontMm } from './drawerBox';
import { KINEMATICS, KinematicId, KinematicIssueCode, OPENING_HARDWARE, constructionOf, dividerBoardsOf, effectiveKinematic, hardwareCategoriesFor, hardwareKindOfZone, kinematicOfHardware, openingModeOf } from '../rules';
import { APPLIANCES, Facade, FrontPlan, ZoneLayout, isOpenCarcase, layoutZones, planFronts, zonesOf } from './zones';
import { bandPricePerMeterDA } from './edgeBand';
import { hingesPerDoor } from './hinges';
import { assemblyGeometry } from './assemblyGeometry';
import { buildFasteners, fastenerCounts } from './fasteners';

export type PartRole = 'carcase' | 'back' | 'front';
export type GrainDirection = 'vertical' | 'horizontal' | 'none';
export type EdgeBanding = 'NONE' | 'FRONT' | 'ALL';

export interface CabinetPart {
  partType: string;
  role: PartRole;
  thicknessMm: number;
  /** FINISHED size (edge band included). */
  widthMm: number;
  lengthMm: number;
  quantity: number;
  grain: GrainDirection;
  edge: EdgeBanding;
}

export type HardwareGroup = 'Front Hardware' | 'Gola Profile' | 'Push-Open' | 'Assembly Fixings' | 'Base Fixing System' | 'Wall Fixing System';

export interface HardwareRequirement {
  item: InjectedHardwareItem;
  quantity: number;
  group: HardwareGroup;
}

export interface CabinetIssue {
  code:
    | 'INVALID_DIMENSIONS'
    | 'NO_CARCASE_MATERIAL'
    | 'NO_FRONT_MATERIAL'
    | 'NO_FRONT_HARDWARE'
    | 'NO_GOLA_ITEM'
    | 'NO_PUSH_ITEM'
    | 'NO_LEGS_IN_STOCK'
    | 'NO_HANGERS_IN_STOCK'
    | 'BACK_PRICED_AS_CARCASE'
    | 'ZONES_TOO_TALL'
    | KinematicIssueCode
    | 'DRAWER_BOX_TOO_LOW'
    | 'APPLIANCE_TOO_NARROW'
    | 'APPLIANCE_TOO_SHALLOW'
    | 'APPLIANCE_ZONE_TOO_SHORT';
  severity: 'error' | 'warning';
  message: string;
}

// ------------------------------------------------------------------------------------------------ helpers

export const isGlassFront = (cab: Pick<CabinetObject, 'frontStyle'>, frontMat?: InjectedWoodMaterial): boolean =>
  cab.frontStyle === 'GLASS' || (!!frontMat && /glass/i.test(frontMat.type));

export function isLiftItem(hw?: InjectedHardwareItem): boolean {
  return kinematicOfHardware(hw)?.id === 'LIFT';
}

export { hingesPerDoor, openingModeOf };

/** Hardware that opens DOORS (hinges / lift) or DRAWERS (runners). Looks at both ids stored on the cabinet. */
export function pickFrontHardware(cab: CabinetObject, kind: 'DOORS' | 'DRAWERS', items: InjectedHardwareItem[]): InjectedHardwareItem | undefined {
  const ids = kind === 'DOORS'
    ? [cab.frontConfig.hardwareItemId, cab.frontConfig.drawerHardwareItemId]
    : [cab.frontConfig.drawerHardwareItemId, cab.frontConfig.hardwareItemId];
  const categories = hardwareCategoriesFor(kind === 'DOORS' ? 'DOOR' : 'DRAWER');
  const ok = (h: InjectedHardwareItem) => categories.includes(h.category);
  for (const id of ids) {
    const found = id ? items.find((h) => h.id === id) : undefined;
    if (found && ok(found)) return found;
  }
  return undefined;
}

// -------------------------------------------------------------------------------------------------- parts

export interface CabinetModel {
  layout: ZoneLayout;
  plan: FrontPlan;
  parts: CabinetPart[];
}

/** Layout + fronts + the list of parts, from the cabinet and the two board thicknesses. Pure geometry. */
export function modelCabinet(cab: CabinetObject, carcaseTh: number, frontTh: number, opts: { glass?: boolean; lift?: boolean } = {}): CabinetModel {
  const zones = zonesOf(cab);
  const layout = layoutZones(cab, carcaseTh);
  const plan = planFronts(cab, layout);
  const inner = Math.max(0, cab.width - 2 * carcaseTh);
  const open = isOpenCarcase(zones);
  const parts: CabinetPart[] = [];

  const carcase = (partType: string, widthMm: number, lengthMm: number, quantity: number, grain: GrainDirection, edge: EdgeBanding): CabinetPart =>
    ({ partType, role: 'carcase', thicknessMm: carcaseTh, widthMm: Math.max(0, widthMm), lengthMm: Math.max(0, lengthMm), quantity, grain, edge });

  parts.push(carcase('Side Panel (Left/Right)', cab.depth, cab.height, 2, 'vertical', 'FRONT'));
  if (!open) parts.push(carcase('Bottom Deck Panel', cab.depth, inner, 1, 'horizontal', 'FRONT'));
  if (!open && zones.length > 1) parts.push(carcase('Zone Divider Panel', cab.depth, inner, (zones.length - 1) * dividerBoardsOf(cab), 'horizontal', 'FRONT'));

  if (constructionOf(cab.category).top === 'RAILS') {
    parts.push(carcase('Top Stretcher Rail (Traverse)', PANEL.TRAVERSE_DEPTH_MM, inner, 2, 'horizontal', 'NONE'));
  } else {
    parts.push(carcase('Top Roof Panel', cab.depth, inner, 1, 'horizontal', 'FRONT'));
  }

  if (!open) {
    parts.push({ partType: 'Backwall Panel (MDF/HDF)', role: 'back', thicknessMm: PANEL.BACK_THICKNESS_MM, widthMm: cab.width, lengthMm: cab.height, quantity: 1, grain: 'vertical', edge: 'NONE' });
  }

  // A zone with pull-out frames carries baskets (its "shelves" are the basket levels), not fixed shelves.
  const basketZones = new Set(plan.facades.filter((f) => f.kinematic === 'PULL_OUT_FRAME').map((f) => f.zoneIndex));
  const shelves = zones.reduce((sum, z, i) => sum + ((z.kind === 'DOORS' || z.kind === 'OPEN') && !basketZones.has(i) ? Math.max(0, Math.round(z.shelves ?? 0)) : 0), 0);
  if (shelves > 0) {
    parts.push(carcase('Adjustable Internal Shelf', cab.depth - PANEL.SHELF_DEPTH_INSET_MM, inner - PANEL.SHELF_WIDTH_CLEARANCE_MM, shelves, 'horizontal', 'FRONT'));
  }

  // Facades: one row per zone (equal facades inside a zone share the row).
  const byZone = new Map<number, Facade[]>();
  plan.facades.forEach((f) => byZone.set(f.zoneIndex, [...(byZone.get(f.zoneIndex) ?? []), f]));
  const multi = zones.length > 1;
  byZone.forEach((list, zoneIndex) => {
    const f = list[0];
    const tag = multi ? ` [zone ${zoneIndex + 1}]` : '';
    let partType: string;
    let grain: GrainDirection = 'vertical';
    if (f.kind === 'DOOR') partType = `${opts.glass ? 'Glass Door Panel' : opts.lift ? 'Lift Facade Panel' : 'Door Facade Panel'} (1 of ${f.count})${tag}`;
    else if (f.kind === 'DRAWER') { partType = `Drawer Front Facade (1 of ${f.count})${tag}`; grain = 'horizontal'; }
    else if (f.kind === 'APRON') { partType = `Fixed Apron Panel${tag}`; grain = 'horizontal'; }
    else partType = `Appliance Front Panel${tag}`;
    parts.push({ partType, role: 'front', thicknessMm: frontTh, widthMm: f.widthMm, lengthMm: f.heightMm, quantity: list.length, grain, edge: 'ALL' });
  });

  // Drawer boxes: one per drawer that slides on runners (a pull-out frame is a metal set, it has no box). Equal drawers of a
  // zone share the rows; the boards are banded on their top edge (the long edge of the width x length rectangle).
  const boxRows = new Map<number, Facade[]>();
  plan.facades.filter((f) => f.kind === 'DRAWER' && f.kinematic !== 'PULL_OUT_FRAME').forEach((f) => boxRows.set(f.zoneIndex, [...(boxRows.get(f.zoneIndex) ?? []), f]));
  boxRows.forEach((list, zoneIndex) => {
    const tag = multi ? ` [zone ${zoneIndex + 1}]` : '';
    const n = list.length;
    const b = drawerBoxDims(list[0].heightMm, cab, carcaseTh);
    parts.push(carcase(`Drawer Box Side (Left/Right)${tag}`, b.heightMm, b.depthMm, 2 * n, 'horizontal', 'FRONT'));
    parts.push(carcase(`Drawer Box Inner Front${tag}`, b.heightMm, b.innerWidthMm, n, 'horizontal', 'FRONT'));
    parts.push(carcase(`Drawer Box Back${tag}`, b.heightMm, b.innerWidthMm, n, 'horizontal', 'FRONT'));
    parts.push({ partType: `Drawer Box Bottom (HDF)${tag}`, role: 'back', thicknessMm: b.bottomThMm, widthMm: b.outerWidthMm, lengthMm: b.depthMm, quantity: n, grain: 'horizontal', edge: 'NONE' });
  });

  return { layout, plan, parts };
}

// ---------------------------------------------------------------------------------------------- hardware

export function hardwareRequirements(
  cab: CabinetObject,
  items: InjectedHardwareItem[],
  plan?: FrontPlan,
  dims?: { carcaseTh: number; frontTh: number },
): HardwareRequirement[] {
  const th = dims?.carcaseTh ?? (cab.carcaseThickness > 0 ? cab.carcaseThickness : PANEL.DEFAULT_THICKNESS_MM);
  const fTh = dims?.frontTh ?? (cab.frontThickness > 0 ? cab.frontThickness : PANEL.DEFAULT_THICKNESS_MM);
  const frontPlan = plan ?? planFronts(cab, layoutZones(cab, th));
  const out: HardwareRequirement[] = [];
  const add = (item: InjectedHardwareItem | undefined, quantity: number, group: HardwareGroup) => {
    if (!item || quantity <= 0) return;
    const same = out.find((r) => r.item.id === item.id);
    if (same) same.quantity += quantity;
    else out.push({ item, quantity, group });
  };

  const doors = frontPlan.facades.filter((f) => f.kind === 'DOOR');
  const drawers = frontPlan.facades.filter((f) => f.kind === 'DRAWER');

  // Front mechanisms: each facade has an effective mechanism (rules/kinematics.ts) that says which stock item
  // supplies it (hinges / lift for doors, runners for drawers and pull-out frames) and how many pieces it needs.
  const doorHw = pickFrontHardware(cab, 'DOORS', items);
  const drawerHw = pickFrontHardware(cab, 'DRAWERS', items);
  const byMechanism = new Map<KinematicId, Facade[]>();
  frontPlan.facades.forEach((f) => {
    const id = effectiveKinematic(f, { lift: isLiftItem(doorHw) });
    if (id && (f.kind === 'DOOR' || f.kind === 'DRAWER')) byMechanism.set(id, [...(byMechanism.get(id) ?? []), f]);
  });
  // Door hardware rows first, then runners: the order the BOM has always listed them in.
  const hardwareKindOf = (id: KinematicId) => KINEMATICS[id].hardwareKind ?? KINEMATICS[id].drives[0];
  [...byMechanism.entries()]
    .sort(([a], [b]) => Number(hardwareKindOf(a) !== 'DOOR') - Number(hardwareKindOf(b) !== 'DOOR'))
    .forEach(([id, list]) => {
      const spec = KINEMATICS[id];
      if (spec.quantity) add(hardwareKindOf(id) === 'DOOR' ? doorHw : drawerHw, spec.quantity(list), 'Front Hardware');
    });

  // Opening mode extras (rules/openings.ts).
  if (openingModeOf(cab) === 'PUSH') {
    add(items.find((h) => h.category === OPENING_HARDWARE.PUSH.hardwareCategory), (doors.length + drawers.length) * OPENING_HARDWARE.PUSH.perFacade, 'Push-Open');
  }
  if (frontPlan.channels.length > 0) {
    const gola = items.find((h) => h.id === cab.frontConfig.golaProfileItemId) ?? items.find((h) => h.category === OPENING_HARDWARE.GOLA.hardwareCategory);
    add(gola, frontPlan.channels.length * OPENING_HARDWARE.GOLA.perChannel, 'Gola Profile');
  }

  // Connectors: the very ones the atomic workspace draws (cams, dowels, back screws, shelf pins).
  const geo = assemblyGeometry(cab, { carcaseTh: th, frontTh: fTh, lift: isLiftItem(doorHw), inset: !!doorHw && doorHw.modelType.includes('Inset Hinge') });
  const counts = fastenerCounts(buildFasteners(geo, cab, { carcaseTh: th, frontTh: fTh }));
  FASTENER_STOCK.forEach((rule) => add(items.find((h) => h.modelType.includes(rule.keyword)), counts[rule.kind], 'Assembly Fixings'));

  // Legs (base) or hanger plates (wall): rules/construction.ts.
  const fixing = constructionOf(cab.category).fixing;
  add(items.find((h) => h.modelType.includes(fixing.keyword)), fixing.perUnit, fixing.group);
  return out;
}

// ----------------------------------------------------------------------------------------------- pricing

export interface PricedPart extends CabinetPart {
  material?: InjectedWoodMaterial;
  /** Thickness (mm) of the band glued on this part (0 = none). */
  edgeMm: number;
  /** Size to CUT: finished size minus the band that is glued on. */
  cutWidthMm: number;
  cutLengthMm: number;
  /** Cost of all `quantity` pieces: the CUT board area prorated on the sheet price, whole DA. */
  boardCostDA: number;
  /** Metres of band for all `quantity` pieces (0 when no roll is chosen). */
  edgeMeters: number;
  /** CUT area of all `quantity` pieces. */
  areaM2: number;
  /** Sheet-equivalents consumed by all `quantity` pieces. */
  sheets: number;
}

export interface PricedHardware extends HardwareRequirement {
  totalCostDA: number;
}

export interface EdgeUsage {
  part: 'carcase' | 'front';
  roll: EdgeBandRoll;
  meters: number;
  costDA: number;
}

export interface ApplianceNote {
  cabinetName: string;
  label: string;
  nicheWidthMm: number;
  nicheHeightMm: number;
  nicheDepthMm: number;
  note: string;
}

export interface CabinetPricing {
  cabinetId: string;
  cabinetName: string;
  model: CabinetModel;
  parts: PricedPart[];
  hardware: PricedHardware[];
  edgeUsage: EdgeUsage[];
  appliances: ApplianceNote[];
  woodCostDA: number;
  edgeCostDA: number;
  hardwareCostDA: number;
  totalDA: number;
  issues: CabinetIssue[];
}

/** Area-prorated cost of ONE piece, whole DA. */
export function panelCostDA(widthMm: number, lengthMm: number, mat: InjectedWoodMaterial | undefined): number {
  if (!mat) return 0;
  const sheetArea = (mat.widthSheet * mat.heightSheet) / 1_000_000;
  if (!(sheetArea > 0)) return 0;
  return Math.round(((widthMm * lengthMm) / 1_000_000 / sheetArea) * mat.averagePriceDA * PANEL.WASTE_FACTOR);
}

export function priceCabinet(
  cab: CabinetObject,
  woods: InjectedWoodMaterial[],
  hardwareItems: InjectedHardwareItem[],
  edgeRolls: EdgeBandRoll[] = [],
): CabinetPricing {
  const issues: CabinetIssue[] = [];
  const name = cab.name;
  const carcaseMat = woods.find((m) => m.id === cab.carcaseMaterialId);
  const frontMat = woods.find((m) => m.id === cab.frontMaterialId);
  const hdfMat = woods.find((m) => /hdf/i.test(m.type) && m.thickness === PANEL.BACK_THICKNESS_MM);
  const carcaseTh = carcaseMat ? carcaseMat.thickness : cab.carcaseThickness > 0 ? cab.carcaseThickness : PANEL.DEFAULT_THICKNESS_MM;
  const frontTh = frontMat ? frontMat.thickness : cab.frontThickness > 0 ? cab.frontThickness : PANEL.DEFAULT_THICKNESS_MM;

  const dimsOk = [cab.width, cab.height, cab.depth].every((v) => Number.isFinite(v) && v > 0);
  const zones = zonesOf(cab);
  const hasFacades = zones.some((z) => z.kind === 'DOORS' || z.kind === 'DRAWERS' || z.kind === 'APRON' || (z.kind === 'APPLIANCE' && z.panelFront));

  if (!dimsOk) {
    issues.push({ code: 'INVALID_DIMENSIONS', severity: 'error', message: `Cabinet "${name}": width/height/depth must be positive numbers` });
    const empty = { layout: { bands: [], dividerBottomsMm: [], issues: [] }, plan: { facades: [], channels: [] }, parts: [] };
    return { cabinetId: cab.id, cabinetName: name, model: empty, parts: [], hardware: [], edgeUsage: [], appliances: [], woodCostDA: 0, edgeCostDA: 0, hardwareCostDA: 0, totalDA: 0, issues };
  }

  const doorHw = pickFrontHardware(cab, 'DOORS', hardwareItems);
  const model = modelCabinet(cab, carcaseTh, frontTh, { glass: isGlassFront(cab, frontMat), lift: isLiftItem(doorHw) });

  model.layout.issues.forEach((i) => issues.push({ code: i.code, severity: i.code === 'ZONES_TOO_TALL' ? 'error' : 'warning', message: `Cabinet "${name}": ${i.message}` }));
  if (!carcaseMat) issues.push({ code: 'NO_CARCASE_MATERIAL', severity: 'error', message: `Cabinet "${name}": carcase material is not in stock — carcase not priced` });
  if (hasFacades && !frontMat) issues.push({ code: 'NO_FRONT_MATERIAL', severity: 'error', message: `Cabinet "${name}": front material is not in stock — fronts not priced` });
  if (zones.some((z) => hardwareKindOfZone(z) === 'DOOR') && !doorHw) issues.push({ code: 'NO_FRONT_HARDWARE', severity: 'warning', message: `Cabinet "${name}": no hinge / lift selected for the doors — not priced` });
  if (zones.some((z) => hardwareKindOfZone(z) === 'DRAWER') && !pickFrontHardware(cab, 'DRAWERS', hardwareItems)) issues.push({ code: 'NO_FRONT_HARDWARE', severity: 'warning', message: `Cabinet "${name}": no drawer runners selected — not priced` });
  if (openingModeOf(cab) === 'PUSH' && !hardwareItems.some((h) => h.category === OPENING_HARDWARE.PUSH.hardwareCategory)) issues.push({ code: 'NO_PUSH_ITEM', severity: 'warning', message: `Cabinet "${name}": push-to-open selected but no "Push-Open Systems" item in stock — not priced` });
  if (model.plan.channels.length > 0 && !hardwareItems.some((h) => h.id === cab.frontConfig.golaProfileItemId || h.category === OPENING_HARDWARE.GOLA.hardwareCategory)) issues.push({ code: 'NO_GOLA_ITEM', severity: 'warning', message: `Cabinet "${name}": Gola channels but no "Gola & Handle Profiles" item in stock — profile not priced` });
  if (model.plan.facades.some((f) => f.kind === 'DRAWER' && f.kinematic !== 'PULL_OUT_FRAME' && f.heightMm < minDrawerFrontMm())) {
    issues.push({ code: 'DRAWER_BOX_TOO_LOW', severity: 'warning', message: `Cabinet "${name}": a drawer front is lower than ${minDrawerFrontMm()} mm, too low for a drawer box: use fewer drawers or a taller cabinet` });
  }
  // Mechanism limits (rules/kinematics.ts): one warning per code, however many fronts break it.
  const limitCodes = new Set<string>();
  model.plan.facades.forEach((f) => {
    const spec = f.kinematic ? KINEMATICS[f.kinematic] : undefined;
    spec?.constraints?.({ frontWidthMm: f.widthMm, cabinetDepthMm: cab.depth, sideBySide: f.kind === 'DOOR' ? f.count : 1 }).forEach((c) => {
      if (limitCodes.has(c.code)) return;
      limitCodes.add(c.code);
      issues.push({ code: c.code, severity: 'warning', message: `Cabinet "${name}": ${c.message}` });
    });
  });
  if (!hdfMat) issues.push({ code: 'BACK_PRICED_AS_CARCASE', severity: 'warning', message: 'No "HDF 3 mm" sheet in stock — back panels are priced with the carcase sheet' });

  const carcaseRoll = cab.carcaseEdgeRollId ? edgeRolls.find((r) => r.id === cab.carcaseEdgeRollId) : undefined;
  const frontRoll = cab.frontEdgeRollId ? edgeRolls.find((r) => r.id === cab.frontEdgeRollId) : undefined;
  const round2 = (n: number) => Math.round(n * 100) / 100;

  const parts: PricedPart[] = model.parts.map((p) => {
    const material = p.role === 'front' ? frontMat : p.role === 'back' ? hdfMat ?? carcaseMat : carcaseMat;
    const roll = p.role === 'front' ? frontRoll : p.role === 'carcase' ? carcaseRoll : undefined;
    const edgeMm = p.edge === 'NONE' ? 0 : Math.max(0, roll ? roll.thickness : material?.edgeThickness ?? 0);
    const cutWidth = p.edge === 'ALL' ? p.widthMm - 2 * edgeMm : p.edge === 'FRONT' ? p.widthMm - edgeMm : p.widthMm;
    const cutLength = p.edge === 'ALL' ? p.lengthMm - 2 * edgeMm : p.lengthMm;
    const perPieceMm = !roll ? 0 : p.edge === 'ALL' ? 2 * (p.widthMm + p.lengthMm) : p.edge === 'FRONT' ? p.lengthMm : 0;
    const cutW = round2(Math.max(0, cutWidth));
    const cutL = round2(Math.max(0, cutLength));
    // The board consumed from the sheet is the CUT piece (the band adds thickness, not board). The old BOM priced the
    // facades this way but the carcase boards on the finished size; now every part is priced on what is really cut.
    const areaM2 = (cutW * cutL * p.quantity) / 1_000_000;
    const sheetArea = material ? (material.widthSheet * material.heightSheet) / 1_000_000 : 0;
    return {
      ...p,
      material,
      edgeMm,
      cutWidthMm: cutW,
      cutLengthMm: cutL,
      boardCostDA: panelCostDA(cutW, cutL, material) * p.quantity,
      edgeMeters: (perPieceMm / 1000) * p.quantity * EDGE.WASTE_FACTOR,
      areaM2,
      sheets: sheetArea > 0 ? (areaM2 / sheetArea) * PANEL.WASTE_FACTOR : 0,
    };
  });

  const edgeUsage: EdgeUsage[] = [];
  const usage = (part: 'carcase' | 'front', roll: EdgeBandRoll | undefined) => {
    if (!roll) return;
    const meters = parts.filter((p) => (part === 'front' ? p.role === 'front' : p.role === 'carcase')).reduce((s, p) => s + p.edgeMeters, 0);
    if (meters > 0) edgeUsage.push({ part, roll, meters, costDA: Math.round(meters * bandPricePerMeterDA(roll)) });
  };
  usage('carcase', carcaseRoll);
  usage('front', frontRoll);

  const requirements = hardwareRequirements(cab, hardwareItems, model.plan, { carcaseTh, frontTh });
  const fixing = constructionOf(cab.category).fixing;
  if (!requirements.some((r) => r.group === fixing.group)) issues.push({ code: fixing.missingCode, severity: 'warning', message: `No "${fixing.keyword}" item in stock — ${fixing.noun} are not priced` });
  const hardware: PricedHardware[] = requirements.map((r) => ({ ...r, totalCostDA: Math.round(r.quantity * r.item.pricePerUnitDA) }));

  const appliances: ApplianceNote[] = zones.flatMap((z) => {
    if (z.kind !== 'APPLIANCE' || !z.appliance) return [];
    const s = APPLIANCES[z.appliance];
    return [{ cabinetName: name, label: s.label, nicheWidthMm: s.nicheWidthMm, nicheHeightMm: s.nicheHeightMm, nicheDepthMm: s.nicheDepthMm, note: s.note }];
  });

  const woodCostDA = parts.reduce((s, p) => s + p.boardCostDA, 0);
  const edgeCostDA = edgeUsage.reduce((s, u) => s + u.costDA, 0);
  const hardwareCostDA = hardware.reduce((s, h) => s + h.totalCostDA, 0);
  return { cabinetId: cab.id, cabinetName: name, model, parts, hardware, edgeUsage, appliances, woodCostDA, edgeCostDA, hardwareCostDA, totalDA: woodCostDA + edgeCostDA + hardwareCostDA, issues };
}
