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
  /** Reveal at the two outer edges of a front that is alone in its row (one door, or the width of a drawer): half on each side. */
  FRONT_GAP_TOTAL_MM: 1,
  /** Gap between two fronts of one zone, side by side (doors) or stacked (drawers): each front loses half of it on that edge. */
  FRONT_GAP_BETWEEN_MM: 1,
  /**
   * Reveal at each end of a row of SEVERAL doors (0 = flush with the carcase sides, so 600 mm / 2 doors = 299.5 + 299.5).
   * With 0 two neighbouring cabinets of several doors touch; use 0.5 to keep 1 mm between them (doors become 299).
   */
  FRONT_ROW_OUTER_REVEAL_MM: 0,
  /** Height clearance subtracted from the available front height (half at the bottom, half at the top). */
  FRONT_HEIGHT_CLEARANCE_MM: 4,
  /** Gap between the fronts of two stacked zones (drawer over door, apron over doors...): half on each side of the middle of the divider. */
  FRONT_REVEAL_MM: 1,
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
  /** An overhead lift (Aventos…) is one kit per lifting facade: 1 or 2 lift doors = 1 or 2 kits, never per hinge. */
  LIFT_KITS_PER_FACADE: 1,
  /** One cut-to-width Gola profile piece per Gola channel of the cabinet. */
  GOLA_PROFILES_PER_CHANNEL: 1,
  /** Push-to-open latch / Tip-On unit per opening facade (doors and drawers, not fixed aprons or panels). */
  PUSH_LATCHES_PER_FACADE: 1,
} as const;

/**
 * Pull-out frames (a basket / larder frame on full-extension runners behind a front).
 * Typical catalogue limits: edit them to match your own hardware supplier.
 */
export const PULL_OUT = {
  MIN_FRONT_WIDTH_MM: 150,
  MAX_FRONT_WIDTH_MM: 600,
  /** Full-extension runners start at 450 mm. */
  MIN_CABINET_DEPTH_MM: 450,
  /** Baskets drawn when a zone does not say how many (a drawers zone has no shelves field). */
  DEFAULT_LEVELS: 3,
  /** Space each runner takes on each side of the frame. */
  RUNNER_SPACE_MM: 13,
  /** The frame is this much shorter than its front, at the top and at the bottom. */
  VERTICAL_MARGIN_MM: 40,
  /** Gap between the back of the front and the frame. */
  FRONT_GAP_MM: 10,
} as const;

/**
 * Plain drawer box (sides, inner front, back, bottom) behind a drawer front on runners. Typical ball-bearing slides:
 * edit the numbers to match your own hardware. Sides, front and back are cut from the carcase board; the bottom from the HDF sheet.
 */
export const DRAWER_BOX = {
  /** Space each runner takes on each side of the box. */
  SIDE_CLEARANCE_MM: 13,
  /** The box is this much lower than its drawer front (BOTTOM_OFFSET below + the rest above). */
  HEIGHT_MARGIN_MM: 70,
  /** The box rises this far above the lower edge of its front. */
  BOTTOM_OFFSET_MM: 30,
  MIN_HEIGHT_MM: 60,
} as const;

export const LIMITS = {
  WIDTH_MM: [100, 1500],
  HEIGHT_MM: [100, 2700],
  DEPTH_MM: [100, 900],
  SHELVES: [0, 10],
  FRONT_ELEMENTS: [1, 6],
  ZONES: [1, 6],
  ZONE_HEIGHT_MM: [50, 2600],
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

/**
 * Connectors drawn in the atomic workspace AND counted for the BOM (same rules, so what you see is what you buy).
 * Typical 32 mm-system sizes: edit them to match your own hardware.
 */
export const FASTENER = {
  DOWEL_DIA_MM: 8,
  DOWEL_LEN_MM: 30,
  CAM_DIA_MM: 15,
  CAM_DEPTH_MM: 12,
  BOLT_DIA_MM: 7,
  BOLT_LEN_MM: 34,
  /** Distance from a board's front / back edge to the first connector. */
  EDGE_SETBACK_MM: 37,
  /** A dowel sits this far from its cam, toward the middle of the joint. */
  DOWEL_OFFSET_MM: 32,
  /** Boards deeper than this get one more connector in the middle. */
  MID_CONNECTOR_DEPTH_MM: 450,
  BACK_SCREW_PITCH_MM: 150,
  BACK_SCREW_DIA_MM: 3.5,
  BACK_SCREW_LEN_MM: 16,
  SHELF_PIN_DIA_MM: 5,
  SHELF_PIN_LEN_MM: 10,
  SHELF_PIN_SETBACK_MM: 40,
  HINGE_CUP_DIA_MM: 35,
  HINGE_CUP_DEPTH_MM: 12,
  /** Distance from the door's hinge edge to the centre of the cup. */
  HINGE_CUP_EDGE_MM: 22.5,
  /** Distance from the door's top / bottom edge to the first / last hinge. */
  HINGE_END_OFFSET_MM: 100,
} as const;

/** Stock items (matched by the text in their model name) that cover the connectors the cabinet needs. */
export const FASTENER_STOCK = [
  { keyword: 'Cam Lock', kind: 'CAM' },
  { keyword: 'Wooden Dowel', kind: 'DOWEL' },
  { keyword: 'Back Panel Screw', kind: 'BACK_SCREW' },
  { keyword: 'Shelf Support Pin', kind: 'SHELF_PIN' },
] as const;
