// The worktop's width is the user's number. It used to be stretched, silently, to the front it covers — a 600 mm slab over a
// 638 mm front was drawn 638, so typing 611, 620 or 630 changed nothing and the field looked locked. And its finish is picked
// from the same public/textures shelf the fronts use.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import App from '../src/App';

type Screen = ReturnType<typeof render>;
const text = (v: Screen) => v.container.textContent || '';
const button = (v: Screen, re: RegExp) =>
  ([...v.container.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => re.test(b.textContent || ''));
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
  const b = button(v, /حقن وتثبيت/);
  expect(b, 'the unit can be installed').toBeTruthy();
  fireEvent.click(b!);
  await tick(200);
};

const widthField = (v: Screen) => v.container.querySelector('input[aria-label="عرض سطح العمل"]') as HTMLInputElement;
const thicknessField = (v: Screen) => v.container.querySelector('input[aria-label="سُمك سطح العمل"]') as HTMLInputElement;
const type = (input: HTMLInputElement, value: number) => {
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
};

beforeEach(() => { (window as any).confirm = () => true; });
afterEach(() => cleanup());

describe('the worktop width is typed, drawn as typed, and never stretched behind the user', () => {
  it('says by how many millimetres it is short — and the number stays the one that was typed', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);

    // 600 carcase + 18 door + 20 nosing = 638 mm under the fronts
    expect(text(v)).toContain('أقصر من الواجهة بـ 38 مم (الواجهة عند 638 مم)');
    expect(widthField(v).value).toBe('600');

    type(widthField(v), 611);
    await tick();
    expect(widthField(v).value, 'the field keeps what was typed').toBe('611');
    expect(text(v), 'and the gap is recounted, not the number overwritten').toContain('أقصر من الواجهة بـ 27 مم');
  });

  it('one click covers the front, and the notice goes away', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);

    type(widthField(v), 611);
    await tick();
    fireEvent.click(button(v, /اجعله 638/)!);
    await tick();

    expect(widthField(v).value).toBe('638');
    expect(text(v)).not.toContain('أقصر من الواجهة');
  });

  it('a slab wider than the front keeps its number too: 650 stays 650', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);
    type(widthField(v), 650);
    await tick();
    expect(widthField(v).value).toBe('650');
    expect(text(v)).not.toContain('أقصر من الواجهة');
  });

  it('the thickness stays inside 20–40 mm, whatever is typed', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);
    type(thicknessField(v), 55);
    await tick();
    expect(thicknessField(v).value).toBe('40');
    type(thicknessField(v), 5);
    await tick();
    expect(thicknessField(v).value).toBe('20');
  });

  it('its finish is picked from the same public/textures shelf as the fronts', async () => {
    const v = await mount();
    await addBoard(v);
    await inject(v);

    const finish = v.container.querySelector('button[aria-label="خامة سطح العمل"]') as HTMLButtonElement;
    expect(finish, 'the slab has a finish button').toBeTruthy();
    expect(finish.textContent, 'plain stone until a file is picked').toContain('رخام أبيض');
    fireEvent.click(finish);
    await tick();

    // the library opens with the folder's own count, and says so when the folder is unreadable in this build
    expect(text(v)).toMatch(/مكتبة الخامات \(\d+\)/);
    expect(button(v, /رخام أبيض/) || text(v).includes('public/textures')).toBeTruthy();
  });
});
