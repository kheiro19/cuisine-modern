import React, { useMemo, useRef } from 'react';
import { useFurniture } from '../context/FurnitureContext';
import { WallGeometry } from '../types/flatma';

interface Kitchen2DCanvasProps {
  wall: WallGeometry;
}

export default function Kitchen2DCanvas({ wall }: Kitchen2DCanvasProps) {
  const { cabinets, activeCabinetId, setActiveCabinetId, updateCabinet } = useFurniture();
  const SCALE = 5; 
  const canvasWidth = wall.length / SCALE;
  const pointerDragRef = useRef<{ id: string; startClientX: number; startPosX: number } | null>(null);

  const totalCumulativeWidth = useMemo(() => {
    return cabinets.reduce((sum, cab) => sum + cab.width, 0);
  }, [cabinets]);

  // Pure Flatma Snapping Engine: Strict X-Axis alignment pipeline
  const calculateMagneticSnap = (id: string, proposedX: number, width: number): number => {
    const SNAP_THRESHOLD = 15; // 15mm magnetic tolerance
    let finalX = proposedX;
    let closestDelta = SNAP_THRESHOLD;

    // Boundary Wall alignment checks
    if (proposedX < SNAP_THRESHOLD) finalX = 0;
    if (Math.abs((proposedX + width) - wall.length) < SNAP_THRESHOLD) finalX = wall.length - width;

    // Neighboring nodes checks
    for (const cab of cabinets) {
      if (cab.id === id) continue;

      const deltaRight = Math.abs(proposedX - (cab.positionX + cab.width));
      if (deltaRight < closestDelta) {
        closestDelta = deltaRight;
        finalX = cab.positionX + cab.width;
      }

      const deltaLeft = Math.abs((proposedX + width) - cab.positionX);
      if (deltaLeft < closestDelta) {
        closestDelta = deltaLeft;
        finalX = cab.positionX - width;
      }
    }

    return finalX;
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>, id: string, initialX: number) => {
    e.preventDefault();
    setActiveCabinetId(id);
    
    const viewport = document.getElementById('flatma-blueprint-canvas');
    if (!viewport) return;
    
    viewport.setPointerCapture(e.pointerId);
    pointerDragRef.current = {
      id,
      startClientX: e.clientX,
      startPosX: initialX
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDragRef.current) return;
    const { id, startClientX, startPosX } = pointerDragRef.current;
    
    const cabinet = cabinets.find(c => c.id === id);
    if (!cabinet) return;

    const displacementMm = (e.clientX - startClientX) * SCALE;
    let proposedX = startPosX + displacementMm;

    // Physical boundaries locking
    proposedX = Math.max(0, Math.min(proposedX, wall.length - cabinet.width));
    const finalSnappedX = calculateMagneticSnap(id, proposedX, cabinet.width);

    updateCabinet(id, { positionX: Math.round(finalSnappedX) });
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointerDragRef.current) return;
    const viewport = document.getElementById('flatma-blueprint-canvas');
    if (viewport) viewport.releasePointerCapture(e.pointerId);
    pointerDragRef.current = null;
  };

  return (
    <div className="w-full h-full flex flex-col items-center justify-start p-4 bg-[#FAFAFA] select-none">
      
      {/* Blueprint Industrial Clean Header */}
      <div className="mb-3 flex items-center justify-between w-full max-w-4xl font-mono text-[10px] font-bold">
        <span className="bg-slate-900 text-white px-2.5 py-1 rounded-md tracking-wider">⚡ FLATMA 2D BLUEPRINT VIEW</span>
        <div className="bg-white border border-[#E5E5E5] px-3 py-1 rounded-md shadow-3xs flex space-x-2">
          <span className="text-slate-400">Total Run:</span>
          <span className={totalCumulativeWidth > wall.length ? "text-red-500" : "text-indigo-600"}>{totalCumulativeWidth} mm</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-600">{wall.length} mm</span>
        </div>
      </div>

      {/* Blueprint Drafting Layout Viewport */}
      <div 
        id="flatma-blueprint-canvas" 
        className="relative bg-white border border-[#E5E5E5] rounded-xl shadow-xs min-h-[420px] touch-none overflow-hidden" 
        style={{ width: `${canvasWidth}px` }}
        onPointerMove={handlePointerMove}
      >
        {/* Alignment zones visualization */}
        <div className="absolute top-6 left-0 right-0 h-24 bg-amber-50/10 border-b border-dashed border-amber-200/50 flex items-center px-3">
          <span className="text-[8px] text-amber-500/80 font-bold uppercase tracking-widest">Wall Elevation Zone</span>
        </div>
        <div className="absolute bottom-6 left-0 right-0 h-32 bg-indigo-50/10 border-t border-dashed border-indigo-200/40 flex items-end px-3 pb-1">
          <span className="text-[8px] text-indigo-500/70 font-bold uppercase tracking-widest">Base Ground Zone</span>
        </div>

        {cabinets.map((cab) => {
          const isActive = cab.id === activeCabinetId;
          const isWall = cab.category === 'WALL_UNIT';
          const leftPx = cab.positionX / SCALE;
          const widthPx = cab.width / SCALE;

          const activeStyle = isActive 
            ? 'border-indigo-600 bg-indigo-50/20 ring-1 ring-indigo-500 text-indigo-700 font-bold z-10'
            : isWall 
              ? 'border-amber-200 bg-amber-50/40 text-amber-800' 
              : 'border-slate-200 bg-slate-50/70 text-slate-700';

          return (
            <div
              key={cab.id}
              onPointerDown={(e) => handlePointerDown(e, cab.id, cab.positionX)}
              onPointerUp={handlePointerUp}
              className={`absolute rounded-lg flex flex-col items-center justify-center p-2 border text-center cursor-ew-resize select-none transition-shadow ${activeStyle}`}
              style={{
                left: `${leftPx}px`,
                width: `${widthPx}px`,
                top: isWall ? '24px' : 'auto',
                bottom: '24px',
                height: isWall ? '96px' : '128px'
              }}
            >
              <span className="text-xs tracking-tight truncate max-w-full font-sans font-medium px-0.5">{cab.name}</span>
              <span className="text-[9px] font-mono opacity-60 mt-0.5">{cab.width} mm</span>
            </div>
          );
        })}
      </div>

    </div>
  );
}
