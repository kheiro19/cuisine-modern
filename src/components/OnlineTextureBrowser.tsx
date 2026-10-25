// src/components/OnlineTextureBrowser.tsx
// Browse the CC0 textures of Poly Haven and ambientCG from inside the "Workshop Matrix Online" tab and apply one with a tap:
// no download, no visit to the sites. Every refusal (CORS, a bad status, a page that is not an image) is shown in clear words.
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  OnlineSource,
  OnlineTexture,
  QUICK_FILTERS,
  SOURCE_LABEL,
  ambientListUrl,
  filterTextures,
  parseAmbientList,
  parsePolyHavenList,
  polyHavenListUrl,
} from '../data/onlineSources';
import { SourceStatus, checkSources, loadTextureBlobUrl } from '../data/onlineTextureLoader';
import { makeRewrite } from '../data/onlineConfig';
import type { TextureEntry } from '../data/textureCatalog';

interface OnlineTextureBrowserProps {
  /** Called with the texture ready to use (its address is a blob: of the colour map). */
  onPick: (entry: TextureEntry) => void;
}

const PAGE = 48;
let polyHavenCache: OnlineTexture[] | null = null; // the Poly Haven list is one answer of about 700 textures: asked once per session

const reason = (e: unknown) => (e instanceof Error ? e.message : String(e));
// ambientCG is reached through a same-origin proxy (vite.config.ts in development), see src/data/onlineConfig.ts
const rewrite = makeRewrite(import.meta.env);
const PROXY_HINT = 'ambientCG لا يسمح للمتصفح بقراءة ملفاته مباشرة، لذلك يمرّ عبر وسيط في vite.config.ts: أعد تشغيل `npm run dev` بعد هذا التحديث. وعلى استضافة ثابتة اضبط VITE_AMBIENTCG_PROXY.';

export default function OnlineTextureBrowser({ onPick }: OnlineTextureBrowserProps) {
  const [source, setSource] = useState<OnlineSource>('polyhaven');
  const [query, setQuery] = useState<string>('');
  const [debounced, setDebounced] = useState<string>('');
  const [items, setItems] = useState<OnlineTexture[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [shown, setShown] = useState<number>(PAGE);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [note, setNote] = useState<string>('');
  const [diag, setDiag] = useState<Record<string, SourceStatus> | null>(null);
  const ticket = useRef<number>(0); // an answer that arrives after a newer request is ignored

  useEffect(() => {
    const t = setTimeout(() => setDebounced(query), 400);
    return () => clearTimeout(t);
  }, [query]);

  // The list: Poly Haven once (filtered here), ambientCG per search.
  useEffect(() => {
    const mine = ++ticket.current;
    setError('');
    setShown(PAGE);
    setItems([]);
    setTotal(0);
    if (source === 'polyhaven' && polyHavenCache) {
      setItems(polyHavenCache);
      setTotal(polyHavenCache.length);
      return;
    }
    setLoading(true);
    (async () => {
      try {
        const url = source === 'polyhaven' ? polyHavenListUrl() : rewrite(ambientListUrl({ q: debounced, limit: PAGE }));
        const res = await fetch(url, { referrerPolicy: 'no-referrer' });
        if (!res.ok) throw new Error(`ردّ الموقع بالحالة ${res.status}.`);
        const json: unknown = await res.json();
        if (mine !== ticket.current) return;
        if (source === 'polyhaven') {
          polyHavenCache = parsePolyHavenList(json);
          setItems(polyHavenCache);
          setTotal(polyHavenCache.length);
          if (polyHavenCache.length === 0) setError('وصل الردّ من Poly Haven لكن بشكل غير متوقع (لا خامات).');
        } else {
          const r = parseAmbientList(json);
          setItems(r.items);
          setTotal(r.total);
          if (r.items.length === 0 && debounced === '') setError('وصل الردّ من ambientCG لكن بشكل غير متوقع (لا خامات).');
        }
      } catch (e) {
        if (mine !== ticket.current) return;
        setItems([]);
        setTotal(0);
        setError(`تعذّر تحميل قائمة ${SOURCE_LABEL[source]}: ${reason(e)} ${source === 'ambientcg' ? PROXY_HINT : 'اضغط «فحص الاتصال» وأرسل لي النتيجة.'}`);
      } finally {
        if (mine === ticket.current) setLoading(false);
      }
    })();
  }, [source, source === 'ambientcg' ? debounced : '']); // eslint-disable-line react-hooks/exhaustive-deps

  const visible = useMemo(() => (source === 'polyhaven' ? filterTextures(items, debounced) : items), [source, items, debounced]);

  const pick = async (tex: OnlineTexture) => {
    setBusyKey(tex.key);
    setError('');
    setNote('');
    try {
      const path = await loadTextureBlobUrl(tex, { rewrite });
      onPick({ id: `online_${tex.key}`, name: `${tex.name} · ${SOURCE_LABEL[tex.source]}`, path, finish: 'MDF Melamine Matt' });
      setNote(`طُبّقت «${tex.name}».`);
    } catch (e) {
      setError(`تعذّر استعمال «${tex.name}»: ${reason(e)}`);
    } finally {
      setBusyKey(null);
    }
  };

  const runDiag = async () => {
    setDiag(null);
    setDiag(await checkSources({ rewrite }));
  };

  const sizeNote = (t: OnlineTexture) => (t.sizeBytes ? ` · ${(t.sizeBytes / 1048576).toFixed(1)} م.ب` : '');

  return (
    <div className="mt-1 rounded-xl border border-slate-300 bg-white/80 p-2 space-y-2" style={{ direction: 'rtl' }}>
      <div className="flex flex-wrap items-center gap-1.5">
        {(['polyhaven', 'ambientcg'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => { setSource(s); setNote(''); }}
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold border cursor-pointer ${source === s ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-700 border-slate-300 hover:border-indigo-400'}`}
          >
            {SOURCE_LABEL[s]}
          </button>
        ))}
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ابحث بالإنجليزية: wood, marble, tiles..."
          dir="ltr"
          aria-label="بحث في الخامات"
          className="flex-1 min-w-[140px] border border-slate-300 rounded-md px-2 py-1 text-[11px] bg-white focus:outline-none focus:border-indigo-500"
        />
        <button type="button" onClick={runDiag} className="px-2 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer whitespace-nowrap">فحص الاتصال</button>
      </div>

      <div className="flex flex-wrap gap-1">
        {QUICK_FILTERS.map((f) => (
          <button key={f.q} type="button" onClick={() => setQuery(f.q)} className="px-2 py-0.5 rounded-full bg-slate-100 hover:bg-indigo-100 text-[10px] text-slate-700 cursor-pointer">{f.label}</button>
        ))}
        {query && <button type="button" onClick={() => setQuery('')} className="px-2 py-0.5 rounded-full bg-rose-50 text-[10px] text-rose-700 cursor-pointer">مسح</button>}
      </div>

      {diag && (
        <ul className="text-[10px] space-y-0.5" dir="ltr" style={{ textAlign: 'right' }}>
          {Object.entries(diag).map(([k, v]) => (
            <li key={k} className={v.ok ? 'text-emerald-700' : 'text-rose-700'}>{v.ok ? '✔' : '✖'} {k}: {v.message}</li>
          ))}
        </ul>
      )}
      {error && <p role="alert" className="text-[10px] font-bold text-rose-700 leading-snug">{error}</p>}
      {note && !error && <p role="status" className="text-[10px] font-bold text-emerald-700">{note}</p>}
      {loading && <p className="text-[10px] text-slate-500">جارٍ تحميل القائمة من {SOURCE_LABEL[source]}...</p>}
      {!loading && !error && visible.length === 0 && <p className="text-[10px] text-slate-500">لا توجد نتائج.</p>}

      <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-64 overflow-y-auto pr-0.5">
        {visible.slice(0, source === 'polyhaven' ? shown : visible.length).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => pick(t)}
            disabled={busyKey !== null}
            title={`${t.name}${sizeNote(t)}`}
            className="relative rounded-lg overflow-hidden border border-slate-200 hover:border-indigo-500 bg-slate-100 aspect-square cursor-pointer disabled:opacity-60"
          >
            <img src={t.thumbUrl} alt={t.name} loading="lazy" referrerPolicy="no-referrer" decoding="async" onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }} className="w-full h-full object-cover" />
            <span className="absolute bottom-0 inset-x-0 bg-black/55 text-white text-[8px] leading-tight px-0.5 py-0.5 truncate" dir="ltr">{t.name}</span>
            {busyKey === t.key && <span className="absolute inset-0 flex items-center justify-center bg-white/70 text-[10px] font-bold text-indigo-700">...</span>}
          </button>
        ))}
      </div>

      {source === 'polyhaven' && visible.length > shown && (
        <button type="button" onClick={() => setShown((n) => n + PAGE)} className="w-full py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-[10px] font-bold text-slate-700 cursor-pointer">عرض المزيد ({visible.length - shown})</button>
      )}

      <p className="text-[9px] text-slate-500 leading-snug">
        {source === 'polyhaven' ? (
          <>الخامات من <a href="https://polyhaven.com" target="_blank" rel="noreferrer" className="underline font-bold">Powered by Poly Haven</a> (CC0). {total > 0 ? `${total} خامة.` : ''}</>
        ) : (
          <>الخامات من <a href="https://ambientcg.com" target="_blank" rel="noreferrer" className="underline font-bold">ambientCG</a> (CC0). تُطبَّق صورة اللون المعاينة (نحو 1 ميغابايت)، وإن غابت تُنزَّل الحزمة المضغوطة (5 إلى 15 ميغابايت) وتُستخرج صورة اللون وحدها. {total > 0 ? `${total} خامة.` : ''}</>
        )}
      </p>
    </div>
  );
}
