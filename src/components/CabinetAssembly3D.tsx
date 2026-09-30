// src/components/CabinetAssembly3D.tsx
import React, { useMemo } from 'react';
import * as THREE from 'three';
import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { TextureEngine } from '../math/textureEngine';

interface CabinetAssembly3DProps {
  cabinet: CabinetObject;
  showFronts: boolean;
  isXRayMode: boolean;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  openProgress: number; // Kinematic slider variable [0 - 1]
}

export default function CabinetAssembly3D({
  cabinet,
  showFronts,
  isXRayMode,
  woodPanels,
  hardwareItems,
  openProgress
}: CabinetAssembly3DProps) {
  
  // 1. Resolve Materials and Configurations from Context Stockroom
  const carcaseMat = useMemo(() => woodPanels.find(m => m.id === cabinet.carcaseMaterialId), [woodPanels, cabinet.carcaseMaterialId]);
  const frontMat = useMemo(() => woodPanels.find(m => m.id === cabinet.frontMaterialId), [woodPanels, cabinet.frontMaterialId]);
  const activeHardware = useMemo(() => hardwareItems.find(h => h.id === cabinet.frontConfig.hardwareItemId), [hardwareItems, cabinet.frontConfig.hardwareItemId]);

  // Dimension mapping constants (mm to meters for Three.js space layout)
  const th = carcaseMat ? carcaseMat.thickness / 1000 : 0.018; 
  const fTh = frontMat ? frontMat.thickness / 1000 : 0.018; 
  const edgeOffset = carcaseMat ? carcaseMat.edgeThickness / 1000 : 0.002;

  const w = cabinet.width / 1000;
  const h = cabinet.height / 1000;
  const d = cabinet.depth / 1000;

  const golaOffset = cabinet.frontConfig.hasGolaProfile ? 0.045 : 0.0;

  // Resolve structural width clearance based on your elite ultra-slim gap concept
  const dynamicAdjustment = cabinet.frontConfig.elementCount === 1 ? 0.001 : 0.001; 
  const frontZPositionDefault = activeHardware?.modelType.includes('Inset Hinge')
    ? (d / 2) - (fTh / 2) - edgeOffset
    : (d / 2) + (fTh / 2);

  // 2. Dynamic PBR Material Generation via TextureEngine Mapping Subsystem
  const leftRightMaterial = useMemo(() => 
    TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.depth, cabinet.height, isXRayMode, "#E2E8F0", "vertical"),
    [carcaseMat, cabinet.depth, cabinet.height, isXRayMode]
  );

  const bottomTopMaterial = useMemo(() => 
    TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.width, cabinet.depth, isXRayMode, "#E2E8F0", "horizontal"),
    [carcaseMat, cabinet.width, cabinet.depth, isXRayMode]
  );

  const shelfMaterial = useMemo(() => 
    TextureEngine.compileProceduralMaterial(carcaseMat, cabinet.width, cabinet.depth, isXRayMode, "#CBD5E1", "horizontal"),
    [carcaseMat, cabinet.width, cabinet.depth, isXRayMode]
  );

  const frontMaterialCompiled = useMemo(() => {
    // Explicitly determine grain routing based on cabinet configuration setup
    const grainRoute = cabinet.frontConfig.openingType === 'DRAWERS' ? 'horizontal' : 'vertical';
    return TextureEngine.compileProceduralMaterial(frontMat, cabinet.width, cabinet.height, isXRayMode, "#F1F5F9", grainRoute);
  }, [frontMat, cabinet.width, cabinet.height, isXRayMode, cabinet.frontConfig.openingType]);

  // Kinematic parameters translation matrix
  const maxRotation = Math.PI / 2;
  const currentRotation = openProgress * maxRotation;
  const currentDrawerSlide = openProgress * (d * 0.75);

  return (
    <group>
      {/* 🪚 Left Gable Side Panel */}
      <mesh position={[th / 2, h / 2, 0]} castShadow receiveShadow material={leftRightMaterial}>
        <boxGeometry args={[th, h, d]} />
      </mesh>

      {/* 🪚 Right Gable Side Panel */}
      <mesh position={[w - th / 2, h / 2, 0]} castShadow receiveShadow material={leftRightMaterial}>
        <boxGeometry args={[th, h, d]} />
      </mesh>

      {/* 🪚 Bottom Shelf Board */}
      <mesh position={[w / 2, th / 2, 0]} castShadow receiveShadow material={bottomTopMaterial}>
        <boxGeometry args={[w - (2 * th), th, d - edgeOffset]} />
      </mesh>

      {/* 🪚 Top Stretcher Rails / Traverses */}
      <mesh position={[w / 2, h - th / 2, golaOffset / 2]} castShadow receiveShadow material={bottomTopMaterial}>
        <boxGeometry args={[w - (2 * th), th, 0.1]} />
      </mesh>
      <mesh position={[w / 2, h - th / 2, -d / 2 + 0.05]} castShadow receiveShadow material={bottomTopMaterial}>
        <boxGeometry args={[w - (2 * th), th, 0.1]} />
      </mesh>

      {/* 🪚 Backwall Fiberboard Panel (3mm) */}
      <mesh position={[w / 2, h / 2, -d / 2 + 0.0015]} receiveShadow>
        <boxGeometry args={[w, h, 0.003]} />
        <meshStandardMaterial color="#D1D5DB" roughness={0.6} transparent={isXRayMode} opacity={op} />
      </mesh>

      {/* 🪚 Internal Adjustable Shelving Cluster */}
      {cabinet.shelvesCount > 0 && Array.from({ length: cabinet.shelvesCount }).map((_, idx) => {
        const shelfY = (h / (cabinet.shelvesCount + 1)) * (idx + 1);
        return (
          <mesh key={idx} position={[w / 2, shelfY, -0.01]} castShadow receiveShadow material={shelfMaterial}>
            <boxGeometry args={[w - (2 * th) - 0.002, th, d - 0.03]} />
          </mesh>
        );
      })}

      {/* ======================================================== */}
      {/* 🚪 HIGH-FIDELITY INTERACTIVE SUITE FRONT FACADES          */}
      {/* ======================================================== */}
      {showFronts && cabinet.frontConfig.openingType === 'DOORS' && (
        <group>
          {Array.from({ length: cabinet.frontConfig.elementCount }).map((_, idx) => {
            const doorWidth = (w - dynamicAdjustment) / cabinet.frontConfig.elementCount;
            const doorHeight = h - golaOffset - 0.004;
            const defaultDoorX = (doorWidth / 2) + (idx * doorWidth) + 0.002;
            
            const isLeftHinge = idx % 2 === 0;
            const pivotXOffset = isLeftHinge ? defaultDoorX - (doorWidth / 2) : defaultDoorX + (doorWidth / 2);
            const appliedRotation = isLeftHinge ? -currentRotation : currentRotation;

            return (
              <group key={idx} position={[pivotXOffset, (h - golaOffset) / 2, frontZPositionDefault]}>
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

      {showFronts && cabinet.frontConfig.openingType === 'DRAWERS' && (
        <group>
          {Array.from({ length: cabinet.frontConfig.elementCount }).map((_, idx) => {
            const drawerWidth = w - dynamicAdjustment;
            const drawerHeight = (h - golaOffset - 0.004) / cabinet.frontConfig.elementCount;
            const drawerY = (drawerHeight / 2) + (idx * drawerHeight) + 0.002;
            
            const animatedZPosition = frontZPositionDefault + currentDrawerSlide;

            return (
              <group key={idx}>
                {/* Outward sliding architectural facade front panel */}
                <mesh position={[w / 2, drawerY, animatedZPosition]} castShadow material={frontMaterialCompiled}>
                  <boxGeometry args={[drawerWidth, drawerHeight - 0.002, fTh]} />
                </mesh>
                {/* Synchronized internal structural drawer box element */}
                <mesh position={[w / 2, drawerY, animatedZPosition - (d * 0.4) - (fTh / 2)]} castShadow material={shelfMaterial}>
                  <boxGeometry args={[drawerWidth - 0.04, drawerHeight * 0.6, d * 0.8]} />
                </mesh>
              </group>
            );
          })}
        </group>
      )}
    </group>
  );
}
