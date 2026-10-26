// src/components/CabinetAssembly3D.tsx
// ONE assembly for base and wall cabinets. It draws exactly the boxes and facades computed by math/assemblyGeometry.ts
// (the same zone layout the BOM and the price use): zones with dividers, appliance niches, apron panels, doors that
// swing / lift / glass, drawers that slide, and one Gola channel per enabled position.
// `explode` (0..1) pulls the parts apart and `showFasteners` shows the cams, dowels, screws, shelf pins, hinges and
// runners (ghosted boards with outlines), both computed by math/fasteners.ts from the same geometry as the BOM.
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Edges } from '@react-three/drei';
import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { TextureEngine } from '../math/textureEngine';
import { facadeMaterialSignature, grainOf, materialKeyOf, parseMaterialKey } from '../math/materialLifecycle';
import { zoneFrontChoicesOf } from '../math/zoneFronts';
import { useDisposeMaterials } from './useDisposeMaterials';
import { ApplianceGeo, AssemblyGeometry, FacadeGeo, applianceKey, assemblyGeometry, facadeKey } from '../math/assemblyGeometry';
import { FastenerKind, buildFasteners, explodeOffsets } from '../math/fasteners';
import { baseOf, bodyView } from '../math/base';
import { isGlassFront, isLiftItem, pickFrontHardware } from '../math/partsEngine';
import { applianceLookOf } from '../math/applianceModels';
import { modelPrims } from '../math/accessoryModels';
import { FINISHES } from '../data/accessoryCatalog';
import { Shapes } from './PrimShapes';
import { DEFAULT_PALETTE } from '../math/palette';

interface CabinetAssembly3DProps {
  cabinet: CabinetObject;
  showFronts: boolean;
  isXRayMode: boolean;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  openProgress: number; // [0 - 1]
  /** Exploded view, 0 (assembled) .. 1 (fully apart). */
  explode?: number;
  /** Draw the connectors and mechanisms (boards become ghosted so they can be seen). */
  showFasteners?: boolean;
  /** Tells the parent which geometry is drawn (the dimension lines and the audit use exactly it). Pass a stable function. */
  onGeometry?: (info: DrawnGeometry) => void;
  /** Fronts the user opened one by one (facadeKey -> open), overruling the master openProgress for those fronts only. */
  frontOpen?: Record<string, boolean>;
  /** Double-click on a front: open it if shut, shut it if open. */
  onToggleFront?: (facadeKey: string) => void;
}

/** What the assembly draws, as the measuring tools need it. */
export interface DrawnGeometry {
  geo: AssemblyGeometry;
  thicknessMm: number;
  frontThicknessMm: number;
  /** Glass doors are drawn as several meshes: the audit leaves the fronts out. */
  glass: boolean;
}

const FASTENER_STYLE: Record<FastenerKind, { color: string; metalness: number; roughness: number }> = {
  DOWEL: { color: '#C9A66B', metalness: 0, roughness: 0.8 },
  CAM_BOLT: { color: '#8C95A3', metalness: 0.9, roughness: 0.35 },
  CAM: { color: '#B8BEC7', metalness: 0.8, roughness: 0.3 },
  BACK_SCREW: { color: '#4B5563', metalness: 0.7, roughness: 0.4 },
  SHELF_PIN: { color: '#C8A24A', metalness: 0.8, roughness: 0.3 },
  HINGE_CUP: { color: '#D1D5DB', metalness: 0.9, roughness: 0.25 },
  HINGE_ARM: { color: '#D1D5DB', metalness: 0.9, roughness: 0.25 },
  HINGE_PLATE: { color: '#D1D5DB', metalness: 0.9, roughness: 0.25 },
  RUNNER: { color: '#9CA3AF', metalness: 0.8, roughness: 0.35 },
  LIFT_KIT: { color: '#6B7280', metalness: 0.7, roughness: 0.4 },
};

const GLASS_FRAME_M = 0.022;
const m = (mm: number) => mm / 1000;

export default function CabinetAssembly3D({ cabinet, showFronts, isXRayMode, woodPanels, hardwareItems, openProgress, explode = 0, showFasteners = false, onGeometry, frontOpen, onToggleFront }: CabinetAssembly3DProps) {
  const carcaseMat = useMemo(() => woodPanels.find((x) => x.id === cabinet.carcaseMaterialId), [woodPanels, cabinet.carcaseMaterialId]);
  const frontMat = useMemo(() => woodPanels.find((x) => x.id === cabinet.frontMaterialId), [woodPanels, cabinet.frontMaterialId]);
  const doorHardware = useMemo(() => pickFrontHardware(cabinet, 'DOORS', hardwareItems), [cabinet, hardwareItems]);

  // The body stands on its base (legs, plinth, wooden frame): the body is drawn `shift` above the floor, the base from the floor up.
  const base = useMemo(() => baseOf(cabinet), [cabinet]);
  const body = useMemo(() => bodyView(cabinet), [cabinet]);
  const shift = base.heightMm / 1000;
  const th = carcaseMat ? carcaseMat.thickness : cabinet.carcaseThickness || 18;
  const fTh = frontMat ? frontMat.thickness : cabinet.frontThickness || 18;
  const lift = isLiftItem(doorHardware);
  const glass = isGlassFront(cabinet, frontMat);
  const inset = !!doorHardware && doorHardware.modelType.includes('Inset Hinge');

  // A zone may have a front sheet of its own: its fronts are as thick as that sheet and look like it (math/zoneFronts.ts).
  const zoneFronts = useMemo(() => zoneFrontChoicesOf(cabinet, woodPanels, fTh), [cabinet, woodPanels, fTh]);
  const zoneFrontTh = useMemo(() => zoneFronts.map((c) => c?.thicknessMm), [zoneFronts]);
  const geo = useMemo(() => assemblyGeometry(cabinet, { carcaseTh: th, frontTh: fTh, zoneFrontTh, lift, inset }), [cabinet, th, fTh, zoneFrontTh, lift, inset]);

  useEffect(() => { onGeometry?.({ geo, thicknessMm: th, frontThicknessMm: fTh, glass }); }, [geo, th, fTh, glass]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ghost = see-through boards with outlines: X-ray, or whenever the fasteners are shown (they sit inside the boards).
  const ghost = isXRayMode || showFasteners;
  const offsets = useMemo(() => explodeOffsets(geo, body, explode), [geo, body, explode]);
  const fasteners = useMemo(() => (showFasteners ? buildFasteners(geo, body, { carcaseTh: th, frontTh: fTh }) : []), [showFasteners, geo, body, th, fTh]);
  const off = (key: string): [number, number, number] => {
    const o = offsets[key] ?? [0, 0, 0];
    return [m(o[0]), m(o[1]), m(o[2])];
  };

  const sideMaterial = useMemo(
    () => TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.depth, body.height, ghost, DEFAULT_PALETTE.carcase.color, 'vertical', undefined, DEFAULT_PALETTE.carcase),
    [carcaseMat, cabinet.depth, body.height, ghost],
  );
  const boardMaterial = useMemo(
    () => TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.width, cabinet.depth, ghost, DEFAULT_PALETTE.carcase.color, 'horizontal', undefined, DEFAULT_PALETTE.carcase),
    [carcaseMat, cabinet.width, cabinet.depth, ghost],
  );
  // One front material per distinct facade size, so the grain / texture scale follows each facade.
  const overridePath = cabinet.frontTextureOverride?.path;
  const overrideFinish = cabinet.frontTextureOverride?.finishType;
  // Keyed by the SIZES the fronts need (not by `geo`, which is a new object after every cabinet edit): a cabinet that only moves,
  // or whose fronts keep their size, keeps its materials instead of uploading new texture clones to the GPU.
  // A facade of a zone with its own sheet gets its own material (the key says which sheet); the showcase texture only dresses the fronts that follow the cabinet.
  const ownSheetOf = (zoneIndex: number): string | undefined => zoneFronts[zoneIndex]?.materialId;
  const frontKeyOf = (f: { zoneIndex: number; kind: string; widthMm: number; heightMm: number }): string => {
    const own = ownSheetOf(f.zoneIndex);
    // The zone's own grain choice (direction and 180° flip) rides in the key; missing = the kind's grain, as before.
    const zone = cabinet.zones?.[f.zoneIndex];
    const key = materialKeyOf(f, zone?.grainDirection ?? grainOf(f.kind), !!zone?.grainFlip);
    return own ? `${key}@@${own}` : key;
  };
  const facadeSig = [...new Set(geo.facades.map(frontKeyOf))].sort().join('|') || facadeMaterialSignature(geo.facades);
  const frontMaterials = useMemo(() => {
    const out: Record<string, ReturnType<typeof TextureEngine.compileProceduralMaterial>> = {};
    (facadeSig ? facadeSig.split('|') : []).forEach((key) => {
      const [sizeKey, ownId] = key.split('@@');
      const { widthMm, heightMm, grain, flip } = parseMaterialKey(sizeKey);
      const sheet = ownId ? woodPanels.find((x) => x.id === ownId) ?? frontMat : frontMat;
      out[key] = TextureEngine.compileProceduralMaterial(sheet, widthMm, heightMm, ghost, DEFAULT_PALETTE.front.color, grain, ownId ? undefined : cabinet.frontTextureOverride, DEFAULT_PALETTE.front, flip);
    });
    return out;
  }, [facadeSig, frontMat, woodPanels, ghost, overridePath, overrideFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  // These materials own GPU memory (one texture clone each) that nothing frees by itself: release the old ones when they are replaced.
  const ownedMaterials = useMemo(() => [sideMaterial, boardMaterial, ...Object.values(frontMaterials)], [sideMaterial, boardMaterial, frontMaterials]);
  useDisposeMaterials(ownedMaterials);

  const W = cabinet.width, D = cabinet.depth;
  // One front at a time: a front the user double-clicked has its own open/shut state and eases to it (~0.35 s); every
  // other front follows the master slider exactly as before. The animated values live in a ref and only re-render
  // this cabinet while something is actually moving.
  const frontTargetOf = (key: string): number => (frontOpen && key in frontOpen ? (frontOpen[key] ? 1 : 0) : openProgress);
  const animRef = useRef<Map<string, number>>(new Map());
  const [, setAnimTick] = useState(0);
  useFrame((_, delta) => {
    let moved = false;
    geo.facades.forEach((f) => {
      const key = facadeKey(f);
      const target = frontTargetOf(key);
      const current = animRef.current.get(key) ?? target;
      if (Math.abs(current - target) > 0.002) {
        const next = current + Math.sign(target - current) * Math.min(Math.abs(target - current), delta / 0.35);
        animRef.current.set(key, next);
        moved = true;
      }
    });
    if (moved) setAnimTick((n) => n + 1);
  });
  const progressOf = (f: FacadeGeo): number => animRef.current.get(facadeKey(f)) ?? frontTargetOf(facadeKey(f));
  const toggleProps = (key: string) => (onToggleFront ? { onDoubleClick: (e: { stopPropagation: () => void }) => { e.stopPropagation(); onToggleFront(key); } } : {});

  const facadeBody = (f: FacadeGeo) => {
    const w = m(f.widthMm), h = m(f.heightMm), t = m(f.thicknessMm ?? fTh);
    const material = frontMaterials[frontKeyOf(f)];
    if (glass && f.kind === 'DOOR') {
      const fr = GLASS_FRAME_M;
      return (
        <group>
          <mesh position={[0, h / 2 - fr / 2, 0]} castShadow material={material}><boxGeometry args={[w, fr, t]} /></mesh>
          <mesh position={[0, -h / 2 + fr / 2, 0]} castShadow material={material}><boxGeometry args={[w, fr, t]} /></mesh>
          <mesh position={[-w / 2 + fr / 2, 0, 0]} castShadow material={material}><boxGeometry args={[fr, Math.max(0.001, h - 2 * fr), t]} /></mesh>
          <mesh position={[w / 2 - fr / 2, 0, 0]} castShadow material={material}><boxGeometry args={[fr, Math.max(0.001, h - 2 * fr), t]} /></mesh>
          <mesh>
            <boxGeometry args={[Math.max(0.001, w - 2 * fr), Math.max(0.001, h - 2 * fr), 0.004]} />
            <meshStandardMaterial color="#BFE3F5" transparent opacity={0.28} roughness={0.05} metalness={0.1} depthWrite={false} />
          </mesh>
        </group>
      );
    }
    return (
      <mesh castShadow material={material} userData={{ partKey: facadeKey(f) }}>
        <boxGeometry args={[w, h, t]} />
        {ghost && <Edges threshold={15} color="#475569" />}
      </mesh>
    );
  };

  const renderFacadeInner = (f: FacadeGeo) => {
    const key = facadeKey(f);
    const w = m(f.widthMm), h = m(f.heightMm);
    const cx = m(f.xMm) + w / 2, cy = m(f.yMm) + h / 2, z = m(f.zMm);
    // This front's own opening: the global slider angle/travel, scaled by its animated progress.
    const pr = progressOf(f);
    const swing = pr * (Math.PI / 2);
    const liftAngle = pr * (Math.PI / 2);
    const drawerTravel = pr * m(D) * 0.75;

    if (f.motion === 'SWING') {
      const left = f.hinge === 'LEFT';
      const pivotX = left ? m(f.xMm) : m(f.xMm) + w;
      // The ROTATION belongs on the pivot group: it used to be on the inner group, so the door spun about its own centre.
      return (
        <group key={key} position={[pivotX, cy, z]} rotation={[0, left ? -swing : swing, 0]} {...toggleProps(key)}>
          <group position={[left ? w / 2 : -w / 2, 0, 0]}>{facadeBody(f)}</group>
        </group>
      );
    }
    if (f.motion === 'LIFT') {
      // Lifting flap: hinged on its top edge, swings up and out.
      return (
        <group key={key} position={[cx, m(f.yMm) + h, z]} rotation={[-liftAngle, 0, 0]} {...toggleProps(key)}>
          <group position={[0, -h / 2, 0]}>{facadeBody(f)}</group>
        </group>
      );
    }
    if (f.motion === 'PULL_OUT' && f.frame) {
      // Basket frame behind the front: two side rails, a back and one tray per level. It travels with the front.
      const [fw, fh, fd] = f.frame.sizeMm.map((v) => m(v));
      const offset: [number, number, number] = [m(f.frame.centerMm[0]) - cx, m(f.frame.centerMm[1]) - cy, m(f.frame.centerMm[2]) - z];
      const bar = 0.008;
      const levels = Math.max(1, f.frame.levels);
      const metal = <meshStandardMaterial color="#9CA3AF" metalness={0.8} roughness={0.35} />;
      return (
        <group key={key} position={[cx, cy, z + drawerTravel]} {...toggleProps(key)}>
          {facadeBody(f)}
          <group position={offset}>
            {[-1, 1].map((side) => (
              <mesh key={side} position={[side * (fw / 2 - bar / 2), 0, 0]} castShadow>
                <boxGeometry args={[bar, fh, fd]} />
                {metal}
              </mesh>
            ))}
            <mesh position={[0, 0, -fd / 2 + bar / 2]} castShadow>
              <boxGeometry args={[fw, fh, bar]} />
              {metal}
            </mesh>
            {Array.from({ length: levels }, (_, i) => (
              <mesh key={i} position={[0, -fh / 2 + (i * fh) / levels + bar / 2, 0]} castShadow>
                <boxGeometry args={[fw - 2 * bar, bar, fd - bar]} />
                {metal}
              </mesh>
            ))}
          </group>
        </group>
      );
    }
    if (f.motion === 'SLIDE') {
      // The real drawer box (the same five boards as the BOM: sides, inner front, back, bottom); it travels with the front.
      return (
        <group key={key} position={[cx, cy, z + drawerTravel]} {...toggleProps(key)}>
          {facadeBody(f)}
          {(f.box ?? []).map((b) => (
            <mesh key={b.key} position={[m(b.centerMm[0]) - cx, m(b.centerMm[1]) - cy, m(b.centerMm[2]) - z]} castShadow receiveShadow material={boardMaterial}>
              <boxGeometry args={[m(b.sizeMm[0]), m(b.sizeMm[1]), m(b.sizeMm[2])]} />
            </mesh>
          ))}
        </group>
      );
    }
    return (
      <group key={key} position={[cx, cy, z]}>
        {facadeBody(f)}
      </group>
    );
  };

  const renderFacade = (f: FacadeGeo) => (
    <group key={facadeKey(f)} position={off(facadeKey(f))}>
      {renderFacadeInner(f)}
    </group>
  );

  const renderAppliance = (a: ApplianceGeo) => {
    const [aw, ah, ad] = [m(a.sizeMm[0]), m(a.sizeMm[1]), m(a.sizeMm[2])];
    // A washer, a dryer, a dishwasher or a fridge standing in an open bay with nothing in front of it: it is drawn with the shapes of the
    // accessories library (round glass door, controls, handles) stretched to its niche, not as a grey box.
    const look = a.frontVisible ? applianceLookOf(a.appliance, a.libraryId) : undefined;
    if (look) {
      const prims = modelPrims(look.model, a.sizeMm[0], a.sizeMm[1], a.sizeMm[2], look.opts, FINISHES[look.finish]);
      const o = off(applianceKey(a.zoneIndex));
      return (
        <group key={applianceKey(a.zoneIndex)} position={[m(a.centerMm[0]) + o[0], m(a.centerMm[1]) + o[1], m(a.centerMm[2]) + o[2]]}>
          <group position={[0, -ah / 2, 0]} userData={{ partKey: applianceKey(a.zoneIndex) }}>
            <Shapes prims={prims} xray={ghost} />
          </group>
        </group>
      );
    }
    const body = a.appliance === 'DISHWASHER' || a.appliance === 'FRIDGE' ? '#CBD5E1' : '#2B2F36';
    // The trim (front frame) stands OVER the cabinet edges in front of the carcase; the glass and the handle sit on its face.
    const trim = a.trim;
    const [fw, fh] = trim ? [m(trim.sizeMm[0]), m(trim.sizeMm[1])] : [aw, ah];
    const fy = trim ? m(trim.centerMm[1] - a.centerMm[1]) : 0;
    // In a split zone the frame is held inside its column strip, so it is not centred on the appliance: it sits where the model puts it.
    const fx = trim ? m(trim.centerMm[0] - a.centerMm[0]) : 0;
    const frontZ = (trim ? m(trim.centerMm[2] - a.centerMm[2]) + m(trim.sizeMm[2]) / 2 : ad / 2) + 0.0006;
    return (
      <group key={applianceKey(a.zoneIndex)} position={[m(a.centerMm[0]) + off(applianceKey(a.zoneIndex))[0], m(a.centerMm[1]) + off(applianceKey(a.zoneIndex))[1], m(a.centerMm[2]) + off(applianceKey(a.zoneIndex))[2]]}>
        <mesh castShadow receiveShadow userData={{ partKey: applianceKey(a.zoneIndex) }}>
          <boxGeometry args={[aw, ah, ad]} />
          <meshStandardMaterial color={body} roughness={0.35} metalness={0.4} transparent={ghost} opacity={ghost ? 0.5 : 1} />
        </mesh>
        {trim && (
          <mesh position={[fx, fy, m(trim.centerMm[2] - a.centerMm[2])]} castShadow receiveShadow userData={{ partKey: `${applianceKey(a.zoneIndex)}-trim` }}>
            <boxGeometry args={[fw, fh, m(trim.sizeMm[2])]} />
            <meshStandardMaterial color="#3A3F47" roughness={0.3} metalness={0.6} transparent={ghost} opacity={ghost ? 0.5 : 1} />
            {ghost && <Edges threshold={15} color="#475569" />}
          </mesh>
        )}
        {(a.appliance === 'OVEN' || a.appliance === 'MICROWAVE' || a.appliance === 'COFFEE') && (
          <>
            <mesh position={[fx + (a.appliance === 'MICROWAVE' ? -fw * 0.12 : 0), fy + (a.appliance === 'OVEN' ? -fh * 0.06 : 0), frontZ]}>
              <boxGeometry args={[fw * (a.appliance === 'MICROWAVE' ? 0.62 : 0.74), fh * (a.appliance === 'OVEN' ? 0.5 : 0.66), 0.002]} />
              <meshStandardMaterial color="#0B1220" roughness={0.1} metalness={0.2} />
            </mesh>
            {a.appliance === 'MICROWAVE' && (
              <mesh position={[fx + fw * 0.34, fy, frontZ]}>
                <boxGeometry args={[fw * 0.18, fh * 0.66, 0.002]} />
                <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.3} />
              </mesh>
            )}
            {a.appliance === 'OVEN' && (
              <mesh position={[fx, fy + fh * 0.36, frontZ + 0.007]}>
                <boxGeometry args={[fw * 0.8, 0.01, 0.014]} />
                <meshStandardMaterial color="#9CA3AF" roughness={0.3} metalness={0.8} />
              </mesh>
            )}
          </>
        )}
      </group>
    );
  };

  return (
    <group>
      <group position={[0, shift, 0]}>
      {geo.boxes.map((b) => {
        const o = off(b.key);
        const position: [number, number, number] = [m(b.centerMm[0]) + o[0], m(b.centerMm[1]) + o[1], m(b.centerMm[2]) + o[2]];
        const size: [number, number, number] = [m(b.sizeMm[0]), m(b.sizeMm[1]), m(b.sizeMm[2])];
        if (b.kind === 'back') {
          return (
            <mesh key={b.key} position={position} receiveShadow userData={{ partKey: b.key }}>
              <boxGeometry args={size} />
              <meshStandardMaterial color="#D1D5DB" transparent={ghost} opacity={ghost ? 0.3 : 1.0} />
              {ghost && <Edges threshold={15} color="#475569" />}
            </mesh>
          );
        }
        return (
          <mesh key={b.key} position={position} castShadow receiveShadow material={b.kind === 'side' ? sideMaterial : boardMaterial} userData={{ partKey: b.key }}>
            <boxGeometry args={size} />
            {ghost && <Edges threshold={15} color="#475569" />}
          </mesh>
        );
      })}

      {geo.appliances.map(renderAppliance)}

      {showFronts && geo.facades.map(renderFacade)}

      {showFronts && geo.channels.map((c) => (
        <mesh key={`gola-${c.zoneIndex}-${c.slot}`} position={[m(W) / 2, m(c.yMm + c.heightMm / 2), m(D) / 2 + 0.002]}>
          <boxGeometry args={[m(W - 4), m(c.heightMm) * 0.55, 0.012]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}

      {fasteners.map((f, i) => {
        const o = off(f.parent);
        const position: [number, number, number] = [m(f.centerMm[0]) + o[0], m(f.centerMm[1]) + o[1], m(f.centerMm[2]) + o[2]];
        const st = FASTENER_STYLE[f.kind];
        if (f.shape === 'cyl') {
          const rotation: [number, number, number] = f.axis === 'x' ? [0, 0, Math.PI / 2] : f.axis === 'z' ? [Math.PI / 2, 0, 0] : [0, 0, 0];
          return (
            <mesh key={`fastener-${i}`} position={position} rotation={rotation}>
              <cylinderGeometry args={[m(f.sizeMm[0] / 2), m(f.sizeMm[0] / 2), m(f.sizeMm[1]), 14]} />
              <meshStandardMaterial color={st.color} metalness={st.metalness} roughness={st.roughness} />
            </mesh>
          );
        }
        return (
          <mesh key={`fastener-${i}`} position={position}>
            <boxGeometry args={[m(f.sizeMm[0]), m(f.sizeMm[1]), m(f.sizeMm[2])]} />
            <meshStandardMaterial color={st.color} metalness={st.metalness} roughness={st.roughness} />
          </mesh>
        );
      })}
      </group>

      {/* The base, from the floor up: legs, the plinth board, or the boards of the wooden frame (math/base.ts) */}
      {geo.base.map((b) => {
        const position: [number, number, number] = [m(b.centerMm[0]), m(b.centerMm[1]), m(b.centerMm[2])];
        const size: [number, number, number] = [m(b.sizeMm[0]), m(b.sizeMm[1]), m(b.sizeMm[2])];
        if (b.kind === 'leg') {
          return (
            <mesh key={b.key} position={position} castShadow userData={{ partKey: b.key }}>
              <cylinderGeometry args={[size[0] / 2, size[0] / 2, size[1], 18]} />
              <meshStandardMaterial color="#9CA3AF" metalness={0.65} roughness={0.35} transparent={ghost} opacity={ghost ? 0.4 : 1.0} />
            </mesh>
          );
        }
        const pvc = b.kind === 'plinth' && base.plinthMaterial === 'PVC';
        return (
          <mesh key={b.key} position={position} castShadow receiveShadow material={pvc ? undefined : boardMaterial} userData={{ partKey: b.key }}>
            <boxGeometry args={size} />
            {pvc && <meshStandardMaterial color="#374151" roughness={0.6} transparent={ghost} opacity={ghost ? 0.4 : 1.0} />}
            {ghost && <Edges threshold={15} color="#475569" />}
          </mesh>
        );
      })}
    </group>
  );
}
