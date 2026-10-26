// src/math/renderPrompt.ts
// The "prepare for AI" text — a forensic, cabinet-by-cabinet specification built ONLY from the design's real
// manufacturing data (the same assemblyGeometry the app cuts and draws from): every facade with its exact size,
// kind (door / drawer / lift / panel), hinge side and motion, its sheet, grain direction, opening system,
// interior shelves, appliance niches, and every cabinet's exact position along its wall with the gaps between.
// Image models still approximate — the app labels their output "marketing visual, not for execution" — but the
// more truth the prompt carries, the less the model has to invent. A cabinet whose geometry refuses to build
// degrades to its zone summary instead of killing the prompt.
import type { CabinetObject, RunId } from '../types/flatma';
import { assemblyGeometry, type FacadeGeo } from './assemblyGeometry';
import { baseOf } from './base';
import { zoneFrontChoicesOf } from './zoneFronts';
import { grainOf } from './materialLifecycle';
import { footprintOf, sceneRefOf, type PlacedAccessory } from './accessoryPlacement';
import { getAccessory } from '../data/accessoryCatalog';
import { runOf, runsOf, wallBottomMmOf, wallLengthOf, type KitchenLayout } from './kitchenLayout';
import { carriesCountertop } from './countertop';
import { LAYOUT } from './constants';
import { DEFAULT_PALETTE } from './palette';

interface SheetRef { id: string; brand: string; type: string; thickness: number }

const MOTION_TXT: Record<string, string> = {
  SWING: 'hinged door', LIFT: 'lift-up door', SLIDE: 'drawer front (slides out)',
  PULL_OUT: 'pull-out front', FIXED: 'fixed panel',
};
const KIND_TXT: Record<string, string> = {
  DOOR: 'door', DRAWER: 'drawer front', APRON: 'apron panel', PANEL: 'decor panel', FILLER: 'filler strip',
};

function facadePhrase(f: FacadeGeo): string {
  const size = `${Math.round(f.widthMm)}x${Math.round(f.heightMm)} mm`;
  if (f.kind === 'DRAWER') return `drawer front ${size} (slides out)`;
  if (f.kind === 'DOOR' && f.motion === 'LIFT') return `lift-up door ${size}`;
  if (f.kind === 'DOOR') return `door ${size} (hinged door, hinged on the ${f.hinge === 'RIGHT' ? 'right' : 'left'})`;
  return `${KIND_TXT[f.kind] ?? 'front'} ${size} (${MOTION_TXT[f.motion] ?? 'fixed'})`;
}

/** Identical fronts of one zone collapse into "3 × drawer front 784x176 mm (slides out)". */
function zoneFrontsText(facades: FacadeGeo[]): string {
  const groups = new Map<string, { f: FacadeGeo; n: number }>();
  for (const f of facades) {
    const key = `${f.kind}|${Math.round(f.widthMm)}|${Math.round(f.heightMm)}|${f.motion}|${f.hinge ?? ''}`;
    const g = groups.get(key);
    if (g) g.n += 1; else groups.set(key, { f, n: 1 });
  }
  return [...groups.values()].map(({ f, n }) => (n > 1 ? `${n} x ` : '') + facadePhrase(f)).join('; ');
}

export function buildAiRenderPrompt(args: {
  cabinets: ReadonlyArray<CabinetObject>;
  layout: KitchenLayout;
  accessories?: ReadonlyArray<PlacedAccessory>;
  countertopThicknessMm: number;
  countertopDepthMm?: number;
  countertopTexturePath?: string;
  splashMm?: number;
  woods: ReadonlyArray<SheetRef>;
}): string {
  const { cabinets, layout, countertopThicknessMm, woods } = args;
  const accessories = args.accessories ?? [];
  const splashMm = args.splashMm ?? 600;
  const lines: string[] = [];
  lines.push('Photorealistic interior photograph of EXACTLY this kitchen design, built to the specification below. Keep the layout, the number of cabinets, every door and drawer, their positions, proportions and the camera angle identical to the attached render — change only lighting, material realism, reflections and photographic quality. Do not add, remove, move, resize or restyle any cabinet, door, drawer, handle or appliance. No people, no text, no watermark.');
  lines.push('');
  lines.push(`ROOM: ${layout.widthMm} x ${layout.depthMm ?? 3000} mm, ceiling height ${layout.heightMm ?? 2600} mm.`);
  lines.push(`FRONT STYLE & COLOUR: ${DEFAULT_PALETTE.front.english} (${DEFAULT_PALETTE.front.color}), carcase ${DEFAULT_PALETTE.carcase.english}. Doors are flat slab fronts unless stated; drawers are flat fronts stacked with 3 mm shadow gaps.`);

  const counters = cabinets.filter(carriesCountertop);
  const counterTopMm = (counters.length ? Math.max(...counters.map((c) => c.height)) : LAYOUT.DEFAULT_BASE_HEIGHT_MM) + countertopThicknessMm;
  const wallRef = { counterTopMm, defaultGapMm: splashMm, roomHeightMm: layout.heightMm ?? 2600 };

  for (const run of runsOf(layout)) {
    const onRun = cabinets.filter((c) => runOf(c) === (run as RunId)).sort((a, b) => a.positionX - b.positionX);
    if (!onRun.length) continue;
    lines.push('');
    lines.push(`WALL ${run} (${wallLengthOf(layout, run)} mm long) — cabinets left to right:`);
    let prevEnd: number | null = null;
    onRun.forEach((cab, i) => {
      const isWall = cab.category === 'WALL_UNIT';
      const carcaseSheet = woods.find((x) => x.id === cab.carcaseMaterialId);
      const frontSheet = woods.find((x) => x.id === cab.frontMaterialId);
      const th = carcaseSheet?.thickness ?? cab.carcaseThickness ?? 18;
      const fTh = frontSheet?.thickness ?? cab.frontThickness ?? 18;
      const from = Math.round(cab.positionX);
      const gap = prevEnd !== null && from - prevEnd > 0 ? ` (${from - prevEnd} mm gap before it)` : '';
      prevEnd = from + cab.width;
      const head = `${i + 1}. "${cab.name}" — ${isWall ? 'WALL cabinet' : 'BASE cabinet'} ${cab.width}w x ${cab.height}h x ${cab.depth}d mm, occupying ${from}-${from + cab.width} mm along wall ${run}${gap}.`;
      lines.push(head);
      const mount = isWall
        ? `   Mounted on the wall: bottom edge ${Math.round(wallBottomMmOf(cab, wallRef))} mm above the floor, top at ${Math.round(wallBottomMmOf(cab, wallRef) + cab.height)} mm.`
        : (() => { const b = baseOf(cab); return b.type === 'NONE' ? '   Stands directly on the floor (no plinth).' : `   Stands on ${b.type === 'PLINTH' ? 'a recessed plinth' : b.type === 'WOOD' ? 'a wooden base frame' : 'legs'} ${b.heightMm} mm high; the body starts at ${b.heightMm} mm.`; })();
      lines.push(mount);
      lines.push(`   Carcase ${th} mm${carcaseSheet ? ` ${carcaseSheet.brand} ${carcaseSheet.type}` : ''}; fronts ${fTh} mm${frontSheet ? ` ${frontSheet.brand} ${frontSheet.type}` : ''}.`);
      try {
        const geo = assemblyGeometry(cab, {
          carcaseTh: th, frontTh: fTh,
          zoneFrontTh: zoneFrontChoicesOf(cab, woods as never, fTh).map((c) => c?.thicknessMm),
          lift: false, inset: false,
        });
        const zones = cab.zones ?? [];
        zones.forEach((zone, zi) => {
          const facades = geo.facades.filter((f) => f.zoneIndex === zi).sort((a, b) => a.yMm - b.yMm || a.xMm - b.xMm);
          const zoneSheetChoice = zoneFrontChoicesOf(cab, woods as never, fTh)[zi];
          const sheet = zoneSheetChoice ? woods.find((x) => x.id === zoneSheetChoice.materialId) : undefined;
          const bits: string[] = [];
          if (facades.length) {
            const grain = zone.grainDirection ?? (facades[0] ? grainOf(facades[0].kind) : 'vertical');
            bits.push(`fronts (bottom to top): ${zoneFrontsText(facades)}`);
            bits.push(`wood grain ${grain}${zone.grainFlip ? ', reversed 180 degrees' : ''}`);
            if (sheet) bits.push(`sheet ${sheet.brand} ${sheet.type}`);
            bits.push(geo.channels.some((ch) => ch.zoneIndex === zi) || zone.openingMode === 'GOLA'
              ? 'handle-less (recessed gola profile)'
              : zone.openingMode === 'PUSH' ? 'push-to-open, no handles' : 'with bar handles');
          } else if (zone.kind === 'OPEN') {
            bits.push('open shelving, no fronts');
          }
          if ((zone.kind === 'DOORS' || zone.kind === 'OPEN') && zone.shelves) bits.push(`inside: ${zone.shelves} adjustable ${zone.shelves === 1 ? 'shelf' : 'shelves'}`);
          const app = geo.appliances.find((a) => a.zoneIndex === zi);
          if (app) {
            const lib = app.libraryId ? getAccessory(app.libraryId) : undefined;
            bits.push(`appliance niche ${Math.round(app.sizeMm[0])}x${Math.round(app.sizeMm[1])}x${Math.round(app.sizeMm[2])} mm for a built-in ${String(app.appliance).toLowerCase()}${lib ? ` (${lib.nameAr})` : ''} supplied by the customer — ${app.frontVisible ? 'the appliance front stays visible' : 'hidden behind a decor panel matching the fronts'}`);
          }
          if (bits.length) lines.push(`   Zone ${zi + 1} (${zone.kind.toLowerCase()}): ${bits.join('; ')}.`);
        });
      } catch {
        (cab.zones ?? []).forEach((zone, zi) => {
          lines.push(`   Zone ${zi + 1} (${zone.kind.toLowerCase()}): ${zone.count ?? 1} front(s)${zone.shelves ? `, ${zone.shelves} shelves inside` : ''}.`);
        });
      }
    });
  }

  lines.push('');
  lines.push(`WORKTOP: ${countertopThicknessMm} mm thick${args.countertopDepthMm ? `, ${args.countertopDepthMm} mm deep` : ''}${args.countertopTexturePath ? `, material file ${args.countertopTexturePath.split('/').pop()}` : ', light stone with subtle veining'}, running continuously over the base cabinets; splashback zone ${splashMm} mm up the wall behind it.`);
  if (accessories.length) {
    lines.push('');
    lines.push('APPLIANCES & ACCESSORIES (keep each exactly where it is):');
    const scene = sceneRefOf(cabinets as never, counterTopMm);
    for (const a of accessories) {
      const item = getAccessory(a.catalogId);
      const fp = footprintOf(a, accessories, cabinets as never, scene) ?? (item ? { w: item.sizeMm.w, h: item.sizeMm.h, d: item.sizeMm.d } : null);
      lines.push(`- ${item?.nameAr ?? a.catalogId}${fp ? `: ${Math.round(fp.w)}x${Math.round(fp.h)}x${Math.round(fp.d)} mm` : ''}, centred at ${Math.round(a.xMm)} mm along wall ${a.run ?? 'A'}.`);
    }
  }
  lines.push('');
  lines.push('PHOTOGRAPHY: bright modern kitchen, soft daylight, realistic wood grain following the stated direction on every front, stone worktop, gentle contact shadows, high-end architectural photography, 16:9.');
  return lines.join('\n');
}
