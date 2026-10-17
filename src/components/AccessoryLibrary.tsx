// src/components/AccessoryLibrary.tsx
// The accessories library panel: search or browse by category, pick a finish, press "إضافة للتصميم" and the piece appears in
// the 3D showroom; the list below moves, recolours or removes what was added.
import React, { useMemo, useState } from 'react';
import {
  ACCESSORY_CATEGORIES,
  AccessoryCategory,
  AccessoryItem,
  CATEGORY_ICONS,
  CATEGORY_LABELS,
  FINISHES,
  FinishKey,
  MOUNT_LABELS,
  accessoriesOf,
  allAccessories,
  getAccessory,
  searchAccessories,
} from '../data/accessoryCatalog';
import { creditsOf, resolveGlb } from '../data/libraryManifest';
import { useModelLibrary } from './useModelLibrary';
import { CabinetLite, NudgeResult, PlaceResult, PlacedAccessory } from '../math/accessoryPlacement';

interface AccessoryLibraryProps {
  cabinets: ReadonlyArray<CabinetLite>;
  accessories: ReadonlyArray<PlacedAccessory>;
  onAdd: (catalogId: string, hostCabinetId?: string, finish?: FinishKey) => PlaceResult;
  onNudge: (id: string, dxMm: number) => NudgeResult;
  onRemove: (id: string) => void;
  onFinish: (id: string, finish: FinishKey) => void;
  onClear: () => void;
}

type Message = { kind: 'ok' | 'warn' | 'err'; text: string };

const NUDGE_MM = 50;

function FinishSwatches({ item, value, onPick }: { item: AccessoryItem; value?: FinishKey; onPick: (k: FinishKey) => void }) {
  if (!item.finishes || item.finishes.length < 2) return null;
  const current = value && item.finishes.includes(value) ? value : item.finishes[0];
  return (
    <div className="flex items-center gap-1" role="radiogroup" aria-label="التشطيب">
      {item.finishes.map((k) => (
        <button
          key={k}
          type="button"
          role="radio"
          aria-checked={current === k}
          aria-label={FINISHES[k].labelAr}
          title={FINISHES[k].labelAr}
          onClick={() => onPick(k)}
          className={`w-4 h-4 rounded-full border cursor-pointer ${current === k ? 'ring-2 ring-amber-400 border-white' : 'border-slate-500'}`}
          style={{ backgroundColor: FINISHES[k].c }}
        />
      ))}
    </div>
  );
}

export default function AccessoryLibrary({ cabinets, accessories, onAdd, onNudge, onRemove, onFinish, onClear }: AccessoryLibraryProps) {
  const [open, setOpen] = useState<boolean>(true);
  const [category, setCategory] = useState<AccessoryCategory>('ELECTRICAL');
  const [query, setQuery] = useState<string>('');
  const [hostId, setHostId] = useState<string>('');
  const [finishes, setFinishes] = useState<Record<string, FinishKey>>({});
  const [message, setMessage] = useState<Message | null>(null);

  const library = useModelLibrary();
  const searching = query.trim().length > 0;
  // `library.extraItems` changes when the external library has loaded: the lists are read again.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const items = useMemo(() => (searching ? searchAccessories(query) : accessoriesOf(category)), [searching, query, category, library.extraItems]);
  const credits = useMemo(() => creditsOf(library.manifest), [library.manifest]);
  const problems = [...library.manifest.warnings, ...library.errors];
  const glbOf = (item: AccessoryItem) => resolveGlb(item.id, item.model, library.manifest);
  const nameOf = (id?: string) => cabinets.find((c) => c.id === id)?.name ?? '';

  // The cabinet a hosted piece goes into: the chosen one when it suits the piece, else the first that does.
  const hostFor = (item: AccessoryItem): string | undefined => {
    if (item.mount !== 'CABINET_UNDER' && item.mount !== 'CABINET_INSIDE') return undefined;
    const valid = cabinets.filter((c) => (item.mount === 'CABINET_UNDER' ? c.category === 'WALL_UNIT' : true));
    return valid.find((c) => c.id === hostId)?.id ?? valid[0]?.id;
  };

  const add = (item: AccessoryItem) => {
    const r = onAdd(item.id, hostFor(item), finishes[item.id]);
    if (!r.ok) setMessage({ kind: 'err', text: r.error });
    else if (r.warnings.length > 0) setMessage({ kind: 'warn', text: r.warnings.join(' ') });
    else setMessage({ kind: 'ok', text: `أُضيفت «${item.nameAr}» إلى التصميم.` });
  };

  const nudge = (id: string, dx: number) => {
    const r = onNudge(id, dx);
    setMessage(r.ok ? null : { kind: 'err', text: r.error });
  };

  const tone = { ok: 'bg-emerald-50 text-emerald-800 border-emerald-200', warn: 'bg-amber-50 text-amber-900 border-amber-300', err: 'bg-rose-50 text-rose-800 border-rose-200' };

  return (
    <section className="mt-3 bg-slate-900 text-slate-100 rounded-2xl border border-slate-700 shadow-md overflow-hidden" style={{ direction: 'rtl' }}>
      <button type="button" onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between px-4 py-2.5 bg-slate-800 hover:bg-slate-700 cursor-pointer">
        <span className="text-[12px] font-extrabold tracking-wide">🧰 مكتبة المطبخ العصري · {allAccessories().length} قطعة</span>
        <span className="text-[10px] text-slate-400">{accessories.length > 0 ? `${accessories.length} قطعة في التصميم` : 'اضغط للفتح'} {open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="p-3 space-y-3">
          <input
            type="search"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setMessage(null); }}
            placeholder="ابحث: محبس، ثلاجة، pendant، موقد..."
            aria-label="بحث في المكتبة"
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-[12px] text-slate-100 placeholder-slate-500 focus:outline-none focus:border-amber-400"
          />

          {!searching && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" role="tablist">
              {ACCESSORY_CATEGORIES.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={category === c}
                  onClick={() => { setCategory(c); setMessage(null); }}
                  className={`whitespace-nowrap px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all cursor-pointer ${category === c ? 'bg-amber-500 text-slate-900 border-amber-400' : 'bg-slate-800 text-slate-300 border-slate-600 hover:border-amber-400'}`}
                >
                  {CATEGORY_ICONS[c]} {CATEGORY_LABELS[c]} <span className="opacity-70">({accessoriesOf(c).length})</span>
                </button>
              ))}
            </div>
          )}

          {cabinets.length > 0 && (
            <label className="flex items-center gap-2 text-[10px] text-slate-300">
              الخزانة المستهدفة (للمنظّمات والإضاءة والشفاط المسطح):
              <select value={hostId} onChange={(e) => setHostId(e.target.value)} className="bg-slate-800 border border-slate-600 rounded-md px-2 py-1 text-[11px] text-slate-100">
                <option value="">تلقائي (أول خزانة مناسبة)</option>
                {cabinets.map((c) => (
                  <option key={c.id} value={c.id}>{c.name ?? c.id} — {c.width}×{c.height}</option>
                ))}
              </select>
            </label>
          )}

          {message && <p role="status" className={`text-[11px] font-bold border rounded-lg px-3 py-1.5 ${tone[message.kind]}`}>{message.text}</p>}

          {searching && <p className="text-[10px] text-slate-400">{items.length > 0 ? `${items.length} نتيجة` : 'لا توجد نتائج لهذا البحث.'}</p>}

          <div className="grid grid-cols-2 lg:grid-cols-3 gap-2 max-h-[520px] overflow-y-auto pr-1">
            {items.map((item) => (
              <article key={item.id} className="bg-slate-800 border border-slate-700 rounded-xl p-2.5 flex flex-col gap-1.5 hover:border-amber-400 transition-colors">
                <div className="flex items-start justify-between">
                  <span className="text-2xl leading-none" aria-hidden="true">{item.icon}</span>
                  <span className="flex flex-col items-end gap-0.5">
                    {glbOf(item) && <span className="text-[9px] font-bold text-emerald-300">نموذج حقيقي</span>}
                    {!glbOf(item) && item.codeModel && <span className="text-[9px] font-bold text-emerald-300">نموذج مفصّل</span>}
                    {item.external && <span className="text-[9px] font-bold text-sky-300">من مكتبتك</span>}
                    {searching && <span className="text-[9px] text-slate-400">{CATEGORY_LABELS[item.category]}</span>}
                  </span>
                </div>
                <h3 className="text-[11px] font-extrabold leading-snug">{item.nameAr}</h3>
                <p className="text-[9px] text-slate-400" dir="ltr" style={{ textAlign: 'right' }}>{item.nameEn}</p>
                <p className="text-[9px] text-slate-300">{item.sizeMm.w} × {item.sizeMm.d} × {item.sizeMm.h} مم · {MOUNT_LABELS[item.mount]}</p>
                {item.note && <p className="text-[9px] text-amber-300 leading-snug">{item.note}</p>}
                {(!glbOf(item) || glbOf(item)!.tintMaterials.length > 0) && <FinishSwatches item={item} value={finishes[item.id]} onPick={(k) => setFinishes((f) => ({ ...f, [item.id]: k }))} />}
                <button type="button" onClick={() => add(item)} className="mt-auto bg-amber-500 hover:bg-amber-400 text-slate-900 text-[11px] font-extrabold rounded-lg py-1.5 cursor-pointer">
                  ＋ إضافة للتصميم
                </button>
              </article>
            ))}
          </div>

          {(credits.length > 0 || problems.length > 0) && (
            <details className="border-t border-slate-700 pt-2 text-[10px] text-slate-300">
              <summary className="cursor-pointer font-bold">
                مكتبة النماذج الخارجية: {credits.length} ملف{problems.length > 0 ? ` · ${problems.length} تنبيه` : ''}
              </summary>
              <ul className="mt-1.5 space-y-0.5">
                {credits.map((c) => (
                  <li key={c.stem} dir="ltr" style={{ textAlign: 'right' }}>
                    {c.stem} — {c.license || 'بدون ترخيص مسجّل'}{c.author ? ` — ${c.author}` : ''}
                  </li>
                ))}
                {problems.map((p, i) => (
                  <li key={`p${i}`} className="text-amber-300" dir="ltr" style={{ textAlign: 'right' }}>⚠ {p}</li>
                ))}
              </ul>
            </details>
          )}

          {accessories.length > 0 && (
            <div className="border-t border-slate-700 pt-2">
              <div className="flex items-center justify-between mb-1.5">
                <h4 className="text-[11px] font-extrabold">القطع المضافة ({accessories.length})</h4>
                <button type="button" onClick={() => { onClear(); setMessage(null); }} className="text-[10px] text-rose-300 hover:text-rose-200 cursor-pointer">حذف الكل</button>
              </div>
              <ul className="space-y-1 max-h-60 overflow-y-auto pr-1">
                {accessories.map((a) => {
                  const item = getAccessory(a.catalogId);
                  if (!item) return null;
                  const hosted = item.mount === 'CABINET_INSIDE' || item.mount === 'CABINET_UNDER';
                  return (
                    <li key={a.id} className="flex items-center gap-2 bg-slate-800 rounded-lg px-2.5 py-1.5">
                      <span aria-hidden="true">{item.icon}</span>
                      <span className="flex-1 text-[11px] font-bold truncate">
                        {item.nameAr}
                        {hosted && <span className="text-slate-400 font-normal"> — {nameOf(a.cabinetId)}</span>}
                      </span>
                      {(!glbOf(item) || glbOf(item)!.tintMaterials.length > 0) && <FinishSwatches item={item} value={a.finish} onPick={(k) => onFinish(a.id, k)} />}
                      {!hosted && !item.autoSpan && (
                        <span className="flex gap-1" dir="ltr">
                          <button type="button" title="تحريك لليسار 5 سم" aria-label="تحريك لليسار" onClick={() => nudge(a.id, -NUDGE_MM)} className="w-7 h-7 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px] cursor-pointer">◀</button>
                          <button type="button" title="تحريك لليمين 5 سم" aria-label="تحريك لليمين" onClick={() => nudge(a.id, NUDGE_MM)} className="w-7 h-7 rounded-md bg-slate-700 hover:bg-slate-600 text-[11px] cursor-pointer">▶</button>
                        </span>
                      )}
                      <button type="button" title="حذف" aria-label="حذف" onClick={() => { onRemove(a.id); setMessage(null); }} className="w-7 h-7 rounded-md bg-rose-600/80 hover:bg-rose-500 text-[11px] cursor-pointer">🗑</button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
