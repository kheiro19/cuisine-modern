// @ts-nocheck  (plain node:test file, run with: npm test)
// The auditor: independent checks on the numbers the engine produces, over many sizes. If a rule changes (a gap, a rounding, a
// grouping) and one of these fails, the cutting list or the drawing is wrong somewhere. Same checks the on-screen ruler will reuse.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import * as E from '../src/math/partsEngine';

const wood = (id, th, type) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm'), wood('mel', 18, 'MDF Melamine Matt')];
const hw = (id, category, modelType = 'x') => ({ id, category, brand: 'B', modelType, pricePerUnitDA: 300, availableQty: 100 });
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs'), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates')];

const priced = (base, mutate) => {
  const d = P.resolveDraft(mutate({ ...P.draftFromPreset(base) }), WOODS, HW, []);
  const cab = { ...P.draftToNewCabinet(d, { id: 'a', name: 'a', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  return { cab, r: E.priceCabinet(cab, WOODS, HW, []) };
};
// the multiset of "w x h" of the fronts drawn, against what the cutting list says
const drawn = (facades) => { const m = new Map(); facades.forEach((f) => m.set(`${f.widthMm}x${f.heightMm}`, (m.get(`${f.widthMm}x${f.heightMm}`) ?? 0) + 1)); return m; };
const listed = (parts, re) => { const m = new Map(); parts.filter((p) => p.role === 'front' && re.test(p.partType)).forEach((p) => m.set(`${p.widthMm}x${p.lengthMm}`, (m.get(`${p.widthMm}x${p.lengthMm}`) ?? 0) + p.quantity)); return m; };
const sameRows = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.get(k) === v);
const show = (m) => [...m].map(([k, v]) => `${v}x${k}`).join(' + ');

test('audit: doors are 1 mm apart, inside the carcase, and the cutting list holds every door at its real width', () => {
  for (const width of [300, 450, 500, 600, 601, 800, 900, 1000, 1200]) {
    for (let doors = 1; doors <= 6; doors++) {
      const { cab, r } = priced('Standard_Wall', (d) => ({ ...d, width, zones: [{ kind: 'DOORS', count: doors }] }));
      const f = r.model.plan.facades.filter((x) => x.kind === 'DOOR').sort((a, b) => a.xMm - b.xMm);
      const ctx = `W=${cab.width} doors=${doors}`;
      for (let k = 1; k < f.length; k++) assert.equal(f[k].xMm - (f[k - 1].xMm + f[k - 1].widthMm), 1, `${ctx}: gap between doors`);
      assert.ok(f[0].xMm >= 0 && f[f.length - 1].xMm + f[f.length - 1].widthMm <= cab.width, `${ctx}: inside the carcase`);
      assert.ok(sameRows(drawn(f), listed(r.parts, /Door/)), `${ctx}: drawn ${show(drawn(f))} | cutting list ${show(listed(r.parts, /Door/))}`);
    }
  }
});

test('audit: drawers are 1 mm apart and the cutting list holds every drawer front and drawer box at its real height', () => {
  for (let drawers = 1; drawers <= 6; drawers++) {
    const { r } = priced('Deep_Drawers', (d) => ({ ...d, height: 870, zones: [{ kind: 'DRAWERS', count: drawers }] }));
    const f = r.model.plan.facades.filter((x) => x.kind === 'DRAWER').sort((a, b) => a.yMm - b.yMm);
    for (let k = 1; k < f.length; k++) assert.equal(f[k].yMm - (f[k - 1].yMm + f[k - 1].heightMm), 1, `${drawers} drawers: gap`);
    assert.ok(sameRows(drawn(f), listed(r.parts, /Drawer Front/)), `${drawers} drawers: drawn ${show(drawn(f))} | cutting list ${show(listed(r.parts, /Drawer Front/))}`);
    // a box per drawer, each as tall as its own front allows
    const boxes = r.parts.filter((p) => /Drawer Box Back/.test(p.partType)).reduce((sum, p) => sum + p.quantity, 0);
    assert.equal(boxes, drawers, `${drawers} drawers: one box each`);
    const heights = new Map(); f.forEach((x) => heights.set(Math.max(60, x.heightMm - 70), (heights.get(Math.max(60, x.heightMm - 70)) ?? 0) + 1));
    const rows = new Map(); r.parts.filter((p) => /Drawer Box Back/.test(p.partType)).forEach((p) => rows.set(p.widthMm, (rows.get(p.widthMm) ?? 0) + p.quantity));
    assert.ok(sameRows(heights, rows), `${drawers} drawers: box heights ${show(heights)} | cutting list ${show(rows)}`);
  }
});

test('audit: two stacked zones keep 1 mm between their fronts, one divider board or two', () => {
  for (const boards of [1, 2]) {
    for (const [a, b] of [[{ kind: 'DRAWERS', count: 2 }, { kind: 'DOORS', count: 2 }], [{ kind: 'DOORS', count: 1 }, { kind: 'DOORS', count: 2 }], [{ kind: 'DRAWERS', count: 3 }, { kind: 'DRAWERS', count: 2 }]]) {
      const { r } = priced('Deep_Drawers', (d) => ({ ...d, zones: [a, b], dividerBoards: boards }));
      const f = r.model.plan.facades;
      const lo = f.filter((x) => x.zoneIndex === 0), up = f.filter((x) => x.zoneIndex === 1);
      assert.equal(Math.min(...up.map((x) => x.yMm)) - Math.max(...lo.map((x) => x.yMm + x.heightMm)), 1, `${boards} board(s) ${a.kind}${a.count}/${b.kind}${b.count}`);
    }
  }
});
