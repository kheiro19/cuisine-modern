// Resizing an L corner that is already on the wall, from the panel a user really clicks: the corner shows its THREE numbers
// (square, back-wall arm, side-wall arm), each one is typable at any time, and the three boxes move together — the door side
// never opens again.
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import React from 'react';
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

/** L kitchen → corner family → the three boxes (square 600 + two 450 arms). */
const buildCorner = async (v: Screen) => {
  fireEvent.click(button(v, /^شكل L$/)!);
  await tick();
  fireEvent.click(button(v, /^زاوية$/)!);
  await tick();
  fireEvent.click(button(v, /إضافة زاوية L/)!);
  await tick(200);
};

/** Opens one box of the corner in the editor, by the role its row shows. */
const editBox = async (v: Screen, role: 'ذراع الجدار الخلفي' | 'ذراع الجدار الجانبي' | 'مربع الزاوية') => {
  const span = [...v.container.querySelectorAll('span[title]')]
    .find((s) => (s.getAttribute('title') || '').endsWith(role)) as HTMLElement | undefined;
  expect(span, `${role} is listed`).toBeTruthy();
  const edit = span!.closest('div')!.querySelector('button[title="تعديل"]') as HTMLButtonElement | null;
  expect(edit, 'the row has an edit button').toBeTruthy();
  fireEvent.click(edit!);
  await tick();
};

const widthField = (v: Screen) => v.container.querySelector('input[aria-label="العرض"]') as HTMLInputElement;
const panelField = (v: Screen, label: string) => v.container.querySelector(`input[aria-label="${label} (مم)"]`) as HTMLInputElement | null;
const setNumber = (input: HTMLInputElement, value: number) => {
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
};

const save = async (v: Screen) => {
  const b = button(v, /تحديث الوحدة المحددة/);
  expect(b, 'the cabinet can be committed').toBeTruthy();
  fireEvent.click(b!);
  await tick(250);
};

/** The three rows of the corner as the list shows them: role + the width of the box. */
const rowsOfCorner = (v: Screen) => ({
  square: /مربع الزاوية · [^·]+ · (\d+)/.exec(text(v))?.[1],
  armA: /ذراع الجدار الخلفي · [^·]+ · (\d+)/.exec(text(v))?.[1],
  armB: /ذراع الجدار الجانبي · [^·]+ · (\d+)/.exec(text(v))?.[1],
});

beforeEach(() => { (window as any).confirm = () => true; });
afterEach(() => cleanup());

describe('an L corner is resized from the panel, and its three boxes move together', () => {
  it('opens with the corner’s own three numbers, not with a frozen 450', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBox(v, 'ذراع الجدار الخلفي');

    expect(v.container.querySelector('[data-testid="corner-dims"]'), 'the corner panel is there').toBeTruthy();
    expect(panelField(v, 'مربع الزاوية')!.value).toBe('600');
    expect(panelField(v, 'عرض الذراع الخلفي')!.value).toBe('450');
    expect(panelField(v, 'عرض الذراع الجانبي')!.value).toBe('450');
    // the box in the form is the arm itself: its W is that number, so typing in either place is one edit
    expect(widthField(v).value).toBe('450');
  });

  it('a wider back-wall arm widens the corner and both neighbours stay glued to it', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBox(v, 'ذراع الجدار الخلفي');

    setNumber(widthField(v), 600);
    await tick();
    await save(v);

    expect(rowsOfCorner(v)).toEqual({ square: '600', armA: '600', armB: '450' });
    expect(text(v)).toMatch(/1200 مم على الجدار الخلفي/);
    expect(text(v)).toMatch(/1050 مم على الجانبي/);
    expect(text(v)).toContain('والصناديق الثلاثة تحرّكت معاً');
  });

  it('the SIDE arm is typable from the square’s panel, and the back-wall arm keeps its place', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBox(v, 'مربع الزاوية');

    const side = panelField(v, 'عرض الذراع الجانبي')!;
    expect(side, 'the side arm is on the panel of the square too').toBeTruthy();
    setNumber(side, 550);
    await tick();
    await save(v);

    expect(rowsOfCorner(v)).toEqual({ square: '600', armA: '450', armB: '550' });
    expect(text(v)).toMatch(/1150 مم على الجانبي/);
    expect(text(v)).toMatch(/1050 مم على الجدار الخلفي/);
  });

  it('the numbers survive a second edit: the panel reopens with what was saved, not with 450 again', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBox(v, 'ذراع الجدار الخلفي');
    setNumber(widthField(v), 620);
    await tick();
    await save(v);

    await editBox(v, 'ذراع الجدار الخلفي');
    expect(panelField(v, 'عرض الذراع الخلفي')!.value).toBe('620');
    expect(widthField(v).value).toBe('620');
    expect(panelField(v, 'عرض الذراع الجانبي')!.value).toBe('450');
  });

  it('a size that would leave the room is refused, in the user’s own numbers, and nothing moves', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    // the room shrinks to 1200 mm of side wall: 600 square + 700 arm = 1300 no longer fits
    const roomDepth = [...v.container.querySelectorAll('label')]
      .find((l) => (l.textContent || '').includes('عمق الغرفة'))?.querySelector('input') as HTMLInputElement;
    expect(roomDepth, 'the room depth is on the form').toBeTruthy();
    fireEvent.change(roomDepth, { target: { value: '1200' } });
    fireEvent.blur(roomDepth);
    await tick();

    await editBox(v, 'ذراع الجدار الجانبي');
    setNumber(panelField(v, 'عرض الذراع الجانبي')!, 700);
    await tick();
    await save(v);

    expect(text(v)).toContain('⛔ مقاسات الزاوية هذه تحتاج');
    expect(text(v)).toContain('لم يُغيَّر شيء');
    expect(rowsOfCorner(v), 'the boxes are untouched').toEqual({ square: '600', armA: '450', armB: '450' });
    expect(panelField(v, 'عرض الذراع الجانبي'), 'the edit stays open so the number can be corrected').toBeTruthy();
  });
});
