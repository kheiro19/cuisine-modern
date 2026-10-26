// src/components/AccessoryTransformEditor.tsx
// The size & direction editor of one placed library piece: three size fields (mm, committed on Enter/blur like the rest
// of the app), a quarter-turn button, a mirror button and a factory reset. Shared by the library drawer and the 3D
// selection panel, so a piece behaves identically wherever it is edited. All rules live in math/accessoryPlacement.ts:
// this component only asks, and shows the refusal (with the largest size that would fit) when the place says no.
import { useState } from 'react';
import type { AccessoryItem } from '../data/accessoryCatalog';
import { sizeOf, type PlacedAccessory, type TransformResult } from '../math/accessoryPlacement';

export interface AccessoryTransformEditorProps {
  item: AccessoryItem;
  placed: PlacedAccessory;
  onResize: (id: string, size: { w: number; h: number; d: number }) => TransformResult;
  onRotate: (id: string, dir: 1 | -1) => TransformResult;
  onFlip: (id: string) => TransformResult;
  onReset: (id: string) => void;
  /** Dark (library drawer) or light (3D overlay) chrome. */
  tone?: 'dark' | 'light';
}

const ROT_LABEL: Record<number, string> = { 0: '0°', 90: '90°', 180: '180°', 270: '270°' };

export default function AccessoryTransformEditor({ item, placed, onResize, onRotate, onFlip, onReset, tone = 'dark' }: AccessoryTransformEditorProps) {
  const size = sizeOf(placed, item);
  const [note, setNote] = useState<string | null>(null);
  const dark = tone === 'dark';
  const field = `w-[64px] rounded-md border px-1.5 py-1 text-[11px] font-bold ${dark ? 'bg-slate-900 border-slate-600 text-slate-100' : 'bg-white border-slate-300 text-slate-800'}`;
  const btn = `rounded-md border px-2 py-1 text-[11px] font-black cursor-pointer ${dark ? 'border-slate-600 bg-slate-800 text-slate-100 hover:bg-slate-700' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-100'}`;

  const commit = (axis: 'w' | 'h' | 'd', v: number) => {
    if (!Number.isFinite(v)) return;
    const next = { ...size, [axis]: Math.round(v) };
    if (next[axis] === size[axis]) return;
    const r = onResize(placed.id, next);
    setNote(r.ok ? null : r.error);
  };
  const act = (r: TransformResult) => setNote(r.ok ? null : r.error);
  const axis = (label: string, k: 'w' | 'h' | 'd') => (
    <label className="flex items-center gap-1" key={k}>
      <span className={dark ? 'text-slate-400' : 'text-slate-500'}>{label}</span>
      <input type="number" min={10} step={10} defaultValue={size[k]} key={`${placed.id}:${k}:${size[k]}:${placed.rotY ?? 0}`}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        onBlur={(e) => commit(k, Number(e.target.value))}
        className={field} dir="ltr" aria-label={`${item.nameAr} — ${label} (مم)`} />
    </label>
  );

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-[10px]">
        {axis('عرض', 'w')}
        {axis('ارتفاع', 'h')}
        {axis('عمق', 'd')}
        <span className={dark ? 'text-slate-500' : 'text-slate-400'}>مم</span>
        <span className="flex gap-1 ms-1">
          <button type="button" title="تدوير 90° (يتبادل العرض والعمق)" onClick={() => act(onRotate(placed.id, 1))} className={btn}>⟳ تدوير {ROT_LABEL[placed.rotY ?? 0]}</button>
          <button type="button" title="قلب مرآتي يمين/يسار (باب الجهة الأخرى)" onClick={() => act(onFlip(placed.id))} className={`${btn} ${placed.flip ? (dark ? 'ring-2 ring-amber-400' : 'ring-2 ring-amber-500') : ''}`}>⇋ قلب{placed.flip ? ' ✓' : ''}</button>
          {(placed.sizeMm || placed.rotY || placed.flip) && (
            <button type="button" title="العودة لمقاس واتجاه الكتالوج" onClick={() => { onReset(placed.id); setNote(null); }} className={btn}>⟲ ضبط المصنع</button>
          )}
        </span>
      </div>
      {(placed.rotY === 90 || placed.rotY === 270) && <span className={`text-[9px] ${dark ? 'text-sky-300' : 'text-sky-700'}`}>مدوّرة: العرض والعمق متبادلان في المكان الذي تشغله.</span>}
      {note && <p role="alert" className={`text-[10px] font-bold rounded-md px-2 py-1 ${dark ? 'bg-rose-950/60 text-rose-200 border border-rose-800' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>⛔ {note}</p>}
    </div>
  );
}
