// The dimension lines of the 3D atomic workspace (the style of the reference screenshots).
import * as M from '../fixtures/matrix';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import { assemblyGeometry } from '../../src/math/assemblyGeometry';
import { dimensionGraphics, dimensionsOf, formatMm } from '../../src/math/dimensions';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const dimsOf = (draft: any, over = {}) => {
  const d = P.resolveDraft({ ...draft, ...over }, WOODS, [], []);
  const cab = { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  const geo = assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
  return { cab, geo, dims: dimensionsOf(geo, cab, 18) };
};
const len = (a, b) => Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);

test('dimensions: the left chain adds up to the total, boards and openings, bottom to top, for every configuration of the panel', () => {
  M.MATRIX.forEach((c) => {
    const { cab, dims } = dimsOf(c.draft);
    const chain = dims.filter((d) => d.id.startsWith('chain-'));
    assert.ok(chain.length >= 1, c.name); // an open carcase (a dishwasher on its own) has no board: one opening, floor to top
    assert.ok(Math.abs(chain.reduce((sum, d) => sum + d.valueMm, 0) - cab.height) < 1e-6, `${c.name}: chain != height`);
    assert.equal(chain[0].a[1], 0);
    assert.ok(Math.abs(chain.at(-1).b[1] - cab.height) < 1e-6);
    chain.slice(1).forEach((d, i) => assert.ok(Math.abs(d.a[1] - chain[i].b[1]) < 1e-6, `${c.name}: gap in the chain`));
    chain.forEach((d) => { assert.ok(d.valueMm > 0); assert.ok(Number.isFinite(d.valueMm)); });
  });
});

test('dimensions: total, inner and outer width, depth', () => {
  const { cab, dims } = dimsOf(M.config('deepDrawers'), { width: 262, height: 1800, depth: 253.1 });
  const by = (id) => dims.find((d) => d.id === id);
  assert.equal(by('total').valueMm, cab.height);
  assert.equal(by('width-outer').valueMm, cab.width);
  assert.equal(by('width-inner').valueMm, cab.width - 36);
  assert.equal(by('depth').valueMm, cab.depth);
  assert.equal(by('width-inner').label, formatMm(cab.width - 36));
  assert.ok(by('width-outer').offset[1] < by('width-inner').offset[1], 'the overall width sits under the inner one');
  assert.ok(by('total').offset[0] < by('chain-0').offset[0], 'the total sits further out than the chain');
});

test('dimensions: every gap between two fronts is a bracket with its real value', () => {
  const { dims } = dimsOf(M.config('deepDrawers'), { zones: [{ kind: 'DOORS', count: 2 }, { kind: 'DRAWERS', count: 3 }] });
  const gaps = dims.filter((d) => d.kind === 'GAP');
  assert.ok(gaps.length >= 3, 'one between the doors, two between the drawers, one between the zones');
  gaps.forEach((g) => { assert.equal(g.valueMm, 1); assert.equal(g.label, '1'); assert.equal(len(g.a, g.b), 1); });
});

test('dimensions: whole numbers without a decimal point, half millimetres and tenths with one', () => {
  assert.equal(formatMm(248), '248');
  assert.equal(formatMm(381.8), '381.8');
  assert.equal(formatMm(0.5), '0.5');
  assert.equal(formatMm(241.00000001), '241');
  assert.equal(formatMm(253.12), '253.1');
});

test('dimensions: the drawn line is exactly as long as the value it carries', () => {
  const { dims } = dimsOf(M.config('deepDrawers'));
  dims.forEach((d) => {
    const g = dimensionGraphics(d);
    assert.equal(g.segments.length, 5, 'two extension lines, the dimension line, two ticks');
    const main = g.segments[2];
    assert.ok(Math.abs(len(...main) - d.valueMm) < 1e-9, `${d.id}: drawn ${len(...main)} for ${d.valueMm}`);
    assert.ok(Math.abs(len(...g.segments[0]) - (len([0, 0, 0], d.offset) + 8)) < 1e-9, 'extension line reaches the row + overshoot');
    g.segments.flat(2).forEach((n) => assert.ok(Number.isFinite(n)));
  });
});

test('dimensions: every front carries its own width and height, equal to the cut size', () => {
  M.MATRIX.forEach((c) => {
    const { geo, dims } = dimsOf(c.draft);
    const w = dims.filter((d) => d.kind === 'FRONT_W'), h = dims.filter((d) => d.kind === 'FRONT_H');
    assert.equal(w.length, geo.facades.length, c.name);
    assert.equal(h.length, geo.facades.length, c.name);
    geo.facades.forEach((f) => {
      const fw = w.find((d) => d.valueMm === f.widthMm && d.a[0] === f.xMm), fh = h.find((d) => d.valueMm === f.heightMm && d.a[1] === f.yMm);
      assert.ok(fw && fh, `${c.name}: front ${f.zoneIndex}/${f.kind}/${f.index} has no dimension`);
      assert.equal(fw.label, formatMm(f.widthMm));
      assert.equal(fw.a[2], f.zMm + 9, 'drawn on the outer face of the front (18 mm thick)');
    });
  });
});

test('dimensions: with an edge band the front labels carry the CUT size next to the finished one', () => {
  const { cab, geo } = dimsOf(M.config('deepDrawers'));
  const dims = dimensionsOf(geo, cab, 18, 18, 2);
  const fronts = dims.filter((d) => d.kind === 'FRONT_W' || d.kind === 'FRONT_H');
  assert.ok(fronts.length >= 2);
  fronts.forEach((d) => {
    assert.equal(d.cutMm, d.valueMm - 4, 'a 2 mm band on both sides');
    assert.equal(d.label, `${formatMm(d.valueMm)} ✂ ${formatMm(d.valueMm - 4)}`);
    assert.ok(Math.abs(len(...dimensionGraphics(d).segments[2]) - d.valueMm) < 1e-9, 'the line stays as long as the FINISHED size');
  });
  dimensionsOf(geo, cab, 18, 18, 0).filter((d) => d.kind === 'FRONT_W').forEach((d) => { assert.equal(d.cutMm, undefined); assert.equal(d.label, formatMm(d.valueMm)); });
});
