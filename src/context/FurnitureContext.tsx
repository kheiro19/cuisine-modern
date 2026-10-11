// src/context/FurnitureContext.tsx
import React, { createContext, useContext, useRef, useState } from 'react';
import { CabinetObject, WorkshopInventoryState, EdgeBandRoll, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { computeCabinetTotalCost } from '../math/costEngine';
import { applyConsumptionDelta, registerHardwareItem } from '../math/stockDelta';

type Inventory = WorkshopInventoryState & { edgeBandRolls: EdgeBandRoll[] };

interface FurnitureContextType {
  cabinets: CabinetObject[];
  inventory: Inventory;
  activeCabinetId: string;
  setActiveCabinetId: (id: string) => void;
  addCabinet: (cabinet: Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>) => void;
  updateCabinet: (id: string, fields: Partial<CabinetObject>) => void;
  /** Same change on several cabinets with ONE undo step. */
  updateManyCabinets: (ids: string[], fields: Partial<CabinetObject>) => void;
  deleteCabinet: (id: string) => void;
  triggerUndo: () => void;
  canUndo: boolean;

  // ⚡ The Restored Lamed Dynamic Injections Pipelines
  addWoodMaterial: (material: InjectedWoodMaterial) => void;
  addHardwareItem: (item: InjectedHardwareItem) => void;
  addEdgeBandRoll: (roll: EdgeBandRoll) => void; // 🔒 Autonomous loader registration
}

const FurnitureContext = createContext<FurnitureContextType | undefined>(undefined);

const isMoveOnly = (fields: Partial<CabinetObject>) =>
  Object.keys(fields).every((k) => k === 'positionX' || k === 'positionY' || k === 'positionZ' || k === 'calculatedCostDA');

export function FurnitureProvider({ children }: { children: React.ReactNode }) {
  const [cabinets, setCabinets] = useState<CabinetObject[]>([]);
  // Always the latest committed list, even between two actions of the same event (state would still be stale).
  const cabinetsRef = useRef<CabinetObject[]>([]);
  const [activeCabinetId, setActiveCabinetId] = useState<string>('');

  // ⏱️ Flatma Memento Stack for High-Speed Undo Tracking (Max 20 steps to optimize memory)
  const [historyStack, setHistoryStack] = useState<CabinetObject[][]>([]);

  // 🗄️ Core Software State Initialization (Vierge Warehouse Concept)
  const [inventory, setInventory] = useState<Inventory>({
    woodPanels: [],
    hardwareItems: [], // 🔒 Totalement purgé : Aucune quincaillerie fictive par défaut
    edgeBandRolls: []  // 🔒 Segment d'indépendance pour le stockage autonome des chants
  });
  // Always the latest inventory, like cabinetsRef: two actions of one event must not read a stale render's stock.
  const inventoryRef = useRef<Inventory>(inventory);
  const commitInventory = (next: Inventory) => {
    inventoryRef.current = next;
    setInventory(next);
  };

  // Helper to save current state into history matrix before any mutation
  const saveToHistory = (currentState: CabinetObject[]) => {
    setHistoryStack(prev => {
      const updatedStack = [...prev, JSON.parse(JSON.stringify(currentState))];
      if (updatedStack.length > 20) updatedStack.shift(); // Evict oldest step to prevent memory leaks
      return updatedStack;
    });
  };

  /**
   * EVERY change of the cabinet list goes through here. The hardware stock is corrected by the DIFFERENCE in
   * consumption between the old and the new list, so add / edit / delete / undo are all reversible by
   * construction (see math/stockDelta.ts).
   */
  const commit = (next: CabinetObject[]) => {
    const before = cabinetsRef.current;
    cabinetsRef.current = next;
    const inv = inventoryRef.current;
    commitInventory({ ...inv, hardwareItems: applyConsumptionDelta(inv.hardwareItems, before, next) });
    setCabinets(next);
  };

  /** Cached thickness always follows the stock material (it used to go stale when the material was changed). */
  const refresh = (cab: CabinetObject): CabinetObject => {
    const inventory = inventoryRef.current;
    const carcaseMat = inventory.woodPanels.find(m => m.id === cab.carcaseMaterialId);
    const frontMat = inventory.woodPanels.find(m => m.id === cab.frontMaterialId);
    const thick = {
      ...cab,
      carcaseThickness: carcaseMat ? carcaseMat.thickness : 18,
      frontThickness: frontMat ? frontMat.thickness : 18,
    };
    return { ...thick, calculatedCostDA: computeCabinetTotalCost(thick, inventory.woodPanels, inventory.hardwareItems, inventory.edgeBandRolls) };
  };

  const addCabinet = (cabFields: Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>) => {
    saveToHistory(cabinetsRef.current); // Snapshot tracking
    const finalCabinet = refresh({ ...cabFields, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 });
    commit([...cabinetsRef.current, finalCabinet]);
    setActiveCabinetId(finalCabinet.id);
  };

  const updateManyCabinets = (ids: string[], fields: Partial<CabinetObject>) => {
    const targets = new Set(ids);
    if (!cabinetsRef.current.some(c => targets.has(c.id))) return;
    // Only drag moves skip the history (they would flood it); every other edit is one undo step.
    if (!isMoveOnly(fields)) saveToHistory(cabinetsRef.current);
    commit(cabinetsRef.current.map(cab => (targets.has(cab.id) ? refresh({ ...cab, ...fields }) : cab)));
  };

  const updateCabinet = (id: string, fields: Partial<CabinetObject>) => updateManyCabinets([id], fields);

  // 🗑️ The Smart Industrial Delete Engine: the stock follows automatically (see commit)
  const deleteCabinet = (id: string) => {
    if (!cabinetsRef.current.some(c => c.id === id)) return;
    saveToHistory(cabinetsRef.current); // Snapshot tracking
    commit(cabinetsRef.current.filter(cab => cab.id !== id));
    if (activeCabinetId === id) setActiveCabinetId('');
  };

  // 🧪 INLINE MUTATION INJECTION UTILITIES FOR ATELIER
  /** A new sheet or item can change what a cabinet costs (an HDF back sheet, hinges that were missing): re-price the cached costs. */
  const repriceCabinets = () => {
    if (cabinetsRef.current.length === 0) return;
    const next = cabinetsRef.current.map(refresh);
    cabinetsRef.current = next;
    setCabinets(next);
  };

  const addWoodMaterial = (material: InjectedWoodMaterial) => {
    commitInventory({ ...inventoryRef.current, woodPanels: [...inventoryRef.current.woodPanels, material] });
    repriceCabinets();
  };

  const addHardwareItem = (item: InjectedHardwareItem) => {
    const inv = inventoryRef.current;
    commitInventory({ ...inv, hardwareItems: registerHardwareItem(inv.hardwareItems, item, cabinetsRef.current) });
    repriceCabinets();
  };

  // 🔒 تصحيح المسار الهندسي لإدخال رولوهات شريط الحواف دون انهيار الشاشة
  const addEdgeBandRoll = (roll: EdgeBandRoll) => {
    commitInventory({ ...inventoryRef.current, edgeBandRolls: [...inventoryRef.current.edgeBandRolls, roll] });
  };

  // ⏱️ The Undo Execution Engine (no state setter is called inside another setter's updater any more)
  const triggerUndo = () => {
    if (historyStack.length === 0) return;
    const previous = historyStack[historyStack.length - 1];
    setHistoryStack(prev => prev.slice(0, -1));
    commit(previous.map(refresh)); // costs follow today's stock prices
    if (!previous.some(c => c.id === activeCabinetId)) setActiveCabinetId('');
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
      updateManyCabinets,
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
