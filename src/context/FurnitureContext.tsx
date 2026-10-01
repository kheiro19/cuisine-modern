// src/context/FurnitureContext.tsx
import React, { createContext, useContext, useState } from 'react';
import { CabinetObject, WorkshopInventoryState, EdgeBandRoll, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { computeCabinetTotalCost } from '../math/costEngine';

interface FurnitureContextType {
  cabinets: CabinetObject[];
  inventory: WorkshopInventoryState & { edgeBandRolls: EdgeBandRoll[] };
  activeCabinetId: string;
  setActiveCabinetId: (id: string) => void;
  addCabinet: (cabinet: Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>) => void;
  updateCabinet: (id: string, fields: Partial<CabinetObject>) => void;
  deleteCabinet: (id: string) => void; 
  triggerUndo: () => void;
  canUndo: boolean;
  
  // ⚡ The Restored Lamed Dynamic Injections Pipelines
  addWoodMaterial: (material: InjectedWoodMaterial) => void;
  addHardwareItem: (item: InjectedHardwareItem) => void;
  addEdgeBandRoll: (roll: EdgeBandRoll) => void; // 🔒 Autonomous loader registration
}

const FurnitureContext = createContext<FurnitureContextType | undefined>(undefined);

export function FurnitureProvider({ children }: { children: React.ReactNode }) {
  const [cabinets, setCabinets] = useState<CabinetObject[]>([]);
  const [activeCabinetId, setActiveCabinetId] = useState<string>('');
  
  // ⏱️ Flatma Memento Stack for High-Speed Undo Tracking (Max 20 steps to optimize memory)
  const [historyStack, setHistoryStack] = useState<CabinetObject[][]>([]);

  // 🗄️ Core Software State Initialization (Vierge Warehouse Concept)
  const [inventory, setInventory] = useState<WorkshopInventoryState & { edgeBandRolls: EdgeBandRoll[] }>({
    woodPanels: [],
    hardwareItems: [], // 🔒 Totalement purgé : Aucune quincaillerie fictive par défaut
    edgeBandRolls: []  // 🔒 Segment d'indépendance pour le stockage autonome des chants
  });

  // Helper to save current state into history matrix before any mutation
  const saveToHistory = (currentState: CabinetObject[]) => {
    setHistoryStack(prev => {
      const updatedStack = [...prev, JSON.parse(JSON.stringify(currentState))];
      if (updatedStack.length > 20) updatedStack.shift(); // Evict oldest step to prevent memory leaks
      return updatedStack;
    });
  };

  const addCabinet = (cabFields: Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>) => {
    saveToHistory(cabinets); // Snapshot tracking

    const carcaseMat = inventory.woodPanels.find(m => m.id === cabFields.carcaseMaterialId);
    const frontMat = inventory.woodPanels.find(m => m.id === cabFields.frontMaterialId);
    const carcaseThick = carcaseMat ? carcaseMat.thickness : 18;
    const frontThick = frontMat ? frontMat.thickness : 18;

    const partialCabinet: CabinetObject = {
      ...cabFields,
      carcaseThickness: carcaseThick,
      frontThickness: frontThick,
      calculatedCostDA: 0
    };

    const evaluatedCost = computeCabinetTotalCost(partialCabinet, inventory.woodPanels, inventory.hardwareItems);
    const finalCabinet = { ...partialCabinet, calculatedCostDA: evaluatedCost };

    // Inventory Automatic Stock Deductions Engine
    setInventory(prev => {
      const updatedHardware = prev.hardwareItems.map(h => {
        if (h.id === finalCabinet.frontConfig.hardwareItemId) {
          const deduction = finalCabinet.frontConfig.openingType === 'DOORS' 
            ? (finalCabinet.height > 900 ? 3 : 2) * finalCabinet.frontConfig.elementCount 
            : finalCabinet.frontConfig.elementCount;
          return { ...h, quantityIncoming: Math.max(0, h.quantityIncoming - deduction) };
        }
        if (finalCabinet.category === 'BASE_UNIT' && h.modelType.includes('Adjustable Kitchen Legs')) {
          return { ...h, quantityIncoming: Math.max(0, h.quantityIncoming - 4) };
        }
        if (finalCabinet.category === 'WALL_UNIT' && h.modelType.includes('Cabinet Hanger Plates')) {
          return { ...h, quantityIncoming: Math.max(0, h.quantityIncoming - 2) };
        }
        return h;
      });
      return { ...prev, hardwareItems: updatedHardware };
    });

    setCabinets(prev => [...prev, finalCabinet]);
    setActiveCabinetId(finalCabinet.id);
  };

  const updateCabinet = (id: string, fields: Partial<CabinetObject>) => {
    // Only save history on significant dimension shifts, not rapid pixel drag moves to keep history clean
    if (fields.width || fields.height || fields.carcaseMaterialId || fields.frontConfig?.openingType) {
      saveToHistory(cabinets);
    }

    setCabinets(prev => prev.map(cab => {
      if (cab.id !== id) return cab;
      const updatedCabinet = { ...cab, ...fields };
      const reevaluatedCost = computeCabinetTotalCost(updatedCabinet, inventory.woodPanels, inventory.hardwareItems);
      return { ...updatedCabinet, calculatedCostDA: reevaluatedCost };
    }));
  };

  // 🗑️ The Smart Industrial Delete Engine: Automatically restores items back to storehouse stock
  const deleteCabinet = (id: string) => {
    const targetCabinet = cabinets.find(c => c.id === id);
    if (!targetCabinet) return;

    saveToHistory(cabinets); // Snapshot tracking

    // Reverse Deduction: Re-inject the allocated hardware components back to workshop supply
    setInventory(prev => {
      const restoredHardware = prev.hardwareItems.map(h => {
        if (h.id === targetCabinet.frontConfig.hardwareItemId) {
          const restorationAmount = targetCabinet.frontConfig.openingType === 'DOORS'
            ? (targetCabinet.height > 900 ? 3 : 2) * targetCabinet.frontConfig.elementCount
            : targetCabinet.frontConfig.elementCount;
          return { ...h, quantityIncoming: h.quantityIncoming + restorationAmount };
        }
        if (targetCabinet.category === 'BASE_UNIT' && h.modelType.includes('Adjustable Kitchen Legs')) {
          return { ...h, quantityIncoming: h.quantityIncoming + 4 };
        }
        if (targetCabinet.category === 'WALL_UNIT' && h.modelType.includes('Cabinet Hanger Plates')) {
          return { ...h, quantityIncoming: h.quantityIncoming + 2 };
        }
        return h;
      });
      return { ...prev, hardwareItems: restoredHardware };
    });

    setCabinets(prev => prev.filter(cab => cab.id !== id));
    if (activeCabinetId === id) setActiveCabinetId('');
  };

  // 🧪 INLINE MUTATION INJECTION UTILITIES FOR ATELIER
  const addWoodMaterial = (material: InjectedWoodMaterial) => {
    setInventory(prev => ({ ...prev, woodPanels: [...prev.woodPanels, material] }));
  };

  const addHardwareItem = (item: InjectedHardwareItem) => {
    setInventory(prev => ({ ...prev, hardwareItems: [...prev.hardwareItems, item] }));
  };

    // 🔒 تصحيح المسار الهندسي لإدخال رولوهات شريط الحواف دون انهيار الشاشة
  const addEdgeBandRoll = (roll: EdgeBandRoll) => {
    setInventory(prev => ({ 
      ...prev, 
      edgeBandRolls: [...prev.edgeBandRolls, roll] // 👈 تم حذف .inventory الزائدة لتقرأ الذاكرة مباشرة
    }));
  };


  // ⏱️ The Undo Execution Engine
  const triggerUndo = () => {
    if (historyStack.length === 0) return;
    
    setHistoryStack(prev => {
      const newStack = [...prev];
      const previousState = newStack.pop();
      if (previousState) {
        setCabinets(previousState);
      }
      return newStack;
    });
  };

  const canUndo = historyStack.length > 0;

  return (
    <FurnitureContext.Provider value={{
      cabinets,
      inventory,
      activeCabinetId,
      setActiveCabinetId,
      addCabinet,
      updateCabinet,
      deleteCabinet,
      triggerUndo,
      canUndo,
      addWoodMaterial,
      addHardwareItem,
      addEdgeBandRoll
    }}>
      {children}
    </FurnitureContext.Provider>
  );
}

export function useFurniture() {
  const context = useContext(FurnitureContext);
  if (!context) throw new Error('useFurniture must be used within a FurnitureProvider');
  return context;
}
