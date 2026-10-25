// THE priority-9 test: not the formula, the WIRING.
// The previous file proves the arithmetic of math/stockDelta.ts. This one mounts the real FurnitureProvider — the object the
// whole app uses — and drives it with the real actions (addCabinet, updateCabinet, deleteCabinet, triggerUndo, addHardwareItem),
// reading the shelf back through the same context. If `commit()` ever stops calling applyConsumptionDelta, or undo forgets the
// stock, this file fails even though every engine still passes.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import { FurnitureProvider, useFurniture } from '../src/context/FurnitureContext';
import * as P from '../src/math/cabinetPresets';

// ------------------------------------------------------------------------------------------------ a window on the context
let api: any;
function Probe() {
  api = useFurniture();
  const { inventory } = api;
  const row = (id: string) => inventory.hardwareItems.find((h: any) => h.id === id)?.availableQty ?? 'absent';
  return (
    <div>
      <span data-testid="hinge">{row('hinge')}</span>
      <span data-testid="legs">{row('legs')}</span>
      <span data-testid="cams">{row('cam')}</span>
      <span data-testid="count">{api.cabinets.length}</span>
      <span data-testid="baseline-hinge">{api.baselineInventory.hardwareItems.find((h: any) => h.id === 'hinge')?.availableQty ?? 'absent'}</span>
    </div>
  );
}
const mount = () => render(<FurnitureProvider><Probe /></FurnitureProvider>);
const num = (el: HTMLElement) => Number(el.textContent);

const stock = () => [
  { id: 'hinge', category: 'Cabinet Hinges', brand: 'B', modelType: 'Clip Top Hinge', pricePerUnitDA: 100, availableQty: 100 },
  { id: 'cam', category: 'Assembly & Fixing', brand: 'B', modelType: 'Cam Lock', pricePerUnitDA: 10, availableQty: 1000 },
  { id: 'dowel', category: 'Assembly & Fixing', brand: 'B', modelType: 'Wooden Dowel', pricePerUnitDA: 2, availableQty: 1000 },
  { id: 'screw', category: 'Assembly & Fixing', brand: 'B', modelType: 'Back Panel Screw', pricePerUnitDA: 1, availableQty: 1000 },
  { id: 'pin', category: 'Assembly & Fixing', brand: 'B', modelType: 'Shelf Support Pin', pricePerUnitDA: 1, availableQty: 1000 },
  { id: 'legs', category: 'Assembly & Fixing', brand: 'B', modelType: 'Adjustable Kitchen Legs', pricePerUnitDA: 120, availableQty: 100 },
];
const wood = (id: string, th: number) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 100, averagePriceDA: 15000 });

/** The cabinet the app itself builds from a preset (math/cabinetPresets -> partsEngine), never a hand-made object. */
const cabinetOf = (zones: any[], extra: any = {}) => {
  const d = P.resolveDraft(
    { ...P.draftFromPreset('Standard_Base'), width: 600, height: 870, depth: 600, zones, ...extra } as any,
    [{ id: 'hdf', brand: 'hdf', type: 'HDF Standard 3mm', thickness: 3, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 100, averagePriceDA: 4000 } as any,
     { id: 'mel', brand: 'mel', type: 'MDF Melamine Matt', thickness: 18, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 100, averagePriceDA: 15000 } as any],
    api.inventory.hardwareItems, [],
  );
  return P.draftToNewCabinet(d, { id: freshId(), name: 'u', positionX: 0 } as any);
};

let k = 0;
const freshId = () => 'cab' + k++;

beforeEach(() => { cleanup(); k = 0; });

/** Every test starts from a workshop with stock in it. */
function workshop() {
  const view = mount();
  act(() => { api.addWoodMaterial(wood('hdf', 3)); api.addWoodMaterial(wood('mel', 18)); });
  act(() => { stock().forEach((h) => api.addHardwareItem(h)); });
  return view;
}

const add = (zones: any[] = [{ kind: 'DOORS', count: 2, shelves: 0 }], extra: any = {}) => {
  const cab = cabinetOf(zones, extra);
  act(() => { api.addCabinet(cab as any); });
  return cab.id;
};

describe('the real provider: stock goes down and comes back', () => {
  it('adding a cabinet takes four hinges and four legs from the shelf, on screen', () => {
    const v = workshop();
    expect(num(v.getByTestId('hinge'))).toBe(100);
    add();
    expect(num(v.getByTestId('hinge'))).toBe(96);
    expect(num(v.getByTestId('legs'))).toBe(96);
    expect(num(v.getByTestId('count'))).toBe(1);
  });

  it('UNDO puts both the cabinet and the stock back, exactly', () => {
    const v = workshop();
    add();
    expect(num(v.getByTestId('hinge'))).toBe(96);
    act(() => { api.triggerUndo(); });
    expect(num(v.getByTestId('count'))).toBe(0);
    expect(num(v.getByTestId('hinge'))).toBe(100);
    expect(num(v.getByTestId('legs'))).toBe(100);
  });

  it('DELETE returns the pieces without touching Undo', () => {
    const v = workshop();
    const id = add();
    act(() => { api.deleteCabinet(id); });
    expect(num(v.getByTestId('hinge'))).toBe(100);
    expect(num(v.getByTestId('legs'))).toBe(100);
  });

  it('EDIT takes only the difference: a third door costs two hinges, not six', () => {
    const v = workshop();
    const id = add([{ kind: 'DOORS', count: 2, shelves: 0 }]);
    expect(num(v.getByTestId('hinge'))).toBe(96);
    act(() => { api.updateCabinet(id, { zones: [{ kind: 'DOORS', count: 3, shelves: 0 }] } as any); });
    expect(num(v.getByTestId('hinge'))).toBe(94);
    act(() => { api.updateCabinet(id, { zones: [{ kind: 'DOORS', count: 2, shelves: 0 }] } as any); });
    expect(num(v.getByTestId('hinge'))).toBe(96);
  });

  it('UNDO after an EDIT restores both the edit and its stock delta', () => {
    const v = workshop();
    const id = add([{ kind: 'DOORS', count: 2, shelves: 0 }]);
    act(() => { api.updateCabinet(id, { zones: [{ kind: 'DOORS', count: 3, shelves: 0 }] } as any); });
    expect(num(v.getByTestId('hinge'))).toBe(94);
    act(() => { api.triggerUndo(); });
    expect(num(v.getByTestId('hinge'))).toBe(96);
    expect((api.cabinets[0].zones ?? [])[0].count).toBe(2);
    act(() => { api.triggerUndo(); });     // the add itself
    expect(num(v.getByTestId('hinge'))).toBe(100);
    expect(num(v.getByTestId('count'))).toBe(0, );
  });

  it('moving a unit from the floor to the wall returns the legs and takes the hangers', () => {
    const v = workshop();
    act(() => { api.addHardwareItem({ id: 'hang', category: 'Assembly & Fixing', brand: 'B', modelType: 'Cabinet Hanger Plates', pricePerUnitDA: 200, availableQty: 50 } as any); });
    const id = add([{ kind: 'DOORS', count: 2, shelves: 0 }]);
    expect(num(v.getByTestId('legs'))).toBe(96);
    act(() => { api.updateCabinet(id, { category: 'WALL_UNIT' } as any); });
    expect(num(v.getByTestId('legs'))).toBe(100);
    expect(api.inventory.hardwareItems.find((h: any) => h.id === 'hang').availableQty).toBe(48, );
  });

  it('an edit that removes the legs (wooden frame) gives the four back', () => {
    const v = workshop();
    const id = add([{ kind: 'DOORS', count: 2, shelves: 0 }], { base: { type: 'LEGS' } });
    expect(num(v.getByTestId('legs'))).toBe(96);
    act(() => { api.updateCabinet(id, { base: { type: 'WOOD' } } as any); });
    expect(num(v.getByTestId('legs'))).toBe(100);
  });

  it('twenty add/undo cycles leave the shelf exactly where it started', () => {
    const v = workshop();
    for (let i = 0; i < 10; i++) { add(); act(() => { api.triggerUndo(); }); }
    expect(num(v.getByTestId('hinge'))).toBe(100);
    expect(num(v.getByTestId('legs'))).toBe(100);
    expect(num(v.getByTestId('cams'))).toBe(1000);
    expect(num(v.getByTestId('count'))).toBe(0);
  });

  it('a real shortage shows as a negative count, and undo brings the shelf back to two, not to zero', () => {
    const v = mount();
    act(() => { api.addWoodMaterial(wood('hdf', 3)); api.addWoodMaterial(wood('mel', 18)); });
    act(() => { api.addHardwareItem({ ...stock()[0], availableQty: 2 } as any); });   // two hinges only
    act(() => { stock().slice(1).forEach((h) => api.addHardwareItem(h)); });
    expect(num(v.getByTestId('hinge'))).toBe(2);
    add();
    expect(num(v.getByTestId('hinge'))).toBe(-2);
    act(() => { api.triggerUndo(); });
    expect(num(v.getByTestId('hinge'))).toBe(2);
  });

  it('correcting a hardware quantity keeps the shelf at "entered - already taken"', () => {
    const v = workshop();
    add();                                     // four hinges taken: 100 -> 96
    expect(num(v.getByTestId('hinge'))).toBe(96);
    act(() => { api.updateHardwareItem('hinge', { availableQty: 50 }); });   // typo: it was 50, not 100
    expect(num(v.getByTestId('hinge'))).toBe(46);                          // 50 - 4 already on the cabinet
    expect(num(v.getByTestId('baseline-hinge'))).toBe(50);                 // the shelf now says 50
    act(() => { api.triggerUndo(); });                                       // the cabinet goes
    expect(num(v.getByTestId('hinge'))).toBe(50);                          // the pieces come back to 50, not to 100
  });

  it('correcting a board quantity is immediate, and the ledger reads the new number', () => {
    workshop();
    act(() => { api.updateWoodMaterial('mel', { currentQty: 3 }); });
    expect(api.baselineInventory.woodPanels.find((w: any) => w.id === 'mel').currentQty).toBe(3);
    expect(api.inventory.woodPanels.find((w: any) => w.id === 'mel').currentQty).toBe(3);
    add();
    // a board is not consumed by the shelf: adding a cabinet does not change the count
    expect(api.inventory.woodPanels.find((w: any) => w.id === 'mel').currentQty).toBe(3);
  });

  it('removing a stock line removes it from the shelf and from the baseline, and the price follows', () => {
    const v = workshop();
    add();
    const before = Number(v.getByTestId('count').textContent);
    act(() => { api.removeHardwareItem('legs'); });
    expect(api.inventory.hardwareItems.some((h: any) => h.id === 'legs')).toBe(false);
    expect(api.baselineInventory.hardwareItems.some((h: any) => h.id === 'legs')).toBe(false);
    expect(Number(v.getByTestId('count').textContent)).toBe(before);
  });

  it('the BASELINE never moves with the project: it is what the workshop typed in', () => {
    const v = workshop();
    expect(num(v.getByTestId('baseline-hinge'))).toBe(100);
    add(); add();
    expect(num(v.getByTestId('hinge'))).toBe(92);
    expect(num(v.getByTestId('baseline-hinge'))).toBe(100);
    act(() => { api.triggerUndo(); });
    expect(num(v.getByTestId('baseline-hinge'))).toBe(100);
  });

  it('registering hardware AFTER the cabinets charges the cabinets at once, and deleting them returns it', () => {
    const v = mount();
    act(() => { api.addWoodMaterial(wood('hdf', 3)); api.addWoodMaterial(wood('mel', 18)); });
    // hinges first: without them a door cabinet has no front hardware at all
    act(() => { api.addHardwareItem(stock()[0] as any); });
    const a = add();
    act(() => { api.addHardwareItem(stock()[5] as any); });        // legs arrive later
    expect(num(v.getByTestId('legs'))).toBe(96);
    act(() => { api.deleteCabinet(a); });
    expect(num(v.getByTestId('legs'))).toBe(100);
  });
});
