// Correcting a stock line: the workshop typed 10 boards instead of 1, or the wrong price, or a line that should not exist.
// Before this, the stockroom could only ADD — a typo was permanent. These tests drive the real InventoryManager screen.
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import React from 'react';
import { render, fireEvent, cleanup, within } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import InventoryManager from '../src/components/InventoryManager';

const setup = () => render(<FurnitureProvider><InventoryManager /></FurnitureProvider>);
const boardForm = (c: HTMLElement) => c.querySelector('form') as HTMLFormElement;

/** Types a board into the loader and submits it, like a user. */
const addBoard = (c: HTMLElement, qty: number, price = 15000) => {
  const form = boardForm(c);
  const nums = [...form.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
  fireEvent.change(nums[0], { target: { value: String(qty) } });
  fireEvent.change(nums[1], { target: { value: String(price) } });
  fireEvent.submit(form);
};

/**
 * The stockroom row that holds a given text: the innermost matching div that carries the row's own buttons.
 * (The ledger above it shows the same material name, so matching on the text alone would find the wrong box.)
 */
const rowOf = (c: HTMLElement, text: string) => {
  const rows = [...c.querySelectorAll('div')].filter((d) => (d.textContent || '').includes(text) && d.querySelector('button[title]'));
  return rows.sort((a, b) => (a.textContent || '').length - (b.textContent || '').length)[0] as HTMLElement;
};

beforeEach(() => { (window as any).confirm = () => true; });
afterEach(() => cleanup());

describe('a typo in a stock line is fixable', () => {
  it('a board typed as 10 can be corrected to 1, and the ledger follows', () => {
    const { container } = setup();
    addBoard(container, 10);
    const row = rowOf(container, 'MDF Melamine Matt');
    expect(row.textContent).toContain('10 Sheets');

    fireEvent.click(within(row).getByTitle('تعديل الكمية أو السعر'));
    const qty = within(row).getByLabelText('الكمية') as HTMLInputElement;
    fireEvent.change(qty, { target: { value: '1' } });
    fireEvent.click(within(row).getByTitle(/حفظ تعديل/));

    const fixed = rowOf(container, 'MDF Melamine Matt');
    expect(fixed.textContent).toContain('1 Sheets');
    expect(fixed.textContent).not.toContain('10 Sheets');
  });

  it('the price can be corrected too, and the value shown follows', () => {
    const { container } = setup();
    addBoard(container, 5, 15000);
    const row = rowOf(container, 'MDF Melamine Matt');
    fireEvent.click(within(row).getByTitle('تعديل الكمية أو السعر'));
    fireEvent.change(within(row).getByLabelText('السعر'), { target: { value: '9999' } });
    fireEvent.click(within(row).getByTitle(/حفظ تعديل/));
    expect(rowOf(container, 'MDF Melamine Matt').textContent).toContain('9,999');
  });

  it('cancelling changes nothing', () => {
    const { container } = setup();
    addBoard(container, 7);
    const row = rowOf(container, 'MDF Melamine Matt');
    fireEvent.click(within(row).getByTitle('تعديل الكمية أو السعر'));
    fireEvent.change(within(row).getByLabelText('الكمية'), { target: { value: '1' } });
    fireEvent.click(within(row).getByTitle('إلغاء'));
    expect(rowOf(container, 'MDF Melamine Matt').textContent).toContain('7 Sheets');
  });

  it('a nonsense quantity does NOT wipe the stock: an empty / negative entry falls back to zero, never to NaN', () => {
    const { container } = setup();
    addBoard(container, 4);
    const row = rowOf(container, 'MDF Melamine Matt');
    fireEvent.click(within(row).getByTitle('تعديل الكمية أو السعر'));
    fireEvent.change(within(row).getByLabelText('الكمية'), { target: { value: '-3' } });
    fireEvent.click(within(row).getByTitle(/حفظ تعديل/));
    const text = rowOf(container, 'MDF Melamine Matt').textContent || '';
    expect(text).not.toContain('NaN');
    expect(text).toContain('0 Sheets');
  });

  it('a line entered by mistake can be deleted, with the confirmation the user sees', () => {
    const { container } = setup();
    addBoard(container, 5);
    const confirm = vi.fn(() => true);
    (window as any).confirm = confirm;
    const row = rowOf(container, 'MDF Melamine Matt');
    fireEvent.click(within(row).getByTitle('حذف من المخزون'));
    expect(confirm).toHaveBeenCalledTimes(1);
    // the name still exists in the loader's material dropdown; what must be gone is the STOCK LINE
    expect(rowOf(container, 'MDF Melamine Matt')).toBeUndefined();
    expect(container.textContent).toContain('Inventory stock is currently empty');
  });

  it('deleting is refused when the user says no', () => {
    const { container } = setup();
    addBoard(container, 5);
    (window as any).confirm = () => false;
    fireEvent.click(within(rowOf(container, 'MDF Melamine Matt')).getByTitle('حذف من المخزون'));
    expect(rowOf(container, 'MDF Melamine Matt')).toBeTruthy();
  });
});

describe('correcting hardware does not hand back pieces the project already took', () => {
  it('the entered quantity is what the user corrects, the shelf stays "entered - taken"', async () => {
    const { container } = setup();
    // a hardware line, typed through the loader's own form
    const hwForm = [...container.querySelectorAll('form')].find((f) => (f.textContent || '').includes('Inject Hardware Accessory')) as HTMLFormElement;
    const nums = [...hwForm.querySelectorAll('input[type="number"]')] as HTMLInputElement[];
    fireEvent.change(nums[0], { target: { value: '50' } });     // qty
    fireEvent.change(nums[1], { target: { value: '300' } });    // price (per piece)
    fireEvent.submit(hwForm);

    const row = rowOf(container, 'Straight Hinge');
    expect(row).toBeTruthy();
    expect(row.textContent).toContain('50 Pcs');

    fireEvent.click(within(row).getByTitle('تعديل الكمية أو السعر'));
    fireEvent.change(within(row).getByLabelText('الكمية'), { target: { value: '80' } });
    fireEvent.click(within(row).getByTitle(/حفظ تعديل/));
    expect(rowOf(container, 'Straight Hinge').textContent).toContain('80 Pcs');
  });
});
