// The panel declares a zone mechanism: a pull-out frame (Tandem / Cargo) is a field of the ZONE, not a template.
// Before this, the engine priced pull-out frames but nothing in the app could ask for one: three old templates died with the
// catalogue because of it. This is that capability coming back where it belongs — in the control panel.
import { describe, it, expect, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import App from '../src/App';

const text = (view: ReturnType<typeof render>) => view.container.textContent || '';
const mount = async () => {
  const view = render(<FurnitureProvider><App /></FurnitureProvider>);
  await new Promise((r) => setTimeout(r, 250));
  return view;
};
/** The mechanism picker of the first zone. */
const picker = (view: ReturnType<typeof render>) =>
  view.container.querySelector('select[aria-label="آلية القسم"]') as HTMLSelectElement;

afterEach(() => cleanup());

describe('a zone mechanism is declared in the panel', () => {
  it('the picker exists for a doors zone of a floor unit, with "default" as the first choice', async () => {
    const view = await mount();
    const select = picker(view);
    expect(select).toBeTruthy();
    expect(select.value).toBe('');
    expect(select.textContent).toContain('افتراضي');
    expect(select.textContent).toContain('إطار سلة');
  });

  it('choosing a pull-out frame changes what the cabinet NEEDS: hinges become runners', async () => {
    const view = await mount();
    // with no hardware in stock the panel says which picker is missing; that line names the hardware the zone needs
    expect(text(view)).toContain('لا يوجد في المخزن مفصلات');
    fireEvent.change(picker(view), { target: { value: 'PULL_OUT_FRAME' } });
    await new Promise((r) => setTimeout(r, 60));
    expect(text(view)).toContain('لا توجد سكك أدراج في المخزن');
    expect(picker(view).value).toBe('PULL_OUT_FRAME');
  });

  it('going back to the default restores the hinges', async () => {
    const view = await mount();
    fireEvent.change(picker(view), { target: { value: 'PULL_OUT_FRAME' } });
    await new Promise((r) => setTimeout(r, 60));
    fireEvent.change(picker(view), { target: { value: '' } });
    await new Promise((r) => setTimeout(r, 60));
    expect(picker(view).value).toBe('');
    expect(text(view)).toContain('لا يوجد في المخزن مفصلات');
  });

  it('a drawer zone takes the same mechanism (a cargo base, the 300 mm spice unit)', async () => {
    const view = await mount();
    // switch the zone kind to drawers through the panel's own select
    const kindSelect = [...view.container.querySelectorAll('select')].find((s) => [...s.options].some((o) => /^أدراج$/.test(o.textContent || ''))) as HTMLSelectElement;
    expect(kindSelect).toBeTruthy();
    fireEvent.change(kindSelect, { target: { value: 'DRAWERS' } });
    await new Promise((r) => setTimeout(r, 60));
    const select = picker(view);
    expect([...select.options].map((o) => o.value)).toContain('PULL_OUT_FRAME');
    fireEvent.change(select, { target: { value: 'PULL_OUT_FRAME' } });
    await new Promise((r) => setTimeout(r, 60));
    expect(picker(view).value).toBe('PULL_OUT_FRAME');
  });
});
