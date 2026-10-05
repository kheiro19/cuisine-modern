// src/math/constants.ts
// Single home for every manufacturing / commercial / layout number that used to be
// scattered across costEngine, bomEngine, the 3D assemblies and the UI.
// Change a value here and cost, BOM, invoice, stock and 3D all follow.

export const PANEL = {
  BACK_THICKNESS_MM: 3,
  /** Depth of each top stretcher rail (traverse) on base units. */
  TRAVERSE_DEPTH_MM: 100,
  /** Shelves stop this far short of the cabinet front. */
  SHELF_DEPTH_INSET_MM: 20,
  /** Total side clearance for an adjustable shelf. */
  SHELF_WIDTH_CLEARANCE_MM: 2,
  /** Total gap budget shared by the fronts across the cabinet width ("1 mm متراص"). */
  FRONT_GAP_TOTAL_MM: 1,
  /** Height clearance subtracted from the available front height. */
  FRONT_HEIGHT_CLEARANCE_MM: 4,
  /** Height removed from the facade stack when a Gola channel is embedded. */
  GOLA_OFFSET_MM: 45,
  /** Used only when a cabinet references a material that is not in stock. */
  DEFAULT_THICKNESS_MM: 18,
  /**
   * Offcut / kerf allowance applied to area-based cost AND stock consumption.
   * 1 = exact area (previous behaviour). Typical workshops use 1.10 – 1.20.
   */
  WASTE_FACTOR: 1,
} as const;

/**
 * Edge band (chant). The roll is picked from the workshop stock (thickness + price come from the roll).
 * Cut size = finished size minus the band that is glued on:
 *  - carcase boards (sides, bottom, roof, shelves): band on the FRONT edge only  -> depth - e
 *  - fronts (doors / drawer fronts): band on all 4 edges                          -> width - 2e, height - 2e
 * Band consumed (and priced) follows the same edges.
 */
export const EDGE = {
  /** Offcut allowance on the band length that is priced. 1 = exact length, 1.1 = +10 %. */
  WASTE_FACTOR: 1,
} as const;

export const HARDWARE_RULES = {
  LEGS_PER_BASE_UNIT: 4,
  HANGERS_PER_WALL_UNIT: 2,
  LEGS_KEYWORD: 'Adjustable Kitchen Legs',
  HANGERS_KEYWORD: 'Cabinet Hanger Plates',
  /** Hinges per door by DOOR height: first step whose upToMm >= height wins. */
  HINGE_STEPS: [
    { upToMm: 900, hinges: 2 },
    { upToMm: 1600, hinges: 3 },
    { upToMm: 2000, hinges: 4 },
  ],
  HINGES_ABOVE_LAST_STEP: 5,
  /** An overhead lift (Aventos…) is one kit per cabinet, not per hinge. */
  LIFT_KITS_PER_CABINET: 1,
  GOLA_PROFILES_PER_CABINET: 1,
} as const;

export const LIMITS = {
  WIDTH_MM: [100, 1500],
  HEIGHT_MM: [100, 2700],
  DEPTH_MM: [100, 900],
  SHELVES: [0, 10],
  FRONT_ELEMENTS: [1, 6],
  PERCENT: [0, 100],
  QUANTITY_MAX: 100000,
  PRICE_MAX_DA: 100000000,
} as const;

export const COMMERCIAL = {
  DEFAULT_LABOR_PERCENT: 20,
  DEFAULT_PROFIT_PERCENT: 30,
} as const;

export const LAYOUT = {
  /** Base height used for wall-unit elevation when no base unit exists yet. */
  DEFAULT_BASE_HEIGHT_MM: 720,
  COUNTERTOP_THICKNESS_MM: 40,
  COUNTERTOP_FRONT_OVERHANG_MM: 20,
  /** Floor units taller than this (tall / pantry) do not carry the countertop. */
  COUNTERTOP_MAX_UNIT_HEIGHT_MM: 1000,
  DEFAULT_WALL_LENGTH_MM: 2400,
  SNAP_THRESHOLD_MM: 15,
} as const;
