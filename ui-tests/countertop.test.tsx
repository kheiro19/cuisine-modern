// The worktop is drawn in the 3D showcase and the panel decides what is drawn: shown or hidden, 20–40 mm thick,
// 580–650 mm deep. It is never priced (the customer buys the slab): no control here may appear in the invoice.
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import App from '../src/App';

type Screen = ReturnType<typeof render>;
const mount = async (): Promise<Screen> => {
  const view = render(<FurnitureProvider><App /></FurnitureProvider>);
  await new Promise((r) => setTimeout(r, 250));
  return view;
};
const tick = () => new Promise((r) => setTimeout(r, 30));

const toggle = (view: Screen) => view.container.querySelector('button[aria-label="سطح العمل"]') as HTMLButtonElement;
const settings = (view: Screen) => view.container.querySelector('[data-testid="countertop-settings"]') as HTMLElement | null;
const input = (view: Screen, label: string) => view.container.querySelector(`input[aria-label="${label}"]`) as HTMLInputElement;

/** Types a value and leaves the field, the way the panel commits a number. */
const type = async (field: HTMLInputElement, value: string) => {
  fireEvent.change(field, { target: { value } });
  fireEvent.blur(field);
  await tick();
};

afterEach(() => cleanup());

describe('the countertop is a switch in the showcase', () => {
  it('starts visible, and its two numbers sit next to the toggle', async () => {
    const view = await mount();
    expect(toggle(view)).toBeTruthy();
    expect(toggle(view).getAttribute('aria-pressed')).toBe('true');
    expect(toggle(view).textContent).toContain('إخفاء سطح العمل');

    expect(settings(view)).toBeTruthy();
    expect(input(view, 'سُمك سطح العمل').value).toBe('40');
    expect(input(view, 'عرض سطح العمل').value).toBe('600');
  });

  it('hides the slab and takes its numbers away; showing it again brings back the same numbers', async () => {
    const view = await mount();
    fireEvent.click(toggle(view));
    await tick();

    expect(toggle(view).getAttribute('aria-pressed')).toBe('false');
    expect(toggle(view).textContent).toContain('إظهار سطح العمل');
    expect(settings(view)).toBeNull();

    fireEvent.click(toggle(view));
    await tick();
    expect(settings(view)).toBeTruthy();
    expect(input(view, 'سُمك سطح العمل').value, 'the choice survives a hide / show').toBe('40');
  });
});

describe('the numbers stay inside a real slab', () => {
  it('thickness is 20–40 mm: a typed 10 becomes 20, a typed 99 becomes 40', async () => {
    const view = await mount();
    await type(input(view, 'سُمك سطح العمل'), '10');
    expect(input(view, 'سُمك سطح العمل').value).toBe('20');
    await type(input(view, 'سُمك سطح العمل'), '99');
    expect(input(view, 'سُمك سطح العمل').value).toBe('40');
    await type(input(view, 'سُمك سطح العمل'), '25');
    expect(input(view, 'سُمك سطح العمل').value, 'a legal value is kept as typed').toBe('25');
  });

  it('depth is 580–650 mm: a typed 500 becomes 580, a typed 900 becomes 650', async () => {
    const view = await mount();
    await type(input(view, 'عرض سطح العمل'), '500');
    expect(input(view, 'عرض سطح العمل').value).toBe('580');
    await type(input(view, 'عرض سطح العمل'), '900');
    expect(input(view, 'عرض سطح العمل').value).toBe('650');
    await type(input(view, 'عرض سطح العمل'), '620');
    expect(input(view, 'عرض سطح العمل').value).toBe('620');
  });

  it('the fields carry the bounds themselves, so the browser refuses out-of-range values too', async () => {
    const view = await mount();
    expect(input(view, 'سُمك سطح العمل').min).toBe('20');
    expect(input(view, 'سُمك سطح العمل').max).toBe('40');
    expect(input(view, 'عرض سطح العمل').min).toBe('580');
    expect(input(view, 'عرض سطح العمل').max).toBe('650');
  });
});
