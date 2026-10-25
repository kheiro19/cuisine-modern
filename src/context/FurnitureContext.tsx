// src/context/FurnitureContext.tsx
import React, { createContext, useContext, useRef, useState } from 'react';
import { CabinetObject, RunId, WorkshopInventoryState, EdgeBandRoll, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { computeCabinetTotalCost } from '../math/costEngine';
import { maxFrontThicknessOf, zoneFrontChoicesOf } from '../math/zoneFronts';
import { applyConsumptionDelta, registerHardwareItem, totalConsumption } from '../math/stockDelta';

type Inventory = WorkshopInventoryState & { edgeBandRolls: EdgeBandRoll[] };

interface FurnitureContextType {
  cabinets: CabinetObject[];
  inventory: Inventory;
  /**
   * The stock AS ENTERED, before this project took a single piece. Hardware on the shelf is also spent as cabinets are added
   * (math/stockDelta), so a stock check that read the live count would count the same pieces twice: every check, ledger and
   * BOM report reads this snapshot instead (see math/stockCheck.ts).
   */
  baselineInventory: Inventory;
  activeCabinetId: string;
  setActiveCabinetId: (id: string) => void;
  addCabinet: (cabinet: Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>) => void;
  /** Several cabinets at once (an L corner is three boxes): ONE undo step. */
  addCabinets: (cabinets: Array<Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>>) => void;
  deleteCabinets: (ids: string[]) => void;
  /** Moves (and wall changes) of several cabinets: ONE undo step. */
  moveCabinets: (moves: Array<{ id: string; positionX?: number; run?: RunId }>) => void;
  updateCabinet: (id: string, fields: Partial<CabinetObject>) => void;
  /** Same change on several cabinets with ONE undo step. */
  updateManyCabinets: (ids: string[], fields: Partial<CabinetObject>) => void;  /** One edit that touches several boxes in DIFFERENT ways (an L corner re-laid out): one undo step, one save. */
  patchCabinets: (patches: Array<{ id: string; fields: Partial<CabinetObject> }>) => void;
  deleteCabinet: (id: string) => void;
  triggerUndo: () => void;
  canUndo: boolean;

  // ⚡ The Restored Lamed Dynamic Injections Pipelines
  addWoodMaterial: (material: InjectedWoodMaterial) => void;
  addHardwareItem: (item: InjectedHardwareItem) => void;
  addEdgeBandRoll: (roll: EdgeBandRoll) => void; // 🔒 Autonomous loader registration

  // A typo in a quantity used to be permanent (the stockroom could only ADD). These correct an item and remove it, keeping the
  // baseline in step: the baseline is "what the workshop really has", and a correction is part of that truth, not a project.
  updateWoodMaterial: (id: string, fields: Partial<InjectedWoodMaterial>) => void;
  updateHardwareItem: (id: string, fields: Partial<InjectedHardwareItem>) => void;
  updateEdgeBandRoll: (id: string, fields: Partial<EdgeBandRoll>) => void;
  removeWoodMaterial: (id: string) => void;
  removeHardwareItem: (id: string) => void;
  removeEdgeBandRoll: (id: string) => void;
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
  // 🧾 What the workshop typed in, never touched by consumption. Only the three "add to stock" actions write here.
  const [baselineInventory, setBaselineInventory] = useState<Inventory>({ woodPanels: [], hardwareItems: [], edgeBandRolls: [] });
  const baselineRef = useRef<Inventory>(baselineInventory);
  const commitBaseline = (next: Inventory) => {
    baselineRef.current = next;
    setBaselineInventory(next);
  };
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
      // The thickest front: a zone may have a front sheet of its own (what sticks out in front of the carcase is the thickest).
      frontThickness: maxFrontThicknessOf(zoneFrontChoicesOf(cab, inventory.woodPanels, frontMat ? frontMat.thickness : 18), frontMat ? frontMat.thickness : 18),
    };
    return { ...thick, calculatedCostDA: computeCabinetTotalCost(thick, inventory.woodPanels, inventory.hardwareItems, inventory.edgeBandRolls) };
  };

  const addCabinet = (cabFields: Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>) => {
    saveToHistory(cabinetsRef.current); // Snapshot tracking
    const finalCabinet = refresh({ ...cabFields, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 });
    commit([...cabinetsRef.current, finalCabinet]);
    setActiveCabinetId(finalCabinet.id);
  };

  const addCabinets = (list: Array<Omit<CabinetObject, 'calculatedCostDA' | 'carcaseThickness' | 'frontThickness'>>) => {
    if (list.length === 0) return;
    saveToHistory(cabinetsRef.current);
    const made = list.map(f => refresh({ ...f, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 }));
    commit([...cabinetsRef.current, ...made]);
    setActiveCabinetId(made[0].id);
  };

  const deleteCabinets = (ids: string[]) => {
    const gone = new Set(ids);
    if (!cabinetsRef.current.some(c => gone.has(c.id))) return;
    saveToHistory(cabinetsRef.current);
    commit(cabinetsRef.current.filter(cab => !gone.has(cab.id)));
    if (gone.has(activeCabinetId)) setActiveCabinetId('');
  };

  const moveCabinets = (moves: Array<{ id: string; positionX?: number; run?: RunId }>) => {
    const byId = new Map(moves.map(m => [m.id, m]));
    const changes = (cab: CabinetObject) => {
      const m = byId.get(cab.id);
      return !!m && ((m.positionX !== undefined && m.positionX !== cab.positionX) || (m.run !== undefined && m.run !== (cab.run ?? 'A')));
    };
    if (!cabinetsRef.current.some(changes)) return;
    saveToHistory(cabinetsRef.current); // a typed or clicked move is one undo step (only drags skip the history, see updateManyCabinets)
    commit(cabinetsRef.current.map(cab => {
      const m = byId.get(cab.id);
      if (!m || !changes(cab)) return cab;
      return refresh({ ...cab, ...(m.positionX !== undefined ? { positionX: Math.max(0, Math.round(m.positionX)) } : {}), ...(m.run !== undefined ? { run: m.run } : {}) });
    }));
  };

  const updateManyCabinets = (ids: string[], fields: Partial<CabinetObject>) => {
    const targets = new Set(ids);
    if (!cabinetsRef.current.some(c => targets.has(c.id))) return;
    // Only drag moves skip the history (they would flood it); every other edit is one undo step.
    if (!isMoveOnly(fields)) saveToHistory(cabinetsRef.current);
    commit(cabinetsRef.current.map(cab => (targets.has(cab.id) ? refresh({ ...cab, ...fields }) : cab)));
  };

  // The three boxes of a corner are one unit: resizing it writes different numbers on each box, and it must be ONE undo step
  // (otherwise undoing a resize takes three presses and the group is left half-resized in between).
  const patchCabinets = (patches: Array<{ id: string; fields: Partial<CabinetObject> }>) => {
    const byId = new Map(patches.map((p) => [p.id, p.fields]));
    if (!cabinetsRef.current.some((c) => byId.has(c.id))) return;
    saveToHistory(cabinetsRef.current);
    commit(cabinetsRef.current.map((cab) => {
      const fields = byId.get(cab.id);
      return fields ? refresh({ ...cab, ...fields }) : cab;
    }));
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
    const b = baselineRef.current;
    commitBaseline({ ...b, woodPanels: [...b.woodPanels, material] });
    repriceCabinets();
  };

  const addHardwareItem = (item: InjectedHardwareItem) => {
    const inv = inventoryRef.current;
    commitInventory({ ...inv, hardwareItems: registerHardwareItem(inv.hardwareItems, item, cabinetsRef.current) });
    // The baseline keeps what the workshop bought: the retroactive deduction above belongs to the live shelf only.
    const b = baselineRef.current;
    commitBaseline({ ...b, hardwareItems: [...b.hardwareItems, item] });
    repriceCabinets();
  };

  /**
   * 📝 Correcting stock. Boards and rolls are never consumed by the shelf, so their live value IS the entered one: the same
   * patch goes to both lists. Hardware is consumed as cabinets are added, so only the ENTERED quantity is corrected and the
   * live count is recomputed as "entered - what this project already took" — a correction must not hand back pieces.
   */
  const updateWoodMaterial = (id: string, fields: Partial<InjectedWoodMaterial>) => {
    const map = (list: InjectedWoodMaterial[]) => list.map((w) => (w.id === id ? { ...w, ...fields } : w));
    commitInventory({ ...inventoryRef.current, woodPanels: map(inventoryRef.current.woodPanels) });
    commitBaseline({ ...baselineRef.current, woodPanels: map(baselineRef.current.woodPanels) });
    repriceCabinets();
  };

  const updateEdgeBandRoll = (id: string, fields: Partial<EdgeBandRoll>) => {
    const map = (list: EdgeBandRoll[]) => list.map((r) => (r.id === id ? { ...r, ...fields } : r));
    commitInventory({ ...inventoryRef.current, edgeBandRolls: map(inventoryRef.current.edgeBandRolls) });
    commitBaseline({ ...baselineRef.current, edgeBandRolls: map(baselineRef.current.edgeBandRolls) });
    repriceCabinets();
  };

  const updateHardwareItem = (id: string, fields: Partial<InjectedHardwareItem>) => {
    const b = baselineRef.current;
    const entered = fields.availableQty ?? b.hardwareItems.find((h) => h.id === id)?.availableQty ?? 0;
    const baselineItems = b.hardwareItems.map((h) => (h.id === id ? { ...h, ...fields, availableQty: entered } : h));
    commitBaseline({ ...b, hardwareItems: baselineItems });
    const taken = totalConsumption(cabinetsRef.current, baselineItems)[id] ?? 0;
    commitInventory({
      ...inventoryRef.current,
      hardwareItems: inventoryRef.current.hardwareItems.map((h) => (h.id === id ? { ...h, ...fields, availableQty: entered - taken } : h)),
    });
    repriceCabinets();
  };

  const removeWoodMaterial = (id: string) => {
    commitInventory({ ...inventoryRef.current, woodPanels: inventoryRef.current.woodPanels.filter((w) => w.id !== id) });
    commitBaseline({ ...baselineRef.current, woodPanels: baselineRef.current.woodPanels.filter((w) => w.id !== id) });
    repriceCabinets();
  };

  const removeEdgeBandRoll = (id: string) => {
    commitInventory({ ...inventoryRef.current, edgeBandRolls: inventoryRef.current.edgeBandRolls.filter((r) => r.id !== id) });
    commitBaseline({ ...baselineRef.current, edgeBandRolls: baselineRef.current.edgeBandRolls.filter((r) => r.id !== id) });
    repriceCabinets();
  };

  const removeHardwareItem = (id: string) => {
    commitInventory({ ...inventoryRef.current, hardwareItems: inventoryRef.current.hardwareItems.filter((h) => h.id !== id) });
    commitBaseline({ ...baselineRef.current, hardwareItems: baselineRef.current.hardwareItems.filter((h) => h.id !== id) });
    repriceCabinets();
  };

  // 🔒 تصحيح المسار الهندسي لإدخال رولوهات شريط الحواف دون انهيار الشاشة
  const addEdgeBandRoll = (roll: EdgeBandRoll) => {
    commitInventory({ ...inventoryRef.current, edgeBandRolls: [...inventoryRef.current.edgeBandRolls, roll] });
    const b = baselineRef.current;
    commitBaseline({ ...b, edgeBandRolls: [...b.edgeBandRolls, roll] });
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
      deleteCabinet,
      triggerUndo,
      canUndo,
      addWoodMaterial,
      addHardwareItem,
      addEdgeBandRoll,
      updateWoodMaterial,
      updateHardwareItem,
      updateEdgeBandRoll,
      removeWoodMaterial,
      removeHardwareItem,
      removeEdgeBandRoll
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
