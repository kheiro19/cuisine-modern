// src/types/flatma.ts

export interface Vector2D {
  x: number;
  y: number;
}

export interface Vector3D {
  x: number;
  y: number;
  z: number;
}

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
  | 'Assembly & Fixing';

export interface InjectedHardwareItem {
  id: string;
  category: HardwareCategory;
  brand: string;           // e.g., "Blum (Austria)", "Hettich (Germany)", "Samet (Turkey)", "Titus"
  modelType: string;       // Explicit structural names (e.g., "Straight Hinge (Overlay)", "Double-Wall Metal Box System", "Aventos HF")
  pricePerUnitDA: number;  // Moving Average Cost per piece/mechanical set in Algerian Dinars
  availableQty: number;    // Stock counts in pieces or full functional kits in the workshop
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

export interface CabinetFrontConfiguration {
  openingType: FrontOpeningType;
  elementCount: number;        // Spatial layout mapping: e.g., 1, 2, or 3 doors / 2, 3, or 4 drawers
  hardwareItemId: string;      // Directly references targeted InjectedHardwareItem from workshop stock
  hasGolaProfile: boolean;     // Structural flag triggering automatic height offset and traverse recess
  golaProfileItemId?: string;  // References specific Gola aluminum model from active hardware list
}

export interface CabinetObject {
  id: string;
  name: string;
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
  frontThickness: number;      // Cached physical thickness from active front sheet material
  
  // Advanced Mechanical Kinematics Configuration
  frontConfig: CabinetFrontConfiguration;
  
  // Real-time Pricing Cache calculated via Moving Average Engine
  calculatedCostDA: number;
}

export interface WallGeometry {
  id: string;
  length: number; // Total physical length of the kitchen setup grid in mm (e.g., 4000)
}

export interface AdvancedHardwareSettings {
  carcaseThickness: number;   // Fallback safety thickness configuration (mm)
  frontThickness: number;     // Fallback safety thickness configuration (mm)
  wallSplashHeight: number;   // Elevation offset for wall cabinet layout placement (mm)
}
