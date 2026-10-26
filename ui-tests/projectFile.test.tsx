// The project toolbar on the REAL App: it must be visible, it must say when there is unsaved work, and the
// autosave recovery must really bring a previous session's kitchen back onto the screen.
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { FurnitureProvider } from '../src/context/FurnitureContext';
import App from '../src/App';
import { AUTOSAVE_KEY, serializeProject } from '../src/project/projectFile';
import type { ProjectData } from '../src/project/projectFile';
import { draftFromPreset, draftToNewCabinet, resolveDraft } from '../src/math/cabinetPresets';
import { DEFAULT_LAYOUT } from '../src/math/kitchenLayout';
import { COUNTERTOP_DEFAULT } from '../src/math/countertop';

type Screen = ReturnType<typeof render>;
const text = (view: Screen) => view.container.textContent || '';
const mount = async (): Promise<Screen> => {
  const view = render(<FurnitureProvider><App /></FurnitureProvider>);
  await new Promise((r) => setTimeout(r, 250));
  return view;
};

beforeEach(() => localStorage.clear());
afterEach(() => cleanup());

describe('project files', () => {
  it('the toolbar is on screen: new, open, save and the project name', async () => {
    const view = await mount();
    expect(text(view)).toContain('📄 جديد');
    expect(text(view)).toContain('📂 فتح');
    expect(text(view)).toContain('💾 حفظ');
    expect(view.container.querySelector('input[aria-label="اسم المشروع"]')).toBeTruthy();
  });

  it('an autosave from a previous session is offered, and recovering it installs its cabinets', async () => {
    const cab = draftToNewCabinet(resolveDraft(draftFromPreset('Standard_Wall'), [], [], []), { id: 'cab-rec', name: 'علوية مسترجعة', positionX: 0 });
    const data: ProjectData = {
      cabinets: [cab],
      baselineInventory: { woodPanels: [], hardwareItems: [], edgeBandRolls: [] },
      layout: DEFAULT_LAYOUT,
      counterTop: COUNTERTOP_DEFAULT,
      accessories: [],
    };
    localStorage.setItem(AUTOSAVE_KEY, serializeProject('مطبخ الأمس', data));
    const view = await mount();
    expect(text(view)).toContain('وُجد عمل غير محفوظ من الجلسة السابقة');
    expect(text(view)).toContain('مطبخ الأمس');
    const recoverBtn = [...view.container.querySelectorAll('button')].find((b) => b.textContent === 'استرجاع')!;
    fireEvent.click(recoverBtn);
    await new Promise((r) => setTimeout(r, 200));
    expect(text(view)).toContain('الوحدات المثبّتة (1)');
    expect(text(view)).toContain('تم استرجاع');
  });
});
