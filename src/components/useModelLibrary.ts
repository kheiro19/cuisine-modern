// src/components/useModelLibrary.ts
// Gives a component the external 3D library (and loads it the first time anyone asks).
import { useEffect, useSyncExternalStore } from 'react';
import { LibrarySnapshot, getModelLibrary, loadModelLibrary, subscribeModelLibrary } from '../data/modelLibraryStore';

export function useModelLibrary(): LibrarySnapshot {
  useEffect(() => {
    void loadModelLibrary(import.meta.env.BASE_URL);
  }, []);
  return useSyncExternalStore(subscribeModelLibrary, getModelLibrary, getModelLibrary);
}
