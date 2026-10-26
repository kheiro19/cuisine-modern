// src/components/useAccessories.ts
// The pieces the user added from the accessories library. Like the cabinets of FurnitureContext they live for the session;
// the rules (where a piece may go, collisions, fit) are all in math/accessoryPlacement.ts.
import { useCallback, useMemo, useState } from 'react';
import { uid } from '../math/utils';
import {
  CabinetLite,
  NudgeResult,
  PlaceResult,
  PlacedAccessory,
  nudgeAccessory,
  placeAccessory,
  flipAccessory,
  resetAccessoryTransform,
  resizeAccessory,
  rotateAccessory,
  type TransformResult,
  reconcileAccessories,
  removeAccessory,
  sceneRefOf,
  setFinish,
} from '../math/accessoryPlacement';
import type { FinishKey } from '../data/accessoryCatalog';
import type { KitchenLayout } from '../math/kitchenLayout';
import type { RunId } from '../types/flatma';

export function useAccessories(cabinets: ReadonlyArray<CabinetLite>, wallSplashHeightMm: number, roomHeightMm?: number, layout?: KitchenLayout) {
  const [stored, setStored] = useState<PlacedAccessory[]>([]);
  const scene = useMemo(() => sceneRefOf(cabinets, wallSplashHeightMm, roomHeightMm), [cabinets, wallSplashHeightMm, roomHeightMm]);
  // A cabinet or a sink deleted elsewhere takes its pieces away.
  const accessories = useMemo(() => reconcileAccessories(stored, cabinets), [stored, cabinets]);

  const add = useCallback(
    (catalogId: string, hostCabinetId?: string, finish?: FinishKey, run?: RunId): PlaceResult => {
      const result = placeAccessory(catalogId, uid('acc'), accessories, cabinets, scene, hostCabinetId, finish, { layout, run });
      if (result.ok) setStored([...accessories, result.placed]);
      return result;
    },
    [accessories, cabinets, scene, layout],
  );

  const nudge = useCallback(
    (id: string, dxMm: number): NudgeResult => {
      const result = nudgeAccessory(id, dxMm, accessories, cabinets, scene, layout);
      if (result.ok) setStored(result.list);
      return result;
    },
    [accessories, cabinets, scene, layout],
  );

  const resize = useCallback(
    (id: string, size: { w: number; h: number; d: number }): TransformResult => {
      const result = resizeAccessory(id, size, accessories, cabinets, scene, layout);
      if (result.ok) setStored(result.list);
      return result;
    },
    [accessories, cabinets, scene, layout],
  );
  const rotate = useCallback(
    (id: string, dir: 1 | -1): TransformResult => {
      const result = rotateAccessory(id, dir, accessories, cabinets, scene, layout);
      if (result.ok) setStored(result.list);
      return result;
    },
    [accessories, cabinets, scene, layout],
  );
  const flip = useCallback(
    (id: string): TransformResult => {
      const result = flipAccessory(accessories, id);
      if (result.ok) setStored(result.list);
      return result;
    },
    [accessories],
  );
  const resetTransform = useCallback((id: string) => setStored(resetAccessoryTransform(accessories, id)), [accessories]);

  const remove = useCallback((id: string) => setStored(removeAccessory(accessories, id)), [accessories]);
  const changeFinish = useCallback((id: string, finish: FinishKey) => setStored(setFinish(accessories, id, finish)), [accessories]);
  const clear = useCallback(() => setStored([]), []);
  /** A saved project brings its own pieces: the stored list is replaced wholesale (reconcile drops any orphan). */
  const replace = useCallback((list: PlacedAccessory[]) => setStored(list), []);

  return { accessories, add, nudge, resize, rotate, flip, resetTransform, remove, changeFinish, clear, replace };
}
