// src/components/Kitchen3DCanvas.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { OrbitControls, Center } from '@react-three/drei';
import * as THREE from 'three';
import CabinetAssembly3D from './CabinetAssembly3D';
import WallCabinetAssembly3D from './WallCabinetAssembly3D';
import { CabinetObject, AdvancedHardwareSettings, InjectedWoodMaterial, InjectedHardwareItem, WallSide } from '../types/flatma';
import { cornerClearanceMm, nextPositionX } from '../math/layout';
import { textureCatalog } from '../data/textureCatalog';
import type { TextureEntry } from '../data/textureCatalog';
import { onlineTextureCatalog, makeOnlineTextureEntry } from '../data/onlineTextures';
import { LAYOUT } from '../math/constants';
import { computeCountertopOutline } from '../math/countertop';
import { HobProp, Room3D, SinkProp, marbleTexture } from './Room3D';

interface Kitchen3DCanvasProps {
  cabinets: CabinetObject[];
  hardware: AdvancedHardwareSettings;
  showFronts: boolean;
  isXRayMode: boolean;
  countertopPath: { x: number; zOffset: number }[];
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  /** An empty texturePath means "back to the stock material". */
  onApplyTextureOverride: (cabinetId: string, texturePath: string, finishType: string, applyToAll: boolean) => void;
  onDeleteCabinet: (cabinetId: string) => void;
  onUpdateCabinet: (cabinetId: string, fields: Partial<CabinetObject>) => void;
}

export default function Kitchen3DCanvas({
  cabinets: cabinetsProp,
  hardware,
  showFronts,
  isXRayMode,
  countertopPath,
  woodPanels,
  hardwareItems,
  onApplyTextureOverride,
  onDeleteCabinet,
  onUpdateCabinet
}: Kitchen3DCanvasProps) {

  const [openProgress, setOpenProgress] = useState<number>(0);

  // ---- mouse drag of a unit along / between walls. While dragging, the unit is shown at its provisional place and
  // the change is committed once on pointer-up.
  const [drag, setDrag] = useState<{ id: string; grab: number | null; wall: WallSide; positionX: number; moved: boolean } | null>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  const sceneRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<{ enabled: boolean } | null>(null);
  const cabinets = useMemo(
    () => (drag && drag.moved ? cabinetsProp.map(c => (c.id === drag.id ? { ...c, wall: drag.wall, positionX: drag.positionX } : c)) : cabinetsProp),
    [cabinetsProp, drag]
  );
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState<boolean>(false);
  const [activeSource, setActiveSource] = useState<'local' | 'online'>('local');
  const [customOnline, setCustomOnline] = useState<TextureEntry[]>([]);
  const [urlInput, setUrlInput] = useState<string>('');
  const [urlError, setUrlError] = useState<string>('');

  // Colour strip: arrows to scroll it (touch swipe and the mouse wheel also work). Arrows hide at either end.
  const stripRef = useRef<HTMLDivElement>(null);
  const [canScrollPrev, setCanScrollPrev] = useState<boolean>(false);
  const [canScrollNext, setCanScrollNext] = useState<boolean>(false);
  const updateStripArrows = useCallback(() => {
    const el = stripRef.current;
    if (!el) return;
    setCanScrollPrev(el.scrollLeft > 4);
    setCanScrollNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);
  const scrollStrip = (direction: -1 | 1) => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: direction * Math.max(120, el.clientWidth * 0.8), behavior: 'smooth' });
  };

  // A cabinet deleted from anywhere (list, undo…) simply closes the panel.
  const selectedCabinet = useMemo(() => cabinets.find(c => c.id === selectedCabinetId) ?? null, [cabinets, selectedCabinetId]);

  // Local library: generated from the files that really exist in /public/textures (scripts/build-texture-manifest.mjs).
  // Online library: src/data/onlineTextures.ts + links pasted during this session.
  const onlineCollection = useMemo(() => [...onlineTextureCatalog, ...customOnline], [customOnline]);
  const activeCollection = activeSource === 'local' ? textureCatalog : onlineCollection;

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    updateStripArrows();
    const raf = requestAnimationFrame(updateStripArrows); // after the tiles are laid out
    window.addEventListener('resize', updateStripArrows);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', updateStripArrows); };
  }, [activeCollection, selectedCabinetId, activeSource, updateStripArrows]);

  const addOnlineTexture = () => {
    const entry = makeOnlineTextureEntry(urlInput);
    if (!entry) {
      setUrlError('رابط غير صالح: يجب أن يبدأ بـ https:// وأن ينتهي باسم صورة (.jpg .jpeg .png .webp)');
      return;
    }
    setCustomOnline(prev => (prev.some(t => t.path === entry.path) ? prev : [...prev, entry]));
    setUrlInput('');
    setUrlError('');
  };

  // Floor units that carry the worktop (tall / pantry units do not).
  const counterCabinets = useMemo(
    () => cabinets.filter(c => c.category === 'BASE_UNIT' && c.height <= LAYOUT.COUNTERTOP_MAX_UNIT_HEIGHT_MM),
    [cabinets]
  );
  const baseHeightMm = useMemo(
    () => (counterCabinets.length > 0 ? Math.max(...counterCabinets.map(c => c.height)) : LAYOUT.DEFAULT_BASE_HEIGHT_MM),
    [counterCabinets]
  );
  // ---- room / walls: units can stand against the BACK, LEFT or RIGHT wall (L and U layouts)
  const wallOf = (c: CabinetObject): WallSide => c.wall ?? 'BACK';
  const hasLeft = cabinets.some(c => wallOf(c) === 'LEFT');
  const hasRight = cabinets.some(c => wallOf(c) === 'RIGHT');
  const backEndMm = useMemo(() => {
    const back = cabinets.filter(c => wallOf(c) === 'BACK');
    return back.length > 0 ? Math.max(...back.map(c => c.positionX + c.width)) : 1200;
  }, [cabinets]); // eslint-disable-line react-hooks/exhaustive-deps
  const [roomWidthInput, setRoomWidthInput] = useState<number | null>(null);
  const roomWmm = hasRight ? Math.max(roomWidthInput ?? backEndMm, backEndMm) : backEndMm; // x of the right wall
  const sideEndMm = Math.max(0, ...cabinets.filter(c => wallOf(c) !== 'BACK').map(c => c.positionX + c.width));
  const roomDepthM = Math.max(2.6, sideEndMm / 1000 + 0.4);
  const sceneWidthMeters = roomWmm / 1000;

  /** Group transform of a unit: LEFT/RIGHT units are turned so that their front faces the room. */
  const placementOf = (c: CabinetObject, elev: number): { pos: [number, number, number]; rotY: number } => {
    const back = -c.positionZ, mid = back + c.depth / 2;
    if (wallOf(c) === 'LEFT') return { pos: [mid / 1000, elev, (c.positionX + c.width) / 1000], rotY: Math.PI / 2 };
    if (wallOf(c) === 'RIGHT') return { pos: [(roomWmm - mid) / 1000, elev, c.positionX / 1000], rotY: -Math.PI / 2 };
    return { pos: [c.positionX / 1000, elev, mid / 1000], rotY: 0 };
  };
  /** World (x, z) of the middle of a unit's footprint, metres. */
  const centreOf = (c: CabinetObject): [number, number] => {
    const mid = -c.positionZ + c.depth / 2, along = c.positionX + c.width / 2;
    if (wallOf(c) === 'LEFT') return [mid / 1000, along / 1000];
    if (wallOf(c) === 'RIGHT') return [(roomWmm - mid) / 1000, along / 1000];
    return [along / 1000, mid / 1000];
  };
  const rotOf = (c: CabinetObject) => (wallOf(c) === 'LEFT' ? Math.PI / 2 : wallOf(c) === 'RIGHT' ? -Math.PI / 2 : 0);


  const [marble, setMarble] = useState(true);
  const marbleTex = useMemo(() => marbleTexture(), []);
  useEffect(() => () => marbleTex.dispose(), [marbleTex]);
  const sinkCabinets = useMemo(() => counterCabinets.filter(c => c.subtype === 'Pull_Out_Sink'), [counterCabinets]);
  const hobCabinets = useMemo(() => counterCabinets.filter(c => c.subtype === 'Cooktop_Base'), [counterCabinets]);

  // One horizontal slab per wall. The back slab keeps the jogs of countertopPath; side slabs are plain rectangles
  // that start after the back slab so the corner is not covered twice.
  const worktops = useMemo(() => {
    const T = LAYOUT.COUNTERTOP_THICKNESS_MM / 1000, OV = LAYOUT.COUNTERTOP_FRONT_OVERHANG_MM;
    const extrude = (shape: THREE.Shape) => { const g = new THREE.ExtrudeGeometry(shape, { depth: T, bevelEnabled: false }); g.rotateX(-Math.PI / 2); return g; };
    const holeRect = (cx: number, cz: number, hx: number, hz: number) => {
      const h = new THREE.Path();
      h.moveTo(cx - hx, -(cz - hz)); h.lineTo(cx + hx, -(cz - hz)); h.lineTo(cx + hx, -(cz + hz)); h.lineTo(cx - hx, -(cz + hz)); h.closePath();
      return h;
    };
    const list: THREE.BufferGeometry[] = [];
    let backFront = 0;
    const back = counterCabinets.filter(c => wallOf(c) === 'BACK');
    if (back.length > 0) {
      const xStart = Math.min(...back.map(c => c.positionX));
      const xEnd = Math.max(...back.map(c => c.positionX + c.width));
      const zBack = Math.min(...back.map(c => -c.positionZ));
      const zFront = Math.max(...back.map(c => c.depth + c.frontThickness - c.positionZ)) + OV;
      backFront = zFront;
      const outline = computeCountertopOutline(countertopPath, xStart, xEnd, zBack, zFront);
      if (outline.length >= 3) {
        const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x / 1000, -z / 1000)));
        sinkCabinets.filter(c => wallOf(c) === 'BACK').forEach((c) => { const [cx, cz] = centreOf(c); shape.holes.push(holeRect(cx, cz, 0.35, 0.2)); });
        list.push(extrude(shape));
      }
    }
    (['LEFT', 'RIGHT'] as const).forEach((side) => {
      const cs = counterCabinets.filter(c => wallOf(c) === side);
      if (cs.length === 0) return;
      const zA = Math.max(Math.min(...cs.map(c => c.positionX)), backFront);
      const zB = Math.max(...cs.map(c => c.positionX + c.width));
      if (zB <= zA) return;
      const dBack = Math.min(...cs.map(c => -c.positionZ));
      const dFront = Math.max(...cs.map(c => c.depth + c.frontThickness - c.positionZ)) + OV;
      const xa = side === 'LEFT' ? dBack : roomWmm - dFront;
      const xb = side === 'LEFT' ? dFront : roomWmm - dBack;
      const shape = new THREE.Shape([[xa, zA], [xb, zA], [xb, zB], [xa, zB]].map(([x, z]) => new THREE.Vector2(x / 1000, -z / 1000)));
      sinkCabinets.filter(c => wallOf(c) === side).forEach((c) => { const [cx, cz] = centreOf(c); shape.holes.push(holeRect(cx, cz, 0.2, 0.35)); });
      list.push(extrude(shape));
    });
    return list;
  }, [counterCabinets, countertopPath, sinkCabinets, roomWmm]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => () => { worktops.forEach(g => g.dispose()); }, [worktops]);

  const snapAlong = (c: CabinetObject, wall: WallSide, px: number) => {
    const start = wall === 'BACK' ? 0 : cornerClearanceMm(cabinetsProp);
    const cands = [start];
    cabinetsProp.forEach(o => { if (o.id !== c.id && wallOf(o) === wall && o.category === c.category) cands.push(o.positionX + o.width, o.positionX - c.width); });
    let best = Math.round(px / 10) * 10, bd = 60; // snap to a neighbour's edge within 6 cm, else to 1 cm
    cands.forEach(v => { if (v >= 0 && Math.abs(v - px) < bd) { bd = Math.abs(v - px); best = v; } });
    return Math.max(0, best);
  };
  const onDragMove = (e: ThreeEvent<PointerEvent>) => {
    const d = dragRef.current, g = sceneRef.current;
    if (!d || !g) return;
    const c = cabinetsProp.find(o => o.id === d.id);
    if (!c) return;
    const p = g.worldToLocal(e.point.clone());
    const dist: Record<WallSide, number> = { BACK: p.z, LEFT: p.x, RIGHT: roomWmm / 1000 - p.x };
    let wall = d.wall;
    (['BACK', 'LEFT', 'RIGHT'] as WallSide[]).forEach(w => { if (dist[w] < dist[wall] - 0.25) wall = w; }); // 25 cm hysteresis
    const along = (wall === 'BACK' ? p.x : p.z) * 1000;
    let grab = d.grab;
    if (grab === null) grab = wall === wallOf(c) ? along - c.positionX : c.width / 2;
    else if (wall !== d.wall) grab = c.width / 2;
    const px = snapAlong(c, wall, along - grab);
    if (px === d.positionX && wall === d.wall && grab === d.grab) return;
    setDrag({ ...d, grab, wall, positionX: px, moved: d.moved || wall !== wallOf(c) || px !== c.positionX });
  };
  const endDrag = useCallback(() => {
    const d = dragRef.current;
    if (controlsRef.current) controlsRef.current.enabled = true;
    if (d && d.moved) onUpdateCabinet(d.id, { wall: d.wall, positionX: d.positionX });
    setDrag(null);
  }, [onUpdateCabinet]);
  const dragging = drag !== null;
  useEffect(() => {
    if (!dragging) return;
    window.addEventListener('pointerup', endDrag);
    window.addEventListener('pointercancel', endDrag);
    return () => { window.removeEventListener('pointerup', endDrag); window.removeEventListener('pointercancel', endDrag); };
  }, [dragging, endDrag]);

  /** Panel actions for the selected unit. */
  const nudge = (c: CabinetObject, d: number) => onUpdateCabinet(c.id, { positionX: Math.max(0, c.positionX + d) });
  const snapToPrevious = (c: CabinetObject) => {
    const start = wallOf(c) === 'BACK' ? 0 : cornerClearanceMm(cabinets);
    const end = cabinets
      .filter(o => o.id !== c.id && wallOf(o) === wallOf(c) && o.category === c.category && o.positionX + o.width <= c.positionX + 1)
      .reduce((m, o) => Math.max(m, o.positionX + o.width), start);
    onUpdateCabinet(c.id, { positionX: end });
  };

  // Wall units hang above the worktop (its thickness included), whatever the real base height is.
  const wallElevationMeters = (baseHeightMm + LAYOUT.COUNTERTOP_THICKNESS_MM + hardware.wallSplashHeight) / 1000;

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

      <button type="button" onClick={() => setMarble(v => !v)} className="absolute top-3 right-3 z-30 bg-white/80 backdrop-blur border border-[#E5E5E5] px-3 py-1.5 rounded-xl text-[10px] font-bold text-slate-700 hover:border-indigo-600">
        {marble ? '◼ سطح العمل: رخام أسود' : '◻ سطح العمل: أبيض'}
      </button>

      <div className="absolute top-12 right-3 z-30 text-[10px] font-bold text-slate-500 bg-white/70 rounded-lg px-2 py-1 pointer-events-none">اسحب أي خزانة لتحريكها · Shift + سحب لتدوير الكاميرا</div>

      {/* 🧊 Three.js Spatial Layer Viewport */}
      <div className="flex-1 w-full h-full relative">
        <Canvas camera={{ position: [sceneWidthMeters / 2, 1.0, 4.4], fov: 40 }} shadows gl={{ antialias: true }} className="w-full h-full absolute inset-0">
          <color attach="background" args={['#E9EBEE']} />
          <ambientLight intensity={0.35} />
          <directionalLight position={[sceneWidthMeters / 2, 5, 3]} intensity={1.0} castShadow shadow-bias={-0.00005} shadow-mapSize={[2048, 2048]} />

          <Center>
            <group ref={sceneRef}>
            {drag && (
              <mesh rotation={[-Math.PI / 2, 0, 0]} position={[roomWmm / 2000, 0.001, roomDepthM / 2]} onPointerMove={onDragMove} onPointerUp={endDrag}>
                <planeGeometry args={[30, 30]} />
                <meshBasicMaterial transparent opacity={0} depthWrite={false} />
              </mesh>
            )}
              <Room3D x0={hasLeft ? 0 : -0.8} x1={hasRight ? roomWmm / 1000 : backEndMm / 1000 + 0.8} depthM={roomDepthM} windowCenterX={sinkCabinets.find(c => wallOf(c) === 'BACK') ? centreOf(sinkCabinets.find(c => wallOf(c) === 'BACK')!)[0] : undefined} />
              {cabinets.map((cabinet) => {
                const isWallNode = cabinet.category === 'WALL_UNIT';
                const verticalYOffset = isWallNode ? wallElevationMeters : 0;
                // Back planes are flush against the wall (z = 0): a 350 mm wall unit and a 600 mm base unit share
                // the same back, instead of both being centred on z = 0 (which floated wall units off the wall).
                const place = placementOf(cabinet, verticalYOffset);

                return (
                  <group
                    key={cabinet.id}
                    position={place.pos}
                    rotation={[0, place.rotY, 0]}
                    onPointerDown={(e) => {
                      if (e.button !== 0 || e.shiftKey) return; // Shift + drag keeps rotating the camera
                      e.stopPropagation();
                      setSelectedCabinetId(cabinet.id);
                      if (controlsRef.current) controlsRef.current.enabled = false;
                      setDrag({ id: cabinet.id, grab: null, wall: wallOf(cabinet), positionX: cabinet.positionX, moved: false });
                    }}
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

              {/* Countertop slabs (one per wall) */}
              {worktops.map((g, i) => (
                <mesh key={`wt-${i}`} geometry={g} position={[0, baseHeightMm / 1000, 0]} castShadow receiveShadow>
                  <meshPhysicalMaterial color={marble ? '#FFFFFF' : '#F4F4F2'} map={marble ? marbleTex : null} roughness={marble ? 0.12 : 0.2} metalness={0} clearcoat={marble ? 0.7 : 0} clearcoatRoughness={0.1} transparent={isXRayMode} opacity={isXRayMode ? 0.35 : 1.0} />
                </mesh>
              ))}
              {sinkCabinets.map((c) => { const [cx, cz] = centreOf(c); return <SinkProp key={`sink-${c.id}`} rotationY={rotOf(c)} position={[cx, baseHeightMm / 1000 + LAYOUT.COUNTERTOP_THICKNESS_MM / 1000, cz]} />; })}
              {hobCabinets.map((c) => { const [cx, cz] = centreOf(c); return <HobProp key={`hob-${c.id}`} rotationY={rotOf(c)} position={[cx, baseHeightMm / 1000 + LAYOUT.COUNTERTOP_THICKNESS_MM / 1000, cz]} />; })}
            </group>
          </Center>

          <OrbitControls ref={controlsRef as never} makeDefault enableDamping dampingFactor={0.05} maxPolarAngle={Math.PI / 2} minDistance={0.4} maxDistance={8.0} />
        </Canvas>
      </div>

      {/* 🚀 MINIMALIST GLASSMORPHISM CAROUSEL SYSTEM (Sleek Aesthetic Overlay) */}
      {selectedCabinet && (
        <div className="absolute bottom-4 left-4 right-4 z-40 bg-white/70 backdrop-blur-xl border border-white/40 p-3.5 rounded-2xl shadow-xl flex flex-col space-y-2.5 animate-fade-in">

          {/* Placement: wall + position along the wall (L / U layouts) */}
          <div className="flex flex-wrap items-center gap-1.5 text-[10px] font-bold text-slate-600 border-b border-slate-200/40 pb-2">
            <span>الجدار:</span>
            {([['LEFT', 'يسار'], ['BACK', 'خلف'], ['RIGHT', 'يمين']] as const).map(([w, l]) => (
              <button key={w} type="button"
                onClick={() => onUpdateCabinet(selectedCabinet.id, { wall: w, positionX: nextPositionX(cabinets.filter(o => o.id !== selectedCabinet.id), selectedCabinet.category, w) })}
                className={`px-2 py-0.5 rounded border cursor-pointer ${wallOf(selectedCabinet) === w ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white border-slate-300'}`}>{l}</button>
            ))}
            <span className="mr-2">الموضع (مم):</span>
            <button type="button" onClick={() => nudge(selectedCabinet, -100)} className="px-1.5 border border-slate-300 rounded bg-white cursor-pointer">−10</button>
            <input type="number" step={10} value={Math.round(selectedCabinet.positionX)} onChange={(e) => onUpdateCabinet(selectedCabinet.id, { positionX: Math.max(0, Number(e.target.value) || 0) })} className="w-16 border border-slate-300 rounded px-1 py-0.5 text-[10px]" />
            <button type="button" onClick={() => nudge(selectedCabinet, 100)} className="px-1.5 border border-slate-300 rounded bg-white cursor-pointer">+10</button>
            <button type="button" onClick={() => snapToPrevious(selectedCabinet)} className="px-2 py-0.5 border border-slate-300 rounded bg-white cursor-pointer">🧲 التصاق بالسابق</button>
            {hasRight && (
              <>
                <span className="mr-2">عرض الغرفة (مم):</span>
                <input type="number" step={100} value={Math.round(roomWmm)} onChange={(e) => setRoomWidthInput(Math.max(0, Number(e.target.value) || 0))} className="w-16 border border-slate-300 rounded px-1 py-0.5 text-[10px]" />
              </>
            )}
          </div>

          {/* Header: which cabinet, texture scope, delete, close */}
          <div className="flex justify-between items-center border-b border-slate-200/40 pb-2 gap-3">
            <div className="flex items-center gap-4 min-w-0">
              <span className="text-[11px] font-bold text-slate-800 truncate max-w-[180px]" title={selectedCabinet.name}>{selectedCabinet.name}</span>
              <button
                type="button"
                onClick={() => setActiveSource('local')}
                className={`flex items-center space-x-1.5 pb-1 text-[11px] font-sans font-bold tracking-tight uppercase cursor-pointer whitespace-nowrap border-b-2 transition-all ${activeSource === 'local' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                <span>📂</span> <span>Workshop Matrix ({textureCatalog.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveSource('online')}
                className={`flex items-center space-x-1.5 pb-1 text-[11px] font-sans font-bold tracking-tight uppercase cursor-pointer whitespace-nowrap border-b-2 transition-all ${activeSource === 'online' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
              >
                <span>🌐</span> <span>Workshop Matrix Online ({onlineCollection.length})</span>
              </button>
              <label className="flex items-center gap-1 text-[10px] text-slate-600 cursor-pointer whitespace-nowrap">
                <input type="checkbox" checked={applyToAll} onChange={(e) => setApplyToAll(e.target.checked)} />
                <span>تطبيق على كل الخزائن</span>
              </label>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm(`حذف الخزانة «${selectedCabinet.name}» نهائياً؟`)) {
                    onDeleteCabinet(selectedCabinet.id);
                    setSelectedCabinetId(null);
                  }
                }}
                className="px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] font-bold cursor-pointer"
              >
                🗑 حذف الخزانة
              </button>
              <button type="button" onClick={() => setSelectedCabinetId(null)} className="w-5 h-5 rounded-full bg-slate-200/50 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-[9px] transition-colors cursor-pointer">✕</button>
            </div>
          </div>

          {/* Online tab: paste an https image link to try it immediately */}
          {activeSource === 'online' && (
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlError(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') addOnlineTexture(); }}
                  placeholder="https://.../texture.jpg"
                  dir="ltr"
                  className="flex-1 min-w-0 border border-slate-300 rounded-md px-2 py-1 text-[11px] font-mono bg-white/80 focus:outline-none focus:border-indigo-500"
                />
                <button type="button" onClick={addOnlineTexture} className="px-3 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold cursor-pointer whitespace-nowrap">➕ إضافة</button>
              </div>
              {urlError && <span className="text-[10px] text-red-600">{urlError}</span>}
              {onlineCollection.length === 0 && !urlError && (
                <span className="text-[10px] text-slate-500">لا توجد خامات أونلاين بعد: الصق رابط صورة https أعلاه، أو أضف روابط دائمة في src/data/onlineTextures.ts</span>
              )}
            </div>
          )}

          {/* Endless Fluid Micro-interaction Horizontal Strip Panel */}
          <div className="flex items-center gap-2" dir="ltr">
          <button
            type="button"
            aria-label="الألوان السابقة"
            onClick={() => scrollStrip(-1)}
            disabled={!canScrollPrev}
            className={`flex-shrink-0 w-8 h-14 rounded-xl border border-slate-200 bg-white/80 hover:bg-white text-slate-700 text-xl font-bold flex items-center justify-center shadow-sm transition-opacity ${canScrollPrev ? 'cursor-pointer opacity-100' : 'opacity-30 cursor-default'}`}
          >
            ‹
          </button>
          <div
            ref={stripRef}
            onScroll={updateStripArrows}
            onWheel={(e) => { const el = stripRef.current; if (el && Math.abs(e.deltaY) > Math.abs(e.deltaX)) el.scrollLeft += e.deltaY; }}
            style={{ touchAction: 'pan-x' }}
            className="flex flex-1 min-w-0 space-x-3 overflow-x-auto py-1 scrollbar-none snap-x">
            {/* First tile: back to the stock material */}
            <div
              onClick={() => onApplyTextureOverride(selectedCabinet.id, '', '', applyToAll)}
              title="إزالة الخامة المختارة والعودة لخامة المخزن"
              className={`flex-shrink-0 w-14 h-14 rounded-xl border flex items-center justify-center text-lg cursor-pointer hover:border-indigo-600 hover:scale-105 active:scale-95 transition-all bg-white/60 snap-center ${selectedCabinet.frontTextureOverride ? 'border-slate-300' : 'border-indigo-600'}`}
            >
              ↺
            </div>
            {activeCollection.map((tex) => (
              <div
                key={tex.id}
                onClick={() => onApplyTextureOverride(selectedCabinet.id, tex.path, tex.finish, applyToAll)}
                className={`flex-shrink-0 w-14 h-14 rounded-xl border overflow-hidden cursor-pointer hover:border-indigo-600 hover:scale-105 active:scale-95 transition-all bg-white/40 shadow-3xs relative group snap-center ${selectedCabinet.frontTextureOverride?.path === tex.path ? 'border-indigo-600 ring-2 ring-indigo-300' : 'border-slate-200/60'}`}
              >
                <img
                  src={tex.path}
                  alt={tex.name}
                  title={tex.name}
                  loading="lazy"
                  crossOrigin={activeSource === 'online' ? 'anonymous' : undefined}
                  referrerPolicy="no-referrer"
                  decoding="async"
                  onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-indigo-900/10 opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            ))}
          </div>
          <button
            type="button"
            aria-label="ألوان أخرى"
            onClick={() => scrollStrip(1)}
            disabled={!canScrollNext}
            className={`flex-shrink-0 w-8 h-14 rounded-xl border border-slate-200 bg-white/80 hover:bg-white text-slate-700 text-xl font-bold flex items-center justify-center shadow-sm transition-opacity ${canScrollNext ? 'cursor-pointer opacity-100' : 'opacity-30 cursor-default'}`}
          >
            ›
          </button>
          </div>
        </div>
      )}

    </div>
  );
}
