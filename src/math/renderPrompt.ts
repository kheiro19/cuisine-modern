// src/math/renderPrompt.ts
// The "prepare for AI" text: a precise, copy-paste prompt built ONLY from the design's real data (the same
// numbers the app manufactures from), for pasting with the still into any image AI (Gemini/ChatGPT/Claude apps).
// The instruction block begs the model to preserve the geometry — image models may still drift, so the app
// labels every AI output "marketing visual, not for execution". Nothing here invents a dimension.
import type { CabinetObject } from '../types/flatma';
import { getAccessory } from '../data/accessoryCatalog';
import type { PlacedAccessory } from './accessoryPlacement';
import type { KitchenLayout } from './kitchenLayout';
import { runsOf, wallLengthOf } from './kitchenLayout';

export function buildAiRenderPrompt(args: {
  cabinets: ReadonlyArray<CabinetObject>;
  layout: KitchenLayout;
  accessories?: ReadonlyArray<PlacedAccessory>;
  countertopThicknessMm: number;
  woods: ReadonlyArray<{ brand: string; type: string }>;
}): string {
  const { cabinets, layout, countertopThicknessMm, woods } = args;
  const accessories = args.accessories ?? [];
  const cats = (c: CabinetObject['category']) => cabinets.filter((x) => x.category === c);
  const base = cats('BASE_UNIT'), wall = cats('WALL_UNIT');
  const lines: string[] = [];
  lines.push('Photorealistic interior photograph of EXACTLY this kitchen design. Keep the layout, number of cabinets, their positions, proportions and camera angle identical to the attached render — change only lighting, materials realism, reflections and photographic quality. Do not add, remove, move or resize any cabinet, door, drawer, handle or appliance. No people, no text, no watermark.');
  lines.push('');
  lines.push(`Room: ${layout.widthMm} x ${layout.depthMm ?? 3000} mm, height ${layout.heightMm ?? 2600} mm. Walls used: ${runsOf(layout).map((r) => `${r} (${wallLengthOf(layout, r)} mm)`).join(', ')}.`);
  if (base.length) lines.push(`Base cabinets (${base.length}): ${base.map((c) => `${c.name} ${c.width}x${c.height}x${c.depth}`).join('; ')} (mm).`);
  if (wall.length) lines.push(`Wall cabinets (${wall.length}): ${wall.map((c) => `${c.name} ${c.width}x${c.height}x${c.depth}`).join('; ')} (mm).`);
  lines.push(`Worktop thickness: ${countertopThicknessMm} mm.`);
  const mats = [...new Map(woods.map((w) => [`${w.brand}|${w.type}`, w])).values()];
  if (mats.length) lines.push(`Cabinet sheet materials: ${mats.map((w) => `${w.brand} — ${w.type}`).join(', ')}.`);
  if (accessories.length) {
    const names = accessories.map((a) => getAccessory(a.catalogId)?.nameAr ?? a.catalogId);
    lines.push(`Appliances & accessories visible (keep them in place): ${names.join(', ')}.`);
  }
  lines.push('');
  lines.push('Style: bright modern kitchen, soft daylight from the left, realistic wood grain on the fronts, stone worktop with subtle veining, gentle shadows, high-end architectural photography, 16:9.');
  return lines.join('\n');
}
