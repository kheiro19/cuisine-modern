// src/components/CabinetAssembly3D.tsx
// ONE assembly for base and wall cabinets. It draws exactly the boxes and facades computed by math/assemblyGeometry.ts
// (the same zone layout the BOM and the price use): zones with dividers, appliance niches, apron panels, doors that
// swing / lift / glass, drawers that slide, and one Gola channel per enabled position.
import React, { useMemo } from 'react';
import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { TextureEngine } from '../math/textureEngine';
import { ApplianceGeo, FacadeGeo, assemblyGeometry } from '../math/assemblyGeometry';
import { isGlassFront, isLiftItem, pickFrontHardware } from '../math/partsEngine';

interface CabinetAssembly3DProps {
  cabinet: CabinetObject;
  showFronts: boolean;
  isXRayMode: boolean;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  openProgress: number; // [0 - 1]
}

const GLASS_FRAME_M = 0.022;
const m = (mm: number) => mm / 1000;

export default function CabinetAssembly3D({ cabinet, showFronts, isXRayMode, woodPanels, hardwareItems, openProgress }: CabinetAssembly3DProps) {
  const carcaseMat = useMemo(() => woodPanels.find((x) => x.id === cabinet.carcaseMaterialId), [woodPanels, cabinet.carcaseMaterialId]);
  const frontMat = useMemo(() => woodPanels.find((x) => x.id === cabinet.frontMaterialId), [woodPanels, cabinet.frontMaterialId]);
  const doorHardware = useMemo(() => pickFrontHardware(cabinet, 'DOORS', hardwareItems), [cabinet, hardwareItems]);

  const th = carcaseMat ? carcaseMat.thickness : cabinet.carcaseThickness || 18;
  const fTh = frontMat ? frontMat.thickness : cabinet.frontThickness || 18;
  const lift = isLiftItem(doorHardware);
  const glass = isGlassFront(cabinet, frontMat);
  const inset = !!doorHardware && doorHardware.modelType.includes('Inset Hinge');

  const geo = useMemo(() => assemblyGeometry(cabinet, { carcaseTh: th, frontTh: fTh, lift, inset }), [cabinet, th, fTh, lift, inset]);

  const sideMaterial = useMemo(
    () => TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.depth, cabinet.height, isXRayMode, '#E2E8F0', 'vertical'),
    [carcaseMat, cabinet.depth, cabinet.height, isXRayMode],
  );
  const boardMaterial = useMemo(
    () => TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.width, cabinet.depth, isXRayMode, '#E2E8F0', 'horizontal'),
    [carcaseMat, cabinet.width, cabinet.depth, isXRayMode],
  );
  // One front material per distinct facade size, so the grain / texture scale follows each facade.
  const overridePath = cabinet.frontTextureOverride?.path;
  const overrideFinish = cabinet.frontTextureOverride?.finishType;
  const frontMaterials = useMemo(() => {
    const out: Record<string, ReturnType<typeof TextureEngine.compileProceduralMaterial>> = {};
    geo.facades.forEach((f) => {
      const grain = f.kind === 'DRAWER' || f.kind === 'APRON' ? 'horizontal' : 'vertical';
      const key = `${f.widthMm}x${f.heightMm}x${grain}`;
      if (!out[key]) out[key] = TextureEngine.compileProceduralMaterial(frontMat, f.widthMm, f.heightMm, isXRayMode, '#FAFAFA', grain, cabinet.frontTextureOverride);
    });
    return out;
  }, [geo, frontMat, isXRayMode, overridePath, overrideFinish]); // eslint-disable-line react-hooks/exhaustive-deps

  const W = cabinet.width, D = cabinet.depth;
  const swing = openProgress * (Math.PI / 2);
  const liftAngle = openProgress * (Math.PI / 2);
  const drawerTravel = openProgress * m(D) * 0.75;

  const facadeBody = (f: FacadeGeo) => {
    const w = m(f.widthMm), h = m(f.heightMm), t = m(fTh);
    const grain = f.kind === 'DRAWER' || f.kind === 'APRON' ? 'horizontal' : 'vertical';
    const material = frontMaterials[`${f.widthMm}x${f.heightMm}x${grain}`];
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
      <mesh castShadow material={material}>
        <boxGeometry args={[w, h, t]} />
      </mesh>
    );
  };

  const renderFacade = (f: FacadeGeo) => {
    const key = `facade-${f.zoneIndex}-${f.kind}-${f.index}`;
    const w = m(f.widthMm), h = m(f.heightMm);
    const cx = m(f.xMm) + w / 2, cy = m(f.yMm) + h / 2, z = m(f.zMm);

    if (f.motion === 'SWING') {
      const left = f.hinge === 'LEFT';
      const pivotX = left ? m(f.xMm) : m(f.xMm) + w;
      // The ROTATION belongs on the pivot group: it used to be on the inner group, so the door spun about its own centre.
      return (
        <group key={key} position={[pivotX, cy, z]} rotation={[0, left ? -swing : swing, 0]}>
          <group position={[left ? w / 2 : -w / 2, 0, 0]}>{facadeBody(f)}</group>
        </group>
      );
    }
    if (f.motion === 'LIFT') {
      // Lifting flap: hinged on its top edge, swings up and out.
      return (
        <group key={key} position={[cx, m(f.yMm) + h, z]} rotation={[-liftAngle, 0, 0]}>
          <group position={[0, -h / 2, 0]}>{facadeBody(f)}</group>
        </group>
      );
    }
    if (f.motion === 'SLIDE') {
      const boxDepth = m(D) * 0.8;
      return (
        <group key={key} position={[cx, cy, z + drawerTravel]}>
          {facadeBody(f)}
          <mesh position={[0, 0, -(m(fTh) / 2 + boxDepth / 2)]} castShadow receiveShadow material={boardMaterial}>
            <boxGeometry args={[Math.max(0.05, m(W - 2 * th) - 0.012), Math.max(0.03, h * 0.7), boxDepth]} />
          </mesh>
        </group>
      );
    }
    return (
      <group key={key} position={[cx, cy, z]}>
        {facadeBody(f)}
      </group>
    );
  };

  const renderAppliance = (a: ApplianceGeo) => {
    const [aw, ah, ad] = [m(a.sizeMm[0]), m(a.sizeMm[1]), m(a.sizeMm[2])];
    const frontZ = ad / 2 + 0.0006;
    const body = a.appliance === 'DISHWASHER' || a.appliance === 'FRIDGE' ? '#CBD5E1' : '#2B2F36';
    return (
      <group key={`appliance-${a.zoneIndex}`} position={[m(a.centerMm[0]), m(a.centerMm[1]), m(a.centerMm[2])]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[aw, ah, ad]} />
          <meshStandardMaterial color={body} roughness={0.35} metalness={0.4} transparent={isXRayMode} opacity={isXRayMode ? 0.5 : 1} />
        </mesh>
        {(a.appliance === 'OVEN' || a.appliance === 'MICROWAVE' || a.appliance === 'COFFEE') && (
          <>
            <mesh position={[a.appliance === 'MICROWAVE' ? -aw * 0.12 : 0, a.appliance === 'OVEN' ? -ah * 0.06 : 0, frontZ]}>
              <boxGeometry args={[aw * (a.appliance === 'MICROWAVE' ? 0.62 : 0.74), ah * (a.appliance === 'OVEN' ? 0.5 : 0.66), 0.002]} />
              <meshStandardMaterial color="#0B1220" roughness={0.1} metalness={0.2} />
            </mesh>
            {a.appliance === 'MICROWAVE' && (
              <mesh position={[aw * 0.34, 0, frontZ]}>
                <boxGeometry args={[aw * 0.18, ah * 0.66, 0.002]} />
                <meshStandardMaterial color="#475569" roughness={0.3} metalness={0.3} />
              </mesh>
            )}
            {a.appliance === 'OVEN' && (
              <mesh position={[0, ah * 0.36, frontZ + 0.007]}>
                <boxGeometry args={[aw * 0.8, 0.01, 0.014]} />
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
      {geo.boxes.map((b) => {
        const position: [number, number, number] = [m(b.centerMm[0]), m(b.centerMm[1]), m(b.centerMm[2])];
        const size: [number, number, number] = [m(b.sizeMm[0]), m(b.sizeMm[1]), m(b.sizeMm[2])];
        if (b.kind === 'back') {
          return (
            <mesh key={b.key} position={position} receiveShadow>
              <boxGeometry args={size} />
              <meshStandardMaterial color="#D1D5DB" transparent={isXRayMode} opacity={isXRayMode ? 0.3 : 1.0} />
            </mesh>
          );
        }
        return (
          <mesh key={b.key} position={position} castShadow receiveShadow material={b.kind === 'side' ? sideMaterial : boardMaterial}>
            <boxGeometry args={size} />
          </mesh>
        );
      })}

      {geo.appliances.map(renderAppliance)}

      {showFronts && geo.facades.map(renderFacade)}

      {showFronts && geo.channels.map((c) => (
        <mesh key={`gola-${c.slot}`} position={[m(W) / 2, m(c.yMm + c.heightMm / 2), m(D) / 2 + 0.002]}>
          <boxGeometry args={[m(W - 4), m(c.heightMm) * 0.55, 0.012]} />
          <meshStandardMaterial color="#374151" metalness={0.6} roughness={0.4} />
        </mesh>
      ))}
    </group>
  );
}
