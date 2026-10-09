// src/components/Room3D.tsx
// The "showroom" around the cabinets: glossy tiled floor, grey walls with a window, soft studio lighting, a black
// marble worktop texture, and the sink / hob props that sit on the worktop. Everything is procedural (canvas
// textures, no downloads) so it works offline. Coordinates are METRES in the same frame as the cabinets:
// x along the run (cabinet.positionX / 1000), back wall at z = 0, y up.
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Environment, Lightformer } from '@react-three/drei';

const rng = (seed: number) => () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

/** Black marble with white veins. */
export function marbleTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 1024;
  const g = c.getContext('2d')!;
  const r = rng(7);
  g.fillStyle = '#0F1013';
  g.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 46; i++) {
    let x = r() * 1024, y = r() * 1024, a = r() * Math.PI * 2;
    g.beginPath();
    g.moveTo(x, y);
    const steps = 30 + Math.floor(r() * 50);
    for (let k = 0; k < steps; k++) {
      a += (r() - 0.5) * 0.9;
      x += Math.cos(a) * (10 + r() * 14);
      y += Math.sin(a) * (10 + r() * 14);
      g.lineTo(x, y);
    }
    g.strokeStyle = `rgba(235,238,245,${0.07 + r() * (i < 8 ? 0.5 : 0.22)})`;
    g.lineWidth = i < 8 ? 1.5 + r() * 2.5 : 0.4 + r() * 1.2;
    g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(0.9, 0.9);
  t.anisotropy = 8;
  return t;
}

function tileTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  const r = rng(3);
  g.fillStyle = '#E9EBEE';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 14; i++) { // faint veining
    g.beginPath();
    let x = r() * 512, y = r() * 512;
    g.moveTo(x, y);
    for (let k = 0; k < 10; k++) { x += (r() - 0.3) * 60; y += (r() - 0.5) * 60; g.lineTo(x, y); }
    g.strokeStyle = 'rgba(150,158,170,0.18)';
    g.lineWidth = 1;
    g.stroke();
  }
  g.strokeStyle = '#C9CED5';
  g.lineWidth = 6;
  g.strokeRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const STEEL = { color: '#C4CAD1', metalness: 0.9, roughness: 0.25 };

export function Room3D({ x0, x1, depthM: depth, wallHeightM = 2.7, windowCenterX }: { x0: number; x1: number; depthM: number; wallHeightM?: number; windowCenterX?: number }) {
  const floorTex = useMemo(() => {
    const t = tileTexture();
    t.repeat.set((x1 - x0) / 0.6, depth / 0.6);
    return t;
  }, [x1, x0, depth]);
  const wx = Math.min(Math.max(windowCenterX ?? (x0 + x1) / 2, x0 + 0.9), x1 - 0.9);
  const ww = 1.4, wy0 = 1.05, wh = 1.2;
  const wallGeo = useMemo(() => {
    const s = new THREE.Shape([new THREE.Vector2(x0, 0), new THREE.Vector2(x1, 0), new THREE.Vector2(x1, wallHeightM), new THREE.Vector2(x0, wallHeightM)]);
    const h = new THREE.Path();
    h.moveTo(wx - ww / 2, wy0); h.lineTo(wx + ww / 2, wy0); h.lineTo(wx + ww / 2, wy0 + wh); h.lineTo(wx - ww / 2, wy0 + wh); h.closePath();
    s.holes.push(h);
    return new THREE.ExtrudeGeometry(s, { depth: 0.05, bevelEnabled: false });
  }, [x0, x1, wallHeightM, wx]);
  const wallMat = <meshStandardMaterial color="#D9DCE1" roughness={0.9} />;
  const frame = '#20232A';
  return (
    <group>
      {/* soft studio light: reflections on the floor, the worktop and the steel */}
      <Environment resolution={256} background={false}>
        <Lightformer form="rect" intensity={2.6} position={[0, 5, 2]} rotation-x={Math.PI / 2} scale={[12, 5, 1]} />
        <Lightformer form="rect" intensity={1.8} position={[-6, 2, 1]} rotation-y={Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={1.4} position={[6, 2, 1]} rotation-y={-Math.PI / 2} scale={[6, 3, 1]} />
        <Lightformer form="rect" intensity={2.2} position={[0, 2, -6]} scale={[10, 3, 1]} />
      </Environment>

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[(x0 + x1) / 2, -0.002, depth / 2 - 0.05]} receiveShadow>
        <planeGeometry args={[x1 - x0, depth]} />
        <meshStandardMaterial map={floorTex} roughness={0.16} metalness={0.08} />
      </mesh>

      <mesh geometry={wallGeo} position={[0, 0, -0.06]} receiveShadow>{wallMat}</mesh>
      <mesh position={[x0, wallHeightM / 2, depth / 2 - 0.05]} rotation={[0, Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, wallHeightM]} /><meshStandardMaterial color="#D3D6DB" roughness={0.9} />
      </mesh>
      <mesh position={[x1, wallHeightM / 2, depth / 2 - 0.05]} rotation={[0, -Math.PI / 2, 0]} receiveShadow>
        <planeGeometry args={[depth, wallHeightM]} /><meshStandardMaterial color="#D3D6DB" roughness={0.9} />
      </mesh>

      {/* window: bright daylight pane + dark aluminium frame */}
      <mesh position={[wx, wy0 + wh / 2, -0.075]}><planeGeometry args={[ww, wh]} /><meshBasicMaterial color="#F4F9FF" /></mesh>
      {[
        [ww + 0.08, 0.05, wx, wy0 + wh], [ww + 0.08, 0.05, wx, wy0], [0.05, wh, wx - ww / 2, wy0 + wh / 2], [0.05, wh, wx + ww / 2, wy0 + wh / 2], [0.03, wh, wx, wy0 + wh / 2],
      ].map(([w, h, x, y], i) => (
        <mesh key={i} position={[x, y, -0.04]} castShadow><boxGeometry args={[w, h, 0.07]} /><meshStandardMaterial color={frame} roughness={0.5} metalness={0.4} /></mesh>
      ))}
    </group>
  );
}

/** Steel sink basin under a hole in the worktop (the hole itself is cut by the caller). Origin = centre of the hole at worktop top level. */
export function SinkProp({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const w = 0.7, d = 0.4, h = 0.18;
  const curve = useMemo(() => new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0.26, 0), new THREE.Vector3(0, 0.36, 0.02), new THREE.Vector3(0, 0.38, 0.12), new THREE.Vector3(0, 0.3, 0.17),
  ]), []);
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, -h, 0]} castShadow receiveShadow><boxGeometry args={[w, 0.006, d]} /><meshStandardMaterial {...STEEL} /></mesh>
      {([-1, 1] as const).map((k) => <mesh key={`x${k}`} position={[(k * w) / 2, -h / 2, 0]} castShadow><boxGeometry args={[0.006, h, d]} /><meshStandardMaterial {...STEEL} /></mesh>)}
      {([-1, 1] as const).map((k) => <mesh key={`z${k}`} position={[0, -h / 2, (k * d) / 2]} castShadow><boxGeometry args={[w, h, 0.006]} /><meshStandardMaterial {...STEEL} /></mesh>)}
      <mesh position={[0, 0.002, 0]}><boxGeometry args={[w + 0.03, 0.004, d + 0.03]} /><meshStandardMaterial {...STEEL} /></mesh>
      <mesh position={[0, 0.0025, 0]}><boxGeometry args={[w - 0.01, 0.004, d - 0.01]} /><meshStandardMaterial color="#0B0C0E" /></mesh>
      <group position={[0, 0, -d / 2 - 0.06]}>
        <mesh castShadow><tubeGeometry args={[curve, 24, 0.014, 12, false]} /><meshStandardMaterial {...STEEL} /></mesh>
        <mesh position={[0.05, 0.1, 0]} rotation={[0, 0, -Math.PI / 2]}><cylinderGeometry args={[0.007, 0.007, 0.07, 12]} /><meshStandardMaterial {...STEEL} /></mesh>
      </group>
    </group>
  );
}

/** Black glass hob with four burners and cast-iron grates. Origin = centre of the hob at worktop top level. */
export function HobProp({ position, rotationY = 0 }: { position: [number, number, number]; rotationY?: number }) {
  const burners: [number, number][] = [[-0.14, -0.1], [0.14, -0.1], [-0.14, 0.12], [0.14, 0.12]];
  return (
    <group position={position} rotation={[0, rotationY, 0]}>
      <mesh position={[0, 0.003, 0]} castShadow receiveShadow><boxGeometry args={[0.6, 0.006, 0.5]} /><meshStandardMaterial color="#0A0B0D" roughness={0.1} metalness={0.3} /></mesh>
      {burners.map(([x, z], i) => (
        <group key={i} position={[x, 0.006, z]}>
          <mesh><cylinderGeometry args={[0.045, 0.045, 0.012, 28]} /><meshStandardMaterial {...STEEL} /></mesh>
          <mesh position={[0, 0.007, 0]}><cylinderGeometry args={[0.028, 0.028, 0.008, 28]} /><meshStandardMaterial color="#15171B" roughness={0.6} /></mesh>
        </group>
      ))}
      {[-0.14, 0.14].map((x) => <mesh key={`g${x}`} position={[x, 0.032, 0.01]}><boxGeometry args={[0.02, 0.014, 0.4]} /><meshStandardMaterial color="#1B1D22" roughness={0.5} metalness={0.5} /></mesh>)}
      {[-0.1, 0.12].map((z) => <mesh key={`h${z}`} position={[0, 0.032, z]}><boxGeometry args={[0.46, 0.014, 0.02]} /><meshStandardMaterial color="#1B1D22" roughness={0.5} metalness={0.5} /></mesh>)}
      {[-0.2, -0.07, 0.07, 0.2].map((x) => <mesh key={`k${x}`} position={[x, 0.008, 0.235]}><cylinderGeometry args={[0.014, 0.014, 0.014, 16]} /><meshStandardMaterial {...STEEL} /></mesh>)}
    </group>
  );
}
