// tests/fixtures/matrix.ts
// The control panel's vocabulary, as data.
//
// There is no catalogue any more: the app ships four starting points (src/rules/templates) and every cabinet is built from
// the form — a category, three dimensions, one to six zones (doors / drawers / open / appliance / apron), an opening mode,
// a front style, a divider and a base. This file writes down the same thing the form writes down, so the engine tests run on
// what the workshop can actually produce instead of on palaces the app used to offer.
//
// Nothing here may know an old template name: a configuration is a set of FIELD VALUES, and it is read by product tests as
// well as compatibility ones (tests/taxonomy.test.ts enforces that this file stays catalogue-free).
import * as P from '../../src/math/cabinetPresets';
import type { CabinetDraft } from '../../src/math/cabinetPresets';
import type { CabinetZone } from '../../src/types/flatma';

/**
 * A floor unit as the form builds it. `base: NONE` = "بدون (على الأرض)": the body keeps the finished height, which is the
 * state the numbers in the engine tests are written against. Base variants live at the bottom of CONFIGS.
 */
export const floorUnit = (over: Partial<CabinetDraft> = {}): CabinetDraft => ({
  ...P.draftFromPreset('Standard_Base'),
  base: { type: 'NONE' },
  ...over,
});

/** A wall unit as the form builds it: nothing under it, it hangs. */
export const wallUnit = (over: Partial<CabinetDraft> = {}): CabinetDraft => ({
  ...P.draftFromPreset('Standard_Wall'),
  ...over,
});

const z = (kind: CabinetZone['kind'], count?: number, shelves?: number, extra: Partial<CabinetZone> = {}): CabinetZone =>
  ({ kind, ...(count !== undefined ? { count } : {}), ...(shelves !== undefined ? { shelves } : {}), ...extra });

// ------------------------------------------------------------------------------------------------ the configurations
export const CONFIGS: Record<string, CabinetDraft> = {
  // ---- plain
  standardBase: floorUnit(),
  standardWall: wallUnit(),

  // ---- drawers and their opening modes
  deepDrawers: floorUnit({ zones: [z('DRAWERS', 2)] }),
  fourDrawersGola: floorUnit({ zones: [z('DRAWERS', 4)], openingMode: 'GOLA', golaSlots: [0, 2, 3] }),
  threeDrawersPush: floorUnit({ zones: [z('DRAWERS', 3)], openingMode: 'PUSH' }),
  dooredDrawers: floorUnit({ zones: [z('DOORS', 2), z('DRAWERS', 2)] }),
  dividerTwoZones: floorUnit({ zones: [z('DOORS', 2), z('DRAWERS', 2)], dividerBoards: 2 }),
  sinkBase: floorUnit({ width: 800, zones: [z('DOORS', 2), z('APRON', undefined, undefined, { heightMm: 150 })] }),

  // ---- openings without fronts
  openShelves: wallUnit({ zones: [z('OPEN', undefined, 3)] }),

  // ---- fronts
  glassWall: wallUnit({ zones: [z('DOORS', 2, 1)], frontStyle: 'GLASS', frontMaterialId: 'glass' }),
  liftWall: wallUnit({ zones: [z('DOORS', 1)], hardwareItemId: 'lift' }),
  overFridge: wallUnit({ width: 900, height: 450, depth: 600, zones: [z('DOORS', 2)] }),
  ceilingHeight: wallUnit({ height: 1100, zones: [z('DOORS', 2, 1, { heightMm: 700 }), z('DOORS', 2)] }),

  // ---- appliance bays (the customer brings the machine, the form gives the niche)
  washerBay: floorUnit({ width: 636, zones: [z('APPLIANCE', undefined, undefined, { appliance: 'WASHER' })] }),
  dryerBay: floorUnit({ width: 636, zones: [z('APPLIANCE', undefined, undefined, { appliance: 'DRYER' })] }),
  fridgeBay: floorUnit({ width: 636, zones: [z('APPLIANCE', undefined, undefined, { appliance: 'UNDER_FRIDGE' })] }),
  panelReady: floorUnit({ width: 636, zones: [z('APPLIANCE', undefined, undefined, { appliance: 'DISHWASHER', panelFront: true })] }),
  washerWithDoors: floorUnit({ width: 636, zones: [z('APPLIANCE', undefined, undefined, { appliance: 'WASHER' }), z('DOORS', 1)] }),
  ovenColumn: floorUnit({
    height: 2200,
    zones: [
      z('DRAWERS', 1, undefined, { heightMm: 380 }),
      z('APPLIANCE', undefined, undefined, { appliance: 'OVEN', heightMm: 595 }),
      z('APPLIANCE', undefined, undefined, { appliance: 'MICROWAVE', heightMm: 380 }),
      z('DOORS', 2, 1),
    ],
  }),

  // ---- tall units
  tallPantry: floorUnit({ height: 2200, zones: [z('DOORS', 2, 4)] }),
  tallDoorsPush: floorUnit({ height: 2200, zones: [z('DOORS', 2, 4)], openingMode: 'PUSH' }),

  // ---- the pull-out frame, declared on the zone (the mechanism the form now offers)
  cargoBase: floorUnit({ width: 300, zones: [z('DRAWERS', 1, undefined, { kinematic: 'PULL_OUT_FRAME' })] }),
  tallCargo: floorUnit({ height: 2200, zones: [z('DOORS', 1, 4, { kinematic: 'PULL_OUT_FRAME' })] }),
  cargoDrawers: floorUnit({ zones: [z('DRAWERS', 2, undefined, { kinematic: 'PULL_OUT_FRAME' })] }),

  // ---- the split column: one door on the visible part, a fixed panel on the blind part
  blindBase: floorUnit({ width: 1050, zones: [z('DOORS', 1, 1, { split: { mainSide: 'LEFT', mainWidthMm: 500, fill: 'PANEL' } })] }),
  blindWall: wallUnit({ width: 900, zones: [z('DOORS', 1, 1, { split: { mainSide: 'LEFT', mainWidthMm: 420, fill: 'PANEL' } })] }),
  blindMirrored: floorUnit({ width: 1050, zones: [z('DOORS', 1, 1, { split: { mainSide: 'RIGHT', mainWidthMm: 500, fill: 'PANEL' } })] }),

  // ---- the corner family (a starting point for the L unit; the L itself is built by math/lCorner.ts)
  cornerBase: { ...P.draftFromPreset('L_Corner_Base'), width: 1050, height: 870, depth: 600, base: { type: 'NONE' }, zones: [z('DOORS', 2, 1)] },
  cornerWall: { ...P.draftFromPreset('L_Corner_Wall'), width: 900, zones: [z('DOORS', 2, 1)] },
  cornerDrawers: { ...P.draftFromPreset('L_Corner_Base'), width: 1050, height: 870, depth: 600, base: { type: 'NONE' }, zones: [z('DRAWERS', 2)] },

  // ---- what a floor unit stands on
  legsBase: floorUnit({ base: { type: 'LEGS' } }),
  plinthBase: floorUnit({ base: { type: 'PLINTH' } }),
  woodBase: floorUnit({ base: { type: 'WOOD' } }),
  deepLegs: floorUnit({ width: 1200, zones: [z('DRAWERS', 3)], base: { type: 'LEGS', legCount: 6 } }),

  // ---- edge band on both the carcase and the fronts
  edgeBanded: floorUnit({ zones: [z('DOORS', 2, 1)], carcaseEdgeRollId: 'e1', frontEdgeRollId: 'e2' }),

  // ---- the limits
  narrow: floorUnit({ width: 200, zones: [z('DOORS', 1)] }),
  wide: floorUnit({ width: 1200, zones: [z('DOORS', 4, 2)] }),
  shallow: wallUnit({ depth: 300, zones: [z('OPEN', undefined, 2)] }),
};

export interface Configuration {
  name: string;
  draft: CabinetDraft;
}

/** Every configuration, named — the loop the engine promises run on ("for all configurations"). */
export const MATRIX: Configuration[] = Object.entries(CONFIGS).map(([name, draft]) => ({ name, draft }));

/** The draft of a named configuration. Throws on a typo instead of testing `undefined`. */
export function config(name: keyof typeof CONFIGS): CabinetDraft {
  const d = CONFIGS[name];
  if (!d) throw new Error(`matrix: unknown configuration "${name}"`);
  return d;
}
