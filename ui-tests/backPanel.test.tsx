// The back of the cabinet in the panel: three buttons — HDF sheet, two carcase rails, a full carcase board — and the
// workshop's own numbers under them. The choice is written per cabinet and can be pushed to the whole kitchen.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import App from '../src/App';

type Screen = ReturnType<typeof render>;
const text = (v: Screen) => v.container.textContent || '';
const allButtons = (v: Screen) => [...v.container.querySelectorAll('button')] as HTMLButtonElement[];
const button = (v: Screen, re: RegExp) => allButtons(v).find((b) => re.test(b.textContent || ''));
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms));

const mount = async (): Promise<Screen> => {
  const v = render(<FurnitureProvider><App /></FurnitureProvider>);
  await tick(250);
  return v;
};

const addBoard = async (v: Screen) => {
  const form = v.container.querySelector('form') as HTMLFormElement;
  const qty = [...form.querySelectorAll('input')].find((i) => (i as HTMLInputElement).type === 'number')!;
  fireEvent.change(qty, { target: { value: '20' } });
  fireEvent.submit(form);
  await tick(150);
};

const inject = async (v: Screen) => {
  fireEvent.click(button(v, /حقن وتثبيت/)!);
  await tick(300);
};

const editFirst = async (v: Screen) => {
  const edit = allButtons(v).find((b) => b.getAttribute('title') === 'تعديل')!;
  expect(edit, 'the cabinet has an edit button').toBeTruthy();
  fireEvent.click(edit);
  await tick();
};

const save = async (v: Screen) => {
  const b = button(v, /تحديث الوحدة المحددة/);
  expect(b, 'the cabinet can be committed').toBeTruthy();
  fireEvent.click(b!);
  await tick(250);
};

const backButton = (v: Screen, label: string) =>
  [...v.container.querySelectorAll('button[aria-pressed]')].find((b) => (b.textContent || '').trim() === label) as HTMLButtonElement | undefined;
const railDepthField = (v: Screen) => v.container.querySelector('input[aria-label="عرض عارضة الخلفية (مم)"]') as HTMLInputElement | null;

beforeEach(() => { (window as any).confirm = () => true; });
afterEach(() => cleanup());

describe('the back of the cabinet is the user\'s choice', () => {
  it('opens on HDF, the way every saved cabinet was built', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);
    await editFirst(v);
    expect(backButton(v, 'HDF 3 مم')!.getAttribute('aria-pressed')).toBe('true');
    expect(railDepthField(v), 'no rail to size when the back is a sheet').toBeNull();
    expect(text(v)).toContain('ملصوق على الوجه الخلفي');
  });

  it('picking the two rails asks for their width and explains the trade-off', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);
    await editFirst(v);
    fireEvent.click(backButton(v, 'عارضتان (أعلى وأسفل)')!);
    await tick();
    expect(backButton(v, 'عارضتان (أعلى وأسفل)')!.getAttribute('aria-pressed')).toBe('true');
    const field = railDepthField(v)!;
    expect(field, 'the rail width is the user\'s').toBeTruthy();
    expect(field.placeholder).toBe('100');
    expect(field.min).toBe('50');
    expect(field.max).toBe('200');
    fireEvent.change(field, { target: { value: '150' } });
    await tick();
    expect(text(v)).toContain('150 مم عرضاً');
    expect(text(v)).toContain('بلا ظهر');
  });

  it('the full board says what it costs inside: the shelves and dividers get shorter', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);
    await editFirst(v);
    fireEvent.click(backButton(v, 'لوح مثل الهيكل')!);
    await tick();
    expect(backButton(v, 'لوح مثل الهيكل')!.getAttribute('aria-pressed')).toBe('true');
    expect(text(v)).toContain('تقصر الأرفف والحواجز');
    await save(v);
    expect(text(v)).toContain('الوحدات المثبّتة (1)');
  });

  it('the choice is kept when the cabinet is opened again, and can be pushed to the whole kitchen', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);
    await editFirst(v);
    fireEvent.click(backButton(v, 'عارضتان (أعلى وأسفل)')!);
    await tick();
    await save(v);

    await editFirst(v);
    expect(backButton(v, 'عارضتان (أعلى وأسفل)')!.getAttribute('aria-pressed'), 'still rails').toBe('true');
    // one button pushes this back onto every cabinet of the kitchen
    const all = button(v, /تعميم على كل الخزائن/);
    expect(all, 'the whole kitchen can take this back').toBeTruthy();
    fireEvent.click(all!);
    await tick(200);
    await editFirst(v);
    expect(backButton(v, 'عارضتان (أعلى وأسفل)')!.getAttribute('aria-pressed')).toBe('true');
  });
});
