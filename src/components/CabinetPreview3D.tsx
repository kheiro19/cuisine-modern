// src/components/CabinetPreview3D.tsx
// The "3D ATOMIC WORKSPACE": renders the draft with the SAME assembly components the showcase uses, so what is
// previewed here is exactly what will be injected (it used to be flat CSS rectangles from a separate generator).
import React, { useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
import CabinetAssembly3D from './CabinetAssembly3D';
import WallCabinetAssembly3D from './WallCabinetAssembly3D';
import { CabinetObject, InjectedWoodMaterial, InjectedHardwareItem } from '../types/flatma';

interface CabinetPreview3DProps {
  cabinet: CabinetObject;
  showFronts: boolean;
  isXRayMode: boolean;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
}

export default function CabinetPreview3D({ cabinet, showFronts, isXRayMode, woodPanels, hardwareItems }: CabinetPreview3DProps) {
  const [openProgress, setOpenProgress] = useState<number>(0);
  const Assembly = cabinet.category === 'WALL_UNIT' ? WallCabinetAssembly3D : CabinetAssembly3D;

  return (
    <div className="w-full h-full relative">
      <Canvas camera={{ position: [0.9, 1.1, 3.4], fov: 38 }} shadows gl={{ antialias: true }} className="absolute inset-0">
        <ambientLight intensity={0.75} />
        <directionalLight position={[2, 4, 3]} intensity={0.9} castShadow />
        <Center>
          <Assembly
            cabinet={cabinet}
            showFronts={showFronts}
            isXRayMode={isXRayMode}
            woodPanels={woodPanels}
            hardwareItems={hardwareItems}
            openProgress={openProgress}
          />
        </Center>
        <OrbitControls makeDefault enableDamping dampingFactor={0.05} minDistance={0.6} maxDistance={7} />
      </Canvas>

      <div className="absolute bottom-0 left-0 right-0 flex items-center gap-3 bg-slate-950/70 backdrop-blur-sm rounded-lg px-3 py-1.5">
        <span className="text-[9px] font-mono font-bold text-slate-200 whitespace-nowrap">
          {cabinet.width}×{cabinet.height}×{cabinet.depth} mm
        </span>
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={openProgress}
          onChange={(e) => setOpenProgress(parseFloat(e.target.value))}
          className="flex-1 h-1 bg-slate-600 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          title="فتح الأبواب / الأدراج"
        />
        <span className="text-[9px] font-mono font-bold text-indigo-300 w-8 text-right">{Math.round(openProgress * 100)}%</span>
      </div>
    </div>
  );
}
