// src/components/AccessoryLayer.tsx
// Draws the pieces of the accessories library inside the kitchen scene. Where a piece is comes from math/accessoryPlacement.ts
// and what it looks like from math/accessoryModels.ts (plain boxes and cylinders), so this file only maps numbers to meshes.
import React, { useMemo } from 'react';
import { CodeModelId, FinishStyle, getAccessory, resolveFinish } from '../data/accessoryCatalog';
import { Prim, modelPrims } from '../math/accessoryModels';
import { Shapes } from './PrimShapes';
import { GlbResolution, resolveGlb } from '../data/libraryManifest';
import GlbModel from './GlbModel';
import CodeModel from './CodeModel';
import { useModelLibrary } from './useModelLibrary';
import { CabinetLite, PlacedAccessory, footprintOf, sceneRefOf } from '../math/accessoryPlacement';

const mm = (v: number) => v / 1000;

interface AccessoryLayerProps {
  accessories: ReadonlyArray<PlacedAccessory>;
  cabinets: ReadonlyArray<CabinetLite>;
  wallSplashHeightMm: number;
  isXRayMode: boolean;
}

export default function AccessoryLayer({ accessories, cabinets, wallSplashHeightMm, isXRayMode }: AccessoryLayerProps) {
  const library = useModelLibrary();
  const drawn = useMemo(() => {
    const scene = sceneRefOf(cabinets, wallSplashHeightMm);
    const list: Array<{ id: string; x: number; y: number; z: number; prims: Prim[]; size: { w: number; h: number; d: number }; glb?: GlbResolution; code?: CodeModelId; finish: FinishStyle }> = [];
    accessories.forEach((a) => {
      const item = getAccessory(a.catalogId);
      const f = footprintOf(a, accessories, cabinets, scene);
      if (!item || !f) return;
      const finish = resolveFinish(item, a.finish);
      list.push({ id: a.id, x: f.xMm, y: f.yMm, z: f.zMm, size: { w: f.w, h: f.h, d: f.d }, glb: resolveGlb(item.id, item.model, library.manifest), ...(item.codeModel ? { code: item.codeModel } : {}), finish, prims: modelPrims(item.model, f.w, f.h, f.d, item.opts ?? {}, finish) });
    });
    return list;
  }, [accessories, cabinets, wallSplashHeightMm, library.manifest]);

  return (
    <group>
      {drawn.map((a) => (
        <group key={a.id} position={[mm(a.x), mm(a.y), mm(a.z)]}>
          {a.glb ? (
            <GlbModel url={library.baseUrl + a.glb.entry.file} res={a.glb} size={a.size} finish={a.finish} xray={isXRayMode} fallback={<Shapes prims={a.prims} xray={isXRayMode} />} />
          ) : a.code ? (
            <CodeModel codeId={a.code} size={a.size} xray={isXRayMode} fallback={<Shapes prims={a.prims} xray={isXRayMode} />} />
          ) : (
            <Shapes prims={a.prims} xray={isXRayMode} />
          )}
        </group>
      ))}
    </group>
  );
}
