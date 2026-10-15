// src/components/AccessoryLayer.tsx
// Draws the pieces of the accessories library inside the kitchen scene. Where a piece is comes from math/accessoryPlacement.ts
// and what it looks like from math/accessoryModels.ts (plain boxes and cylinders), so this file only maps numbers to meshes.
import React, { useMemo } from 'react';
import { getAccessory, resolveFinish } from '../data/accessoryCatalog';
import { Prim, modelPrims } from '../math/accessoryModels';
import { CabinetLite, PlacedAccessory, footprintOf, sceneRefOf } from '../math/accessoryPlacement';

const mm = (v: number) => v / 1000;

// `order` = position in the model's list: details come after the body they sit on, so a later shape is pulled a hair towards
// the camera and wins over a face it shares with an earlier one (no flicker where a button lies on a panel).
function PrimMesh({ p, xray, order }: { p: Prim; xray: boolean; order: number }) {
  const material = (
    <meshStandardMaterial
      color={p.c}
      metalness={p.metal ?? 0.1}
      roughness={p.rough ?? 0.55}
      emissive={p.emissive ?? '#000000'}
      emissiveIntensity={p.emissive ? 0.9 : 0}
      transparent={xray || p.opacity !== undefined}
      opacity={xray ? 0.45 : p.opacity ?? 1}
      polygonOffset={order > 0}
      polygonOffsetFactor={-1}
      polygonOffsetUnits={-Math.min(order, 40)}
    />
  );
  if (p.t === 'box') {
    return (
      <mesh position={[mm(p.x), mm(p.y), mm(p.z)]} castShadow receiveShadow>
        <boxGeometry args={[mm(p.w), mm(p.h), mm(p.d)]} />
        {material}
      </mesh>
    );
  }
  if (p.t === 'sph') {
    return (
      <mesh position={[mm(p.x), mm(p.y), mm(p.z)]} castShadow receiveShadow>
        <sphereGeometry args={[mm(p.r), 24, 16]} />
        {material}
      </mesh>
    );
  }
  const rotation: [number, number, number] = p.ax === 'x' ? [0, 0, Math.PI / 2] : p.ax === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
  return (
    <mesh position={[mm(p.x), mm(p.y), mm(p.z)]} rotation={rotation} castShadow receiveShadow>
      <cylinderGeometry args={[mm(p.r), mm(p.r), mm(p.len), 24]} />
      {material}
    </mesh>
  );
}

interface AccessoryLayerProps {
  accessories: ReadonlyArray<PlacedAccessory>;
  cabinets: ReadonlyArray<CabinetLite>;
  wallSplashHeightMm: number;
  isXRayMode: boolean;
}

export default function AccessoryLayer({ accessories, cabinets, wallSplashHeightMm, isXRayMode }: AccessoryLayerProps) {
  const drawn = useMemo(() => {
    const scene = sceneRefOf(cabinets, wallSplashHeightMm);
    const list: Array<{ id: string; x: number; y: number; z: number; prims: Prim[] }> = [];
    accessories.forEach((a) => {
      const item = getAccessory(a.catalogId);
      const f = footprintOf(a, accessories, cabinets, scene);
      if (!item || !f) return;
      list.push({ id: a.id, x: f.xMm, y: f.yMm, z: f.zMm, prims: modelPrims(item.model, f.w, f.h, f.d, item.opts ?? {}, resolveFinish(item, a.finish)) });
    });
    return list;
  }, [accessories, cabinets, wallSplashHeightMm]);

  return (
    <group>
      {drawn.map((a) => (
        <group key={a.id} position={[mm(a.x), mm(a.y), mm(a.z)]}>
          {a.prims.map((p, i) => (
            <PrimMesh key={i} p={p} xray={isXRayMode} order={i} />
          ))}
        </group>
      ))}
    </group>
  );
}
