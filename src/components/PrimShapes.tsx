// src/components/PrimShapes.tsx
// Draws the shapes of math/accessoryModels.ts (boxes, cylinders, spheres in millimetres) as meshes. Shared by the accessories
// library (AccessoryLayer) and the appliances inside a cabinet niche (CabinetAssembly3D).
import type { Prim } from '../math/accessoryModels';

const mm = (v: number) => v / 1000;

// `order` = position in the model's list: details come after the body they sit on, so a later shape is pulled a hair towards
// the camera and wins over a face it shares with an earlier one (no flicker where a button lies on a panel).
export function PrimMesh({ p, xray, order }: { p: Prim; xray: boolean; order: number }) {
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

export function Shapes({ prims, xray }: { prims: Prim[]; xray: boolean }) {
  return (
    <>
      {prims.map((p, i) => (
        <PrimMesh key={i} p={p} xray={xray} order={i} />
      ))}
    </>
  );
}
