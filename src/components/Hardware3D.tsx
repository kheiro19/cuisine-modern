// src/components/Hardware3D.tsx
// Procedural 3D models of the hardware catalogue (same React Three Fiber stack as the cabinets).
// Every model is authored in MILLIMETRES and scaled by 0.001 so it sits in the scene at real size.
// <HardwareModel3D modelType="Straight Hinge (Overlay)" /> can be dropped in any <Canvas>;
// <HardwareViewer3D modelType=... /> is a ready-made rotating preview.
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { Bounds, OrbitControls } from '@react-three/drei';

type V3 = [number, number, number];
type Col = 'steel' | 'accent' | 'dark' | 'wood' | 'white' | 'rubber';
const COL: Record<Col, { color: string; metalness: number; roughness: number }> = {
  steel: { color: '#B8C0C8', metalness: 0.85, roughness: 0.32 },
  accent: { color: '#E07A1F', metalness: 0.3, roughness: 0.5 },
  dark: { color: '#374151', metalness: 0.6, roughness: 0.4 },
  wood: { color: '#D6B98C', metalness: 0.02, roughness: 0.8 },
  white: { color: '#F1F5F9', metalness: 0.05, roughness: 0.6 },
  rubber: { color: '#1F2937', metalness: 0.0, roughness: 0.95 },
};
const Mat = ({ c }: { c: Col }) => <meshStandardMaterial {...COL[c]} />;

const B = ({ s, p = [0, 0, 0], r = [0, 0, 0], c = 'steel' }: { s: V3; p?: V3; r?: V3; c?: Col }) => (
  <mesh position={p} rotation={r} castShadow receiveShadow><boxGeometry args={s} /><Mat c={c} /></mesh>
);
const Cy = ({ r, h, p = [0, 0, 0], rot = [0, 0, 0], c = 'steel' }: { r: number; h: number; p?: V3; rot?: V3; c?: Col }) => (
  <mesh position={p} rotation={rot} castShadow receiveShadow><cylinderGeometry args={[r, r, h, 28]} /><Mat c={c} /></mesh>
);
const Sp = ({ r, p, c = 'accent' }: { r: number; p: V3; c?: Col }) => (
  <mesh position={p} castShadow><sphereGeometry args={[r, 14, 14]} /><Mat c={c} /></mesh>
);
/** 2D outline (mm) extruded along z, centred. */
const Prof = ({ pts, len, p = [0, 0, 0], rot = [0, 0, 0], c = 'steel' }: { pts: [number, number][]; len: number; p?: V3; rot?: V3; c?: Col }) => {
  const geo = useMemo(() => {
    const g = new THREE.ExtrudeGeometry(new THREE.Shape(pts.map(([x, y]) => new THREE.Vector2(x, y))), { depth: len, bevelEnabled: false });
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    g.translate(-(bb.min.x + bb.max.x) / 2, -(bb.min.y + bb.max.y) / 2, -len / 2);
    return g;
  }, [pts, len]);
  return <mesh geometry={geo} position={p} rotation={rot} castShadow receiveShadow><Mat c={c} /></mesh>;
};
const PI = Math.PI;

// ---------- 1. Hinges (cup axis = y, arm along +x) ----------
const Hinge = ({ crank = 0, angle = 0, thick = false, pie = false, plateRot = 0 }: { crank?: number; angle?: number; thick?: boolean; pie?: boolean; plateRot?: number }) => {
  const one = (z: number, rotY: number) => (
    <group position={[0, 0, z]} rotation={[0, rotY, 0]}>
      <Cy r={thick ? 20 : 17.5} h={thick ? 16 : 11.5} />
      <Cy r={6} h={thick ? 18 : 13.5} p={[0, 1, 0]} c="accent" />
      {thick && <Cy r={23} h={4} p={[0, -9, 0]} c="dark" />}
      <B s={[30, 4, 18]} p={[25, 7, 0]} />
      <B s={[30, 4, 18]} p={[52, 7 - crank, 0]} />
      {crank > 0 && <B s={[4, crank + 4, 18]} p={[40, 7 - crank / 2, 0]} />}
      <group position={[78, 3 - crank, 0]} rotation={[0, plateRot, 0]}>
        <B s={[24, 3, 42]} c="dark" />
        <Cy r={3} h={4} p={[0, 2, 14]} c="accent" /><Cy r={3} h={4} p={[0, 2, -14]} c="accent" />
      </group>
    </group>
  );
  return pie ? <group>{one(32, 0.35)}{one(-32, -0.35)}</group> : <group rotation={[0, angle, 0]}>{one(0, 0)}</group>;
};

// ---------- 2. Drawer systems (front toward +z) ----------
const Drawer = ({ kind }: { kind: 'wall' | 'under' | 'underPartial' | 'ball' | 'roller' | 'push' }) => {
  const sx = kind === 'wall' ? 206 : 208;
  const sides = ([-1, 1] as const).map((k) => (
    kind === 'wall' ? (
      <group key={k}>
        <B s={[12, 90, 450]} p={[k * sx, 45, 0]} />
        <B s={[3, 90, 450]} p={[k * (sx - 14), 45, 0]} />
        <Cy r={4} h={450} p={[k * (sx - 7), 88, 0]} rot={[PI / 2, 0, 0]} c="accent" />
      </group>
    ) : <B key={k} s={[16, 80, 450]} p={[k * sx, 40, 0]} c="wood" />
  ));
  const rails = ([-1, 1] as const).map((k) => {
    if (kind === 'under') return <B key={k} s={[10, 12, 430]} p={[k * 185, -10, 0]} c="accent" />;
    if (kind === 'underPartial') return <group key={k}><B s={[10, 12, 300]} p={[k * 185, -10, -60]} c="accent" /><B s={[12, 14, 14]} p={[k * 185, -10, 100]} c="dark" /></group>;
    if (kind === 'ball') return (
      <group key={k}>
        <B s={[8, 36, 430]} p={[k * 224, 40, 0]} />
        {[-180, -120, -60, 0, 60, 120, 180].map((z) => <Sp key={z} r={4.5} p={[k * 219, 40, z]} />)}
      </group>
    );
    if (kind === 'roller') return (
      <group key={k}>
        <B s={[8, 30, 430]} p={[k * 224, 25, 0]} />
        {[-170, 170].map((z) => <Cy key={z} r={11} h={6} p={[k * 217, 25, z]} rot={[0, 0, PI / 2]} c="accent" />)}
      </group>
    );
    return (
      <group key={k}>
        <B s={[10, 12, 430]} p={[k * 185, -10, 0]} c="dark" />
        {[0, 1, 2, 3, 4, 5].map((i) => <Cy key={i} r={9} h={3} p={[k * 185, -10, -230 + i * 7]} rot={[PI / 2, 0, 0]} c="accent" />)}
      </group>
    );
  });
  return (
    <group>
      <B s={[404, 8, 450]} c="wood" />
      <B s={[404, 90, 18]} p={[0, 45, 234]} c="white" />
      <B s={[404, 70, 12]} p={[0, 35, -225]} c="wood" />
      {sides}{rails}
    </group>
  );
};

// ---------- 3. Lift systems (cabinet 600 x 400 x 300, open front toward +z) ----------
const LiftFrame = () => (
  <group>
    <B s={[18, 400, 300]} p={[-291, 0, 0]} c="wood" /><B s={[18, 400, 300]} p={[291, 0, 0]} c="wood" />
    <B s={[564, 18, 300]} p={[0, 191, 0]} c="wood" /><B s={[564, 18, 300]} p={[0, -191, 0]} c="wood" />
  </group>
);
const Arm = ({ len = 160 }: { len?: number }) => (
  <>{([-1, 1] as const).map((k) => <B key={k} s={[8, len, 6]} p={[k * 262, -len / 2, 0]} />)}</>
);
const Motors = () => (
  <>{([-1, 1] as const).map((k) => <B key={k} s={[50, 50, 60]} p={[k * 258, 150, 110]} c="accent" />)}</>
);
const Lift = ({ kind }: { kind: 'hf' | 'hs' | 'hl' | 'hk' }) => (
  <group>
    <LiftFrame /><Motors />
    {kind === 'hf' && (
      <group position={[0, 200, 150]} rotation={[-1.25, 0, 0]}>
        <B s={[564, 150, 18]} p={[0, -75, 0]} c="white" /><Arm len={150} />
        <group position={[0, -150, 0]} rotation={[2.2, 0, 0]}><B s={[564, 150, 18]} p={[0, -75, 0]} c="white" /></group>
      </group>
    )}
    {kind === 'hs' && (
      <group position={[0, 175, 40]} rotation={[-PI / 2, 0, 0]}><B s={[564, 300, 18]} c="white" /></group>
    )}
    {kind === 'hl' && (
      <group position={[0, 200, 150]} rotation={[-1.45, 0, 0]}><B s={[564, 300, 18]} p={[0, -150, 0]} c="white" /><Arm /></group>
    )}
    {kind === 'hk' && (
      <group position={[0, 200, 150]} rotation={[-1.1, 0, 0]}><B s={[564, 300, 18]} p={[0, -150, 0]} c="white" /><Arm len={200} /></group>
    )}
  </group>
);
const GasStrut = () => (
  <group rotation={[0, 0, PI / 2]}>
    <Cy r={9} h={140} p={[0, -35, 0]} c="dark" /><Cy r={4} h={110} p={[0, 90, 0]} />
    <Sp r={8} p={[0, -105, 0]} /><Sp r={8} p={[0, 145, 0]} />
  </group>
);
const StayHinge = () => (
  <group>
    <B s={[40, 6, 120]} p={[0, 0, 0]} c="dark" />
    <B s={[6, 140, 22]} p={[20, 70, 20]} r={[0, 0, -0.35]} /><B s={[6, 120, 22]} p={[-10, 60, -10]} r={[0, 0, 0.4]} />
    <Cy r={9} h={30} p={[0, 4, 40]} rot={[0, 0, PI / 2]} c="accent" />
  </group>
);

// ---------- 4. Gola & handles ----------
const L_PTS: [number, number][] = [[0, 0], [45, 0], [45, 4], [4, 4], [4, 50], [0, 50]];
const C_PTS: [number, number][] = [[0, 0], [30, 0], [30, 4], [4, 4], [4, 26], [30, 26], [30, 30], [0, 30]];
const U_PTS: [number, number][] = [[0, 0], [24, 0], [24, 26], [20, 26], [20, 4], [4, 4], [4, 26], [0, 26]];

// ---------- 5. Fixings ----------
const Leg = () => (
  <group>
    <Cy r={30} h={6} p={[0, 3, 0]} c="rubber" /><Cy r={7} h={110} p={[0, 61, 0]} />
    {[30, 45, 60, 75, 90].map((y) => <Cy key={y} r={8} h={1.5} p={[0, y, 0]} c="dark" />)}
    <B s={[60, 3, 60]} p={[0, 118, 0]} c="dark" /><Cy r={9} h={8} p={[0, 112, 0]} c="accent" />
  </group>
);
const Hanger = () => (
  <group>
    <B s={[140, 3, 50]} c="steel" />
    <B s={[40, 22, 3]} p={[0, 12, -24]} c="steel" />
    <B s={[90, 8, 22]} p={[0, 6, 4]} c="dark" />
    <Cy r={8} h={6} p={[-50, 5, 0]} c="accent" /><Cy r={8} h={6} p={[50, 5, 0]} c="accent" />
  </group>
);
const Screw = () => (
  <group rotation={[0, 0, PI / 2]}>
    <Cy r={8} h={3} p={[0, 26, 0]} /><Cy r={5} h={10} p={[0, 20, 0]} c="dark" />
    <Cy r={2.6} h={40} p={[0, -5, 0]} />
    {Array.from({ length: 9 }).map((_, i) => <Cy key={i} r={3.8} h={1.4} p={[0, 12 - i * 4.5, 0]} />)}
  </group>
);

type ModelDef = { match: string[]; node: React.ReactNode };
const MODELS: ModelDef[] = [
  { match: ['straight hinge'], node: <Hinge /> },
  { match: ['half-crank'], node: <Hinge crank={9.5} /> },
  { match: ['inset hinge'], node: <Hinge crank={18} /> },
  { match: ['blind corner'], node: <Hinge angle={0.5} /> },
  { match: ['45-degree'], node: <Hinge plateRot={PI / 4} /> },
  { match: ['pie-corner'], node: <Hinge pie /> },
  { match: ['thick door'], node: <Hinge thick /> },
  { match: ['double-wall'], node: <Drawer kind="wall" /> },
  { match: ['partial extension'], node: <Drawer kind="underPartial" /> },
  { match: ['under-mount', 'undermount'], node: <Drawer kind="under" /> },
  { match: ['ball bearing'], node: <Drawer kind="ball" /> },
  { match: ['roller slide'], node: <Drawer kind="roller" /> },
  { match: ['push-to-open', 'push-open'], node: <Drawer kind="push" /> },
  { match: ['aventos hf', 'bi-fold'], node: <Lift kind="hf" /> },
  { match: ['aventos hs', 'up & over'], node: <Lift kind="hs" /> },
  { match: ['aventos hl', 'lift up'], node: <Lift kind="hl" /> },
  { match: ['aventos hk', 'stay lift'], node: <Lift kind="hk" /> },
  { match: ['gas strut'], node: <GasStrut /> },
  { match: ['friction hinge', 'mechanical stay'], node: <StayHinge /> },
  { match: ['l-profile'], node: <Prof pts={L_PTS} len={600} /> },
  { match: ['c-profile'], node: <Prof pts={C_PTS} len={600} /> },
  { match: ['vertical gola single'], node: <Prof pts={L_PTS} len={720} rot={[PI / 2, 0, 0]} /> },
  { match: ['vertical gola double'], node: <group rotation={[PI / 2, 0, 0]}><Prof pts={L_PTS} len={720} p={[-22, 0, 0]} /><Prof pts={L_PTS} len={720} p={[22, 0, 0]} rot={[0, PI, 0]} /></group> },
  { match: ['inset handle'], node: <Prof pts={U_PTS} len={600} c="steel" /> },
  { match: ['drilling handle', 'handle'], node: (
    <group>
      <Cy r={6} h={160} p={[0, 30, 0]} rot={[0, 0, PI / 2]} />
      {[-64, 64].map((x) => <Cy key={x} r={4} h={30} p={[x, 15, 0]} />)}
      {[-64, 64].map((x) => <Cy key={`b${x}`} r={7} h={3} p={[x, 0, 0]} c="dark" />)}
    </group>
  ) },
  { match: ['adjustable kitchen legs'], node: <Leg /> },
  { match: ['hanger'], node: <Hanger /> },
  { match: ['confirmat'], node: <Screw /> },
  { match: ['plinth'], node: <group><B s={[600, 100, 16]} c="white" /><B s={[600, 8, 18]} p={[0, -54, 0]} c="rubber" /></group> },
  { match: ['corner filler'], node: <Prof pts={[[0, 0], [50, 0], [50, 4], [4, 4], [4, 50], [0, 50]]} len={400} c="white" /> },
  { match: ['sink bottom', 'sink protector'], node: (
    <group>
      <B s={[560, 3, 460]} />
      <B s={[560, 14, 3]} p={[0, 8, 228]} /><B s={[560, 14, 3]} p={[0, 8, -228]} />
      <B s={[3, 14, 460]} p={[278, 8, 0]} /><B s={[3, 14, 460]} p={[-278, 8, 0]} />
    </group>
  ) },
];

export function findHardwareModel(modelType: string): React.ReactNode | null {
  const t = modelType.toLowerCase();
  return MODELS.find((m) => m.match.some((k) => t.includes(k)))?.node ?? null;
}

/** Real-size (metres) model, usable inside any <Canvas>. */
export function HardwareModel3D({ modelType }: { modelType: string }) {
  const node = findHardwareModel(modelType);
  return node ? <group scale={0.001}>{node}</group> : null;
}

/** Self-contained rotating preview (own Canvas, auto-fitted to the model). */
export default function HardwareViewer3D({ modelType, height = 200 }: { modelType: string; height?: number }) {
  const known = findHardwareModel(modelType) !== null;
  return (
    <div className="w-full rounded-lg bg-gradient-to-b from-slate-100 to-slate-200 border border-slate-200 relative overflow-hidden" style={{ height }}>
      {known ? (
        <Canvas shadows camera={{ position: [0.5, 0.4, 0.7], fov: 35, near: 0.005, far: 50 }} gl={{ antialias: true }}>
          <ambientLight intensity={0.8} />
          <directionalLight position={[2, 4, 3]} intensity={1} castShadow />
          <directionalLight position={[-3, 1, -2]} intensity={0.4} />
          <Bounds fit clip observe margin={1.35}>
            <HardwareModel3D modelType={modelType} />
          </Bounds>
          <OrbitControls makeDefault autoRotate autoRotateSpeed={2.5} enablePan={false} />
        </Canvas>
      ) : (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-slate-400">لا يوجد نموذج 3D لهذا النظام</div>
      )}
      <span className="absolute bottom-1 left-2 text-[9px] font-mono text-slate-500 pointer-events-none">{modelType}</span>
    </div>
  );
}

// ---------- Visible gallery: one tab per category, one 3D card per system ----------
const GALLERY: { category: string; label: string; models: string[] }[] = [
  { category: 'Cabinet Hinges', label: '1. مفصلات', models: ['Straight Hinge (Overlay)', 'Half-Crank Hinge (Half-Overlay)', 'Inset Hinge (Cranked)', 'Blind Corner Hinge', '45-Degree Corner Hinge', 'Pie-Corner Hinge (Corner Fold)', 'Thick Door Hinge'] },
  { category: 'Drawer Slide Systems', label: '2. سكك الأدراج', models: ['Double-Wall Metal Box System', 'Hidden Under-mount Runner (Full Extension)', 'Hidden Under-mount Runner (Partial Extension)', 'Standard Ball Bearing Slide', 'Standard Roller Slide', 'Push-to-Open Heavy Duty Slides'] },
  { category: 'Overhead Lift Systems', label: '3. أنظمة الرفع', models: ['Bi-fold Lift System (Aventos HF)', 'Up & Over Lift System (Aventos HS)', 'Lift Up System (Aventos HL)', 'Stay Lift System (Aventos HK / HK-top)', 'Standard Gas Strut System', 'Mechanical Stay Friction Hinge'] },
  { category: 'Gola & Handle Profiles', label: '4. غولا ومقابض', models: ['Horizontal Gola L-Profile (J-Profile)', 'Horizontal Gola C-Profile (Mid-Profile)', 'Vertical Gola Single Profile', 'Vertical Gola Double Profile', 'Aluminum Inset Handle Profile', 'Standard Drilling Handle'] },
  { category: 'Assembly & Fixing', label: '5. التركيب والبراغي', models: ['Adjustable Kitchen Legs (100mm - 150mm)', 'Cabinet Hanger Plates (Heavy Duty)', 'Confirmated Assembly Screws (5x50mm)', 'PVC Plinth Base Board (With Rubber)', 'Corner Filler Profiles', 'Aluminum Sink Bottom Protector'] },
];

/** Image library of all hardware systems. Only the active tab mounts its Canvases (max 7 WebGL contexts at a time). */
export function HardwareGallery3D({ onSelect }: { onSelect?: (category: string, modelType: string) => void }) {
  const [tab, setTab] = React.useState(0);
  const g = GALLERY[tab];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1">
        {GALLERY.map((x, i) => (
          <button key={x.category} type="button" onClick={() => setTab(i)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-bold border ${i === tab ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-200'}`}>
            {x.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        {g.models.map((m) => (
          <button key={m} type="button" onClick={() => onSelect?.(g.category, m)} className="text-left">
            <HardwareViewer3D modelType={m} height={150} />
          </button>
        ))}
      </div>
    </div>
  );
}

/** Runner pair for ONE drawer, driven by the stock item's modelType. Local frame: x across, y up, z = drawer depth (front at +z/2). Units: mm (wrapped to metres). */
export function Runner3D({ modelType, lenMm, halfWidthMm, boxHeightMm }: { modelType: string; lenMm: number; halfWidthMm: number; boxHeightMm: number }) {
  const t = modelType.toLowerCase();
  const yb = -boxHeightMm / 2;
  return (
    <group scale={0.001}>
      {([-1, 1] as const).map((k) => {
        const x = k * halfWidthMm;
        if (t.includes('double-wall')) return (<group key={k}><B s={[3, boxHeightMm + 40, lenMm]} p={[x, 20, 0]} /><Cy r={4} h={lenMm} p={[x, boxHeightMm / 2 + 36, 0]} rot={[PI / 2, 0, 0]} c="accent" /></group>);
        if (t.includes('ball')) return (<group key={k}><B s={[5, 30, lenMm]} p={[x, yb + 20, 0]} />{[-0.4, -0.2, 0, 0.2, 0.4].map((f) => <Sp key={f} r={4} p={[x + k * 3, yb + 20, f * lenMm]} c="steel" />)}</group>);
        if (t.includes('roller')) return (<group key={k}><B s={[5, 26, lenMm]} p={[x, yb + 18, 0]} />{[-0.42, 0.42].map((f) => <Cy key={f} r={10} h={5} p={[x + k * 4, yb + 18, f * lenMm]} rot={[0, 0, PI / 2]} c="accent" />)}</group>);
        if (t.includes('push')) return (<group key={k}><B s={[8, 10, lenMm]} p={[x, yb - 4, 0]} c="dark" /><Cy r={7} h={26} p={[x, yb - 4, lenMm / 2 - 12]} rot={[PI / 2, 0, 0]} c="accent" /></group>);
        return <B key={k} s={[8, 10, lenMm]} p={[x, yb - 4, 0]} c="accent" />; // hidden under-mount (full / partial)
      })}
    </group>
  );
}

/** Handle for a facade, driven by the stock item's modelType. Mount it on the facade's FRONT face (z+ = outwards). Units: mm (wrapped to metres). */
export function Handle3D({ modelType, wMm, hMm, vertical, top, edgeX }: { modelType: string; wMm: number; hMm: number; vertical: boolean; top: boolean; edgeX: number }) {
  if (modelType.toLowerCase().includes('inset')) {
    const y = top ? hMm / 2 - 7 : -hMm / 2 + 7;
    return (
      <group scale={0.001}>
        <B s={[Math.max(10, wMm - 4), 14, 16]} p={[0, y, 6]} />
        <B s={[Math.max(10, wMm - 4), 3, 17]} p={[0, y + (top ? -6 : 6), 6]} c="accent" />
      </group>
    );
  }
  const y = vertical ? (top ? hMm / 2 - 110 : -hMm / 2 + 110) : hMm / 2 - 45;
  return (
    <group scale={0.001} position={[0, 0, 0]}>
      <group position={[vertical ? edgeX : 0, y, 0]} rotation={[0, 0, vertical ? PI / 2 : 0]}>
        <B s={[160, 10, 10]} p={[0, 0, 30]} />
        <B s={[8, 8, 30]} p={[-64, 0, 15]} /><B s={[8, 8, 30]} p={[64, 0, 15]} />
      </group>
    </group>
  );
}
