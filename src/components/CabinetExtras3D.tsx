// src/components/CabinetExtras3D.tsx
// What CabinetAssembly3D could not draw before: the moving interiors of the special cabinets (pull-out pantries, cargo,
// magic corner, lazy susan, LeMans, sink U-drawer, pull-out trays), the 45-degree corner carcase, and the stock hardware
// (hinges, lift arms) drawn on the doors. Cabinet-local frame like CabinetAssembly3D: x 0..W, y 0..H, z centred on depth
// (front = +D/2). Sizes in mm in the props, converted to metres when drawn.
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CabinetObject, InjectedHardwareItem } from '../types/flatma';
import { HardwareModel3D } from './Hardware3D';

type V3 = [number, number, number];
type MatProp = React.ComponentProps<'mesh'>['material'];
const m = (mm: number) => mm / 1000;
const PI = Math.PI;
const STEEL = { color: '#B8C0C8', metalness: 0.85, roughness: 0.32 };
const WHITE = { color: '#F1F5F9', metalness: 0.1, roughness: 0.5 };

const Bx = ({ s, p, rot, white }: { s: V3; p: V3; rot?: V3; white?: boolean }) => (
  <mesh position={[m(p[0]), m(p[1]), m(p[2])]} rotation={rot} castShadow receiveShadow>
    <boxGeometry args={[m(s[0]), m(s[1]), m(s[2])]} />
    <meshStandardMaterial {...(white ? WHITE : STEEL)} />
  </mesh>
);
const Cyl = ({ r, h, p, white, open }: { r: number; h: number; p: V3; white?: boolean; open?: boolean }) => (
  <mesh position={[m(p[0]), m(p[1]), m(p[2])]} castShadow receiveShadow>
    <cylinderGeometry args={[m(r), m(r), m(h), 40, 1, !!open]} />
    <meshStandardMaterial {...(white ? WHITE : STEEL)} side={open ? THREE.DoubleSide : THREE.FrontSide} />
  </mesh>
);

/** Wire basket: grid floor + rim + corner posts. p = centre of the floor (mm). */
const Basket = ({ w, d, h, p }: { w: number; d: number; h: number; p: V3 }) => {
  const nx = Math.max(3, Math.round(w / 50)), nz = Math.max(3, Math.round(d / 60));
  return (
    <group position={[m(p[0]), m(p[1]), m(p[2])]}>
      {Array.from({ length: nx }).map((_, i) => <Bx key={`x${i}`} s={[3, 3, d]} p={[-w / 2 + ((i + 0.5) * w) / nx, 0, 0]} />)}
      {Array.from({ length: nz }).map((_, i) => <Bx key={`z${i}`} s={[w, 3, 3]} p={[0, 0, -d / 2 + ((i + 0.5) * d) / nz]} />)}
      <Bx s={[4, 4, d]} p={[-w / 2, h, 0]} /><Bx s={[4, 4, d]} p={[w / 2, h, 0]} />
      <Bx s={[w, 4, 4]} p={[0, h, -d / 2]} /><Bx s={[w, 4, 4]} p={[0, h, d / 2]} />
      {([-1, 1] as const).map((a) => ([-1, 1] as const).map((b) => <Bx key={`${a}${b}`} s={[4, h, 4]} p={[(a * w) / 2, h / 2, (b * d) / 2]} />))}
    </group>
  );
};

const levels = (n: number, y0: number, y1: number) => Array.from({ length: n }, (_, i) => y0 + ((y1 - y0) * (i + 0.5)) / n);
const kidneyGeo = (a: number, b: number) => {
  const sh = new THREE.Shape();
  const N = 48;
  for (let i = 0; i < N; i++) {
    const t = (i / N) * PI * 2;
    const x = m(a) * Math.cos(t);
    let z = m(b) * Math.sin(t);
    if (Math.sin(t) < 0) z *= 1 - 0.5 * Math.exp(-Math.pow(Math.cos(t) / 0.45, 2));
    if (i === 0) sh.moveTo(x, z); else sh.lineTo(x, z);
  }
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: m(14), bevelEnabled: false });
  g.rotateX(PI / 2);
  return g;
};
const Kidney = ({ a, b, p, rotY }: { a: number; b: number; p: V3; rotY: number }) => {
  const geo = useMemo(() => kidneyGeo(a, b), [a, b]);
  return <mesh geometry={geo} position={[m(p[0]), m(p[1]), m(p[2])]} rotation={[0, rotY, 0]} castShadow receiveShadow><meshStandardMaterial {...WHITE} /></mesh>;
};

export const hasStock = (items: InjectedHardwareItem[], key: string) => items.some((i) => i.modelType.toLowerCase().includes(key));

/** Subtypes whose static shelf boards are replaced by moving trays / baskets. */
export const SHELF_REPLACED = ['Hinged_Pull_Out_Trays', 'Tall_Pantry_Cargo', 'Tandem_Pantry'];

export function SubtypeInterior3D({ cabinet, th, progress, items }: { cabinet: CabinetObject; th: number; progress: number; items: InjectedHardwareItem[] }) {
  const W = cabinet.width, H = cabinet.height, D = cabinet.depth, inner = W - 2 * th;
  const px = W / 2;
  switch (cabinet.subtype) {
    case 'Hinged_Pull_Out_Trays': {
      const n = Math.max(2, cabinet.zones?.find((z) => z.kind === 'DOORS')?.shelves ?? 2);
      const tr = progress * D * 0.6;
      return <>{Array.from({ length: n }, (_, k) => th + ((H - 2 * th) * (k + 1)) / (n + 1)).map((y) => <Basket key={y} w={inner - 40} d={D - 80} h={60} p={[px, y, -20 + tr]} />)}</>;
    }
    case 'Tall_Pantry_Cargo': {
      const tr = progress * D * 0.5;
      return (
        <group>
          {levels(5, th + 150, H - th - 300).map((y) => <Basket key={y} w={inner - 50} d={D - 120} h={90} p={[px, y, -30 + tr]} />)}
          {([-1, 1] as const).map((k) => <Bx key={k} s={[10, H - 420, 10]} p={[px + k * (inner / 2 - 30), H / 2, D / 2 - 90 + tr]} />)}
        </group>
      );
    }
    case 'Tandem_Pantry': {
      const fw = inner / 2 - 30;
      return (
        <>
          {([-1, 1] as const).map((k) => {
            const tr = progress * D * (k < 0 ? 0.65 : 0.5);
            const cx = px + k * (inner / 4);
            return (
              <group key={k}>
                {levels(4, th + 150, H - th - 300).map((y) => <Basket key={y} w={fw} d={D - 120} h={80} p={[cx, y, -30 + tr]} />)}
                <Bx s={[10, H - 420, 10]} p={[cx - (k * fw) / 2, H / 2, D / 2 - 90 + tr]} /><Bx s={[10, H - 420, 10]} p={[cx + (k * fw) / 2, H / 2, D / 2 - 90 + tr]} />
              </group>
            );
          })}
        </>
      );
    }
    case 'Cargo_Pull_Out': {
      const d = D * 0.78, tr = progress * D * 0.75;
      return (
        <group>
          {levels(4, 150, H * 0.8).map((y) => <Basket key={y} w={inner - 20} d={d} h={80} p={[px, y, D / 2 - 30 - d / 2 + tr]} />)}
          {([-1, 1] as const).map((k) => <Bx key={k} s={[10, H * 0.75, 10]} p={[px + k * (inner / 2 - 10), H * 0.45, D / 2 - 30 + tr]} />)}
        </group>
      );
    }
    case 'Pull_Out_Sink': {
      const L = D - 150, fz = D / 2 - 40, tr = progress * D * 0.6, wt = inner - 40, rw = (wt - 180) / 2, y = th + 70;
      const cz = fz - L / 2 + tr;
      return (
        <group>
          <Bx white s={[wt, 130, 16]} p={[px, y, fz + tr]} />
          {([-1, 1] as const).map((k) => <Bx white key={k} s={[16, 130, L]} p={[px + k * (wt / 2 - 8), y, cz]} />)}
          {([-1, 1] as const).map((k) => <Bx white key={`r${k}`} s={[rw, 130, 16]} p={[px + k * (90 + rw / 2), y, fz - L + tr]} />)}
          <Bx white s={[wt - 20, 4, L - 20]} p={[px, th + 6, cz]} />
          <Cyl r={24} h={300} p={[px, th + 150, -D / 2 + 110]} white />
          <Cyl r={20} h={160} p={[px, th + 250, -D / 2 + 20]} white />
          {hasStock(items, 'sink bottom') && <Bx s={[inner - 8, 3, D - 30]} p={[px, th + 1.5, 0]} />}
        </group>
      );
    }
    case 'Magic_Corner': {
      const bw = inner * 0.46, bd = D * 0.62;
      return (
        <group>
          {levels(2, th + 120, H - th - 220).map((y) => (
            <group key={y}>
              <Basket w={bw} d={bd} h={90} p={[px + inner * 0.24, y, D / 2 - 70 - bd / 2 + progress * D * 0.55]} />
              <Basket w={bw} d={bd} h={90} p={[px - inner * 0.1 - progress * inner * 0.12, y, -D / 2 + 40 + bd / 2 + progress * D * 0.85]} />
            </group>
          ))}
        </group>
      );
    }
    case 'Lazy_Susan': {
      const r = Math.min(inner / 2, D / 2 - 30) * 0.95;
      const ys = [th + 200, Math.min(H - th - 120, th + 520)];
      return (
        <group>
          <Cyl r={20} h={ys[1] - ys[0] + 60} p={[px, (ys[0] + ys[1]) / 2, 0]} />
          {ys.map((y) => (
            <group key={y} position={[m(px), m(y), 0]} rotation={[0, progress * PI * 2, 0]}>
              <Cyl white r={r} h={12} p={[0, 0, 0]} />
              <Cyl white open r={r} h={55} p={[0, 28, 0]} />
              <Bx s={[r * 1.6, 4, 4]} p={[0, 14, 0]} />
            </group>
          ))}
        </group>
      );
    }
    case 'LeMans_Curve': {
      const a = inner * 0.22, b = D * 0.3;
      return (
        <group>
          {levels(2, th + 140, H - th - 260).map((y) => (
            <group key={y}>
              <Kidney a={a} b={b} p={[px + inner * 0.2, y, D / 2 - 90 - b + progress * D * 0.45]} rotY={progress * 0.3} />
              <Kidney a={a} b={b} p={[px - inner * 0.1 - progress * inner * 0.12, y, -D / 2 + 60 + b + progress * D * 0.7]} rotY={-progress * 0.5} />
            </group>
          ))}
        </group>
      );
    }
    default:
      return null;
  }
}

// ------------------------------------------------------------------------------------------ hardware on the facades

/** Cup hinges from the stock item on the back of a swinging door (door-local frame, centred). */
export function Hinges3D({ modelType, wMm, hMm, count, hinge, frontTh }: { modelType: string; wMm: number; hMm: number; count: number; hinge: 'LEFT' | 'RIGHT'; frontTh: number }) {
  const left = hinge === 'LEFT';
  const n = Math.max(2, count);
  const ys = Array.from({ length: n }, (_, i) => -hMm / 2 + 100 + ((hMm - 200) * i) / (n - 1));
  return (
    <>
      {ys.map((y) => (
        <group key={y} position={[m(left ? -wMm / 2 + 22.5 : wMm / 2 - 22.5), m(y), -m(frontTh) / 2 - 0.003]} rotation={[PI / 2, 0, 0]} scale={[left ? -1 : 1, 1, 1]}>
          <HardwareModel3D modelType={modelType} />
        </group>
      ))}
    </>
  );
}

/** Lift arms + motors of an overhead lift (static boxes inside the top corners, arms follow the opening). */
export function LiftArms3D({ cabinet, th, progress }: { cabinet: CabinetObject; th: number; progress: number }) {
  const W = cabinet.width, H = cabinet.height, D = cabinet.depth;
  return (
    <>
      {([-1, 1] as const).map((k) => {
        const x = W / 2 + k * (W / 2 - th - 22);
        return (
          <group key={k}>
            <Bx s={[40, 50, 110]} p={[x, H - th - 25, D / 2 - 130]} />
            <group position={[m(x), m(H - th - 40), m(D / 2 - 90)]} rotation={[-progress * 1.2, 0, 0]}>
              <Bx s={[8, 230, 5]} p={[0, -115, 0]} />
            </group>
          </group>
        );
      })}
    </>
  );
}

// ------------------------------------------------------------------------------------- 45-degree corner carcase

export function DiagonalCorner3D({
  cabinet, th, fTh, progress, sideMaterial, boardMaterial, frontMaterial, showFronts, doorHardware,
}: {
  cabinet: CabinetObject; th: number; fTh: number; progress: number; showFronts: boolean;
  sideMaterial: MatProp; boardMaterial: MatProp; frontMaterial: MatProp;
  doorHardware: (wMm: number, hMm: number, hinge: 'LEFT' | 'RIGHT') => React.ReactNode;
}) {
  const W = cabinet.width, H = cabinet.height, D = cabinet.depth;
  const s = D * 0.3, x0 = W - (D - s);
  // plan polygon (x, z): left side, back, right side, diagonal, flat front
  const P: [number, number][] = [[0, -D / 2], [W, -D / 2], [W, -D / 2 + s], [x0, D / 2], [0, D / 2]];
  const polyGeo = (k: number) => {
    const cx = P.reduce((a, p) => a + p[0], 0) / P.length, cz = P.reduce((a, p) => a + p[1], 0) / P.length;
    const sh = new THREE.Shape(P.map(([x, z]) => new THREE.Vector2(m(cx + (x - cx) * k), m(-(cz + (z - cz) * k)))));
    const g = new THREE.ExtrudeGeometry(sh, { depth: m(th), bevelEnabled: false });
    g.rotateX(-PI / 2);
    return g;
  };
  const bottom = useMemo(() => polyGeo(1), [W, D, th]); // eslint-disable-line react-hooks/exhaustive-deps
  const shelf = useMemo(() => polyGeo(0.93), [W, D, th]); // eslint-disable-line react-hooks/exhaustive-deps
  const edge = (a: [number, number], b: [number, number], key: string, mat: MatProp, thick: number) => {
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz);
    return (
      <mesh key={key} position={[m((a[0] + b[0]) / 2), m(H / 2), m((a[1] + b[1]) / 2)]} rotation={[0, -Math.atan2(dz, dx), 0]} castShadow receiveShadow material={mat}>
        <boxGeometry args={[m(L), m(H), m(thick)]} />
      </mesh>
    );
  };
  const L = Math.hypot(W - x0, D - s), doorH = H - th - 4;
  const n = [Math.SQRT1_2, Math.SQRT1_2]; // outward normal of the diagonal
  const pivot: V3 = [W + n[0] * (fTh / 2), H / 2, -D / 2 + s + n[1] * (fTh / 2)];
  return (
    <group>
      {edge(P[4], P[0], 'l', sideMaterial, th)}
      {edge(P[0], P[1], 'b', sideMaterial, th)}
      {edge(P[1], P[2], 'r', sideMaterial, th)}
      <mesh geometry={bottom} position={[0, 0, 0]} castShadow receiveShadow material={boardMaterial} />
      <mesh geometry={bottom} position={[0, m(H - th), 0]} castShadow receiveShadow material={boardMaterial} />
      <mesh geometry={shelf} position={[0, m(H * 0.5), 0]} castShadow receiveShadow material={boardMaterial} />
      {showFronts && (
        <>
          {edge(P[3], P[4], 'f', frontMaterial, fTh)}
          <group position={[m(pivot[0]), m(pivot[1]), m(pivot[2])]} rotation={[0, PI / 4 + progress * 1.75, 0]}>
            <group position={[-m(L) / 2, 0, 0]}>
              <mesh castShadow receiveShadow material={frontMaterial}><boxGeometry args={[m(L), m(doorH), m(fTh)]} /></mesh>
              {doorHardware(L, doorH, 'RIGHT')}
            </group>
          </group>
        </>
      )}
    </group>
  );
}
