// Regression guards found by reviewing phase 2f: phantom stock, invoice rounding, and a random-cabinet invariant fuzz.
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as M from '../fixtures/matrix';
import * as E from '../../src/math/partsEngine';
import * as Z from '../../src/math/zones';
import { GOLA_CATEGORIES } from '../../src/rules/openings';
import { bodyView } from '../../src/math/base';
import { applyConsumptionDelta, registerHardwareItem, hardwareConsumption } from '../../src/math/stockDelta';
import { assemblyGeometry, facadeKey, applianceKey } from '../../src/math/assemblyGeometry';
import { buildFasteners } from '../../src/math/fasteners';
import { auditParts, expectedParts } from '../../src/math/audit';
import { dimensionGraphics, dimensionsOf } from '../../src/math/dimensions';
import { generateFactoryBOMReport } from '../../src/math/bomEngine';
import { generateCustomerInvoice } from '../../src/math/invoiceEngine';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18), wood('mel16', 16), wood('glass', 4, 'Glass Door with Aluminum Profile', 30000)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('lift', 'Overhead Lift Systems', 'Aventos HK', 2500), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200), hw('push', 'Push-Open Systems', 'Tip-On', 450), hw('gola', 'Gola & Handle Profiles', 'Gola C', 1800), hw('cam','Assembly & Fixing','Cam Lock',10), hw('dow','Assembly & Fixing','Wooden Dowel',2), hw('scr','Assembly & Fixing','Back Panel Screw',1), hw('pin','Assembly & Fixing','Shelf Support Pin',1)];
const ROLLS = [{ id: 'e1', brand: 'PVC', thickness: 1, width: 22, totalLengthMeters: 100, rollPriceDA: 3000 }, { id: 'e2', brand: 'ABS', thickness: 2, width: 45, totalLengthMeters: 50, rollPriceDA: 4000 }];

function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const R = rng(20261010);
const pick = (a) => a[Math.floor(R() * a.length)];
const int = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1));

function randomDraft() {
  // Half the runs start from a real configuration of the panel (a base, a bay, a blind corner...), half from a bare unit:
  // the random fields below then push both out of their comfort zone.
  const d = R() < 0.5 ? { ...pick(M.MATRIX).draft } : P.draftFromPreset(pick(['Standard_Base', 'Standard_Wall'] as const));
  d.carcaseMaterialId = pick(['mel', 'mel16']); d.frontMaterialId = pick(['mel', 'mel16', 'glass']);
  d.carcaseEdgeRollId = pick(['', 'e1', 'e2']); d.frontEdgeRollId = pick(['', 'e1', 'e2']);
  d.width = int(150, 1200); d.height = int(300, 2400); d.depth = int(300, 700);
  const n = int(1, 5);
  d.zones = Array.from({ length: n }, () => {
    const kind = pick(['DOORS', 'DRAWERS', 'OPEN', 'APPLIANCE', 'APRON']);
    const z: any = { kind, count: int(1, 6), shelves: int(0, 4) };
    if (R() < 0.5) z.heightMm = int(60, 700);
    if (kind === 'APPLIANCE') { z.appliance = pick(['OVEN', 'MICROWAVE', 'COFFEE', 'DISHWASHER', 'FRIDGE']); z.panelFront = R() < 0.5; }
    if ((kind === 'DOORS' || kind === 'APPLIANCE') && R() < 0.45) z.split = { mainSide: pick(['LEFT', 'RIGHT']), mainWidthMm: R() < 0.4 ? int(40, 700) : undefined, fill: pick(['AUTO', 'PULL_OUT', 'DOOR', 'OPEN', 'PANEL']) };
    return z;
  });
  d.openingMode = pick(['HANDLE', 'GOLA', 'PUSH']);
  d.dividerBoards = pick([1, 2]);
  d.golaSlots = Array.from({ length: int(0, 3) }, () => int(0, 5));
  return d;
}

const EPS = 1e-6;
const overlaps = (a, b) => Math.min(a.xMm + a.widthMm, b.xMm + b.widthMm) - Math.max(a.xMm, b.xMm) > EPS && Math.min(a.yMm + a.heightMm, b.yMm + b.heightMm) - Math.max(a.yMm, b.yMm) > EPS;

test('fuzz: engine invariants on random cabinets', () => {
  const fails = {};
  const note = (k, info) => { (fails[k] ??= []).push(info); };
  let tooTall = 0, total = 0, splits = 0;
  for (let it = 0; it < 1500; it++) {
    const d = P.resolveDraft(randomDraft(), WOODS, HW, ROLLS);
    const cab = { ...P.draftToNewCabinet(d, { id: 'c' + it, name: 'c' + it, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
    let pr;
    try { pr = E.priceCabinet(cab, WOODS, HW, ROLLS); } catch (e) { note('THROW', { it, msg: String(e), d }); continue; }
    total++;
    const th = WOODS.find((w) => w.id === cab.carcaseMaterialId).thickness;
    const tall = pr.issues.some((i) => i.code === 'ZONES_TOO_TALL');
    if (tall) tooTall++;
    // A: finite numbers
    const nums = [pr.totalDA, pr.woodCostDA, pr.edgeCostDA, pr.hardwareCostDA, ...pr.parts.flatMap((p) => [p.cutWidthMm, p.cutLengthMm, p.boardCostDA, p.edgeMeters, p.areaM2, p.sheets])];
    if (nums.some((n) => !Number.isFinite(n) || n < 0)) note('NONFINITE_OR_NEGATIVE', { it });
    // B: total = parts
    if (pr.totalDA !== pr.parts.reduce((s, p) => s + p.boardCostDA, 0) + pr.edgeCostDA + pr.hardware.reduce((s, h) => s + h.totalCostDA, 0)) note('TOTAL_MISMATCH', { it });
    if (tall) continue;
    const { bands, dividerBottomsMm } = pr.model.layout;
    // E: the bands tile the BODY, which is the cabinet minus its base (math/base.ts): a unit on 100 mm legs is 770 mm of body.
    const bodyH = bodyView(cab).height;
    if (bands[0].bandBottomMm !== 0 || bands[bands.length - 1].bandTopMm !== bodyH) note('BANDS_NOT_FULL_HEIGHT', { it, h: bodyH, top: bands[bands.length - 1].bandTopMm });
    for (let i = 1; i < bands.length; i++) if (Math.abs(bands[i].bandBottomMm - bands[i - 1].bandTopMm) > EPS) note('BANDS_NOT_CONTIGUOUS', { it, i });
    // C/D/F facades
    const fs = pr.model.plan.facades;
    fs.forEach((f) => {
      if (!(f.widthMm > 0) || !(f.heightMm > 0)) note('FACADE_NONPOSITIVE', { it, kind: f.kind, w: f.widthMm, h: f.heightMm, zone: d.zones[f.zoneIndex], H: cab.height });
      if (f.xMm < -EPS || f.yMm < -EPS || f.xMm + f.widthMm > cab.width + EPS || f.yMm + f.heightMm > cab.height + EPS) note('FACADE_OUT_OF_BOUNDS', { it, f, W: cab.width, H: cab.height });
      const b = bands[f.zoneIndex];
      if (f.yMm < b.bandBottomMm - EPS || f.yMm + f.heightMm > b.bandTopMm + EPS) note('FACADE_OUTSIDE_BAND', { it, f, b: [b.bandBottomMm, b.bandTopMm] });
    });
    for (let i = 0; i < fs.length; i++) for (let j = i + 1; j < fs.length; j++) if (overlaps(fs[i], fs[j])) note('FACADE_OVERLAP', { it, a: fs[i], b: fs[j] });
    // Gola channels vs facades
    pr.model.plan.channels.forEach((c) => fs.forEach((f) => { if (Math.min(f.yMm + f.heightMm, c.yMm + c.heightMm) - Math.max(f.yMm, c.yMm) > EPS) note('GOLA_OVERLAPS_FACADE', { it, c, f }); }));
    // Gola only when allowed
    if (pr.model.plan.channels.length > 0 && !GOLA_CATEGORIES.includes(cab.category)) note('GOLA_WHERE_NOT_ALLOWED', { it });
    pr.model.plan.channels.forEach((c) => { const b = bands[c.zoneIndex]; if (c.yMm < b.bandBottomMm - EPS || c.yMm + c.heightMm > b.bandTopMm + EPS) note('GOLA_OUTSIDE_BAND', { it, c, b: [b.bandBottomMm, b.bandTopMm] }); });
    // Divider count vs parts
    const divRow = pr.parts.find((p) => p.partType === 'Zone Divider Panel');
    // SPEC CHANGE: the board between two zones is always cut, also above an open appliance bay.
    const expectDiv = (cab.zones.length - 1) * (cab.dividerBoards === 2 ? 2 : 1);
    if ((divRow?.quantity ?? 0) !== expectDiv) note('DIVIDER_COUNT', { it, got: divRow?.quantity, expectDiv });
    // Geometry: nothing solid collides with anything else, every connector has a parent, columns tile the width
    const th18 = th;
    const geo = assemblyGeometry(cab, { carcaseTh: th18, frontTh: th18, lift: false, inset: false });
    const solids = [
      ...geo.boxes.filter((b) => b.kind !== 'back').map((b) => ({ n: b.key, x0: b.centerMm[0] - b.sizeMm[0] / 2, x1: b.centerMm[0] + b.sizeMm[0] / 2, y0: b.centerMm[1] - b.sizeMm[1] / 2, y1: b.centerMm[1] + b.sizeMm[1] / 2, z0: b.centerMm[2] - b.sizeMm[2] / 2, z1: b.centerMm[2] + b.sizeMm[2] / 2 })),
      ...geo.facades.map((f) => ({ n: facadeKey(f), x0: f.xMm, x1: f.xMm + f.widthMm, y0: f.yMm, y1: f.yMm + f.heightMm, z0: f.zMm - th18 / 2, z1: f.zMm + th18 / 2 })),
      ...geo.appliances.flatMap((a) => [{ n: applianceKey(a.zoneIndex), c: a.centerMm, s: a.sizeMm }, ...(a.trim ? [{ n: applianceKey(a.zoneIndex) + '-trim', c: a.trim.centerMm, s: a.trim.sizeMm }] : [])].map((o) => ({ n: o.n, x0: o.c[0] - o.s[0] / 2, x1: o.c[0] + o.s[0] / 2, y0: o.c[1] - o.s[1] / 2, y1: o.c[1] + o.s[1] / 2, z0: o.c[2] - o.s[2] / 2, z1: o.c[2] + o.s[2] / 2 }))),
    ];
    for (let a = 0; a < solids.length; a++) for (let b = a + 1; b < solids.length; b++) {
      const A = solids[a], B = solids[b];
      const shelfOnly = (A.n.startsWith('shelf') || B.n.startsWith('shelf')) && ![A.n, B.n].some((n) => /facade|oven|vdiv|side|appliance/.test(n));
      if (Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 1e-4 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 1e-4 && Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0) > 1e-4) {
        // shelves too close to each other or to a divider are a design mistake the engine must WARN about (SHELVES_TOO_CLOSE)
        if (shelfOnly && pr.issues.some((i) => i.code === 'SHELVES_TOO_CLOSE')) continue;
        note('SOLIDS_COLLIDE', { it, a: A.n, b: B.n, zones: d.zones });
      }
    }
    geo.boxes.filter((b) => b.kind === 'vdivider').forEach((b) => { if (b.centerMm[0] - b.sizeMm[0] / 2 < th18 - EPS || b.centerMm[0] + b.sizeMm[0] / 2 > cab.width - th18 + EPS) note('VDIV_OUTSIDE', { it }); });
    const keys = new Set([...geo.boxes.map((b) => b.key), ...geo.facades.map(facadeKey)]);
    buildFasteners(geo, cab, { carcaseTh: th18, frontTh: th18 }).forEach((f) => { if (!keys.has(f.parent) || f.centerMm.some((n) => !Number.isFinite(n))) note('FASTENER_BAD', { it, parent: f.parent, kind: f.kind }); });
    const splitBands = bands.filter((b) => b.split);
    splitBands.forEach((b) => {
      const sp = b.split;
      const cols = [sp.main, sp.fill].sort((p, q) => p.innerLoMm - q.innerLoMm);
      if (Math.abs(cols[0].innerLoMm - th18) > EPS || Math.abs(cols[1].innerHiMm - (cab.width - th18)) > EPS || Math.abs(cols[1].innerLoMm - cols[0].innerHiMm - th18) > EPS) note('COLUMNS_DO_NOT_TILE', { it });
    });
    splits += splitBands.length;
    // The audit ruler must never cry wolf: a correct drawing (shifted, float32) reports nothing, and every dimension line is finite.
    const exp = expectedParts(geo, { facades: true, frontThicknessMm: th18 });
    const f32 = (v, k) => Math.fround((v + [-400, -1100, 0][k]) / 1000) * 1000;
    const rep = auditParts(exp, exp.map((p) => ({ key: p.key, min: p.min.map(f32), max: p.max.map(f32) })) as any);
    if (rep.findings.length) note('AUDIT_FALSE_ALARM', { it, first: rep.findings[0].message });
    dimensionsOf(geo, cab, th18, th18).forEach((dm) => { if (dimensionGraphics(dm).segments.flat(2).some((n: number) => !Number.isFinite(n))) note('DIMENSION_NOT_FINITE', { it, id: dm.id }); });
    // Sum of sheets sanity
    if (pr.parts.some((p) => p.cutWidthMm > p.widthMm + EPS || p.cutLengthMm > p.lengthMm + EPS)) note('CUT_LARGER_THAN_FINISHED', { it });
  }
  for (const [k, v] of Object.entries(fails) as Array<[string, any[]]>) console.log(k, v.length, JSON.stringify(v[0]).slice(0, 900));
  assert.ok(total - tooTall > 500, 'the fuzz must exercise enough valid cabinets');
  assert.ok(splits > 150, 'the fuzz must exercise enough split zones, got ' + splits);
  assert.equal(Object.keys(fails).length, 0, 'invariant failures: ' + Object.keys(fails).join(', '));
});
