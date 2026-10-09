// src/components/CabinetAssembly3D.tsx
// ONE assembly for base and wall cabinets. It draws exactly the boxes and facades computed by math/assemblyGeometry.ts
// (the same zone layout the BOM and the price use): zones with dividers, appliance niches, apron panels, doors that
// swing / lift / glass, drawers that slide, and one Gola channel per enabled position.
import React, { useMemo } from 'react';
import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { TextureEngine } from '../math/textureEngine';
import { ApplianceGeo, FacadeGeo, assemblyGeometry } from '../math/assemblyGeometry';
import { hingesPerDoor, isGlassFront, isLiftItem, openingModeOf, pickFrontHardware } from '../math/partsEngine';
import { DiagonalCorner3D, Hinges3D, LiftArms3D, SHELF_REPLACED, SubtypeInterior3D } from './CabinetExtras3D';
import { Handle3D, Runner3D } from './Hardware3D';

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

  const drawerHardware = useMemo(() => pickFrontHardware(cabinet, 'DRAWERS', hardwareItems), [cabinet, hardwareItems]);
  // Handle from the stock (Gola & Handle Profiles): the one chosen on the cabinet, else the first handle in stock.
  const handleItem = useMemo(
    () => hardwareItems.find((h) => h.id === cabinet.frontConfig.golaProfileItemId && /handle/i.test(h.modelType))
      ?? hardwareItems.find((h) => h.category === 'Gola & Handle Profiles' && /handle/i.test(h.modelType)),
    [hardwareItems, cabinet.frontConfig.golaProfileItemId],
  );
  const sub = cabinet.subtype;
  const handles = openingModeOf(cabinet) === 'HANDLE' && !!handleItem;

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

  if (sub === 'Diagonal_Corner') {
    const anyFront = Object.values(frontMaterials)[0] ?? boardMaterial;
    return (
      <DiagonalCorner3D
        cabinet={cabinet} th={th} fTh={fTh} progress={openProgress} showFronts={showFronts}
        sideMaterial={sideMaterial} boardMaterial={boardMaterial} frontMaterial={anyFront}
        doorHardware={(wMm, hMm, hinge) => (doorHardware && !lift
          ? <Hinges3D modelType={doorHardware.modelType} wMm={wMm} hMm={hMm} count={hingesPerDoor(hMm)} hinge={hinge} frontTh={fTh} />
          : null)}
      />
    );
  }

  const W = cabinet.width, D = cabinet.depth;
  const swing = openProgress * (Math.PI / 2);
  const liftAngle = openProgress * (Math.PI / 2);
  const drawerTravel = openProgress * m(D) * 0.75;
  const FOLD = sub === 'Pocket_Door_Pantry';
  const RECESS = sub === 'Double_Depth' ? 120 : 0; // lower tier of a double-depth wall unit sits 120 mm back

  const handleFor = (f: FacadeGeo) => (handles && handleItem && (f.kind === 'DOOR' || f.kind === 'DRAWER') && f.motion !== 'LIFT' ? (
    <group position={[0, 0, m(fTh) / 2]}>
      <Handle3D modelType={handleItem.modelType} wMm={f.widthMm} hMm={f.heightMm} vertical={f.kind === 'DOOR'} top={cabinet.category === 'BASE_UNIT'}
        edgeX={f.hinge === 'LEFT' ? f.widthMm / 2 - 35 : -f.widthMm / 2 + 35} />
    </group>
  ) : null);

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
    const cx = m(f.xMm) + w / 2, cy = m(f.yMm) + h / 2, z = m(f.zMm) - (RECESS && f.zoneIndex === 0 ? m(RECESS) : 0);

    if (f.motion === 'SWING') {
      const left = f.hinge === 'LEFT';
      const pivotX = left ? m(f.xMm) : m(f.xMm) + w;
      if (FOLD) {
        // Folding (pocket) door: two leaves, the second hinged on the free edge of the first.
        const th2 = openProgress * 1.35, sgn = left ? -1 : 1, half = w / 2;
        const fm = frontMaterials[`${f.widthMm}x${f.heightMm}xvertical`];
        const leaf = <mesh castShadow material={fm}><boxGeometry args={[half, h, m(fTh)]} /></mesh>;
        return (
          <group key={key} position={[pivotX, cy, z]} rotation={[0, sgn * th2, 0]}>
            <group position={[left ? half / 2 : -half / 2, 0, 0]}>{leaf}</group>
            <group position={[left ? half : -half, 0, 0]} rotation={[0, -sgn * 2 * th2, 0]}>
              <group position={[left ? half / 2 : -half / 2, 0, 0]}>{leaf}</group>
            </group>
          </group>
        );
      }
      // The ROTATION belongs on the pivot group: it used to be on the inner group, so the door spun about its own centre.
      return (
        <group key={key} position={[pivotX, cy, z]} rotation={[0, left ? -swing : swing, 0]}>
          <group position={[left ? w / 2 : -w / 2, 0, 0]}>
            {facadeBody(f)}
            {doorHardware && !lift && <Hinges3D modelType={doorHardware.modelType} wMm={f.widthMm} hMm={f.heightMm} count={hingesPerDoor(f.heightMm)} hinge={f.hinge as 'LEFT' | 'RIGHT'} frontTh={fTh} />}
            {handleFor(f)}
          </group>
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
      const boxW = Math.max(0.05, m(W - 2 * th) - 0.012), boxH = Math.max(0.03, h * 0.7);
      return (
        <group key={key} position={[cx, cy, z + drawerTravel]}>
          {facadeBody(f)}
          {handleFor(f)}
          {sub !== 'Cargo_Pull_Out' && (
            <mesh position={[0, 0, -(m(fTh) / 2 + boxDepth / 2)]} castShadow receiveShadow material={boardMaterial}>
              <boxGeometry args={[boxW, boxH, boxDepth]} />
            </mesh>
          )}
          {drawerHardware && (
            <group position={[0, 0, -(m(fTh) / 2 + boxDepth / 2)]}>
              <Runner3D modelType={drawerHardware.modelType} lenMm={boxDepth * 1000} halfWidthMm={(boxW * 1000) / 2} boxHeightMm={boxH * 1000} />
            </group>
          )}
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
    const steelBody = a.appliance === 'FRIDGE' || a.appliance === 'DISHWASHER';
    const body = a.appliance === 'WASHER' ? '#F1F5F9' : steelBody ? '#B9C0C8' : '#2B2F36';
    return (
      <group key={`appliance-${a.zoneIndex}`} position={[m(a.centerMm[0]), m(a.centerMm[1]), m(a.centerMm[2])]}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[aw, ah, ad]} />
          <meshStandardMaterial color={body} roughness={steelBody ? 0.28 : 0.35} metalness={steelBody ? 0.85 : 0.4} transparent={isXRayMode} opacity={isXRayMode ? 0.5 : 1} />
        </mesh>
        {a.appliance === 'FRIDGE' && (
          <>
            <mesh position={[0, ah * 0.12, frontZ]}><boxGeometry args={[aw * 0.98, 0.004, 0.002]} /><meshStandardMaterial color="#6B7280" /></mesh>
            {[0.3, -0.1].map((f) => (
              <mesh key={f} position={[-aw * 0.4, ah * f, frontZ + 0.02]} castShadow><boxGeometry args={[0.014, ah * 0.28, 0.02]} /><meshStandardMaterial color="#9CA3AF" metalness={0.9} roughness={0.25} /></mesh>
            ))}
          </>
        )}
        {a.appliance === 'DISHWASHER' && (
          <mesh position={[0, ah * 0.42, frontZ + 0.015]} castShadow><boxGeometry args={[aw * 0.7, 0.012, 0.016]} /><meshStandardMaterial color="#9CA3AF" metalness={0.9} roughness={0.25} /></mesh>
        )}
        {a.appliance === 'WASHER' && (
          <>
            <mesh position={[0, ah * 0.4, frontZ]}><boxGeometry args={[aw * 0.92, ah * 0.14, 0.002]} /><meshStandardMaterial color="#CBD5E1" roughness={0.4} /></mesh>
            <mesh position={[0, -ah * 0.08, frontZ + 0.012]} rotation={[Math.PI / 2, 0, 0]} castShadow><torusGeometry args={[aw * 0.33, 0.022, 14, 40]} /><meshStandardMaterial color="#B9C0C8" metalness={0.85} roughness={0.25} /></mesh>
            <mesh position={[0, -ah * 0.08, frontZ + 0.006]} rotation={[Math.PI / 2, 0, 0]}><cylinderGeometry args={[aw * 0.31, aw * 0.31, 0.012, 40]} /><meshStandardMaterial color="#1E293B" metalness={0.3} roughness={0.08} transparent opacity={0.85} /></mesh>
          </>
        )}
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
      {geo.boxes.filter((b) => !(b.kind === 'shelf' && SHELF_REPLACED.includes(sub ?? ''))).map((b) => {
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

      <SubtypeInterior3D cabinet={cabinet} th={th} progress={openProgress} items={hardwareItems} />
      {showFronts && lift && <LiftArms3D cabinet={cabinet} th={th} progress={openProgress} />}

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
