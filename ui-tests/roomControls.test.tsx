// UI tests for the room fields and the wall-unit hanging, on the REAL App: the wall length of a straight kitchen,
// the room height and the standard gap above the worktop in every kitchen shape, the hanging of a wall unit, and
// the button that merges the other column with the zone below (no separating board on that side).
// If any of these controls disappears or stops driving the numbers, `npm run test:ui` fails here.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import App from '../src/App';

type Screen = ReturnType<typeof render>;
const text = (view: Screen) => view.container.textContent || '';
const allButtons = (view: Screen) => [...view.container.querySelectorAll('button')] as HTMLButtonElement[];
const button = (view: Screen, re: RegExp) => allButtons(view).find((b) => re.test(b.textContent || ''));

/** The number input that belongs to a field label ("طول الجدار (مم)", "ارتفاع الغرفة...", ...). */
const inputOfLabel = (view: Screen, labelText: string): HTMLInputElement => {
  const label = [...view.container.querySelectorAll('label')].find((l) => (l.textContent || '').includes(labelText));
  const input = label?.querySelector('input');
  if (!input) throw new Error(`no input for the field «${labelText}»`);
  return input as HTMLInputElement;
};
const setField = (view: Screen, labelText: string, value: string) => {
  const input = inputOfLabel(view, labelText);
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
};

const mount = async (): Promise<Screen> => {
  const view = render(<FurnitureProvider><App /></FurnitureProvider>);
  await new Promise((r) => setTimeout(r, 250));
  return view;
};

beforeEach(() => { (window as any).confirm = () => true; });
afterEach(() => cleanup());

describe('the room fields of the layout panel', () => {
  it('a straight kitchen shows the wall LENGTH, the room height and the standard gap', async () => {
    const view = await mount();
    expect(inputOfLabel(view, 'طول الجدار (مم)')).toBeTruthy();
    expect(text(view)).not.toContain('طول الجدار الخلفي');
    expect(inputOfLabel(view, 'ارتفاع الغرفة').value).toBe('2600');
    expect(inputOfLabel(view, 'الفراغ القياسي فوق سطح العمل').value).toBe('600');
  });

  it('the room height and the standard gap stay on the panel in an L and in a U kitchen', async () => {
    const view = await mount();
    fireEvent.click(button(view, /شكل L/)!);
    expect(inputOfLabel(view, 'طول الجدار الخلفي (مم)')).toBeTruthy();
    expect(inputOfLabel(view, 'ارتفاع الغرفة')).toBeTruthy();
    expect(inputOfLabel(view, 'الفراغ القياسي فوق سطح العمل')).toBeTruthy();
    fireEvent.click(button(view, /شكل U/)!);
    expect(inputOfLabel(view, 'ارتفاع الغرفة')).toBeTruthy();
    expect(inputOfLabel(view, 'الفراغ القياسي فوق سطح العمل')).toBeTruthy();
  });

  it('a typed room height is clamped to the 2000–4000 range', async () => {
    const view = await mount();
    setField(view, 'ارتفاع الغرفة', '9999');
    expect(inputOfLabel(view, 'ارتفاع الغرفة').value).toBe('4000');
    setField(view, 'ارتفاع الغرفة', '100');
    expect(inputOfLabel(view, 'ارتفاع الغرفة').value).toBe('2000');
  });

  it('a typed standard gap is clamped to the 0–1500 range', async () => {
    const view = await mount();
    setField(view, 'الفراغ القياسي فوق سطح العمل', '9999');
    expect(inputOfLabel(view, 'الفراغ القياسي فوق سطح العمل').value).toBe('1500');
  });
});

describe('hanging a wall unit', () => {
  /** Switches the draft to a wall unit and returns its hanging select. */
  const openHanging = async (view: Screen) => {
    fireEvent.click(button(view, /^علوية$/)!);
    await new Promise((r) => setTimeout(r, 150));
    const select = view.container.querySelector('select[aria-label="طريقة تعليق الخزانة"]') as HTMLSelectElement;
    expect(select, 'a wall unit must offer its hanging').toBeTruthy();
    return select;
  };

  it('the standard hanging follows the typed standard gap', async () => {
    const view = await mount();
    setField(view, 'الفراغ القياسي فوق سطح العمل', '450');
    const select = await openHanging(view);
    expect(select.options[0].textContent).toContain('القياسي: 450 مم فوق سطح العمل');
    expect(text(view)).toContain('📏 تعليق الخزانة العلوية');
  });

  it('hanging it from the ceiling measures it against the typed room height', async () => {
    const view = await mount();
    setField(view, 'ارتفاع الغرفة', '3000');
    const select = await openHanging(view);
    fireEvent.change(select, { target: { value: 'CEILING' } });
    await new Promise((r) => setTimeout(r, 150));
    expect(text(view)).toContain('البعد عن السقف');
    expect(text(view)).toContain('السقف عند 3000 مم');
  });

  it('the ceiling shortcut makes a 40 cm unit flush with the ceiling', async () => {
    const view = await mount();
    await openHanging(view);
    fireEvent.click(button(view, /علوية 40 سم من السقف/)!);
    await new Promise((r) => setTimeout(r, 150));
    // 2600 ceiling: a 400 mm unit hung at 0 from the ceiling reads "bottom 2200 · top 2600"
    expect(text(view)).toMatch(/أسفل الخزانة عند 2200 مم · أعلاها عند 2600 مم/);
  });
});

describe('merging the other column with the zone below', () => {
  it('the button appears once two zones carry a vertical board, and merging is said on the card', async () => {
    const view = await mount();
    fireEvent.click(button(view, /➕ قسم/)!);
    await new Promise((r) => setTimeout(r, 150));
    const splitBoxes = () => [...view.container.querySelectorAll('label')]
      .filter((l) => (l.textContent || '').includes('لوح عمودي (عمودان)'))
      .map((l) => l.querySelector('input[type="checkbox"]') as HTMLInputElement);
    expect(splitBoxes().length).toBe(2);
    splitBoxes().forEach((box) => fireEvent.click(box));
    await new Promise((r) => setTimeout(r, 200));
    const mergeLabel = [...view.container.querySelectorAll('label')]
      .find((l) => (l.textContent || '').includes('دمج العمود الآخر مع القسم'));
    expect(mergeLabel, 'the merge button must be offered on the upper zone').toBeTruthy();
    expect(mergeLabel!.textContent).toContain('بلا رف فاصل في هذا الجانب');
    fireEvent.click(mergeLabel!.querySelector('input[type="checkbox"]')!);
    await new Promise((r) => setTimeout(r, 200));
    expect(text(view)).toContain('العمود الآخر: مدموج مع القسم 1');
  });
});
