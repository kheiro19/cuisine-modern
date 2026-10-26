// src/math/renderScene.ts
// The kitchen as a list of boxes in room coordinates (millimetres) — everything an external photoreal renderer
// (render-service/, Blender Cycles) needs to rebuild EXACTLY the design the app shows: the same assembly geometry,
// the same fronts, the same worktop slabs and the same library pieces at their footprints. The app stays the single
// source of truth; the renderer only draws boxes with materials and light. No three.js here: plain data, tested in node.
import type { CabinetObject, RunId } from '../types/flatma';
import { assemblyGeometry } from './assemblyGeometry';
import { baseOf, bodyView } from './base';
import { zoneFrontChoicesOf } from './zoneFronts';
import { footprintOf, sceneRefOf, type CabinetLite, type PlacedAccessory } from './accessoryPlacement';
import { getAccessory } from '../data/accessoryCatalog';
import { runFrame, runOf, runsOf, wallBottomMmOf, wallLengthOf, type KitchenLayout } from './kitchenLayout';
import { carriesCountertop, type CountertopSettings } from './countertop';
import { LAYOUT } from './constants';
import { DEFAULT_PALETTE } from './palette';

export interface RenderBox {
  id: string;
  role: 'carcase' | 'front' | 'countertop' | 'appliance' | 'accessory' | 'room' | 'base';
  /** [w, h, d] mm, before rotYDeg. */
  sizeMm: [number, number, number];
  /** Centre in room coordinates (mm): x along the back wall from its left end, y up from the floor, z away from the back wall. */
  centerMm: [number, number, number];
  rotYDeg?: number;
  color?: string;
  /** Sheet brand/type for the texture convention (wood_<brand>.webp in the textures folder), when the box follows a sheet. */
  sheet?: { brand: string; type: string };
  /** An explicit texture file (showcase pick), relative to the textures root. Wins over `sheet`. */
  texturePath?: string;
}

export interface RenderScene {
  format: 'cuisine-render-scene';
  version: 1;
  room: { widthMm: number; depthMm: number; heightMm: number };
  boxes: RenderBox[];
  cameras: Array<{ name: string; positionMm: [number, number, number]; targetMm: [number, number, number]; lensMm?: number }>;
}

interface SheetRef { id: string; brand: string; type: string; thickness: number }

const rot = (x: number, z: number, rad: number): [number, number] => [x * Math.cos(rad) + z * Math.sin(rad), -x * Math.sin(rad) + z * Math.cos(rad)];

/**
 * Builds the render scene. `woods` are the workshop sheets (id/brand/type/thickness) so fronts and carcases can carry
 * their real texture files; `splashMm` is the worktop-to-wall-unit gap the accessories were placed against.
 */
export function buildRenderScene(args: {
  cabinets: ReadonlyArray<CabinetObject>;
  layout: KitchenLayout;
  accessories?: ReadonlyArray<PlacedAccessory>;
  countertop: CountertopSettings;
  woods: ReadonlyArray<SheetRef>;
  hardwareItems?: ReadonlyArray<{ id: string; modelType?: string; category?: string }>;
  splashMm: number;
}): RenderScene {
  const { cabinets, layout, countertop, woods, splashMm } = args;
  const accessories = args.accessories ?? [];
  const boxes: RenderBox[] = [];
  const W = layout.widthMm, Dp = layout.depthMm ?? 3000, H = layout.heightMm ?? 2600;

  // The room itself: floor and the walls that carry runs (thin boxes; the renderer gives them their finish).
  const twoSided = runsOf(layout).length > 1;
  boxes.push({ id: 'room-floor', role: 'room', sizeMm: [W, 20, twoSided ? Dp * 2 : Dp], centerMm: [W / 2, -10, twoSided ? 0 : Dp / 2], color: '#9AA3AD' });
  // Wall slabs only for a single-wall kitchen. In an L/U the app's own frame puts the side arm behind wall A's
  // plane (the app draws no walls at all), so a full wall box would hide one arm from every diagonal camera.
  if (!twoSided) {
    boxes.push({ id: 'room-wall-a', role: 'room', sizeMm: [W, H, 20], centerMm: [W / 2, H / 2, -10], color: '#C7CDD4' });
  }

  const counters = cabinets.filter(carriesCountertop);
  const baseHeightMm = counters.length > 0 ? Math.max(...counters.map((c) => c.height)) : LAYOUT.DEFAULT_BASE_HEIGHT_MM;
  const wallRef = { counterTopMm: baseHeightMm + countertop.thicknessMm, defaultGapMm: splashMm, roomHeightMm: H };

  const place = (run: RunId, local: [number, number, number]): [number, number, number] => {
    const f = runFrame(layout, run);
    const [rx, rz] = rot(local[0], local[2], f.rotY);
    return [f.xMm + rx, local[1], f.zMm + rz];
  };
  const frameDeg = (run: RunId) => (runFrame(layout, run).rotY * 180) / Math.PI;

  cabinets.forEach((cab) => {
    const run = runOf(cab);
    const isWall = cab.category === 'WALL_UNIT';
    const carcaseSheet = woods.find((x) => x.id === cab.carcaseMaterialId);
    const frontSheet = woods.find((x) => x.id === cab.frontMaterialId);
    const th = carcaseSheet?.thickness ?? cab.carcaseThickness ?? 18;
    const fTh = frontSheet?.thickness ?? cab.frontThickness ?? 18;
    // Closed fronts are the same boxes whatever the hinge hardware: lift/inset change the motion, not the still scene.
    const geo = assemblyGeometry(cab, {
      carcaseTh: th, frontTh: fTh,
      zoneFrontTh: zoneFrontChoicesOf(cab, woods as never, fTh).map((c) => c?.thicknessMm),
      lift: false, inset: false,
    });
    const base = baseOf(cab);
    const yOrigin = isWall ? wallBottomMmOf(cab, wallRef) : 0;
    const shift = isWall ? 0 : base.heightMm;
    // Cabinet group origin in its run frame, exactly as the canvas places it.
    const origin: [number, number, number] = [cab.positionX, yOrigin, -cab.positionZ + cab.depth / 2];
    const put = (id: string, role: RenderBox['role'], size: [number, number, number], centre: [number, number, number], extra?: Partial<RenderBox>) => {
      const local: [number, number, number] = [origin[0] + centre[0], origin[1] + centre[1], origin[2] + centre[2]];
      boxes.push({ id, role, sizeMm: size, centerMm: place(run, local), ...(Math.abs(frameDeg(run)) > 0.01 ? { rotYDeg: frameDeg(run) } : {}), ...extra });
    };
    geo.boxes.forEach((b, i) => put(`${cab.id}-box-${i}`, b.kind === 'back' || b.kind === 'backpanel' ? 'carcase' : 'carcase', b.sizeMm, [b.centerMm[0], shift + b.centerMm[1], b.centerMm[2]], {
      color: DEFAULT_PALETTE.carcase.color, ...(carcaseSheet ? { sheet: { brand: carcaseSheet.brand, type: carcaseSheet.type } } : {}),
    }));
    geo.base.forEach((b, i) => put(`${cab.id}-base-${i}`, 'base', b.sizeMm, [b.centerMm[0], b.centerMm[1], b.centerMm[2]], { color: DEFAULT_PALETTE.carcase.color }));
    geo.facades.forEach((f) => {
      const zoneSheet = zoneFrontChoicesOf(cab, woods as never, fTh)[f.zoneIndex];
      const sheet = zoneSheet ? woods.find((x) => x.id === zoneSheet.materialId) ?? frontSheet : frontSheet;
      put(`${cab.id}-${f.zoneIndex}-${f.kind}-${f.index}`, 'front',
        [f.widthMm, f.heightMm, f.thicknessMm ?? fTh],
        [f.xMm + f.widthMm / 2, shift + f.yMm + f.heightMm / 2, f.zMm],
        {
          color: DEFAULT_PALETTE.front.color,
          ...(sheet ? { sheet: { brand: sheet.brand, type: sheet.type } } : {}),
          ...(cab.frontTextureOverride?.path ? { texturePath: cab.frontTextureOverride.path.replace(/^\//, '') } : {}),
        });
    });
    geo.appliances.forEach((a) => put(`${cab.id}-appliance-${a.zoneIndex}`, 'appliance', a.sizeMm, [a.centerMm[0], shift + a.centerMm[1], a.centerMm[2]], { color: '#2B2F36' }));
    void bodyView;
  });

  // Worktop slabs, one per run (the corner overlap of two slabs is invisible: same material, same top face).
  if (countertop.visible) {
    (['A', 'B', 'C'] as RunId[]).forEach((run) => {
      const list = cabinets.filter((c) => runOf(c) === run && carriesCountertop(c));
      if (list.length === 0) return;
      const x0 = Math.min(...list.map((c) => c.positionX));
      const x1 = Math.max(...list.map((c) => c.positionX + c.width));
      const zBack = Math.min(...list.map((c) => -c.positionZ));
      const local: [number, number, number] = [(x0 + x1) / 2, baseHeightMm + countertop.thicknessMm / 2, zBack + countertop.depthMm / 2];
      boxes.push({
        id: `countertop-${run}`, role: 'countertop',
        sizeMm: [x1 - x0, countertop.thicknessMm, countertop.depthMm],
        centerMm: place(run, local),
        ...(Math.abs(frameDeg(run)) > 0.01 ? { rotYDeg: frameDeg(run) } : {}),
        color: '#E8E6E1',
        ...(countertop.texturePath ? { texturePath: countertop.texturePath.replace(/^\//, '') } : {}),
      });
    });
  }

  // Library pieces at their real footprints, per run (the same numbers the 3D layer draws).
  (['A', 'B', 'C'] as RunId[]).forEach((run) => {
    const runCabs = cabinets.filter((c) => runOf(c) === run) as unknown as CabinetLite[];
    if (runCabs.length === 0 && run !== 'A') return;
    const scene = sceneRefOf(runCabs, splashMm, H);
    accessories.filter((a) => {
      const item = getAccessory(a.catalogId);
      if (!item) return false;
      if (a.cabinetId) return runCabs.some((c) => c.id === a.cabinetId);
      return (a.run ?? 'A') === run;
    }).forEach((a) => {
      const fp = footprintOf(a, accessories, runCabs as never, scene);
      if (!fp) return;
      const local: [number, number, number] = [fp.xMm, fp.yMm + fp.h / 2, fp.zMm];
      boxes.push({
        id: `acc-${a.id}`, role: 'accessory',
        sizeMm: [fp.w, fp.h, fp.d],
        centerMm: place(run, local),
        rotYDeg: (frameDeg(run) + (a.rotY ?? 0)) % 360,
        color: '#8A9199',
      });
    });
  });

  return {
    format: 'cuisine-render-scene', version: 1,
    room: { widthMm: W, depthMm: Dp, heightMm: H },
    boxes,
    cameras: [
      // Corner hero for L/U kitchens: stand opposite the corner so BOTH walls (and their tall towers) are in
      // frame; a straight-on hero crops the side wall's tower out of the picture entirely.
      ...(runsOf(layout).length > 1
        ? [{ name: 'hero', positionMm: [runsOf(layout).includes('B') ? W * 0.9 : W * 0.1, H * 0.6, Dp * 0.95] as [number, number, number], targetMm: [runsOf(layout).includes('B') ? W * 0.2 : W * 0.8, H * 0.35, (runsOf(layout).includes('B') ? -1 : 1) * Dp * 0.15] as [number, number, number], lensMm: 24 }]
        : [{ name: 'hero', positionMm: [W * 0.8, H * 0.58, Dp * 1.5] as [number, number, number], targetMm: [W / 2, H * 0.36, Dp * 0.15] as [number, number, number] }]),
      { name: 'front', positionMm: [W / 2, H * 0.5, wallLengthOf(layout, 'A') * 1.15], targetMm: [W / 2, H * 0.42, 0] },
      { name: 'top', positionMm: [W / 2, H * 2.1, Dp * 0.55], targetMm: [W / 2, 0, Dp * 0.3] },
    ],
  };
}

