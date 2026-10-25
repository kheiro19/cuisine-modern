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
  reconcileAccessories,
  removeAccessory,
  sceneRefOf,
  setFinish,
} from '../math/accessoryPlacement';
import type { FinishKey } from '../data/accessoryCatalog';

export function useAccessories(cabinets: ReadonlyArray<CabinetLite>, wallSplashHeightMm: number, roomHeightMm?: number) {
  const [stored, setStored] = useState<PlacedAccessory[]>([]);
  const scene = useMemo(() => sceneRefOf(cabinets, wallSplashHeightMm, roomHeightMm), [cabinets, wallSplashHeightMm, roomHeightMm]);
  // A cabinet or a sink deleted elsewhere takes its pieces away.
  const accessories = useMemo(() => reconcileAccessories(stored, cabinets), [stored, cabinets]);

  const add = useCallback(
    (catalogId: string, hostCabinetId?: string, finish?: FinishKey): PlaceResult => {
      const result = placeAccessory(catalogId, uid('acc'), accessories, cabinets, scene, hostCabinetId, finish);
      if (result.ok) setStored([...accessories, result.placed]);
      return result;
    },
    [accessories, cabinets, scene],
  );

  const nudge = useCallback(
    (id: string, dxMm: number): NudgeResult => {
      const result = nudgeAccessory(id, dxMm, accessories, cabinets, scene);
      if (result.ok) setStored(result.list);
      return result;
    },
    [accessories, cabinets, scene],
  );

  const remove = useCallback((id: string) => setStored(removeAccessory(accessories, id)), [accessories]);
  const changeFinish = useCallback((id: string, finish: FinishKey) => setStored(setFinish(accessories, id, finish)), [accessories]);
  const clear = useCallback(() => setStored([]), []);

  return { accessories, add, nudge, remove, changeFinish, clear };
}
