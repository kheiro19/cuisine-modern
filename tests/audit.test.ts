// @ts-nocheck  (plain node:test file, run with: npm test)
// The audit ruler: the drawing is compared with the model, and every kind of drawing mistake is caught.
import * as LG from './fixtures/legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../src/math/cabinetPresets';
import { assemblyGeometry } from '../src/math/assemblyGeometry';
import { SUBTYPES } from './fixtures/legacy';
import { auditParts, boxFromCenterSize, expectedParts, gapsBetween } from '../src/math/audit';

const wood = (id, th) => ({ id, brand: id, type: 'MDF Melamine Matt', thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: 15000 });
const WOODS = [wood('hdf', 3), wood('mel', 18)];
const OPTS = { carcaseTh: 18, frontTh: 18, lift: false, inset: false };
const geoOf = (subtype, over = {}) => {
  const d = P.resolveDraft({ ...LG.draftFromPreset(subtype), ...over }, WOODS, [], []);
  const cab = { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  return { cab, geo: assemblyGeometry(cab, OPTS) };
};
const expectedOf = (geo) => expectedParts(geo, { facades: true, frontThicknessMm: 18 });
/** What a correct drawing reports: the same boxes, in another frame (the preview centres the cabinet) and as float32 metres. */
const drawn = (parts, f = (b) => b) => parts.map((p) => {
  const q = f({ ...p, min: [...p.min], max: [...p.max] });
  const t = (v, k) => Math.fround((v + [-400, -1100, 0][k]) / 1000) * 1000;
  return { key: q.key, min: q.min.map(t), max: q.max.map(t) };
});
const twoDoors = () => geoOf('Deep_Drawers', { zones: [{ kind: 'DOORS', count: 2, shelves: 1 }] });
const find = (parts, key) => parts.find((p) => p.key === key);

test('audit: a correct drawing, shifted and rounded to float32, reports nothing', () => {
  [twoDoors(), geoOf('Built_In_Appliance', { width: 800, zones: [{ kind: 'DRAWERS', count: 1, heightMm: 380 }, { kind: 'APPLIANCE', appliance: 'OVEN', heightMm: 595, split: { mainSide: 'LEFT', fill: 'AUTO' } }, { kind: 'DOORS', count: 2, shelves: 1 }] }), geoOf('Standard_Wall')].forEach(({ geo }) => {
    const exp = expectedOf(geo);
    const rep = auditParts(exp, drawn(exp));
    assert.deepEqual(rep.findings, []);
    assert.equal(rep.checked, exp.length);
    assert.equal(rep.ok, true);
  });
});

test('audit: every template, drawn correctly, passes (the audit has no false alarms)', () => {
  SUBTYPES.forEach((s) => {
    const { geo } = geoOf(s);
    const exp = expectedOf(geo);
    assert.deepEqual(auditParts(exp, drawn(exp)).findings, [], s);
  });
});

test('audit: a board drawn too thick, or a shelf drawn out of place, is named with its size error', () => {
  const { geo } = twoDoors();
  const exp = expectedOf(geo);
  const bottom = exp.find((p) => p.key === 'bottom');
  const thick = auditParts(exp, drawn(exp, (b) => { if (b.key === 'bottom') b.max[1] += 0.5; return b; }));
  assert.equal(thick.findings.length >= 1, true);
  const f = thick.findings.find((x) => x.key === 'bottom');
  assert.equal(f.code, 'SIZE');
  assert.equal(f.deltaMm, 0.5);
  assert.ok(f.expected[1] === bottom.max[1] - bottom.min[1]);

  const shelf = exp.find((p) => p.key.startsWith('shelf'));
  const moved = auditParts(exp, drawn(exp, (b) => { if (b.key === shelf.key) { b.min[1] += 2; b.max[1] += 2; } return b; }));
  assert.deepEqual(moved.findings.map((x) => [x.code, x.key, x.deltaMm]), [['OFFSET', shelf.key, 2]]);
});

test('audit: a part that is not drawn, and a part that should not be there', () => {
  const { geo } = twoDoors();
  const exp = expectedOf(geo);
  const missing = auditParts(exp, drawn(exp).filter((b) => b.key !== 'side-left'));
  assert.ok(missing.findings.some((x) => x.code === 'MISSING' && x.key === 'side-left'));
  const extra = auditParts(exp, [...drawn(exp), boxFromCenterSize('ghost', [0, 0, 0], [10, 10, 10])]);
  assert.deepEqual(extra.findings.map((x) => [x.code, x.key]), [['EXTRA', 'ghost']]);
});

test('audit: the 1 mm gap between two doors is read from the drawing, and a drifted door is caught', () => {
  const { geo } = twoDoors();
  const exp = expectedOf(geo);
  const doors = exp.filter((p) => p.key.startsWith('facade-') && p.key.includes('DOOR')).sort((a, b) => a.min[0] - b.min[0]);
  assert.equal(doors.length, 2);
  const planned = gapsBetween(doors);
  assert.equal(planned.length, 1);
  assert.equal(planned[0].axis, 'x');
  assert.equal(planned[0].gapMm, 1);
  const clean = auditParts(exp, drawn(exp));
  assert.ok(clean.gaps.some((g) => g.axis === 'x' && Math.abs(g.gapMm - 1) < 1e-3), 'the ruler reads 1 mm (to float32 precision)');
  // the right door drawn 0.4 mm too close
  const drift = auditParts(exp, drawn(exp, (b) => { if (b.key === doors[1].key) { b.min[0] -= 0.4; b.max[0] -= 0.4; } return b; }));
  const gap = drift.findings.find((x) => x.code === 'GAP');
  assert.ok(gap, 'the gap finding');
  assert.equal(gap.expected[0], 1);
  assert.ok(Math.abs(gap.measured[0] - 0.6) < 1e-3);
  assert.ok(drift.findings.some((x) => x.code === 'OFFSET' && x.key === doors[1].key));
});

test('audit: doors drawn into each other overlap, a back panel that overlays the boards does not', () => {
  const { geo } = twoDoors();
  const exp = expectedOf(geo);
  const doors = exp.filter((p) => p.key.startsWith('facade-')).sort((a, b) => a.min[0] - b.min[0]);
  const rep = auditParts(exp, drawn(exp, (b) => { if (b.key === doors[1].key) { b.min[0] -= 3; } return b; }));
  assert.ok(rep.findings.some((x) => x.code === 'OVERLAP'));
  assert.ok(!auditParts(exp, drawn(exp)).findings.some((x) => x.code === 'OVERLAP' && /back/.test(x.key + x.other)));
});

test('audit: a trim drawn centred on the appliance instead of where the model puts it is caught', () => {
  const { geo } = geoOf('Built_In_Appliance', { width: 800, zones: [{ kind: 'DRAWERS', count: 1, heightMm: 380 }, { kind: 'APPLIANCE', appliance: 'OVEN', heightMm: 595, split: { mainSide: 'LEFT', fill: 'AUTO' } }, { kind: 'DOORS', count: 2 }] });
  const oven = geo.appliances.find((a) => a.appliance === 'OVEN');
  assert.ok(oven.trim, 'the oven has a trim');
  assert.ok(Math.abs(oven.trim.centerMm[0] - oven.centerMm[0]) > 1, 'in a column the trim is not centred on the oven (it is held inside its strip)');
  const exp = expectedOf(geo);
  const trimKey = `${exp.find((p) => p.key.endsWith('-trim')).key}`;
  const rep = auditParts(exp, drawn(exp, (b) => {
    if (b.key === trimKey) { const dx = oven.centerMm[0] - oven.trim.centerMm[0]; b.min[0] += dx; b.max[0] += dx; }
    return b;
  }));
  assert.ok(rep.findings.some((x) => x.code === 'OFFSET' && x.key === trimKey), 'the offset of the trim is reported');
  assert.ok(rep.findings.every((x) => x.key === trimKey || x.other === trimKey), 'and nothing else: at most the overlap it causes with its neighbour');
});
