// src/components/WallCabinetAssembly3D.tsx
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { TextureEngine } from '../math/textureEngine';

interface WallCabinetAssembly3DProps {
  cabinet: CabinetObject;
  showFronts: boolean;
  isXRayMode: boolean;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  openProgress: number; // Kinematic vertical translation matrix hook [0 - 1]
}

export default function WallCabinetAssembly3D({
  cabinet,
  showFronts,
  isXRayMode,
  woodPanels,
  hardwareItems,
  openProgress
}: WallCabinetAssembly3DProps) {
  
  // Resolve stock items from workshop context supply
  const carcaseMat = useMemo(() => woodPanels.find(m => m.id === cabinet.carcaseMaterialId), [woodPanels, cabinet.carcaseMaterialId]);
  const frontMat = useMemo(() => woodPanels.find(m => m.id === cabinet.frontMaterialId), [woodPanels, cabinet.frontMaterialId]);
  const activeHardware = useMemo(() => hardwareItems.find(h => h.id === cabinet.frontConfig.hardwareItemId), [hardwareItems, cabinet.frontConfig.hardwareItemId]);

  const th = carcaseMat ? carcaseMat.thickness / 1000 : 0.018; 
  const fTh = frontMat ? frontMat.thickness / 1000 : 0.018;
  const edgeOffset = carcaseMat ? carcaseMat.edgeThickness / 1000 : 0.002;

  const w = cabinet.width / 1000;
  const h = cabinet.height / 1000;
  const d = cabinet.depth / 1000;

  const dynamicAdjustment = cabinet.frontConfig.elementCount === 1 ? 0.001 : 0.001;
  const frontZPositionDefault = activeHardware?.modelType.includes('Inset Hinge') 
    ? (d / 2) - (fTh / 2) - edgeOffset 
    : (d / 2) + (fTh / 2);

  const isOverheadLiftSystem = activeHardware?.category === 'Overhead Lift Systems';

  // 2. Dynamic PBR Compiling for المعلقة Wall Node Framework Components
  const leftRightMaterial = useMemo(() => 
    TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.depth, cabinet.height, isXRayMode, "#F59E0B", "vertical"),
    [carcaseMat, cabinet.depth, cabinet.height, isXRayMode]
  );

  const bottomTopMaterial = useMemo(() => 
    TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.width, cabinet.depth, isXRayMode, "#E2E8F0", "horizontal"),
    [carcaseMat, cabinet.width, cabinet.depth, isXRayMode]
  );

  const frontMaterialCompiled = useMemo(() => 
    TextureEngine.compileProceduralMaterial(frontMat, cabinet.width, cabinet.height, isXRayMode, "#FAFAFA", "vertical"),
    [frontMat, cabinet.width, cabinet.height, isXRayMode]
  );

  // Calculate Aventos Lift Upwards pathways or standard wing pivots
  const currentRotation = openProgress * (Math.PI / 2);
  const liftYDisplacement = openProgress * (h * 0.6);
  const liftZDisplacement = openProgress * 0.12;

  return (
    <group>
      {/* 🪚 Left Solid Wall Panel */}
      <mesh position={[th / 2, h / 2, 0]} castShadow receiveShadow material={leftRightMaterial}>
        <boxGeometry args={[th, h, d]} />
      </mesh>

      {/* 🪚 Right Solid Wall Panel */}
      <mesh position={[w - th / 2, h / 2, 0]} castShadow receiveShadow material={leftRightMaterial}>
        <boxGeometry args={[th, h, d]} />
      </mesh>

      {/* 🪚 Bottom Solid Shelf */}
      <mesh position={[w / 2, th / 2, 0]} castShadow receiveShadow material={bottomTopMaterial}>
        <boxGeometry args={[w - (2 * th), th, d - edgeOffset]} />
      </mesh>

      {/* 🪚 Solid Top Wood Roof Panel (Flatma Closed Box Standard) */}
      <mesh position={[w / 2, h - th / 2, 0]} castShadow receiveShadow material={bottomTopMaterial}>
        <boxGeometry args={[w - (2 * th), th, d - edgeOffset]} />
      </mesh>

      {/* 🪚 Rear Backwall Fiberboard Panel */}
      <mesh position={[w / 2, h / 2, -d / 2 + 0.0015]} receiveShadow>
        <boxGeometry args={[w, h, 0.003]} />
        <meshStandardMaterial color="#D1D5DB" transparent={isXRayMode} opacity={isXRayMode ? 0.3 : 1.0} />
      </mesh>

      {/* 🪚 Internal Adjustable Floating Shelves */}
      {cabinet.shelvesCount > 0 && Array.from({ length: cabinet.shelvesCount }).map((_, idx) => {
        const shelfY = (h / (cabinet.shelvesCount + 1)) * (idx + 1);
        return (
          <mesh key={idx} position={[w / 2, shelfY, -0.01]} castShadow receiveShadow material={bottomTopMaterial}>
            <boxGeometry args={[w - (2 * th) - 0.002, th, d - 0.03]} />
          </mesh>
        );
      })}

      {/* ======================================================== */}
      {/* 🚪 MECHANICAL LIFTS VS SIDE OPENING FAÇADES INTEGRATION   */}
      {/* ======================================================== */}
      {showFronts && cabinet.frontConfig.openingType === 'DOORS' && (
        <group>
          {isOverheadLiftSystem ? (
            /* ✈️ Aventos Kinematic Mechanical Lift Upwards Activation */
            <mesh 
              position={[w / 2, (h / 2) + liftYDisplacement, frontZPositionDefault + liftZDisplacement]} 
              castShadow 
              material={frontMaterialCompiled}
            >
              <boxGeometry args={[w - dynamicAdjustment, h - 0.004, fTh]} />
            </mesh>
          ) : (
            /* 🚪 Standard Edge Pivot Side Opening Multi-Door Setup Grid */
            <group>
              {Array.from({ length: cabinet.frontConfig.elementCount }).map((_, idx) => {
                const doorWidth = (w - dynamicAdjustment) / cabinet.frontConfig.elementCount;
                const doorHeight = h - 0.004;
                const defaultDoorX = (doorWidth / 2) + (idx * doorWidth) + 0.002;
                
                const isLeftHinge = idx % 2 === 0;
                const pivotXOffset = isLeftHinge ? defaultDoorX - (doorWidth / 2) : defaultDoorX + (doorWidth / 2);
                const appliedRotation = isLeftHinge ? -currentRotation : currentRotation;

                return (
                  <group key={idx} position={[pivotXOffset, h / 2, frontZPositionDefault]}>
                    <group position={[isLeftHinge ? doorWidth / 2 : -doorWidth / 2, 0, 0]} rotation={[0, appliedRotation, 0]}>
                      <mesh castShadow material={frontMaterialCompiled}>
                        <boxGeometry args={[doorWidth - 0.001, doorHeight, fTh]} />
                      </mesh>
                    </group>
                  </group>
                );
              })}
            </group>
          )}
        </group>
      )}
    </group>
  );
}
