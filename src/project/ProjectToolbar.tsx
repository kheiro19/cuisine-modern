// src/project/ProjectToolbar.tsx
import type { ProjectFile } from './projectFile';
import type { ProjectStatus } from './useProjectFile';

interface Props {
  name: string;
  onName: (v: string) => void;
  dirty: boolean;
  lastSavedAt: string | null;
  inPlace: boolean;
  status: ProjectStatus;
  onClearStatus: () => void;
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  recovery: ProjectFile | null;
  onRecover: () => void;
  onDismissRecovery: () => void;
}

const btn = 'px-3 py-1 rounded-md border text-[11px] font-bold bg-white border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer';

export default function ProjectToolbar(p: Props) {
  return (
    <div className="flex flex-col gap-1" style={{ direction: 'rtl' }}>
      <div className="flex items-center gap-2 flex-wrap">
        <button type="button" className={btn} onClick={p.onNew} title="مشروع جديد (يبقى المخزون)">📄 جديد</button>
        <button type="button" className={btn} onClick={p.onOpen} title="فتح ملف مشروع من الجهاز (Ctrl+O)">📂 فتح</button>
        <button type="button" className={`${btn} ${p.dirty ? 'border-indigo-500 text-indigo-700' : ''}`} onClick={p.onSave} title="حفظ (Ctrl+S)">💾 حفظ{p.dirty ? ' •' : ''}</button>
        {p.inPlace && <button type="button" className={btn} onClick={p.onSaveAs} title="حفظ باسم / مكان آخر (Ctrl+Shift+S)">📑 حفظ باسم</button>}
        <input
          value={p.name}
          onChange={(e) => p.onName(e.target.value)}
          aria-label="اسم المشروع"
          className="px-2 py-1 rounded-md border border-slate-300 text-[11px] w-44"
        />
        <span className="text-[10px] text-slate-500">
          {p.dirty ? 'تغييرات غير محفوظة' : p.lastSavedAt ? `آخر حفظ ${p.lastSavedAt}` : ''}
        </span>
      </div>

      {p.status && (
        <div
          className={`text-[11px] rounded-md px-2 py-1 border flex justify-between items-center ${
            p.status.kind === 'error' ? 'bg-red-50 border-red-300 text-red-700' : p.status.kind === 'ok' ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : 'bg-slate-50 border-slate-200 text-slate-600'
          }`}
        >
          <span>{p.status.text}</span>
          <button type="button" onClick={p.onClearStatus} className="px-1 cursor-pointer" aria-label="إغلاق">✕</button>
        </div>
      )}

      {p.recovery && (
        <div className="text-[11px] rounded-md px-2 py-1 border bg-amber-50 border-amber-300 text-amber-800 flex items-center gap-2">
          <span>
            وُجد عمل غير محفوظ من الجلسة السابقة: «{p.recovery.name}» ({p.recovery.data.cabinets.length} خزانة).
          </span>
          <button type="button" className={btn} onClick={p.onRecover}>استرجاع</button>
          <button type="button" className={btn} onClick={p.onDismissRecovery}>تجاهل</button>
        </div>
      )}
    </div>
  );
}
