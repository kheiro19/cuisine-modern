// src/components/Kitchen3DCanvas.tsx
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Grid, Center } from '@react-three/drei';
import * as THREE from 'three';
import CabinetAssembly3D from './CabinetAssembly3D';
import AccessoryLayer from './AccessoryLayer';
import OnlineTextureBrowser from './OnlineTextureBrowser';
import type { PlacedAccessory } from '../math/accessoryPlacement';
import WallCabinetAssembly3D from './WallCabinetAssembly3D';
import { CabinetObject, AdvancedHardwareSettings, InjectedWoodMaterial, InjectedHardwareItem, RunId } from '../types/flatma';
import { KitchenLayout, DEFAULT_LAYOUT, alongToFrame, runFrame, runOf, runsOf, toFrame } from '../math/kitchenLayout';
import { textureCatalog } from '../data/textureCatalog';
import type { TextureEntry } from '../data/textureCatalog';
import { onlineTextureCatalog, makeOnlineTextureEntry } from '../data/onlineTextures';
import { LAYOUT } from '../math/constants';
import { computeCountertopOutline, carriesCountertop, countertopDepthMm, COUNTERTOP_DEFAULT } from '../math/countertop';
import { DEFAULT_PALETTE, gridColoursOf } from '../math/palette';
import type { CountertopSettings } from '../math/countertop';

interface Kitchen3DCanvasProps {
  cabinets: CabinetObject[];
  hardware: AdvancedHardwareSettings;
  showFronts: boolean;
  isXRayMode: boolean;
  countertopPath: { x: number; zOffset: number }[];
  /** The worktop slab: shown or hidden, thickness and depth typed by the user (never priced). */
  countertop?: CountertopSettings;
  /** Straight, L or U: where each wall is (math/kitchenLayout.ts). Missing = a straight kitchen. */
  layout?: KitchenLayout;
  woodPanels: InjectedWoodMaterial[];
  hardwareItems: InjectedHardwareItem[];
  /** Pieces added from the accessories library (sockets, sinks, hobs, organisers...). */
  accessories?: PlacedAccessory[];
  /** An empty texturePath means "back to the stock material". */
  onApplyTextureOverride: (cabinetId: string, texturePath: string, finishType: string, applyToAll: boolean) => void;
  onDeleteCabinet: (cabinetId: string) => void;
}

/** The room behind the kitchen: the colour and the two grid tones derived from it (math/palette.ts). */
const ROOM = { ...DEFAULT_PALETTE.background, grid: gridColoursOf(DEFAULT_PALETTE.background.color) };

export default function Kitchen3DCanvas({
  cabinets,
  hardware,
  showFronts,
  isXRayMode,
  countertopPath,
  countertop = COUNTERTOP_DEFAULT,
  layout = DEFAULT_LAYOUT,
  woodPanels,
  hardwareItems,
  accessories = [],
  onApplyTextureOverride,
  onDeleteCabinet
}: Kitchen3DCanvasProps) {

  const [openProgress, setOpenProgress] = useState<number>(0);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState<boolean>(false);
  const [activeSource, setActiveSource] = useState<'local' | 'online'>('local');
  const [customOnline, setCustomOnline] = useState<TextureEntry[]>([]);
  const [urlInput, setUrlInput] = useState<string>('');
  const [urlError, setUrlError] = useState<string>('');
  const [browserOpen, setBrowserOpen] = useState<boolean>(false);

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
  const isCounter = (c: CabinetObject) => carriesCountertop(c);
  const counterCabinets = useMemo(() => cabinets.filter(isCounter), [cabinets]);
  const baseHeightMm = useMemo(
    () => (counterCabinets.length > 0 ? Math.max(...counterCabinets.map(c => c.height)) : LAYOUT.DEFAULT_BASE_HEIGHT_MM),
    [counterCabinets]
  );

  // Every wall that has cabinets (or that the layout uses) is drawn in its own frame: inside it the code is the one of a straight
  // kitchen (x along the wall, z away from it), and the frame turns it onto the left / right wall (math/kitchenLayout.ts).
  const runs = useMemo(() => {
    const used = new Set<RunId>(runsOf(layout));
    cabinets.forEach(c => used.add(runOf(c)));
    return (['A', 'B', 'C'] as RunId[]).filter(r => used.has(r));
  }, [cabinets, layout]);
  const framed = useMemo(() => {
    const out: Record<RunId, CabinetObject[]> = { A: [], B: [], C: [] };
    cabinets.forEach(c => { const r = runOf(c); out[r].push(toFrame(c, r)); });
    return out;
  }, [cabinets]);

  const maxBoundaryXMm = useMemo(() => {
    const alongWalls = cabinets.length > 0 ? Math.max(...cabinets.map(c => c.positionX + c.width)) : 1200;
    return layout.type === 'STRAIGHT' ? alongWalls : Math.max(alongWalls, layout.widthMm);
  }, [cabinets, layout]);
  const sceneWidthMeters = maxBoundaryXMm / 1000;

  // Horizontal worktops, one per wall. The back-wall one is the first and reaches the front of its cabinets; the side-wall ones
  // start where it ends, so the three slabs meet without overlapping (two coplanar slabs would flicker).
  const countertopGeometries = useMemo(() => {
    const out: Partial<Record<RunId, THREE.BufferGeometry>> = {};
    if (!countertop.visible) return out;
    const frontA = (() => {
      const a = framed.A.filter(isCounter);
      return a.length > 0 ? Math.max(...a.map(c => c.depth + c.frontThickness - c.positionZ)) + LAYOUT.COUNTERTOP_FRONT_OVERHANG_MM : null;
    })();
    runs.forEach((run) => {
      const list = framed[run].filter(isCounter);
      if (list.length === 0) return;
      let xStart = Math.min(...list.map(c => c.positionX));
      let xEnd = Math.max(...list.map(c => c.positionX + c.width));
      if (run === 'B' && frontA !== null) xEnd = Math.min(xEnd, -frontA);        // frame x runs towards the corner
      if (run === 'C' && frontA !== null) xStart = Math.max(xStart, frontA);     // frame x runs away from it
      if (!(xEnd - xStart > 1)) return;
      const zBack = Math.min(...list.map(c => -c.positionZ));
      const zFront = Math.max(...list.map(c => c.depth + c.frontThickness - c.positionZ)) + LAYOUT.COUNTERTOP_FRONT_OVERHANG_MM;
      // The slab the user asked for, stretched when it would stop before the front it covers.
      const { depthMm } = countertopDepthMm(countertop.depthMm, zFront - zBack);
      const outline = computeCountertopOutline(run === 'A' ? countertopPath : [], xStart, xEnd, zBack, zBack + depthMm);
      if (outline.length < 3) return;
      const shape = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x / 1000, -z / 1000)));
      const geometry = new THREE.ExtrudeGeometry(shape, { depth: countertop.thicknessMm / 1000, bevelEnabled: false });
      geometry.rotateX(-Math.PI / 2); // (x, -z) extruded along +Z  ->  (x, up, z)
      out[run] = geometry;
    });
    return out;
  }, [framed, runs, countertopPath, countertop.visible, countertop.thicknessMm, countertop.depthMm]);

  useEffect(() => () => { (Object.values(countertopGeometries) as Array<THREE.BufferGeometry | undefined>).forEach(g => g?.dispose()); }, [countertopGeometries]);

  // Accessories live on the wall of the cabinet that hosts them (or of the sink they are fixed on); the others are on the back wall.
  const accessoriesOf = useCallback((run: RunId): PlacedAccessory[] => {
    const runOfAccessory = (a: PlacedAccessory, depth = 0): RunId => {
      if (a.cabinetId) { const c = cabinets.find(x => x.id === a.cabinetId); return c ? runOf(c) : 'A'; }
      if (a.hostId && depth < 4) { const h = accessories.find(x => x.id === a.hostId); return h ? runOfAccessory(h, depth + 1) : 'A'; }
      return 'A';
    };
    return accessories
      .filter(a => runOfAccessory(a) === run)
      .map(a => (run === 'B' ? { ...a, xMm: alongToFrame(a.xMm, run), ...(a.dxMm !== undefined ? { dxMm: alongToFrame(a.dxMm, run) } : {}) } : a));
  }, [accessories, cabinets]);

  // Wall units hang above the worktop (its thickness included), whatever the real base height is.
  const wallElevationMeters = (baseHeightMm + countertop.thicknessMm + hardware.wallSplashHeight) / 1000;

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
        <Canvas camera={{ position: layout.type === 'STRAIGHT' ? [sceneWidthMeters / 2, 1.2, 2.5] : [0, 2.6, sceneWidthMeters * 0.9 + 1.5], fov: 40 }} shadows gl={{ antialias: true }} className="w-full h-full absolute inset-0">
          {/* Cold slate room: without it the canvas is transparent and the scene floats on the white panel. */}
          <color attach="background" args={[ROOM.color]} />
          <ambientLight intensity={0.65} />
          <directionalLight position={[sceneWidthMeters / 2, 5, 3]} intensity={0.85} castShadow shadow-bias={-0.00005} />

          <Center>
            <group>
              {runs.map((run) => {
                const frame = runFrame(layout, run);
                return (
                  <group key={run} position={[frame.xMm / 1000, 0, frame.zMm / 1000]} rotation={[0, frame.rotY, 0]}>
                    {framed[run].map((cabinet) => {
                      const isWallNode = cabinet.category === 'WALL_UNIT';
                      const verticalYOffset = isWallNode ? wallElevationMeters : 0;
                      // Back planes are flush against the wall (z = 0): a 350 mm wall unit and a 600 mm base unit share
                      // the same back, instead of both being centred on z = 0 (which floated wall units off the wall).
                      const zMeters = (-cabinet.positionZ + cabinet.depth / 2) / 1000;

                      return (
                        <group
                          key={cabinet.id}
                          position={[cabinet.positionX / 1000, verticalYOffset, zMeters]}
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

                    {/* Countertop of this wall */}
                    {countertopGeometries[run] && (
                      <mesh geometry={countertopGeometries[run]} position={[0, baseHeightMm / 1000, 0]} castShadow receiveShadow>
                        <meshStandardMaterial color="#FFFFFF" roughness={0.2} metalness={0.0} transparent={isXRayMode} opacity={isXRayMode ? 0.35 : 1.0} />
                      </mesh>
                    )}

                    {/* Accessories library: sockets, sinks, hobs, hoods, lighting, organisers */}
                    <AccessoryLayer accessories={accessoriesOf(run)} cabinets={framed[run]} wallSplashHeightMm={hardware.wallSplashHeight} isXRayMode={isXRayMode} />
                  </group>
                );
              })}
            </group>
          </Center>

          <OrbitControls makeDefault enableDamping dampingFactor={0.05} maxPolarAngle={Math.PI / 2} minDistance={0.4} maxDistance={8.0} />
          <Grid position={[0, -0.4, 0]} args={[Math.max(12, sceneWidthMeters * 2.5), Math.max(12, sceneWidthMeters * 2.5)]} cellSize={0.1} cellThickness={0.4} cellColor={ROOM.grid.cell} sectionSize={0.5} sectionColor={ROOM.grid.section} />
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
                <span className="text-[10px] text-slate-500">لا توجد خامات أونلاين بعد: تصفّح Poly Haven و ambientCG أدناه، أو الصق رابط صورة https أعلاه، أو أضف روابط دائمة في src/data/onlineTextures.ts</span>
              )}
              <button type="button" onClick={() => setBrowserOpen((o) => !o)} className="self-start px-3 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer">
                🔎 تصفّح Poly Haven و ambientCG (مجاني CC0) {browserOpen ? '▲' : '▼'}
              </button>
              {browserOpen && (
                <OnlineTextureBrowser
                  onPick={(entry) => {
                    setCustomOnline((prev) => (prev.some((t) => t.id === entry.id) ? prev : [...prev, entry]));
                    onApplyTextureOverride(selectedCabinet.id, entry.path, entry.finish, applyToAll);
                  }}
                />
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
