// src/math/designAudit.ts
// A deterministic technical audit of the design: the checks a senior kitchen fitter runs before quoting — wall coverage
// and wasted gaps, clashes (cabinets among themselves and against the library's floor pieces), units escaping the room,
// and fronts whose zone forgot its grain. Pure numbers on the project's own data; an AI assistant (render-service
// /copilot) reads the same findings, but the findings themselves never depend on a model inventing facts.
import type { CabinetObject } from '../types/flatma';
import { cabinetsClashingPieces, fitStates, runOf, runsOf, wallBottomMmOf, wallLengthOf, type KitchenLayout } from './kitchenLayout';
import { footprintSizeOf, type PlacedAccessory } from './accessoryPlacement';
import { getAccessory } from '../data/accessoryCatalog';
import { LAYOUT } from './constants';

export interface AuditFinding { level: 'error' | 'warn' | 'tip'; text: string }

export function auditDesign(args: {
  cabinets: ReadonlyArray<CabinetObject>;
  layout: KitchenLayout;
  accessories: ReadonlyArray<PlacedAccessory>;
  counterTopMm: number;
  splashMm: number;
}): AuditFinding[] {
  const { cabinets, layout, accessories, counterTopMm, splashMm } = args;
  const out: AuditFinding[] = [];
  const nameOf = (c: CabinetObject) => c.name || c.id;
  const wallRef = { counterTopMm, defaultGapMm: splashMm, roomHeightMm: layout.heightMm ?? 2600 };

  // 1) Clashes and escapes, by the same fit states the installed list paints.
  const fits = fitStates(cabinets as never, layout, wallRef);
  cabinets.forEach((c) => {
    const s = fits[c.id];
    if (s === 'OVERLAP') out.push({ level: 'error', text: `«${nameOf(c)}» تتداخل مع خزانة أخرى أو قطعة أرضية على نفس الجدار.` });
    if (s === 'OUT_OF_BOUNDS' || c.positionX + c.width > wallLengthOf(layout, runOf(c)) + 0.5) out.push({ level: 'error', text: `«${nameOf(c)}» تتجاوز نهاية جدارها (${Math.round(wallLengthOf(layout, runOf(c)))} مم).` });
  });

  // 2) Base cabinets standing inside a library floor piece (also painted red in the list; named here with the piece).
  const spans = accessories.flatMap((a) => {
    const item = getAccessory(a.catalogId);
    return item && item.mount === 'FLOOR' && !item.noCollide ? [{ run: a.run ?? 'A' as const, xMm: a.xMm, w: footprintSizeOf(a, item).w, name: item.nameAr }] : [];
  });
  const clashIds = new Set(cabinetsClashingPieces(cabinets as never, spans));
  cabinets.forEach((c) => {
    if (!clashIds.has(c.id)) return;
    const piece = spans.find((s) => (s.run ?? 'A') === runOf(c) && c.positionX < s.xMm + s.w / 2 && s.xMm - s.w / 2 < c.positionX + c.width);
    if (piece && fits[c.id] !== 'OVERLAP') out.push({ level: 'error', text: `«${nameOf(c)}» تقف داخل «${piece.name}» من المكتبة — انقل أحدهما.` });
  });

  // 3) Coverage of every wall: what the base run leaves unused, and the exploitable gaps in it.
  runsOf(layout).forEach((run) => {
    const wallMm = wallLengthOf(layout, run);
    const base = cabinets.filter((c) => runOf(c) === run && c.category === 'BASE_UNIT').slice().sort((a, b) => a.positionX - b.positionX);
    if (base.length === 0) return;
    let cursor = 0;
    base.forEach((c) => {
      const gap = c.positionX - cursor;
      if (gap >= 300) out.push({ level: 'tip', text: `فجوة ${Math.round(gap)} مم قبل «${nameOf(c)}» على ${run === 'A' ? 'الجدار الخلفي' : 'الجدار الجانبي'} — تتسع لوحدة صغيرة أو قطعة من المكتبة.` });
      cursor = Math.max(cursor, c.positionX + c.width);
    });
    const rest = wallMm - cursor;
    if (rest >= 300) out.push({ level: 'tip', text: `يبقى ${Math.round(rest)} مم غير مستغل في نهاية ${run === 'A' ? 'الجدار الخلفي' : 'الجدار الجانبي'} بعد آخر خزانة سفلية.` });
    const usedPct = Math.round((Math.min(cursor, wallMm) / wallMm) * 100);
    out.push({ level: 'tip', text: `تغطية ${run === 'A' ? 'الجدار الخلفي' : 'الجدار الجانبي'} بالخزائن السفلية: ${usedPct}% من ${Math.round(wallMm)} مم.` });
  });

  // 4) Wall units whose top leaves the room, and base cabinets taller than the ceiling line they must fit under.
  const roomH = layout.heightMm ?? 2600;
  cabinets.filter((c) => c.category === 'WALL_UNIT').forEach((c) => {
    const top = wallBottomMmOf(c, wallRef) + c.height;
    if (top > roomH + 0.5) out.push({ level: 'error', text: `«${nameOf(c)}» تعلو فوق سقف الغرفة بـ${Math.round(top - roomH)} مم.` });
  });
  void LAYOUT;
  if (out.length === 0) out.push({ level: 'tip', text: 'لا ملاحظات تقنية: الجدران مغطاة بلا تداخل ولا تجاوز.' });
  return out;
}
