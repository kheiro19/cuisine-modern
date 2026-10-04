// src/components/Kitchen3DCanvas.tsx
import React, { useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Center } from '@react-three/drei';
import * as THREE from 'three';
import CabinetAssembly3D from './CabinetAssembly3D';
import WallCabinetAssembly3D from './WallCabinetAssembly3D';
import { CabinetObject, AdvancedHardwareSettings, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';
import { textureCatalog } from '../data/textureCatalog';

interface Kitchen3DCanvasProps {
  cabinets: CabinetObject[];
  hardware: AdvancedHardwareSettings;
  showFronts: boolean;
  isXRayMode: boolean;
  countertopPath: { x: number; zOffset: number }[];
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  onApplyTextureOverride: (cabinetId: string, texturePath: string, finishType: string) => void;
}

export default function Kitchen3DCanvas({
  cabinets,
  hardware,
  showFronts,
  isXRayMode,
  countertopPath,
  woodPanels,
  hardwareItems,
  onApplyTextureOverride
}: Kitchen3DCanvasProps) {
  
  const [openProgress, setOpenProgress] = useState<number>(0);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  // Real workshop texture library, generated from the files that actually exist in /public/textures
  // (scripts/build-texture-manifest.mjs): no fake "variation_N" thumbnails and no dead remote links.
  const activeCollection = textureCatalog;
  const baseCabinets = useMemo(() => cabinets.filter(c => c.category === 'BASE_UNIT'), [cabinets]);
  const maxBoundaryXMm = useMemo(() => cabinets.length > 0 ? Math.max(...cabinets.map(c => c.positionX + c.width)) : 1200, [cabinets]);
  const sceneWidthMeters = maxBoundaryXMm / 1000;

  const structuralCountertop = useMemo(() => {
    if (baseCabinets.length === 0) return null;
    const extremeDepthMm = Math.max(...baseCabinets.map(c => c.depth));
    const depthMeters = extremeDepthMm / 1000;
    const thicknessMeters = 0.04;

    if (countertopPath && countertopPath.length > 1) {
      const contour = new THREE.Shape();
      contour.moveTo(countertopPath[0].x / 1000, countertopPath[0].zOffset / 1000);
      countertopPath.forEach((vertex) => contour.lineTo(vertex.x / 1000, vertex.zOffset / 1000));
      contour.lineTo(sceneWidthMeters, -depthMeters);
      contour.lineTo(0, -depthMeters);
      contour.closePath();

      return new THREE.ExtrudeGeometry(contour, { depth: thicknessMeters, bevelEnabled: true, bevelThickness: 0.001, bevelSize: 0.001, bevelSegments: 1 });
    }
    return new THREE.BoxGeometry(sceneWidthMeters, thicknessMeters, depthMeters);
  }, [baseCabinets, sceneWidthMeters, countertopPath]);

  return (
    <div className="w-full h-full min-h-[580px] bg-[#FAF9F6] rounded-xl overflow-hidden relative flex flex-col shadow-inner select-none">
      
      {/* 🎮 Kinematic Motion Simulation Overlay Control */}
      <div className="absolute top-3 left-3 z-30 bg-white/80 backdrop-blur border border-[#E5E5E5] px-4 py-2.5 rounded-xl shadow-xs flex flex-col space-y-1.5 min-w-[220px]">
        <div className="flex justify-between items-center">
          <span className="text-[10px] font-mono font-bold text-slate-800 tracking-wider">🎛️ KINEMATIC SIMULATION</span>
          <span className="text-[10px] font-mono font-bold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">{Math.round(openProgress * 100)}%</span>
        </div>
        <input type="range" min="0" max="1" step="0.01" value={openProgress} onChange={(e) => setOpenProgress(parseFloat(e.target.value))} className="w-full h-1 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600" />
      </div>

      {/* 🧊 Three.js Spatial Layer Viewport */}
      <div className="flex-1 w-full h-full relative">
        <Canvas camera={{ position: [sceneWidthMeters / 2, 1.2, 2.5], fov: 40 }} shadows gl={{ antialias: true }} className="w-full h-full absolute inset-0">
          <ambientLight intensity={0.65} />
          <directionalLight position={[sceneWidthMeters / 2, 5, 3]} intensity={0.85} castShadow shadow-bias={-0.00005} />
          
          <Center>
            <group>
              {cabinets.map((cabinet) => {
                const isWallNode = cabinet.category === 'WALL_UNIT';
                const verticalYOffset = isWallNode ? (720 / 1000) + (hardware.wallSplashHeight / 1000) : 0;

                return (
                  <group 
                    key={cabinet.id} 
                    position={[cabinet.positionX / 1000, verticalYOffset, -cabinet.positionZ / 1000]}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedCabinetId(cabinet.id); // Raycasting simulation trigger
                    }}
                  >
                    {isWallNode ? (
                      <WallCabinetAssembly3D cabinet={cabinet} showFronts={showFronts} isXRayMode={isXRayMode} woodPanels={woodPanels} hardwareItems={hardwareItems} openProgress={openProgress} />
                    ) : (
                      <CabinetAssembly3D cabinet={cabinet} showFronts={showFronts} isXRayMode={isXRayMode} woodPanels={woodPanels} hardwareItems={hardwareItems} openProgress={openProgress} />
                    )}
                  </group>
                );
              })}

              {/* Countertop Mesh Block */}
              {baseCabinets.length > 0 && structuralCountertop && (
                <mesh geometry={structuralCountertop} position={[sceneWidthMeters / 2, 720 / 1000 + 0.02, -0.3]} castShadow receiveShadow>
                  <meshStandardMaterial color="#FFFFFF" roughness={0.2} metalness={0.0} transparent={isXRayMode} opacity={isXRayMode ? 0.35 : 1.0} />
                </mesh>
              )}
            </group>
          </Center>

          <OrbitControls makeDefault enableDamping dampingFactor={0.05} maxPolarAngle={Math.PI / 2} minDistance={0.4} maxDistance={8.0} />
          <Grid position={[0, -0.4, 0]} args={[Math.max(12, sceneWidthMeters * 2.5), Math.max(12, sceneWidthMeters * 2.5)]} cellSize={0.1} cellThickness={0.4} cellColor="#E5E5E5" sectionSize={0.5} sectionColor="#D4D4D4" />
        </Canvas>
      </div>

      {/* 🚀 MINIMALIST GLASSMORPHISM CAROUSEL SYSTEM (Sleek Aesthetic Overlay) */}
      {selectedCabinetId && (
        <div className="absolute bottom-4 left-4 right-4 z-40 bg-white/70 backdrop-blur-xl border border-white/40 p-3.5 rounded-2xl shadow-xl flex flex-col space-y-2.5 animate-fade-in">
          
          {/* Header Segment: Silent Architecture Tabs Layout */}
          <div className="flex justify-between items-center border-b border-slate-200/40 pb-2">
            <div className="flex items-center space-x-4">
              <span className="flex items-center space-x-1.5 pb-1 text-[11px] font-sans font-bold tracking-tight uppercase border-b-2 border-indigo-600 text-indigo-600">
                <span>📂</span> <span>Workshop Matrix ({activeCollection.length})</span>
              </span>
            </div>
            <button type="button" onClick={() => setSelectedCabinetId(null)} className="w-5 h-5 rounded-full bg-slate-200/50 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-[9px] transition-colors cursor-pointer">✕</button>
          </div>

          {/* Endless Fluid Micro-interaction Horizontal Strip Panel */}
          <div className="flex space-x-3 overflow-x-auto py-1 scrollbar-none snap-x snap-mandatory">
            {activeCollection.map((tex) => (
              <div 
                key={tex.id}
                onClick={() => {
                  onApplyTextureOverride(selectedCabinetId, tex.path, tex.finish);
                  setSelectedCabinetId(null);
                }}
                className="flex-shrink-0 w-14 h-14 rounded-xl border border-slate-200/60 overflow-hidden cursor-pointer hover:border-indigo-600 hover:scale-105 active:scale-95 transition-all bg-white/40 shadow-3xs relative group snap-center"
              >
                <img 
                  src={tex.path} 
                  alt={tex.name}
                  title={tex.name}
                  loading="lazy"
                  decoding="async"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  className="w-full h-full object-cover" 
                />
                <div className="absolute inset-0 bg-indigo-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}
