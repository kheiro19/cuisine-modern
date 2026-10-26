// src/project/useProjectFile.ts
// منطق «مشروع جديد / حفظ / حفظ باسم / فتح / استرجاع» فوق ملفات الجهاز. لا يعرف شيئاً عن الواجهة.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ProjectData, ProjectFile, DeviceHandle, canWriteInPlace, clearAutosave, fileNameFor, fingerprint, parseProject,
  readAutosave, readFromDevice, serializeProject, writeAutosave, writeToDevice,
} from './projectFile';

export type ProjectStatus = { kind: 'ok' | 'error' | 'info'; text: string } | null;

interface Options {
  /** الحالة الحالية كلها كما ستُحفظ. */
  data: ProjectData;
  /** يطبّق مشروعاً مقروءاً على الشاشة (الخزائن + المخزون + المخطط + سطح العمل + الإكسسوارات). */
  apply: (data: ProjectData) => void;
  /** يعيد الشاشة إلى مشروع فارغ. */
  reset: () => void;
}

export function useProjectFile({ data, apply, reset }: Options) {
  const [name, setName] = useState('مشروع جديد');
  const [status, setStatus] = useState<ProjectStatus>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const handleRef = useRef<DeviceHandle>(null);

  // بصمة آخر حالة محفوظة (أو الحالة الفارغة عند البداية) → «غير محفوظ» = اختلاف البصمة.
  const current = useMemo(() => fingerprint(data), [data]);
  // undefined = «خذ بصمة أول عرض قادم على أنها المحفوظة» (البداية، ومشروع جديد). '' = لا تطابق أي حالة → يبقى «غير محفوظ».
  const savedPrint = useRef<string | undefined>(undefined);
  if (savedPrint.current === undefined) savedPrint.current = current;
  const dirty = current !== savedPrint.current;
  const hasWork = data.cabinets.length > 0;

  const [recovery, setRecovery] = useState<ProjectFile | null>(() => {
    const a = readAutosave();
    return a && a.data.cabinets.length > 0 ? a : null;
  });

  const notify = (s: ProjectStatus) => setStatus(s);
  const confirmDiscard = () => !dirty || !hasWork || window.confirm('لديك تغييرات غير محفوظة ستضيع. هل تريد المتابعة؟');

  const markSaved = (fp: string) => {
    savedPrint.current = fp;
    setLastSavedAt(new Date().toLocaleTimeString('ar-DZ', { hour: '2-digit', minute: '2-digit' }));
    clearAutosave();
    setRecovery(null);
  };

  const save = useCallback(async (forcePicker = false) => {
    try {
      const text = serializeProject(name, data);
      const res = await writeToDevice(text, fileNameFor(name), handleRef.current, forcePicker);
      if (res.cancelled) return;
      handleRef.current = res.handle;
      markSaved(fingerprint(data));
      notify({ kind: 'ok', text: res.handle ? `تم الحفظ في «${res.handle.name}».` : `تم تنزيل «${fileNameFor(name)}» إلى مجلد التنزيلات.` });
    } catch (e) {
      notify({ kind: 'error', text: `تعذّر الحفظ: ${(e as Error).message}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, data]);

  const saveAs = useCallback(() => save(true), [save]);

  const open = useCallback(async () => {
    if (!confirmDiscard()) return;
    try {
      const picked = await readFromDevice();
      if (!picked) return;
      const parsed = parseProject(picked.text);
      if (!parsed.ok) { notify({ kind: 'error', text: `لا يمكن فتح «${picked.fileName}»: ${parsed.error}` }); return; }
      apply(parsed.project.data);
      handleRef.current = picked.handle;
      setName(parsed.project.name);
      savedPrint.current = undefined; // البصمة المحفوظة = ما سيعرضه البرنامج فعلاً بعد التطبيع (حسابات السماكة والإكسسوارات)
      setLastSavedAt(null);
      setRecovery(null);
      notify({ kind: 'ok', text: `تم فتح «${parsed.project.name}» (${parsed.project.data.cabinets.length} خزانة).` });
    } catch (e) {
      notify({ kind: 'error', text: `تعذّر الفتح: ${(e as Error).message}` });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apply, dirty, hasWork]);

  const newProject = useCallback(() => {
    if (!confirmDiscard()) return;
    reset();
    handleRef.current = null;
    setName('مشروع جديد');
    clearAutosave();
    setRecovery(null);
    setLastSavedAt(null);
    savedPrint.current = undefined; // بصمة المشروع الفارغ تُؤخذ في العرض التالي
    notify({ kind: 'info', text: 'مشروع جديد. مخزون الورشة بقي كما هو.' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reset, dirty, hasWork]);

  const recover = useCallback(() => {
    if (!recovery) return;
    apply(recovery.data);
    setName(recovery.name);
    handleRef.current = null;
    savedPrint.current = ''; // يبقى «غير محفوظ» حتى يحفظه المستخدم في ملف
    setRecovery(null);
    notify({ kind: 'ok', text: `تم استرجاع «${recovery.name}» من الحفظ التلقائي. احفظه في ملف.` });
  }, [apply, recovery]);

  const dismissRecovery = useCallback(() => { clearAutosave(); setRecovery(null); }, []);

  // حفظ تلقائي محلي بعد هدوء 1 ثانية — فقط حين يوجد عمل غير محفوظ.
  useEffect(() => {
    if (!dirty || !hasWork) return;
    const t = setTimeout(() => writeAutosave(name, data), 1000);
    return () => clearTimeout(t);
  }, [dirty, hasWork, name, data]);

  // تحذير عند إغلاق التبويب وفيه عمل غير محفوظ.
  useEffect(() => {
    if (!(dirty && hasWork)) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty, hasWork]);

  // اختصارات: Ctrl/Cmd+S حفظ، Ctrl/Cmd+Shift+S حفظ باسم، Ctrl/Cmd+O فتح.
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 's') { e.preventDefault(); void save(e.shiftKey); }
      else if (k === 'o') { e.preventDefault(); void open(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [save, open]);

  return {
    name, setName, dirty: dirty && hasWork, status, clearStatus: () => setStatus(null), lastSavedAt,
    newProject, save: () => save(false), saveAs, open, recovery, recover, dismissRecovery,
    inPlace: canWriteInPlace(),
  };
}
