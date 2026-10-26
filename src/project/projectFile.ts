// src/project/projectFile.ts
// ملف المشروع المحلي: صيغة الحفظ + التحقق + قراءة/كتابة الملف على جهاز المستخدم.
// لا يعتمد على React: كله دوال نقية قابلة للاختبار.
import type { CabinetObject, EdgeBandRoll, WorkshopInventoryState } from '../types/flatma';
import type { KitchenLayout } from '../math/kitchenLayout';
import type { CountertopSettings } from '../math/countertop';
import type { PlacedAccessory } from '../math/accessoryPlacement';

export const PROJECT_FORMAT = 'cuisine-project';
export const PROJECT_VERSION = 1;
export const PROJECT_EXTENSION = '.cuisine.json';
export const AUTOSAVE_KEY = 'cuisine:autosave:v1';

/** المخزون كما أُدخل (قبل أن يستهلكه المشروع) — نفس نوع FurnitureContext. */
export type ProjectInventory = WorkshopInventoryState & { edgeBandRolls: EdgeBandRoll[] };

/** كل ما يلزم لإعادة المشروع كما كان بالضبط. */
export interface ProjectData {
  cabinets: CabinetObject[];
  /** المخزون الأصلي (baseline) وليس الحي: الحي يُحسب من الأصلي ناقص استهلاك الخزائن. */
  baselineInventory: ProjectInventory;
  layout: KitchenLayout;
  counterTop: CountertopSettings;
  accessories: PlacedAccessory[];
}

export interface ProjectFile {
  format: typeof PROJECT_FORMAT;
  version: number;
  name: string;
  savedAt: string; // ISO
  data: ProjectData;
}

export type ParseResult = { ok: true; project: ProjectFile } | { ok: false; error: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

export function serializeProject(name: string, data: ProjectData, now: Date = new Date()): string {
  const file: ProjectFile = { format: PROJECT_FORMAT, version: PROJECT_VERSION, name: name.trim() || 'مشروع بدون اسم', savedAt: now.toISOString(), data };
  return JSON.stringify(file, null, 2);
}

/** بصمة للمقارنة (هل تغيّر شيء منذ آخر حفظ؟): لا تدخل فيها التكلفة المخزّنة مؤقتاً ولا وقت الحفظ. */
export function fingerprint(data: ProjectData): string {
  return JSON.stringify(data, (k, v) => (k === 'calculatedCostDA' ? undefined : v));
}

/** ترقية الصيغ القديمة. اليوم لا توجد إلا النسخة 1؛ أضف هنا حالة لكل نسخة جديدة. */
function migrate(file: Record<string, unknown>): Record<string, unknown> {
  return file;
}

export function parseProject(text: string): ParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: 'الملف ليس JSON صالحاً.' };
  }
  if (!isObj(raw) || raw.format !== PROJECT_FORMAT) return { ok: false, error: 'هذا الملف ليس ملف مشروع من هذا البرنامج.' };
  if (!isNum(raw.version)) return { ok: false, error: 'رقم نسخة الملف مفقود.' };
  if (raw.version > PROJECT_VERSION) return { ok: false, error: `الملف من نسخة أحدث (${raw.version}) من التي يفهمها هذا البرنامج (${PROJECT_VERSION}).` };

  const file = migrate(raw);
  const data = file.data;
  if (!isObj(data)) return { ok: false, error: 'بيانات المشروع مفقودة.' };

  if (!Array.isArray(data.cabinets)) return { ok: false, error: 'قائمة الخزائن مفقودة.' };
  const ids = new Set<string>();
  for (const [i, c] of data.cabinets.entries()) {
    if (!isObj(c) || typeof c.id !== 'string' || !c.id) return { ok: false, error: `الخزانة رقم ${i + 1} بلا معرّف.` };
    if (ids.has(c.id)) return { ok: false, error: `معرّف مكرّر في الخزائن: ${c.id}` };
    ids.add(c.id);
    for (const f of ['width', 'depth', 'height', 'positionX'] as const) {
      if (!isNum(c[f])) return { ok: false, error: `الخزانة «${String(c.name ?? c.id)}»: الحقل ${f} ليس رقماً.` };
    }
  }

  const inv = data.baselineInventory;
  if (!isObj(inv) || !Array.isArray(inv.woodPanels) || !Array.isArray(inv.hardwareItems)) return { ok: false, error: 'مخزون الورشة مفقود أو ناقص.' };
  const baselineInventory: ProjectInventory = { ...(inv as unknown as ProjectInventory), edgeBandRolls: Array.isArray(inv.edgeBandRolls) ? (inv.edgeBandRolls as EdgeBandRoll[]) : [] };

  if (!isObj(data.layout)) return { ok: false, error: 'مخطط المطبخ مفقود.' };
  if (!isObj(data.counterTop)) return { ok: false, error: 'إعدادات سطح العمل مفقودة.' };

  return {
    ok: true,
    project: {
      format: PROJECT_FORMAT,
      version: PROJECT_VERSION,
      name: typeof file.name === 'string' && file.name.trim() ? file.name : 'مشروع بدون اسم',
      savedAt: typeof file.savedAt === 'string' ? file.savedAt : new Date(0).toISOString(),
      data: {
        cabinets: data.cabinets as unknown as CabinetObject[],
        baselineInventory,
        layout: data.layout as unknown as KitchenLayout,
        counterTop: data.counterTop as unknown as CountertopSettings,
        accessories: Array.isArray(data.accessories) ? (data.accessories as PlacedAccessory[]) : [],
      },
    },
  };
}

export const fileNameFor = (name: string): string =>
  (name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ') || 'مشروع') + PROJECT_EXTENSION;

// ───────────── ملفات الجهاز ─────────────
// File System Access API (Chrome/Edge): يسمح بـ «حفظ» فوق نفس الملف. غيره (Firefox/Safari): تنزيل + اختيار ملف.
type FsHandle = { name: string; createWritable: () => Promise<{ write: (d: string) => Promise<void>; close: () => Promise<void> }> };
type FsWindow = Window & {
  showSaveFilePicker?: (o: unknown) => Promise<FsHandle>;
  showOpenFilePicker?: (o: unknown) => Promise<Array<{ getFile: () => Promise<File> } & FsHandle>>;
};
const FILE_TYPES = [{ description: 'مشروع مطبخ', accept: { 'application/json': ['.json'] } }];

export const canWriteInPlace = (): boolean => typeof window !== 'undefined' && typeof (window as FsWindow).showSaveFilePicker === 'function';

export type DeviceHandle = FsHandle | null;

/** يحفظ النص على الجهاز. يعيد المقبض (للحفظ التالي فوق نفس الملف) أو null إن كان تنزيلاً عادياً. null أيضاً عند إلغاء المستخدم → استخدم `cancelled`. */
export async function writeToDevice(text: string, suggestedName: string, existing: DeviceHandle, forcePicker: boolean): Promise<{ handle: DeviceHandle; cancelled: boolean }> {
  const w = window as FsWindow;
  try {
    if (w.showSaveFilePicker) {
      const handle = !forcePicker && existing ? existing : await w.showSaveFilePicker({ suggestedName, types: FILE_TYPES });
      const stream = await handle.createWritable();
      await stream.write(text);
      await stream.close();
      return { handle, cancelled: false };
    }
  } catch (e) {
    if ((e as DOMException)?.name === 'AbortError') return { handle: existing, cancelled: true };
    throw e;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = suggestedName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return { handle: null, cancelled: false };
}

/** يفتح ملفاً من الجهاز. null = ألغى المستخدم. */
export async function readFromDevice(): Promise<{ text: string; fileName: string; handle: DeviceHandle } | null> {
  const w = window as FsWindow;
  if (w.showOpenFilePicker) {
    try {
      const [h] = await w.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
      const file = await h.getFile();
      return { text: await file.text(), fileName: file.name, handle: h };
    } catch (e) {
      if ((e as DOMException)?.name === 'AbortError') return null;
      throw e;
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = async () => {
      const f = input.files?.[0];
      resolve(f ? { text: await f.text(), fileName: f.name, handle: null } : null);
    };
    input.oncancel = () => resolve(null);
    input.click();
  });
}

// ───────────── الحفظ التلقائي (للاسترجاع بعد إغلاق المتصفح بالخطأ) ─────────────
export function writeAutosave(name: string, data: ProjectData): void {
  try {
    localStorage.setItem(AUTOSAVE_KEY, serializeProject(name, data));
  } catch {
    /* ممتلئ أو ممنوع: الحفظ التلقائي اختياري */
  }
}
export function readAutosave(): ProjectFile | null {
  try {
    const t = localStorage.getItem(AUTOSAVE_KEY);
    if (!t) return null;
    const r = parseProject(t);
    return r.ok ? r.project : null;
  } catch {
    return null;
  }
}
export function clearAutosave(): void {
  try {
    localStorage.removeItem(AUTOSAVE_KEY);
  } catch {
    /* تجاهل */
  }
}
