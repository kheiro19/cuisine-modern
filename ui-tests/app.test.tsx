// UI tests for the REAL App: no mock component, no fake context — the same FurnitureProvider and the same buttons a user clicks.
// The 3D scene is not asserted (jsdom has no WebGL): what is asserted is the part test.md said nobody tests — the screen.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import App from '../src/App';

type Screen = ReturnType<typeof render>;

const text = (view: Screen) => view.container.textContent || '';
const allButtons = (view: Screen) => [...view.container.querySelectorAll('button')] as HTMLButtonElement[];
const button = (view: Screen, re: RegExp) => allButtons(view).find((b) => re.test(b.textContent || ''));
const countOf = (view: Screen): number => Number(/الوحدات المثبّتة \((\d+)\)/.exec(text(view))?.[1] ?? -1);

/** How many cabinets the list says are installed. */
const unitsLine = (view: Screen) => text(view).slice(text(view).indexOf('الوحدات المثبّتة'), text(view).indexOf('الوحدات المثبّتة') + 40).replace(/\s+/g, ' ');

const mount = async (): Promise<Screen> => {
  const view = render(<FurnitureProvider><App /></FurnitureProvider>);
  await new Promise((r) => setTimeout(r, 250));
  return view;
};

/** Uses the workshop's own form: the board the user really types in. */
const addBoard = async (view: Screen, sheets: number) => {
  const form = view.container.querySelector('form') as HTMLFormElement;
  const qty = [...form.querySelectorAll('input')].find((i) => i.type === 'number')!;
  fireEvent.change(qty, { target: { value: String(sheets) } });
  fireEvent.submit(form);
  await new Promise((r) => setTimeout(r, 150));
};

const inject = async (view: Screen, times = 1) => {
  for (let k = 0; k < times; k++) {
    const b = button(view, /حقن وتثبيت/);
    if (!b || b.disabled) throw new Error(`inject button is disabled on click ${k + 1}`);
    fireEvent.click(b);
    await new Promise((r) => setTimeout(r, 120));
  }
};

let confirmCalls = 0;
beforeEach(() => {
  confirmCalls = 0;
  (window as any).confirm = () => { confirmCalls++; return true; };
});
afterEach(() => cleanup());

describe('the app opens', () => {
  it('shows the empty workshop and an undo button that is disabled — nothing to undo yet', async () => {
    const view = await mount();
    expect(text(view)).toContain('لا توجد وحدات بعد');
    expect(unitsLine(view)).toContain('(0)');
    expect(button(view, /تراجع خطوة/)!.disabled).toBe(true);
  });

  it('refuses to install a cabinet while the workshop has no board at all', async () => {
    const view = await mount();
    expect(button(view, /حقن وتثبيت/)!.disabled).toBe(true);
    expect(text(view)).toContain('Parametric Panels Stock Loader');
  });
});

describe('adding stock', () => {
  it('a board typed in the form appears in the stockroom and unlocks the install button', async () => {
    const view = await mount();
    expect(button(view, /حقن وتثبيت/)!.disabled).toBe(true);
    await addBoard(view, 10);
    expect(text(view)).toContain('MDF Melamine Matt');
    expect(button(view, /حقن وتثبيت/)!.disabled).toBe(false);
  });
});

describe('installing a cabinet', () => {
  it('adds a unit to the list with its size and its price, and makes Undo available', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view);
    expect(countOf(view)).toBe(1);
    expect(unitsLine(view)).toContain('(1)');
    const units = text(view).slice(text(view).indexOf('الوحدات المثبّتة'));
    expect(units).toContain('خزانة سفلية');
    expect(units).toMatch(/600×870×600/);
    expect(units).toMatch(/\d[\d\s]*دج|\d{4}/); // a price is shown on the row
    expect(button(view, /تراجع خطوة/)!.disabled).toBe(false);
  });

  it('Undo puts the screen back exactly where it was', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view, 2);
    expect(countOf(view)).toBe(2);
    fireEvent.click(button(view, /تراجع خطوة/)!);
    await new Promise((r) => setTimeout(r, 150));
    expect(countOf(view)).toBe(1);
    fireEvent.click(button(view, /تراجع خطوة/)!);
    await new Promise((r) => setTimeout(r, 150));
    expect(countOf(view)).toBe(0);
    expect(text(view)).toContain('لا توجد وحدات بعد');
    expect(button(view, /تراجع خطوة/)!.disabled).toBe(true);
  });

  it('the list own delete button removes the unit (after the confirmation the user sees)', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view, 2);
    // The stockroom now has its own 🗑 buttons ("حذف من المخزون"); this is the UNIT list's one.
    const del = allButtons(view).find((b) => (b.textContent || '').trim() === '🗑' && b.title === 'حذف');
    expect(del, 'the installed-units list must offer a delete button').toBeTruthy();
    fireEvent.click(del!);
    await new Promise((r) => setTimeout(r, 150));
    expect(confirmCalls).toBe(1);
    expect(countOf(view)).toBe(1);
  });

  it('editing the width in the unit panel changes the size shown for that unit', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view);
    const width = view.container.querySelector('input[aria-label="العرض"]') as HTMLInputElement;
    expect(width, 'the selected unit must show its width').toBeTruthy();
    fireEvent.change(width, { target: { value: '900' } });
    fireEvent.blur(width);
    await new Promise((r) => setTimeout(r, 200));
    expect(text(view)).toMatch(/900×870×600/);
  });
});

describe('stock shortage on screen', () => {
  it('warns in Arabic when the boards run out, and names the numbers', async () => {
    const view = await mount();
    await addBoard(view, 1);          // one sheet
    await inject(view, 3);            // three cabinets: more than one sheet
    const t = text(view);
    expect(t).toContain('المخزون لا يكفي');
    expect(t).toContain('الناقص');
    expect(t).toContain('MDF Melamine Matt');
  });

  it('stays silent when the stock is enough', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view);
    expect(text(view)).not.toContain('المخزون لا يكفي');
  });
});

describe('the stock ledger on the stock screen', () => {
  it('shows the three numbers of every item: in stock, reserved by this project, left after it', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view);
    const t = text(view);
    expect(t).toContain('حجز المخزون');
    expect(t).toContain('المتوفر');
    expect(t).toContain('المحجوز');
    expect(t).toContain('المتبقي');
    const line = t.slice(t.indexOf('MDF Melamine Matt'));
    expect(line).toMatch(/المتوفر\s*10/);
    expect(line).toMatch(/المحجوز\s*0\.4\d/); // 0.45 of a sheet for one 600 unit
  });

  it('deleting the unit frees the reservation at once', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view);
    const before = text(view).slice(text(view).indexOf('MDF Melamine Matt'));
    expect(before).toMatch(/المحجوز\s*0\.4\d/); // 0.45
    fireEvent.click(allButtons(view).find((b) => (b.textContent || '').trim() === '🗑' && b.title === 'حذف')!);
    await new Promise((r) => setTimeout(r, 200));
    const after = text(view).slice(text(view).indexOf('MDF Melamine Matt'));
    expect(after).toMatch(/المحجوز\s*0\s/);
  });
});

describe('exports from the screen', () => {
  it('the BOM button prints the factory report, stock ledger section included', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view);
    fireEvent.click(button(view, /تقرير BOM/)!);
    await new Promise((r) => setTimeout(r, 200));
    const t = text(view);
    expect(t).toContain('FLATMA FACTORY PRODUCTION BOM REPORT');
    expect(t).toContain('SECTION 1: PROCEDURAL WOOD PARTS CUTTING LIST');
    expect(t).toContain('SECTION 4: STOCK LEDGER');
    expect(t).toContain('MDF Melamine Matt');
  });

  it('the invoice button prints a customer invoice with the total', async () => {
    const view = await mount();
    await addBoard(view, 10);
    await inject(view);
    fireEvent.click(button(view, /الفاتورة/)!);
    await new Promise((r) => setTimeout(r, 200));
    const t = text(view);
    expect(t).toMatch(/فاتورة/);
    expect(t).toMatch(/DA|دج/);
    expect(t).not.toContain('FLATMA FACTORY PRODUCTION BOM REPORT'); // the two exports do not mix
  });

  it('does nothing with an empty workshop: no report, no crash', async () => {
    const view = await mount();
    fireEvent.click(button(view, /تقرير BOM/)!);
    await new Promise((r) => setTimeout(r, 120));
    expect(text(view)).not.toContain('FLATMA FACTORY PRODUCTION BOM REPORT');
  });
});
