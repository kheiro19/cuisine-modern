// src/components/useDisposeMaterials.ts
import { useEffect } from 'react';
import { OwnedMaterial, disposeOwned, reviveOwned } from '../math/materialLifecycle';

/**
 * Releases the materials (and their GPU texture clones) when the list is replaced or the component goes away.
 * Pass a MEMOISED list: the effect re-runs when its identity changes, and React needs a dependency list of fixed length.
 */
export function useDisposeMaterials(materials: OwnedMaterial[]): void {
  useEffect(() => {
    materials.forEach(reviveOwned);
    return () => materials.forEach(disposeOwned);
  }, [materials]);
}
