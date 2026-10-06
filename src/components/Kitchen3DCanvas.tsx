// src/components/Kitchen3DCanvas.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Center } from '@react-three/drei';
import * as THREE from 'three';
import CabinetAssembly3D from './CabinetAssembly3D';
import WallCabinetAssembly3D from './WallCabinetAssembly3D';
import RoomEnvironment3D from './RoomEnvironment3D';
import { CabinetObject, AdvancedHardwareSettings, InjectedWoodMaterial, InjectedHardwareItem, ResolvedRoom, WallSegment } from '../types/flatma';
import { textureCatalog } from '../data/textureCatalog';
import type { TextureEntry } from '../data/textureCatalog';
import { onlineTextureCatalog, makeOnlineTextureEntry } from '../data/onlineTextures';
import { LAYOUT } from '../math/constants';
import { computeCountertopOutline } from '../math/countertop';
import { wallLocalToWorld } from '../engine/wallGeometry';

const LEGACY_WALL_ID = 'legacy-wall-0';

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
  /** Resolved multi-wall room (optional). When absent, a single legacy straight wall is synthesized. */
  room?: ResolvedRoom;
  /** Toggles visibility of the translucent room walls/floor. Defaults to true; irrelevant until `room` is set. */
  showRoomEnvironment?: boolean;
}

export default function Kitchen3DCanvas({
  cabinets,
  hardware,
  showFronts,
  isXRayMode,
  countertopPath,
  woodPanels,
  hardwareItems,
  onApplyTextureOverride,
  onDeleteCabinet,
  room,
  showRoomEnvironment = true
}: Kitchen3DCanvasProps) {

  const [openProgress, setOpenProgress] = useState<number>(0);
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
  const maxBoundaryXMm = useMemo(() => cabinets.length > 0 ? Math.max(...cabinets.map(c => c.positionX + c.width)) : 1200, [cabinets]);
  const sceneWidthMeters = maxBoundaryXMm / 1000;

  // Multi-wall layout engine: use the resolved room's walls when available, otherwise fall back to a single
  // synthetic straight wall that reproduces the legacy (pre-wall-engine) single-wall behaviour exactly.
  const effectiveWalls: WallSegment[] = useMemo(() => {
    if (room && room.walls.length > 0) return room.walls;
    return [{
      id: LEGACY_WALL_ID,
      index: 0,
      startPoint: { x: 0, z: 0 },
      endPoint: { x: maxBoundaryXMm, z: 0 },
      angleDeg: 0,
      length: maxBoundaryXMm
    }];
  }, [room, maxBoundaryXMm]);

  // Resolves a cabinet's wall-local placement (new wallId/positionOnWall/depthIntoRoom fields when present,
  // with the legacy positionX/positionY/positionZ fields as fallback/cache) into a world-space transform.
  const resolveCabinetTransform = useCallback((cabinet: CabinetObject) => {
    const wallId = (cabinet.wallId && effectiveWalls.some(w => w.id === cabinet.wallId))
      ? cabinet.wallId
      : effectiveWalls[0].id;
    const wallSeg = effectiveWalls.find(w => w.id === wallId) ?? effectiveWalls[0];
    const posOnWall = cabinet.positionOnWall ?? cabinet.positionX;
    const depthIntoRoomMm = cabinet.depthIntoRoom ?? (cabinet.depth / 2 - cabinet.positionZ);
    return wallLocalToWorld(wallSeg, posOnWall, depthIntoRoomMm);
  }, [effectiveWalls]);

  // Horizontal worktop. The old shape was built in the XY plane and extruded along Z (a thin VERTICAL slab),
  // offset by half the scene width, at a hard-coded 720 mm height.
  const countertopGeometry = useMemo(() => {
    if (counterCabinets.length === 0) return null;
    const xStart = Math.min(...counterCabinets.map(c => c.positionX));
    const xEnd = Math.max(...counterCabinets.map(c => c.positionX + c.width));
    const zBack = Math.min(...counterCabinets.map(c => -c.positionZ));
    const zFront = Math.max(...counterCabinets.map(c => c.depth + c.frontThickness - c.positionZ)) + LAYOUT.COUNTERTOP_FRONT_OVERHANG_MM;
    const outline = computeCountertopOutline(countertopPath, xStart, xEnd, zBack, zFront);
    if (outline.length < 3) return null;
    const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x / 1000, -z / 1000)));
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: LAYOUT.COUNTERTOP_THICKNESS_MM / 1000, bevelEnabled: false });
    geometry.rotateX(-Math.PI / 2); // (x, -z) extruded along +Z  ->  (x, up, z)
    return geometry;
  }, [counterCabinets, countertopPath]);

  useEffect(() => () => { countertopGeometry?.dispose(); }, [countertopGeometry]);

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

      {/* 🧊 Three.js Spatial Layer Viewport */}
      <div className="flex-1 w-full h-full relative">
        <Canvas camera={{ position: [sceneWidthMeters / 2, 1.2, 2.5], fov: 40 }} shadows gl={{ antialias: true }} className="w-full h-full absolute inset-0">
          <ambientLight intensity={0.65} />
          <directionalLight position={[sceneWidthMeters / 2, 5, 3]} intensity={0.85} castShadow shadow-bias={-0.00005} />

          <Center>
            <group>
              {cabinets.map((cabinet) => {
                const isWallNode = cabinet.category === 'WALL_UNIT';
                const verticalYOffset = isWallNode ? wallElevationMeters : 0;
                // Wall-aware transform: resolves wallId/positionOnWall/depthIntoRoom (or the legacy
                // positionX/positionY/positionZ fallback) into a world-space x/z/rotationY via the wall engine.
                const transform = resolveCabinetTransform(cabinet);

                return (
                  <group
                    key={cabinet.id}
                    position={[transform.x / 1000, verticalYOffset, transform.z / 1000]}
                    rotation={[0, THREE.MathUtils.degToRad(transform.rotationYDeg), 0]}
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
              {countertopGeometry && (
                <mesh geometry={countertopGeometry} position={[0, baseHeightMm / 1000, 0]} castShadow receiveShadow>
                  <meshStandardMaterial color="#FFFFFF" roughness={0.2} metalness={0.0} transparent={isXRayMode} opacity={isXRayMode ? 0.35 : 1.0} />
                </mesh>
              )}

              {/* 🏠 Room Environment: translucent walls + floor derived from the resolved room shape.
                  Returns null entirely (no visual effect) when no room has been defined yet or the toggle is off. */}
              <RoomEnvironment3D walls={effectiveWalls} visible={!!room && showRoomEnvironment} />
            </group>
          </Center>

          <OrbitControls makeDefault enableDamping dampingFactor={0.05} maxPolarAngle={Math.PI / 2} minDistance={0.4} maxDistance={8.0} />
          <Grid position={[0, -0.4, 0]} args={[Math.max(12, sceneWidthMeters * 2.5), Math.max(12, sceneWidthMeters * 2.5)]} cellSize={0.1} cellThickness={0.4} cellColor="#E5E5E5" sectionSize={0.5} sectionColor="#D4D4D4" />
        </Canvas>
      </div>

      {/* 🚀 MINIMALIST GLASSMORPHISM CAROUSEL SYSTEM (Sleek Aesthetic Overlay) */}
      {selectedCabinet && (
        <div className="absolute bottom-4 left-4 right-4 z-40 bg-white/70 backdrop-blur-xl border border-white/40 p-3.5 rounded-2xl shadow-xl flex flex-col space-y-2.5 animate-fade-in">

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