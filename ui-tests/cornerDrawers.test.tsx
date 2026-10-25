// The L corner in the panel: a FIXED filler panel on either side of an arm (the corner side for drawer clearance, the far side
// for looks alone) — always inside the arm's own width, so the arm stays 450 and nothing on the wall moves. The user controls it.
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

/** The workshop's own form: boards in the stock, so a cabinet can be built. */
const addBoard = async (v: Screen) => {
  const form = v.container.querySelector('form') as HTMLFormElement;
  const qty = [...form.querySelectorAll('input')].find((i) => (i as HTMLInputElement).type === 'number')!;
  fireEvent.change(qty, { target: { value: '20' } });
  fireEvent.submit(form);
  await tick(150);
};

/** L kitchen → corner family → three boxes (square + two 450 arms). */
const buildCorner = async (v: Screen) => {
  fireEvent.click(button(v, /^شكل L$/)!);
  await tick();
  fireEvent.click(button(v, /^زاوية$/)!);
  await tick();
  const inject = button(v, /إضافة زاوية L/);
  expect(inject, 'the corner can be built').toBeTruthy();
  fireEvent.click(inject!);
  await tick(200);
};

/** Open the back-wall arm in the editor. */
const editBackWallArm = async (v: Screen) => {
  const span = [...v.container.querySelectorAll('span[title]')]
    .find((s) => (s.getAttribute('title') || '').endsWith('ذراع الجدار الخلفي')) as HTMLElement | undefined;
  expect(span, 'the arm is listed').toBeTruthy();
  const edit = span!.closest('div')!.querySelector('button[title="تعديل"]') as HTMLButtonElement | null;
  expect(edit, 'the row has an edit button').toBeTruthy();
  fireEvent.click(edit!);
  await tick();
};

const setZoneKind = async (v: Screen, kind: 'DRAWERS' | 'DOORS') => {
  const picker = v.container.querySelector('select[aria-label="نوع القسم"]') as HTMLSelectElement | null;
  expect(picker, 'the panel has a zone-kind picker').toBeTruthy();
  fireEvent.change(picker!, { target: { value: kind } });
  await tick();
};

const save = async (v: Screen) => {
  const b = button(v, /تحديث الوحدة المحددة/);
  expect(b, 'the cabinet can be committed').toBeTruthy();
  fireEvent.click(b!);
  await tick(250);
};

const fillerField = (v: Screen) => v.container.querySelector('input[aria-label="ضلفة الزاوية الثابتة (مم)"]') as HTMLInputElement | null;

beforeEach(() => { (window as any).confirm = () => true; });
afterEach(() => cleanup());

describe('L corner: fixed filler panels, on either side, always inside the arm width', () => {
  it('drawers bring a 19.5 mm filler on the corner side: the arm stays 450, the front is 430', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    expect(text(v)).toContain('450×870×600');

    await editBackWallArm(v);
    const field = fillerField(v);
    expect(field, 'the filler control is there even before choosing a kind').toBeTruthy();
    expect(field!.placeholder).toContain('تلقائي 19.5');
    await setZoneKind(v, 'DRAWERS');
    await save(v);

    // the arm did NOT grow: still 450, and it never moved on the wall
    expect(text(v)).toContain('· 450');
    expect(text(v)).not.toContain('· 469.5');
    expect(text(v)).toContain('ضلفة زاوية ثابتة بعرض 19.5 مم على الجهة اليسرى');
    expect(text(v)).toContain('الواجهة 430 مم');
  });

  it('the user sets the width himself: 35 mm gives a 414.5 mm front', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBackWallArm(v);
    await setZoneKind(v, 'DRAWERS');
    fireEvent.change(fillerField(v)!, { target: { value: '35' } });
    await tick();
    await save(v);

    expect(text(v)).toContain('· 450');
    expect(text(v)).toContain('ضلفة زاوية ثابتة بعرض 35 مم');
    expect(text(v)).toContain('الواجهة 414.5 مم');
  });

  it('cannot go below the facing door: typing 5 mm keeps 18 and loses the 1.5 mm of play', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBackWallArm(v);
    await setZoneKind(v, 'DRAWERS');
    const field = fillerField(v)!;
    expect(field.min, 'the field itself declares the floor').toBe('18');
    expect(field.max).toBe('50');
    fireEvent.change(field, { target: { value: '5' } });
    await tick();
    await save(v);

    expect(text(v)).toContain('· 450');
    expect(text(v)).toContain('ضلفة زاوية ثابتة بعرض 18 مم على الجهة اليسرى');
    expect(text(v)).toContain('الواجهة 431.5 مم');
  });

  it('the panel can be sent to the OTHER side, to both sides, or switched off', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBackWallArm(v);
    await setZoneKind(v, 'DRAWERS');
    const side = (label: string) =>
      ([...v.container.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => (b.textContent || '').trim() === label);

    // to the far side only: the corner edge stays free, the panel stands at the other end
    fireEvent.click(side('اليمنى')!);
    await tick();
    expect(side('اليمنى')!.getAttribute('aria-pressed')).toBe('true');
    await save(v);
    expect(text(v)).toContain('ضلفة زاوية ثابتة بعرض 18 مم على الجهة اليمنى');
    expect(text(v)).toContain('الواجهة 431.5 مم');

    // both sides at once, at the same width
    await editBackWallArm(v);
    fireEvent.click(side('الجهتان')!);
    await tick();
    fireEvent.change(fillerField(v)!, { target: { value: '30' } });
    await tick();
    await save(v);
    expect(text(v)).toContain('ضلفة زاوية ثابتة بعرض 30 مم على الجهتين');
    expect(text(v)).toContain('الواجهة 390 مم');

    // and off: the front takes the whole arm
    await editBackWallArm(v);
    fireEvent.click(side('بلا ضلفة')!);
    await tick();
    expect(fillerField(v)!.disabled, 'no panel, nothing to size').toBe(true);
    await save(v);
    expect(text(v)).toContain('· 450');
    expect(text(v)).not.toContain('ضلفة زاوية ثابتة');
  });

  it('a doors-only arm can take a look-only panel: one front thickness, the door starts on its edge', async () => {
    const v = await mount();
    await addBoard(v);
    await buildCorner(v);
    await editBackWallArm(v);
    await setZoneKind(v, 'DOORS');
    expect(fillerField(v), 'the control stays available for a doors arm').toBeTruthy();

    fireEvent.click(([...v.container.querySelectorAll('button')] as HTMLButtonElement[]).find((b) => (b.textContent || '').trim() === 'الجهتان')!);
    await tick();
    await save(v);

    expect(text(v)).toContain('· 450');
    expect(text(v)).toContain('ضلفة زاوية ثابتة بعرض 18 مم على الجهتين');
    expect(text(v)).toContain('للجمال فقط');
    expect(text(v)).toContain('الواجهة 414 مم');
  });
  it('the builder says it: the three boxes stand on ONE L bottom, cut from a single board', async () => {
    const v = await mount();
    await addBoard(v);
    // the corner builder, before anything is added: 600 deep, two 450 arms, an 18 mm board
    fireEvent.click(button(v, /^شكل L$/)!);
    await tick();
    fireEvent.click(button(v, /^زاوية$/)!);
    await tick();
    expect(text(v)).toContain('قاعدة واحدة L بين الصناديق الثلاثة');
    expect(text(v)).toContain('1014×1014 خارجياً');
    expect(text(v)).toContain('عرض الرجل 600');
    expect(text(v)).toContain('مربع 432×432 قصاصة');
    // a wider arm lengthens the piece, and the line follows before anything is cut
    const armField = [...v.container.querySelectorAll('input')].filter((i) => (i as HTMLInputElement).type === 'number' && (i as HTMLInputElement).min === '300')[0] as HTMLInputElement;
    fireEvent.change(armField, { target: { value: '600' } });
    await tick(200);
    expect(text(v)).toContain('1164×1014 خارجياً');
    expect(text(v)).toContain('مربع 582×432 قصاصة');
  });

});
