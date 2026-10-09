// src/types/flatma.ts

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
export type FrontOpeningType = 'DOORS' | 'DRAWERS' | 'NONE';

/**
 * A cabinet is a vertical stack of ZONES (bottom -> top) between the bottom board and the top. Each zone is one thing:
 * a set of doors, a set of drawers, an open compartment, an appliance niche or a fixed apron panel.
 * Cabinets saved without `zones` are read as ONE zone made from frontConfig + shelvesCount (see math/zones.ts).
 */
export type ZoneKind = 'DOORS' | 'DRAWERS' | 'OPEN' | 'APPLIANCE' | 'APRON';
export type ApplianceKind = 'OVEN' | 'MICROWAVE' | 'COFFEE' | 'DISHWASHER' | 'FRIDGE';

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
  /** APPLIANCE only (dishwasher, fridge): a decor panel in the fronts material hides the appliance. */
  panelFront?: boolean;
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
  openingMode?: OpeningMode;
  /** GLASS: aluminium frame + glass pane (also assumed when the front sheet's type says glass). */
  frontStyle?: 'SOLID' | 'GLASS';
  
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
