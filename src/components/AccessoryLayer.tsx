// src/components/AccessoryLayer.tsx
// Draws the pieces of the accessories library inside the kitchen scene. Where a piece is comes from math/accessoryPlacement.ts
// and what it looks like from math/accessoryModels.ts (plain boxes and cylinders), so this file only maps numbers to meshes.
import { useMemo } from 'react';
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
  /** Floor to ceiling (wall units may hang from the ceiling). */
  roomHeightMm?: number;
  isXRayMode: boolean;
  /** Clicking a piece in the 3D view selects it (its size/direction panel opens in the canvas). */
  selectedId?: string;
  onSelect?: (id: string) => void;
}

export default function AccessoryLayer({ accessories, cabinets, wallSplashHeightMm, roomHeightMm, isXRayMode, selectedId, onSelect }: AccessoryLayerProps) {
  const library = useModelLibrary();
  const drawn = useMemo(() => {
    const scene = sceneRefOf(cabinets, wallSplashHeightMm, roomHeightMm);
    const list: Array<{ id: string; x: number; y: number; z: number; prims: Prim[]; size: { w: number; h: number; d: number }; rawSize: { w: number; h: number; d: number }; rotY: number; flip: boolean; glb?: GlbResolution; code?: CodeModelId; finish: FinishStyle }> = [];
    accessories.forEach((a) => {
      const item = getAccessory(a.catalogId);
      const f = footprintOf(a, accessories, cabinets, scene);
      if (!item || !f) return;
      const finish = resolveFinish(item, a.finish);
      // The model is built from the CATALOG proportions turned by the quarter turn: intrinsic w/h/d with swapped axes.
      const raw = a.sizeMm ?? item.sizeMm;
      list.push({ id: a.id, x: f.xMm, y: f.yMm, z: f.zMm, size: { w: f.w, h: f.h, d: f.d }, rawSize: { w: raw.w, h: raw.h, d: raw.d }, rotY: a.rotY ?? 0, flip: !!a.flip, glb: resolveGlb(item.id, item.model, library.manifest), ...(item.codeModel ? { code: item.codeModel } : {}), finish, prims: modelPrims(item.model, raw.w, raw.h, raw.d, item.opts ?? {}, finish) });
    });
    return list;
  }, [accessories, cabinets, wallSplashHeightMm, roomHeightMm, library.manifest]);

  return (
    <group>
      {drawn.map((a) => (
        <group key={a.id} position={[mm(a.x), mm(a.y), mm(a.z)]} onClick={onSelect ? (e) => { e.stopPropagation(); onSelect(a.id); } : undefined}>
          <group rotation={[0, (a.rotY * Math.PI) / 180, 0]} scale={[a.flip ? -1 : 1, 1, 1]}>
            {a.glb ? (
              <GlbModel url={library.baseUrl + a.glb.entry.file} res={a.glb} size={a.rawSize} finish={a.finish} xray={isXRayMode} fallback={<Shapes prims={a.prims} xray={isXRayMode} />} />
            ) : a.code ? (
              <CodeModel codeId={a.code} size={a.rawSize} xray={isXRayMode} fallback={<Shapes prims={a.prims} xray={isXRayMode} />} />
            ) : (
              <Shapes prims={a.prims} xray={isXRayMode} />
            )}
          </group>
          {selectedId === a.id && (
            <mesh position={[0, mm(a.size.h) / 2, 0]}>
              <boxGeometry args={[mm(a.size.w) + 0.02, mm(a.size.h) + 0.02, mm(a.size.d) + 0.02]} />
              <meshBasicMaterial color="#f59e0b" wireframe transparent opacity={0.9} />
            </mesh>
          )}
        </group>
      ))}
    </group>
  );
}
