// src/types/flatma.ts
import type { KinematicId } from '../rules/kinematics';

// ========================================================
// 📦 1. WORKSHOP CENTRAL INVENTORY STRUCTURAL DATA TYPES
// ========================================================

export interface InjectedWoodMaterial {
  id: string;
  brand: string;          // e.g., "EGGER (Austria)", "AGT (Turkey)", "PANO ALGERIE (PDA)"
  type: string;           // e.g., "MDF Melamine Matt", "MDF Wood Grain / Textured", "Acrylic High Gloss", "Hydrofuge"
  thickness: number;      // Core board thickness in mm (Restored Grid mapping 3mm to 25mm)
  widthSheet: number;     // e.g., 2800 (Standard industrial sheet length in mm)
  heightSheet: number;    // e.g., 2070 (Standard industrial sheet height in mm)
  edgeThickness: number; // PVC Edge thickness in mm (e.g., 0.4, 2.0)
  edgeWidth: number;     // PVC Edge width in mm (e.g., 22, 45)
  averagePriceDA: number; // Moving Average Cost (السعر المتوسط التراكمي) calculated in Algerian Dinars
  currentQty: number;     // Total remaining volume available in workshop inventory stockroom
}

export type HardwareCategory = 
  | 'Cabinet Hinges' 
  | 'Drawer Slide Systems' 
  | 'Overhead Lift Systems' 
  | 'Gola & Handle Profiles' 
  | 'Push-Open Systems'
  | 'Assembly & Fixing';

export interface InjectedHardwareItem {
  id: string;
  category: HardwareCategory;
  brand: string;           // e.g., "Blum (Austria)", "Hettich (Germany)", "Samet (Turkey)", "Titus"
  modelType: string;       // Explicit structural names (e.g., "Straight Hinge (Overlay)", "Double-Wall Metal Box System", "Aventos HF")
  pricePerUnitDA: number;  // Moving Average Cost per piece/mechanical set in Algerian Dinars
  availableQty: number;    // Stock counts in pieces or full functional kits in the workshop
}

/** An independent PVC edge-band roll. Registered in stock; not yet consumed by the BOM. */
export interface EdgeBandRoll {
  id: string;
  brand: string;
  thickness: number;          // mm
  width: number;              // mm
  totalLengthMeters: number;  // roll length in meters
  /** What is still on the roll. Missing = the whole roll is still there (see math/stockCheck.ts). */
  remainingLengthMeters?: number;
  rollPriceDA: number;        // price of the whole roll in Algerian Dinars
}

export interface WorkshopInventoryState {
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
}

// ========================================================
// 🗄️ 2. PROCEDURAL DESIGN & FURNITURE CONSTRAINTS ENGINE
// ========================================================

export type CabinetCategory = 'BASE_UNIT' | 'WALL_UNIT';

/** What a floor unit stands on: nothing (on the floor), adjustable legs, legs + a front plinth board, or a wooden frame made in the workshop. */
export type BaseType = 'NONE' | 'LEGS' | 'PLINTH' | 'WOOD';

/**
 * The base of a floor unit (math/base.ts). `height` of the cabinet is the FINISHED height from the floor, so a 100 mm base leaves a
 * 770 mm body of an 870 mm unit. A cabinet without this field is a legacy one: nothing is drawn under it and 4 legs are still counted.
 */
export interface CabinetBase {
  type: BaseType;
  /** Height of the legs / plinth / wooden frame (mm). Missing = the default. */
  heightMm?: number;
  /** PLINTH and WOOD: how far the front board / frame is set back from the front face (mm), for the feet. */
  frontSetbackMm?: number;
  /** WOOD: how far the frame is set back from the wall at the back (mm), to clear the skirting. */
  backSetbackMm?: number;
  /** LEGS and PLINTH: number of legs. 0 or missing = automatic (4, or 6 above 900 mm wide). */
  legCount?: number;
  /** PLINTH: a PVC board from the stock (hardware), or a board cut from the cabinet's own sheet. */
  plinthMaterial?: 'PVC' | 'BOARD';
}
/** A = back wall, B = left wall, C = right wall. */
export type RunId = 'A' | 'B' | 'C';
export type FrontOpeningType = 'DOORS' | 'DRAWERS' | 'NONE';

/**
 * A cabinet is a vertical stack of ZONES (bottom -> top) between the bottom board and the top. Each zone is one thing:
 * a set of doors, a set of drawers, an open compartment, an appliance niche or a fixed apron panel.
 * Cabinets saved without `zones` are read as ONE zone made from frontConfig + shelvesCount (see math/zones.ts).
 */
export type ZoneKind = 'DOORS' | 'DRAWERS' | 'OPEN' | 'APPLIANCE' | 'APRON';
export type ApplianceKind = 'OVEN' | 'MICROWAVE' | 'COFFEE' | 'DISHWASHER' | 'FRIDGE' | 'WASHER' | 'DRYER' | 'UNDER_FRIDGE';

export interface CabinetZone {
  kind: ZoneKind;
  /** Opening height (mm). Undefined = flexible: the zones without a height share what is left equally. */
  heightMm?: number;
  /** DOORS / DRAWERS: number of facades (a lift counts every door as one lifting facade). */
  count?: number;
  /** DOORS / OPEN: adjustable shelves inside this zone. */
  shelves?: number;
  /** APPLIANCE only. The appliance is supplied by the customer: it adds a niche, never a price. */
  appliance?: ApplianceKind;
  /** APPLIANCE only (dishwasher, fridge, washer...): a decor panel in the fronts material hides the appliance. */
  panelFront?: boolean;
  /** APPLIANCE only: the real size (mm) of the appliance, when it is not the standard niche of its kind. Each side missing = the standard. */
  applianceSizeMm?: { w?: number; h?: number; d?: number };
  /** APPLIANCE only: the piece of the accessories library that is drawn in the niche (src/data/accessoryCatalog.ts). */
  libraryApplianceId?: string;
  /** How this zone's facades move (see rules/kinematics.ts). Missing = the default of the zone kind (doors swing, drawers slide). */
  kinematic?: KinematicId;
  /**
   * Per-zone control of the fronts (doors / drawers / panels) of THIS zone. Each field is optional: missing = the cabinet's own choice.
   *  - frontMaterialId: a sheet from the stock; its thickness is the thickness of this zone's fronts.
   *  - frontEdgeRollId: an edge-band roll from the stock for this zone's fronts ('NONE' = no band on them).
   *  - openingMode: HANDLE / GOLA / PUSH for this zone only.
   */
  frontMaterialId?: string;
  frontEdgeRollId?: string;
  openingMode?: OpeningMode;
  /** DOORS / APPLIANCE only: one vertical board splits the zone into two columns (see math/columns.ts). Missing = one column, the whole width. */
  split?: ZoneSplit;
  /** DOORS only, no split: the side the hinges are on, for every door of the zone. Missing = the first door on the left, then alternating. */
  hingeSide?: 'LEFT' | 'RIGHT';
  /**
   * DOORS only, no split: the hinge side of EACH door, left to right ('AUTO' = the zone's side, else alternating). Wins over hingeSide
   * for the doors it names, so every door of a row opens the way the user wants.
   */
  hingeSides?: Array<'LEFT' | 'RIGHT' | 'AUTO'>;
  /**
   * DOORS only: two neighbouring doors hinged on the same edge normally get a board EACH (two boards back to back), so no board holds
   * the hinges of two doors. True = they share one board.
   */
  sharedHingeBoard?: boolean;
}

/** What fills the second column of a split zone. AUTO (or missing) = suggested from its width (math/columns.ts). */
export type ColumnFillChoice = 'AUTO' | 'PULL_OUT' | 'DOOR' | 'OPEN' | 'PANEL';

export interface ZoneSplit {
  /** The side the MAIN column sits on: the appliance niche, or the zone's own doors. The other column takes what is left. */
  mainSide: 'LEFT' | 'RIGHT';
  /** Width (mm) between the carcase and the vertical board for the main column. Missing: the niche + clearance for an appliance, half the free width for doors. */
  mainWidthMm?: number;
  fill?: ColumnFillChoice;
}

/** How the fronts open: a handle (not priced), Gola channels, or a push-to-open mechanism (priced per facade). */
export type OpeningMode = 'HANDLE' | 'GOLA' | 'PUSH';

export interface CabinetFrontConfiguration {
  openingType: FrontOpeningType;
  elementCount: number;        // Spatial layout mapping: e.g., 1, 2, or 3 doors / 2, 3, or 4 drawers
  hardwareItemId: string;      // Directly references targeted InjectedHardwareItem from workshop stock (hinges / lift, or runners on a drawers-only cabinet)
  /** Drawer runners when the cabinet mixes doors and drawers (hardwareItemId is then the hinge / lift). */
  drawerHardwareItemId?: string;
  hasGolaProfile: boolean;     // Structural flag triggering automatic height offset and traverse recess
  golaProfileItemId?: string;  // References specific Gola aluminum model from active hardware list
  /**
   * DRAWERS only: where the Gola channels are. Slot k (0 = top drawer) = channel just ABOVE drawer k.
   * Missing on older saved cabinets -> one channel at the top (see math/gola.ts).
   */
  golaSlots?: number[];
}

/** A texture picked in the 3D showcase for the fronts. Visual only: the stock material (price, thickness) is untouched. */
export interface FrontTextureOverride {
  path: string;
  finishType?: string;
}

export interface CabinetObject {
  id: string;
  name: string;
  /** Preset the unit was created from (informational, see math/cabinetPresets.ts). */
  subtype?: string;
  category: CabinetCategory;
  
  // Outer Physical Boundary Frame Dimensions (mm)
  width: number;
  height: number;
  depth: number;
  
  // 3D Spatial Grid Vector Coordinates (mm)
  positionX: number;
  positionY: number;
  positionZ: number;
  
  // Internal Dividers State
  shelvesCount: number;
  
  // Polymorphic Material Linkage from Workshop Supply (Wood / Stone versatile surface mapping)
  carcaseMaterialId: string;   // References InjectedWoodMaterial for internal caisson construction
  carcaseThickness: number;    // Cached physical thickness from stock material
  
  frontMaterialId: string;     // References InjectedWoodMaterial for exterior facades (Doors/Drawers)
  /** Edge band rolls picked from the stock (EdgeBandRoll.id). Missing = no roll chosen: no band cost (the sheet's own edge thickness, if any, still applies). */
  carcaseEdgeRollId?: string;
  frontEdgeRollId?: string;
  frontThickness: number;      // Cached physical thickness from active front sheet material
  
  // Advanced Mechanical Kinematics Configuration
  frontConfig: CabinetFrontConfiguration;

  /** Interior zones, bottom -> top. Authoritative for geometry, BOM, cost, stock and 3D when present. */
  zones?: CabinetZone[];
  /** Boards between two zones: 1 shared board (default) or 2 glued face to face (rules/construction.ts). */
  dividerBoards?: 1 | 2;
  openingMode?: OpeningMode;
  /** GLASS: aluminium frame + glass pane (also assumed when the front sheet's type says glass). */
  frontStyle?: 'SOLID' | 'GLASS';
  
  /** The wall the unit stands against: A = back wall (default), B = left wall, C = right wall (L and U kitchens, math/kitchenLayout.ts). */
  run?: RunId;
  /** Boxes made together that are ONE unit for the user (an L corner is three boxes, math/lCorner.ts). */
  groupId?: string;
  /** What the unit stands on (legs, plinth, wooden frame). Missing = legacy, see CabinetBase. */
  base?: CabinetBase;
  /** Sides that are not cut because the neighbouring box of the same group is open to this one (the interior of an L corner is continuous). */
  omitSides?: Array<'LEFT' | 'RIGHT'>;
  /**
   * Edges where the door row stops short by one front thickness + the gap, so the door of a neighbouring box that meets this
   * one at a right angle (the two arms of an L corner) is not hit by it: the other door runs past, this one butts against it.
   */
  frontSetbackSides?: Array<'LEFT' | 'RIGHT'>;
  /**
   * The side of this box that faces the OTHER arm of its L corner. Drawer fronts on that side stop short by the neighbour's
   * front thickness + CORNER.DRAWER_CLEARANCE_MM (math/constants.ts), otherwise they cannot be pulled out while that door is shut.
   * Doors are not affected: their row keeps its own rule (frontSetbackSides).
   */
  cornerSide?: 'LEFT' | 'RIGHT';
  /**
   * How much of `width` was ADDED to the designed arm because it carries drawers (front thickness + CORNER.DRAWER_CLEARANCE_MM).
   * Kept so the panel can widen / un-widen the arm on every save without ever adding the extension twice.
   */
  cornerExtensionMm?: number;
  /**
   * Width of the FIXED filler panel that closes the corner side of an arm (math/cornerFiller.ts). Missing = automatic:
   * front thickness + CORNER.DRAWER_CLEARANCE_MM. The panel lets the user choose 0 … CORNER.FILLER_MAX_MM.
   */
  cornerFillerMm?: number;
  /**
   * Sides of this box that carry a fixed filler panel (math/cornerFiller.ts). Missing = automatic: the corner side, and
   * only when a front slides out there. `[]` = none. Both sides may carry one — the far side is for looks (an end panel).
   */
  cornerFillerSides?: Array<'LEFT' | 'RIGHT'>;

  /**
   * What closes the back of this cabinet (math/backPanel.ts): 'HDF' = a 3 mm hardboard sheet on the rear face (default),
   * 'RAILS' = two battens cut from the carcase board (one at the top, one at the bottom), 'PANEL' = a full carcase board
   * fitted inside the rear. Missing = HDF, the way every saved cabinet was built.
   */
  backPanel?: 'HDF' | 'RAILS' | 'PANEL';
  /** RAILS only: depth of each rail up the back (mm). Missing = BACK.RAIL_DEPTH_MM (100). */
  backRailDepthMm?: number;

  /**
   * What this box is inside its L corner (math/lCorner.ts): the square where the two walls meet, or one of the two arms.
   * Written when the corner is built; a box without it falls back to its size.
   */
  cornerRole?: 'SQUARE' | 'ARM_A' | 'ARM_B';
  /**
   * L corner: the three boxes stand on ONE bottom board, cut in an L (the way a real corner is built). The same value sits on
   * all three boxes of the group; the SQUARE cuts the piece, the two arms skip their own deck. Missing or null = the three
   * boxes cannot share it (different depth or board), so each cuts its own deck as before.
   */
  cornerGroupDeckMm?: { armAMm: number; armBMm: number };

  // Look-only texture chosen in the showcase (kept apart from frontMaterialId, which must stay a stock id)
  frontTextureOverride?: FrontTextureOverride;

  // Real-time Pricing Cache calculated via Moving Average Engine
  calculatedCostDA: number;
}

export interface AdvancedHardwareSettings {
  carcaseThickness: number;   // Fallback safety thickness configuration (mm)
  frontThickness: number;     // Fallback safety thickness configuration (mm)
  wallSplashHeight: number;   // Elevation offset for wall cabinet layout placement (mm)
}
