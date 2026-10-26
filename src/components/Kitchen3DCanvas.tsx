// src/components/Kitchen3DCanvas.tsx
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, Grid, Center } from '@react-three/drei';
import * as THREE from 'three';
import CabinetAssembly3D from './CabinetAssembly3D';
import AccessoryLayer from './AccessoryLayer';
import OnlineTextureBrowser from './OnlineTextureBrowser';
import type { PlacedAccessory, TransformResult } from '../math/accessoryPlacement';
import { buildRenderScene } from '../math/renderScene';
import { auditDesign, type AuditFinding } from '../math/designAudit';
import { buildAiRenderPrompt } from '../math/renderPrompt';
import { Environment, Lightformer } from '@react-three/drei';
import { getAccessory } from '../data/accessoryCatalog';
import AccessoryTransformEditor from './AccessoryTransformEditor';
import WallCabinetAssembly3D from './WallCabinetAssembly3D';
import { CabinetObject, AdvancedHardwareSettings, InjectedWoodMaterial, InjectedHardwareItem, RunId } from '../types/flatma';
import { KitchenLayout, DEFAULT_LAYOUT, DEFAULT_ROOM_DEPTH_MM, alongToFrame, roomHeightOf, runFrame, runOf, runsOf, toFrame, wallBottomMmOf } from '../math/kitchenLayout';
import { useTextureCatalog } from '../data/textureCatalog';
import type { TextureEntry } from '../data/textureCatalog';
import { onlineTextureCatalog, makeOnlineTextureEntry } from '../data/onlineTextures';
import { LAYOUT } from '../math/constants';
import { computeCountertopOutline, carriesCountertop, countertopDepthMm, COUNTERTOP_DEFAULT } from '../math/countertop';
import { TextureEngine } from '../math/textureEngine';
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
  /** Size & direction editing of a library piece clicked in the 3D view (optional: unwired hosts keep pieces unselectable). */
  onResizeAccessory?: (id: string, size: { w: number; h: number; d: number }) => TransformResult;
  onRotateAccessory?: (id: string, dir: 1 | -1) => TransformResult;
  onFlipAccessory?: (id: string) => TransformResult;
  onResetAccessoryTransform?: (id: string) => void;
  onRemoveAccessory?: (id: string) => void;
}

/** Registers the 4K still capture: renders the current view once at 3840x2160 and downloads it as a PNG. */
function StillCapture({ register }: { register: (fn: () => string | null) => void }) {
  const { gl, scene, camera } = useThree();
  useEffect(() => {
    register(() => {
      try {
        const cam = camera as THREE.PerspectiveCamera;
        const prev = new THREE.Vector2();
        gl.getSize(prev);
        const prevRatio = gl.getPixelRatio();
        const prevAspect = cam.aspect;
        gl.setPixelRatio(1);
        gl.setSize(3840, 2160, false);
        cam.aspect = 3840 / 2160;
        cam.updateProjectionMatrix();
        gl.render(scene, cam);
        const url = gl.domElement.toDataURL('image/png');
        gl.setPixelRatio(prevRatio);
        gl.setSize(prev.x, prev.y, false);
        cam.aspect = prevAspect;
        cam.updateProjectionMatrix();
        gl.render(scene, cam);
        return url;
      } catch { return null; }
    });
  }, [gl, scene, camera, register]);
  return null;
}

const downloadDataUrl = (url: string, name: string) => {
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
};

/** The room behind the kitchen: the colour and the two grid tones derived from it (math/palette.ts). */
const ROOM = { ...DEFAULT_PALETTE.background, grid: gridColoursOf(DEFAULT_PALETTE.background.color) };

/**
 * Frames the WHOLE room — floor to ceiling, the full back wall — whenever the room or the kitchen's extent
 * changes, and when the user asks for it (the «إظهار كل المطبخ» button, via `nonce`).
 *
 * Why this exists: the scene is recentred by <Center> on the room outline, but the camera used to be placed
 * from the cabinets' width alone and aimed at the floor origin. A kitchen occupying part of its wall slid
 * out of the left edge, and a wall unit hung from the ceiling (bottom at 2200 mm in a 2600 mm room) sat
 * wholly above the frame: the unit was in the list, drawn in the scene, and invisible. Manual orbiting is
 * left alone — this only reframes when the numbers it depends on actually change.
 */
function CameraFitter({ position, target, nonce }: { position: [number, number, number]; target: [number, number, number]; nonce: number }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as { target: { set: (x: number, y: number, z: number) => void }; update: () => void } | null;
  const key = `${position.join(',')}|${target.join(',')}|${nonce}`;
  useEffect(() => {
    camera.position.set(position[0], position[1], position[2]);
    if (controls) { controls.target.set(target[0], target[1], target[2]); controls.update(); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, controls]);
  return null;
}

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
  onDeleteCabinet,
  onResizeAccessory,
  onRotateAccessory,
  onFlipAccessory,
  onResetAccessoryTransform,
  onRemoveAccessory
}: Kitchen3DCanvasProps) {

  const [openProgress, setOpenProgress] = useState<number>(0);
  const [selectedCabinetId, setSelectedCabinetId] = useState<string | null>(null);
  const [applyToAll, setApplyToAll] = useState<boolean>(false);
  const [activeSource, setActiveSource] = useState<'local' | 'online'>('local');
  const [customOnline, setCustomOnline] = useState<TextureEntry[]>([]);
  const [urlInput, setUrlInput] = useState<string>('');
  const [urlError, setUrlError] = useState<string>('');
  const [browserOpen, setBrowserOpen] = useState<boolean>(false);
  const [viewNonce, setViewNonce] = useState(0); // «show the whole kitchen»: bumped by the reset-view button
  const [selectedAccessoryId, setSelectedAccessoryId] = useState<string | null>(null);
  // Pro rendering (environment light + soft shadows), the cinematic render dialog and the smart audit dialog.
  const [proMode, setProMode] = useState(false);
  const captureRef = useRef<() => string | null>(() => null);
  const [panel, setPanel] = useState<'none' | 'render' | 'audit' | 'ai'>('none');
  const [endpoint, setEndpoint] = useState(() => { try { return localStorage.getItem('cuisine:renderEndpoint') || 'http://localhost:8787'; } catch { return 'http://localhost:8787'; } });
  const [renderQuality, setRenderQuality] = useState<'fast' | 'final'>('fast');
  const [renderBusy, setRenderBusy] = useState(false);
  const [renderImage, setRenderImage] = useState<string | null>(null);
  const [renderNote, setRenderNote] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const audit = useMemo(() => (panel === 'audit' ? auditDesign({ cabinets, layout, accessories, counterTopMm: Math.max(0, ...cabinets.filter((c) => c.category === 'BASE_UNIT').map((c) => c.height)) + countertop.thicknessMm, splashMm: hardware.wallSplashHeight }) : []), [panel, cabinets, layout, accessories, countertop.thicknessMm, hardware.wallSplashHeight]);
  // 📋 AI hand-off & enhancement: a 4K still + an exact prompt built from the design data (buildAiRenderPrompt).
  // Enhancement calls the provider directly from the browser with the USER's own key (localStorage only) —
  // Gemini (image models) or OpenAI (gpt-image). Claude has no image output, so it serves through the copilot.
  const [aiImage, setAiImage] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openai'>('gemini');
  const [aiKeys, setAiKeys] = useState<Record<'gemini' | 'openai', string>>(() => {
    try { return { gemini: localStorage.getItem('cuisine:aiKey:gemini') || '', openai: localStorage.getItem('cuisine:aiKey:openai') || '' }; }
    catch { return { gemini: '', openai: '' }; }
  });
  const [aiModels, setAiModels] = useState<Record<'gemini' | 'openai', string>>({ gemini: 'gemini-2.5-flash-image', openai: 'gpt-image-1' });
  const [aiBusy, setAiBusy] = useState(false);
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const openAiPanel = () => {
    const url = captureRef.current();
    setAiImage(url);
    setAiPrompt(buildAiRenderPrompt({ cabinets, layout, accessories, countertopThicknessMm: countertop.thicknessMm, woods: woodPanels }));
    setAiResult(null);
    setAiNote(url ? null : 'تعذّر التقاط اللقطة — فعّل «وضع التصيير الاحترافي» ثم أعد المحاولة.');
    setPanel('ai');
  };
  const setAiKey = (v: string) => {
    setAiKeys((k) => ({ ...k, [aiProvider]: v }));
    try { localStorage.setItem(`cuisine:aiKey:${aiProvider}`, v); } catch { /* private mode */ }
  };
  const copyAiPrompt = async () => {
    try { await navigator.clipboard.writeText(aiPrompt); setAiNote('نُسخ الوصف ✓ — ألصقه مع اللقطة في تطبيق الذكاء الاصطناعي الذي تفضّله (Gemini / ChatGPT / Claude).'); }
    catch { setAiNote('تعذّر النسخ التلقائي — حدّد النص في الحقل وانسخه يدويًا.'); }
  };
  const enhanceWithAi = async () => {
    if (!aiImage) { setAiNote('لا توجد لقطة بعد — أغلق الحوار وأعد فتحه.'); return; }
    const key = aiKeys[aiProvider].trim();
    if (!key) { setAiNote('أدخل مفتاح API أولًا (يُحفظ على جهازك فقط).'); return; }
    setAiBusy(true); setAiResult(null); setAiNote(null);
    try {
      if (aiProvider === 'gemini') {
        const b64 = aiImage.split(',')[1] ?? '';
        const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(aiModels.gemini)}:generateContent`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
          body: JSON.stringify({ contents: [{ parts: [{ text: aiPrompt }, { inlineData: { mimeType: 'image/png', data: b64 } }] }] }),
        });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || `Gemini رد ${res.status}`);
        const parts: any[] = data?.candidates?.[0]?.content?.parts ?? [];
        const img = parts.find((x) => x?.inlineData?.data);
        if (!img) throw new Error('رد Gemini بلا صورة (تأكد أن النموذج المختار يولّد صورًا).');
        setAiResult(`data:${img.inlineData.mimeType || 'image/png'};base64,${img.inlineData.data}`);
      } else {
        const blob = await (await fetch(aiImage)).blob();
        const form = new FormData();
        form.append('image', blob, 'kitchen.png');
        form.append('model', aiModels.openai);
        form.append('prompt', aiPrompt);
        form.append('size', '1536x1024');
        const res = await fetch('https://api.openai.com/v1/images/edits', { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
        const data: any = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data?.error?.message || `OpenAI رد ${res.status}`);
        const b64: string | undefined = data?.data?.[0]?.b64_json;
        if (!b64) throw new Error('رد OpenAI بلا صورة.');
        setAiResult(`data:image/png;base64,${b64}`);
      }
      setAiNote('تم التحسين ✓ — تذكير: صورة تسويقية تقريبية، والمرجع الدقيق للتنفيذ هو تصميم التطبيق وتصيير Blender.');
    } catch (e) {
      setAiNote(`تعذّر التحسين: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAiBusy(false); }
  };
  const callService = async (path: string, body: unknown): Promise<Record<string, unknown>> => {
    const base = endpoint.replace(/\/+$/, '');
    try { localStorage.setItem('cuisine:renderEndpoint', base); } catch { /* private mode */ }
    const res = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) throw new Error(typeof data.error === 'string' ? data.error : `الخدمة ردت ${res.status}`);
    return data;
  };
  const doCinematicRender = async () => {
    setRenderBusy(true); setRenderNote(null); setRenderImage(null);
    try {
      const sceneData = buildRenderScene({ cabinets, layout, accessories, countertop, woods: woodPanels, splashMm: hardware.wallSplashHeight });
      const data = await callService('/render', { scene: sceneData, quality: renderQuality });
      const images = data.images as Record<string, string> | undefined;
      const first = images && (images.hero ?? Object.values(images)[0]);
      if (!first) throw new Error('وصل رد بلا صورة.');
      setRenderImage(`data:image/png;base64,${first}`);
      setRenderNote(renderQuality === 'final' ? 'تصيير نهائي 4K (Cycles) من هندسة تصميمك نفسها.' : 'معاينة سريعة (Cycles) من هندسة تصميمك نفسها.');
    } catch (e) {
      setRenderNote(`تعذر التصيير: ${e instanceof Error ? e.message : String(e)} — تأكد أن خدمة التصيير تعمل (render-service) وأن العنوان صحيح.`);
    } finally { setRenderBusy(false); }
  };
  const askCopilot = async () => {
    if (!question.trim()) return;
    setAsking(true); setAnswer(null);
    try {
      const data = await callService('/copilot', {
        question,
        audit,
        project: {
          layout,
          cabinets: cabinets.map((c) => ({ name: c.name, category: c.category, width: c.width, height: c.height, depth: c.depth, positionX: c.positionX, run: c.run ?? 'A', zones: c.zones })),
          accessories: accessories.map((a) => ({ catalogId: a.catalogId, xMm: a.xMm, run: a.run ?? 'A', sizeMm: a.sizeMm, rotY: a.rotY })),
        },
      });
      setAnswer(typeof data.answer === 'string' ? data.answer : 'رد فارغ.');
    } catch (e) {
      setAnswer(`تعذر الاتصال بالمساعد: ${e instanceof Error ? e.message : String(e)}`);
    } finally { setAsking(false); }
  };
  // Fronts opened one by one (double-click on a front): "cabinetId|facadeKey" -> open. A front with no entry follows
  // the master kinematic slider, exactly as every front did before individual opening existed.
  const [frontOpenMap, setFrontOpenMap] = useState<Record<string, boolean>>({});
  const toggleFront = (cabinetId: string, facadeKey: string) => {
    const k = `${cabinetId}|${facadeKey}`;
    setFrontOpenMap((prev) => ({ ...prev, [k]: !(k in prev ? prev[k] : openProgress > 0.5) }));
  };
  const frontOpenByCabinet = useMemo(() => {
    const out: Record<string, Record<string, boolean>> = {};
    Object.entries(frontOpenMap).forEach(([k, v]) => {
      const i = k.indexOf('|');
      const cab = k.slice(0, i);
      (out[cab] ??= {})[k.slice(i + 1)] = v;
    });
    return out;
  }, [frontOpenMap]);
  const selectedAccessory = useMemo(() => accessories.find((a) => a.id === selectedAccessoryId) ?? null, [accessories, selectedAccessoryId]);
  const selectedAccessoryItem = selectedAccessory ? getAccessory(selectedAccessory.catalogId) : undefined;
  const accessoryEditable = !!(onResizeAccessory && onRotateAccessory && onFlipAccessory && onResetAccessoryTransform);

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
  const local = useTextureCatalog();
  const activeCollection = activeSource === 'local' ? local.entries : onlineCollection;

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
      // The slab the user typed — drawn as typed, even when it stops before the front (the panel says by how much).
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
  // The slab's finish: the file the user picked from public/textures, or plain stone. One material for the whole worktop,
  // released when the pick changes (a texture left attached would leak on every switch).
  const slabMaterial = useMemo(
    () => TextureEngine.slabMaterial(countertop.depthMm, countertop.thicknessMm, isXRayMode, countertop.texturePath),
    [countertop.depthMm, countertop.thicknessMm, countertop.texturePath, isXRayMode],
  );
  useEffect(() => () => slabMaterial.dispose(), [slabMaterial]);

  // Accessories live on the wall of the cabinet that hosts them (or of the sink they are fixed on); the others are on the back wall.
  const accessoriesOf = useCallback((run: RunId): PlacedAccessory[] => {
    const runOfAccessory = (a: PlacedAccessory, depth = 0): RunId => {
      if (a.cabinetId) { const c = cabinets.find(x => x.id === a.cabinetId); return c ? runOf(c) : 'A'; }
      if (a.run) return a.run; // a floor piece chose its wall (older saves have none: the back wall, as before)
      if (a.hostId && depth < 4) { const h = accessories.find(x => x.id === a.hostId); return h ? runOfAccessory(h, depth + 1) : 'A'; }
      return 'A';
    };
    return accessories
      .filter(a => runOfAccessory(a) === run)
      .map(a => (run === 'B' ? { ...a, xMm: alongToFrame(a.xMm, run), ...(a.dxMm !== undefined ? { dxMm: alongToFrame(a.dxMm, run) } : {}) } : a));
  }, [accessories, cabinets]);

  // Wall units hang above the worktop (its thickness included), whatever the real base height is — unless a unit chose its own place
  // (from the ceiling, from the floor, or its own gap above the worktop: CabinetObject.wallMount).
  const roomHeightMm = roomHeightOf(layout);

  // The frame the camera must contain: the room itself (its outline is what <Center> centres on), never less
  // than the cabinets' own extent. Distance is capped by the controls' own maxDistance below.
  const roomHM = roomHeightMm / 1000;
  const frameWM = Math.max(layout.widthMm / 1000, sceneWidthMeters, layout.type !== 'STRAIGHT' ? (layout.depthMm ?? DEFAULT_ROOM_DEPTH_MM) / 1000 : 0);
  const camDist = Math.min(7.6, Math.max(3.4, frameWM * 1.05, roomHM * 1.8));
  const camPos: [number, number, number] = [0, Math.max(1.5, roomHM * 0.58), camDist];
  const camTarget: [number, number, number] = [0, roomHM * 0.44, 0];
  const wallBottomMeters = (c: CabinetObject): number => wallBottomMmOf(c, { counterTopMm: baseHeightMm + countertop.thicknessMm, defaultGapMm: hardware.wallSplashHeight, roomHeightMm }) / 1000;
  // The ceiling and the corners of the room as thin lines, so a unit hung from the ceiling can be seen against it.
  const roomOutline = useMemo(() => {
    const H = roomHeightMm / 1000, W = layout.widthMm / 1000, Dp = (layout.depthMm ?? DEFAULT_ROOM_DEPTH_MM) / 1000;
    const pts: THREE.Vector3[] = [];
    const seg = (a: [number, number, number], b: [number, number, number]) => pts.push(new THREE.Vector3(...a), new THREE.Vector3(...b));
    seg([0, H, 0], [W, H, 0]); seg([0, 0, 0], [0, H, 0]); seg([W, 0, 0], [W, H, 0]);
    if (runs.includes('B')) { seg([0, H, 0], [0, H, Dp]); seg([0, 0, Dp], [0, H, Dp]); }
    if (runs.includes('C')) { seg([W, H, 0], [W, H, Dp]); seg([W, 0, Dp], [W, H, Dp]); }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [roomHeightMm, layout.widthMm, layout.depthMm, runs]);
  useEffect(() => () => roomOutline.dispose(), [roomOutline]);

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

      {/* 🎬 Pro rendering, cinematic render and smart audit */}
      <div className="absolute left-3 top-[104px] z-30 flex flex-col gap-1.5">
        <button type="button" aria-pressed={proMode} onClick={() => setProMode((v) => !v)} title="إضاءة بيئية وظلال ناعمة ودقة أعلى" className={`px-2.5 py-1 rounded-lg border text-[10px] font-bold shadow-xs cursor-pointer ${proMode ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white/80 backdrop-blur text-slate-700 border-[#E5E5E5] hover:bg-white'}`}>✨ وضع التصيير الاحترافي {proMode ? '✓' : ''}</button>
        <button type="button" onClick={() => { const u = captureRef.current(); if (u) downloadDataUrl(u, 'kitchen-4k.png'); }} title="لقطة PNG بدقة 3840×2160 من زاويتك الحالية" className="px-2.5 py-1 rounded-lg border bg-white/80 backdrop-blur text-slate-700 border-[#E5E5E5] text-[10px] font-bold shadow-xs hover:bg-white cursor-pointer">📸 لقطة سريعة 4K</button>
        <button type="button" onClick={openAiPanel} title="لقطة 4K + وصف دقيق من بيانات تصميمك: انسخهما لأي تطبيق ذكاء اصطناعي، أو حسّن هنا بمفتاحك" className="px-2.5 py-1 rounded-lg border bg-white/80 backdrop-blur text-slate-700 border-[#E5E5E5] text-[10px] font-bold shadow-xs hover:bg-white cursor-pointer">📋 تجهيز / تحسين بالذكاء الاصطناعي</button>
        <button type="button" onClick={() => setPanel('render')} title="Blender Cycles على خدمة التصيير — نفس هندسة التصميم بدقة سينمائية" className="px-2.5 py-1 rounded-lg border bg-white/80 backdrop-blur text-slate-700 border-[#E5E5E5] text-[10px] font-bold shadow-xs hover:bg-white cursor-pointer">🎬 تصيير سينمائي</button>
        <button type="button" onClick={() => setPanel('audit')} title="فحص تقني حتمي للتصميم + مساعد ذكاء اصطناعي عبر الخدمة" className="px-2.5 py-1 rounded-lg border bg-white/80 backdrop-blur text-slate-700 border-[#E5E5E5] text-[10px] font-bold shadow-xs hover:bg-white cursor-pointer">🧠 تدقيق ذكي</button>
      </div>

      {/* 🧊 Three.js Spatial Layer Viewport */}
      <div className="flex-1 w-full h-full relative">
        <Canvas key={proMode ? 'pro' : 'std'} camera={{ position: camPos, fov: 40 }} shadows={proMode ? 'soft' : true} dpr={proMode ? [1, 2] : [1, 1.75]} gl={{ antialias: true, preserveDrawingBuffer: true }} className="w-full h-full absolute inset-0">
          <CameraFitter position={camPos} target={camTarget} nonce={viewNonce} />
          <StillCapture register={(fn) => { captureRef.current = fn; }} />
          {proMode && (
            <Environment resolution={256}>
              <group rotation={[-Math.PI / 3, 0, 0]}>
                <Lightformer form="circle" intensity={5} position={[0, 5, -9]} scale={2} />
                <Lightformer intensity={2} position={[-5, 1, -1]} scale={[3, 0.5, 1]} />
                <Lightformer intensity={2} position={[5, 1, -1]} scale={[3, 0.5, 1]} />
                <Lightformer color="#dbeafe" intensity={1.5} position={[0, 5, 5]} scale={[4, 1, 1]} />
              </group>
            </Environment>
          )}
          {/* Cold slate room: without it the canvas is transparent and the scene floats on the white panel. */}
          <color attach="background" args={[ROOM.color]} />
          <ambientLight intensity={0.65} />
          <directionalLight position={[sceneWidthMeters / 2, 5, 3]} intensity={0.85} castShadow shadow-bias={-0.00005} />

          {/* disableY: the scene is built with the floor at y = 0 (legs, wall-unit heights and the room outline
              all start there). A plain <Center> re-centres the bounding box vertically, so once the room outline
              reached the ceiling the whole kitchen sank by half the room height and the floor grid cut through
              the base units instead of passing under their legs. */}
          <Center disableY>
            <group>
              {runs.map((run) => {
                const frame = runFrame(layout, run);
                return (
                  <group key={run} position={[frame.xMm / 1000, 0, frame.zMm / 1000]} rotation={[0, frame.rotY, 0]}>
                    {framed[run].map((cabinet) => {
                      const isWallNode = cabinet.category === 'WALL_UNIT';
                      const verticalYOffset = isWallNode ? wallBottomMeters(cabinet) : 0;
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
                            setSelectedAccessoryId(null);
                          }}
                        >
                          {isWallNode ? (
                            <WallCabinetAssembly3D cabinet={cabinet} showFronts={showFronts} isXRayMode={isXRayMode} woodPanels={woodPanels} hardwareItems={hardwareItems} openProgress={openProgress} frontOpen={frontOpenByCabinet[cabinet.id]} onToggleFront={(fkey) => toggleFront(cabinet.id, fkey)} />
                          ) : (
                            <CabinetAssembly3D cabinet={cabinet} showFronts={showFronts} isXRayMode={isXRayMode} woodPanels={woodPanels} hardwareItems={hardwareItems} openProgress={openProgress} frontOpen={frontOpenByCabinet[cabinet.id]} onToggleFront={(fkey) => toggleFront(cabinet.id, fkey)} />
                          )}
                        </group>
                      );
                    })}

                    {/* Countertop of this wall */}
                    {countertopGeometries[run] && (
                      <mesh geometry={countertopGeometries[run]} material={slabMaterial} position={[0, baseHeightMm / 1000, 0]} castShadow receiveShadow />
                    )}

                    {/* Accessories library: sockets, sinks, hobs, hoods, lighting, organisers */}
                    <AccessoryLayer accessories={accessoriesOf(run)} cabinets={framed[run]} wallSplashHeightMm={hardware.wallSplashHeight} roomHeightMm={roomHeightMm} isXRayMode={isXRayMode} selectedId={selectedAccessoryId ?? undefined} onSelect={accessoryEditable ? (id) => { setSelectedAccessoryId(id); setSelectedCabinetId(null); } : undefined} />
                  </group>
                );
              })}
              <lineSegments geometry={roomOutline}><lineBasicMaterial color="#94a3b8" /></lineSegments>
            </group>
          </Center>

          <OrbitControls makeDefault enableDamping dampingFactor={0.05} maxPolarAngle={Math.PI / 2} minDistance={0.4} maxDistance={8.0} />
          <Grid position={[0, 0, 0]} args={[Math.max(12, sceneWidthMeters * 2.5), Math.max(12, sceneWidthMeters * 2.5)]} cellSize={0.1} cellThickness={0.4} cellColor={ROOM.grid.cell} sectionSize={0.5} sectionColor={ROOM.grid.section} />
        </Canvas>
        <button
          type="button"
          onClick={() => setViewNonce((n) => n + 1)}
          title="إعادة تأطير المشهد بحيث تظهر كل خزائن المطبخ من الأرض إلى السقف"
          className="absolute bottom-3 right-3 z-30 bg-white/80 backdrop-blur border border-[#E5E5E5] px-3 py-1.5 rounded-xl shadow-xs text-[10px] font-bold text-slate-700 hover:bg-white cursor-pointer"
        >
          ⟲ إظهار كل المطبخ
        </button>
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
                <span>📂</span> <span>Workshop Matrix ({local.count})</span>
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
            {/* An empty Workshop Matrix says WHY, and offers to read the folder again — never a silent blank strip. */}
            {activeSource === 'local' && activeCollection.length === 0 && (
              <div className="flex-shrink-0 flex items-center gap-2 h-14 px-3 rounded-xl border border-amber-300 bg-amber-50 text-[10px] text-amber-900 leading-snug">
                <span>⚠ مكتبة الخامات المحلية فارغة: مجلد <b style={{ direction: 'ltr' }}>public/textures</b> غير مقروء في هذا البناء.</span>
                <button
                  type="button"
                  onClick={() => { void local.reload(); }}
                  className="px-2 py-1 rounded border border-amber-400 bg-white hover:bg-amber-100 font-bold cursor-pointer"
                >⟳ إعادة القراءة</button>
              </div>
            )}
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

      {/* 📐 The library piece clicked in the 3D view: same size & direction editor as the drawer, over the scene. */}
      {selectedAccessory && selectedAccessoryItem && accessoryEditable && (
        <div className="absolute bottom-4 left-4 right-4 z-40 bg-white/80 backdrop-blur-xl border border-white/40 p-3 rounded-2xl shadow-xl animate-fade-in" style={{ direction: 'rtl' }}>
          <div className="flex items-center justify-between gap-3 mb-2">
            <span className="text-[11px] font-bold text-slate-800 truncate">{selectedAccessoryItem.icon} {selectedAccessoryItem.nameAr} — المقاس والاتجاه</span>
            <span className="flex items-center gap-2 flex-shrink-0">
              {onRemoveAccessory && (
                <button type="button" onClick={() => { onRemoveAccessory(selectedAccessory.id); setSelectedAccessoryId(null); }} className="px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 text-[10px] font-bold cursor-pointer">🗑 حذف القطعة</button>
              )}
              <button type="button" aria-label="إغلاق" onClick={() => setSelectedAccessoryId(null)} className="w-5 h-5 rounded-full bg-slate-200/50 hover:bg-slate-200 text-slate-500 flex items-center justify-center font-bold text-[9px] cursor-pointer">✕</button>
            </span>
          </div>
          <AccessoryTransformEditor item={selectedAccessoryItem} placed={selectedAccessory} onResize={onResizeAccessory!} onRotate={onRotateAccessory!} onFlip={onFlipAccessory!} onReset={onResetAccessoryTransform!} tone="light" />
        </div>
      )}

      {/* 🎬 Cinematic render: the scene goes to the render service (Blender Cycles), the picture comes back. */}
      {panel !== 'none' && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/45 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-2xl shadow-2xl max-w-[720px] w-full max-h-[86vh] overflow-y-auto p-4" style={{ direction: 'rtl' }}>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-black text-slate-800">{panel === 'render' ? '🎬 تصيير سينمائي (Blender Cycles)' : panel === 'audit' ? '🧠 التدقيق الذكي للتصميم' : '📋 التجهيز والتحسين بالذكاء الاصطناعي'}</span>
              <button type="button" aria-label="إغلاق" onClick={() => setPanel('none')} className="w-6 h-6 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 font-bold text-[11px] cursor-pointer">✕</button>
            </div>

            {panel === 'render' && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-slate-600 leading-relaxed">تُرسل هندسة تصميمك الحالية (كل صندوق وواجهة وقطعة) إلى خدمة التصيير، فيعيد Blender بنائها وتصييرها بـCycles — نفس المقاسات والأماكن تمامًا، بجودة فوتوريالية. الخدمة تعمل حيث تشاء: جهازك، خادمك، أو GPU سحابي (مجلد <span dir="ltr" className="font-mono">render-service</span> في المشروع).</p>
                <label className="flex items-center gap-2 text-[11px] font-bold text-slate-700">
                  عنوان الخدمة
                  <input type="text" dir="ltr" value={endpoint} onChange={(e) => setEndpoint(e.target.value)} className="flex-1 border border-slate-300 rounded-md px-2 py-1 font-mono text-[11px]" />
                </label>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => setRenderQuality('fast')} className={`px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${renderQuality === 'fast' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-700 border-slate-300'}`}>⚡ معاينة سريعة 720p</button>
                  <button type="button" onClick={() => setRenderQuality('final')} className={`px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${renderQuality === 'final' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-700 border-slate-300'}`}>💎 نهائي 4K (٣ زوايا)</button>
                  <button type="button" disabled={renderBusy} onClick={doCinematicRender} className="ms-auto px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[12px] font-black cursor-pointer">{renderBusy ? 'جارٍ التصيير…' : '🎬 صيّر الآن'}</button>
                </div>
                {renderNote && <p className="text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">{renderNote}</p>}
                {renderImage && (
                  <div className="flex flex-col gap-1.5">
                    <img src={renderImage} alt="التصيير السينمائي لمطبخك" className="w-full rounded-xl border border-slate-200" />
                    <a href={renderImage} download="kitchen-cinematic.png" className="self-start px-3 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold">⬇ تنزيل الصورة</a>
                  </div>
                )}
              </div>
            )}

            {panel === 'audit' && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] text-slate-600">فحص حتمي من أرقام تصميمك نفسها (لا يخترع شيئًا):</p>
                <ul className="flex flex-col gap-1">
                  {audit.map((f: AuditFinding, i: number) => (
                    <li key={i} className={`text-[11px] font-bold rounded-lg px-2.5 py-1.5 border ${f.level === 'error' ? 'bg-rose-50 text-rose-800 border-rose-200' : f.level === 'warn' ? 'bg-amber-50 text-amber-900 border-amber-200' : 'bg-sky-50 text-sky-900 border-sky-200'}`}>{f.level === 'error' ? '⛔' : f.level === 'warn' ? '⚠️' : '💡'} {f.text}</li>
                  ))}
                </ul>
                <div className="border-t border-slate-200 pt-2 flex flex-col gap-1.5">
                  <span className="text-[11px] font-black text-slate-700">اسأل المساعد الذكي (عبر خدمة التصيير، يحتاج مفتاحًا على الخادم):</span>
                  <div className="flex gap-1.5">
                    <input type="text" value={question} onChange={(e) => setQuestion(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') askCopilot(); }} placeholder="مثال: هل ممر الحركة كافٍ؟ ما أضعف نقطة في التصميم؟" className="flex-1 border border-slate-300 rounded-md px-2 py-1.5 text-[11px]" />
                    <button type="button" disabled={asking} onClick={askCopilot} className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-[11px] font-black cursor-pointer">{asking ? 'يفكر…' : 'اسأل'}</button>
                  </div>
                  {answer && <p className="text-[11px] leading-relaxed text-slate-800 bg-indigo-50/60 border border-indigo-100 rounded-lg px-2.5 py-2 whitespace-pre-wrap">{answer}</p>}
                </div>
              </div>
            )}

            {panel === 'ai' && (
              <div className="flex flex-col gap-2">
                <p className="text-[11px] font-bold text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">⚠️ صورتان مختلفتان تمامًا: لقطة التطبيق وتصيير Blender دقيقان ويُعتمدان للتنفيذ؛ أما ناتج الذكاء الاصطناعي فتصوّر تسويقي تقريبي قد يغيّر تفاصيل — لا يُبنى عليه مقاس.</p>
                {aiImage ? (
                  <>
                    <img src={aiImage} alt="لقطة المطبخ الحالية بدقة 4K" className="w-full rounded-xl border border-slate-200" />
                    <div className="flex flex-wrap gap-1.5">
                      <button type="button" onClick={() => downloadDataUrl(aiImage, 'kitchen-still-4k.png')} className="px-3 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer">⬇ تنزيل اللقطة 4K</button>
                      <button type="button" onClick={copyAiPrompt} className="px-3 py-1 rounded-lg bg-white border border-slate-300 text-slate-700 text-[11px] font-bold cursor-pointer">📋 نسخ الوصف</button>
                      <span className="text-[10px] text-slate-500 self-center">الطريقة المجانية: نزّل اللقطة، انسخ الوصف، والصقهما في تطبيق Gemini أو ChatGPT أو Claude.</span>
                    </div>
                  </>
                ) : (
                  <p className="text-[11px] text-slate-600">لا لقطة بعد…</p>
                )}
                <label className="flex flex-col gap-1 text-[11px] font-bold text-slate-700">
                  الوصف الدقيق (من بيانات تصميمك — قابل للتعديل قبل الإرسال)
                  <textarea dir="ltr" rows={7} value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} className="text-left font-mono text-[10px] leading-relaxed border border-slate-300 rounded-lg px-2 py-1.5 w-full" />
                </label>
                <div className="border-t border-slate-200 pt-2 flex flex-col gap-1.5">
                  <span className="text-[11px] font-black text-slate-700">أو حسّن هنا مباشرة بمفتاحك (اختياري):</span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button type="button" onClick={() => setAiProvider('gemini')} className={`px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${aiProvider === 'gemini' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-700 border-slate-300'}`}>Gemini (صور)</button>
                    <button type="button" onClick={() => setAiProvider('openai')} className={`px-3 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${aiProvider === 'openai' ? 'bg-indigo-600 text-white border-indigo-500' : 'bg-white text-slate-700 border-slate-300'}`}>OpenAI (gpt-image)</button>
                    <input type="text" dir="ltr" value={aiModels[aiProvider]} onChange={(e) => setAiModels((m) => ({ ...m, [aiProvider]: e.target.value }))} title="اسم النموذج" className="border border-slate-300 rounded-md px-2 py-1 font-mono text-[10px] w-44" />
                  </div>
                  <input type="password" dir="ltr" value={aiKeys[aiProvider]} onChange={(e) => setAiKey(e.target.value)} placeholder={aiProvider === 'gemini' ? 'AIza… (مفتاح Google AI Studio)' : 'sk-… (مفتاح OpenAI)'} className="border border-slate-300 rounded-md px-2 py-1.5 font-mono text-[11px] w-full" />
                  <p className="text-[10px] text-slate-500">المفتاح يُحفظ في متصفح هذا الجهاز فقط (localStorage) ويُرسل لمزوّده مباشرة — لا يدخل الكود ولا يُشارك. لا تستخدمه على جهاز مشترك. (Claude لا يولّد صورًا؛ مكانه المساعد النصي في «التدقيق الذكي».)</p>
                  <button type="button" disabled={aiBusy} onClick={enhanceWithAi} className="self-start px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[12px] font-black cursor-pointer">{aiBusy ? 'جارٍ التحسين…' : '✨ حسّن بالذكاء الاصطناعي'}</button>
                  {aiNote && <p className="text-[11px] font-bold text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">{aiNote}</p>}
                  {aiResult && (
                    <div className="flex flex-col gap-1.5">
                      <img src={aiResult} alt="المطبخ بعد تحسين الذكاء الاصطناعي (تصوّر تسويقي)" className="w-full rounded-xl border border-slate-200" />
                      <button type="button" onClick={() => downloadDataUrl(aiResult, 'kitchen-ai-enhanced.png')} className="self-start px-3 py-1 rounded-lg bg-slate-900 text-white text-[11px] font-bold cursor-pointer">⬇ تنزيل الصورة المحسّنة</button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
