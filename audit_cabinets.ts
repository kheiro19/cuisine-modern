// @ts-nocheck
// Structural + dimensional audit of every cabinet the engine can build. Run: npx tsx audit_cabinets.ts
import * as P from './src/math/cabinetPresets';
import * as E from './src/math/partsEngine';
import { assemblyGeometry, facadeKey } from './src/math/assemblyGeometry';
import { buildFasteners } from './src/math/fasteners';
import { lCornerCabinets, lCornerBoxes } from './src/math/lCorner';
import { footprintOf, toFrame } from './src/math/kitchenLayout';
import { carcaseSidesOf } from './src/math/carcaseSides';
import { PANEL, LAYOUT, DRAWER_BOX } from './src/math/constants';
import { SUBTYPES } from './src/rules/templates';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18), wood('mel16', 16)];
const HW = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('lift', 'Overhead Lift Systems', 'Aventos HK', 2500), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200), hw('push', 'Push-Open Systems', 'Tip-On', 450), hw('gola', 'Gola & Handle Profiles', 'Gola C', 1800), hw('cam', 'Assembly & Fixing', 'Cam Lock', 10), hw('dow', 'Assembly & Fixing', 'Wooden Dowel', 2), hw('scr', 'Assembly & Fixing', 'Back Panel Screw', 1), hw('pin', 'Assembly & Fixing', 'Shelf Support Pin', 1)];
const HW_INSET = HW.map((h) => (h.id === 'hinge' ? { ...h, modelType: 'Inset Hinge (Cranked)' } : h));
const ROLLS = [{ id: 'e1', brand: 'PVC', thickness: 1, width: 22, totalLengthMeters: 100, rollPriceDA: 3000 }];

const found: Record<string, { n: number; ex: any[] }> = {};
const note = (code: string, info: any) => { const f = (found[code] ??= { n: 0, ex: [] }); f.n++; if (f.ex.length < 3) f.ex.push(info); };

const bx = (b) => ({ x0: b.centerMm[0] - b.sizeMm[0] / 2, x1: b.centerMm[0] + b.sizeMm[0] / 2, y0: b.centerMm[1] - b.sizeMm[1] / 2, y1: b.centerMm[1] + b.sizeMm[1] / 2, z0: b.centerMm[2] - b.sizeMm[2] / 2, z1: b.centerMm[2] + b.sizeMm[2] / 2 });
const gap1 = (a0, a1, b0, b1) => Math.max(a0, b0) - Math.min(a1, b1); // <=0 overlap, >0 gap
const dist = (A, B) => Math.max(gap1(A.x0, A.x1, B.x0, B.x1), gap1(A.y0, A.y1, B.y0, B.y1), gap1(A.z0, A.z1, B.z0, B.z1));
const fxBox = (f, th) => ({ x0: f.xMm, x1: f.xMm + f.widthMm, y0: f.yMm, y1: f.yMm + f.heightMm, z0: f.zMm - th / 2, z1: f.zMm + th / 2 });
const fastBox = (f) => {
  if (f.shape === 'box') return bx({ centerMm: f.centerMm, sizeMm: f.sizeMm });
  const [d, l] = f.sizeMm; const s = [d, d, d]; s[{ x: 0, y: 1, z: 2 }[f.axis]] = l;
  return bx({ centerMm: f.centerMm, sizeMm: s });
};

function auditCabinet(cab, label, hwSet = HW) {
  const th = cab.carcaseThickness, fth = cab.frontThickness;
  const doorHw = E.pickFrontHardware(cab, 'DOORS', hwSet);
  const opt = { lift: E.isLiftItem(doorHw), inset: !!doorHw && doorHw.modelType.includes('Inset Hinge') };
  let pr; try { pr = E.priceCabinet(cab, WOODS, hwSet, ROLLS); } catch (e) { note('THROW', { label, e: String(e) }); return; }
  if (pr.issues.some((i) => i.code === 'ZONES_TOO_TALL')) return;
  const geo = assemblyGeometry(cab, { carcaseTh: th, frontTh: fth, ...opt });
  pr.issues.filter((i) => ['LIFT_ZONE_NOT_TOP', 'DOORS_TOO_NARROW'].includes(i.code)).forEach((i) => note('ENGINE_WARNS_' + i.code, { label }));
  const fasts = buildFasteners(geo, cab, { carcaseTh: th, frontTh: fth });
  const W = cab.width, H = cab.height, D = cab.depth;
  const boxes = new Map(geo.boxes.map((b) => [b.key, b]));
  const sides = carcaseSidesOf(cab, th);

  // 1. floating boards: connectivity (touch tolerance 1.6 mm: shelves keep 1 mm clearance)
  const list = geo.boxes.map((b) => ({ k: b.key, b: bx(b) }));
  const seen = new Set([list[0]?.k]); const q = [list[0]];
  while (q.length) { const c = q.pop(); list.forEach((o) => { if (!seen.has(o.k) && dist(c.b, o.b) <= 1.6) { seen.add(o.k); q.push(o); } }); }
  list.forEach((o) => { if (!seen.has(o.k)) note('FLOATING_BOARD', { label, key: o.k }); });

  // 2. every connector must touch the board / facade that carries it
  const fmap = new Map(geo.facades.map((f) => [facadeKey(f), fxBox(f, fth)]));
  fasts.forEach((f) => {
    const parent = boxes.has(f.parent) ? bx(boxes.get(f.parent)) : fmap.get(f.parent);
    if (!parent) { note('FASTENER_PARENT_MISSING', { label, kind: f.kind, parent: f.parent }); return; }
    const d = dist(fastBox(f), parent);
    if (d > 2) note('FASTENER_IN_AIR_' + f.kind, { label, parent: f.parent, distMm: Math.round(d * 10) / 10, at: f.centerMm.map(Math.round) });
  });

  // 3. every opening facade must be carried: swing -> plates on a board that exists; fixed panels -> some connector
  geo.facades.forEach((f) => {
    const key = facadeKey(f);
    const mine = fasts.filter((x) => x.parent === key || (x.kind === 'HINGE_PLATE' && false));
    if (f.motion === 'SWING') {
      const plates = fasts.filter((x) => x.kind === 'HINGE_PLATE' && Math.abs(x.centerMm[0] - (f.hinge === 'LEFT' ? f.xMm : f.xMm + f.widthMm)) < 80);
      if (plates.length === 0) note('DOOR_NO_HINGE_PLATE', { label, key });
    }
    if (f.kind === 'APRON' || f.kind === 'PANEL') {
      if (mine.length === 0) note('FIXED_PANEL_NO_FASTENER', { label, key, kind: f.kind, w: f.widthMm, h: f.heightMm });
    }
    // drawer front: has runners on the cabinet sides that actually exist
    if (f.motion === 'SLIDE' && !sides.left && !sides.right) note('DRAWER_NO_SIDE_FOR_RUNNERS', { label, key });
    if (f.motion === 'SLIDE' && (!sides.left || !sides.right)) note('DRAWER_ON_OMITTED_SIDE', { label, key, omit: cab.omitSides });
  });

  // 4. hinge side must have a carcase board behind the hinge edge
  geo.facades.filter((f) => f.motion === 'SWING').forEach((f) => {
    const hx = f.hinge === 'LEFT' ? f.xMm : f.xMm + f.widthMm;
    const behind = geo.boxes.filter((b) => (b.kind === 'side' || b.kind === 'vdivider') && (() => { const A = bx(b); return hx >= A.x0 - 3 && hx <= A.x1 + 3 && A.y0 <= f.yMm + f.heightMm / 2 && A.y1 >= f.yMm + f.heightMm / 2; })());
    if (behind.length === 0) note('DOOR_HINGE_EDGE_NOT_ON_A_BOARD', { label, key: facadeKey(f), hinge: f.hinge, hx, omit: cab.omitSides });
  });

  // 5. drawer boxes inside the carcase
  geo.facades.forEach((f) => (f.box ?? []).forEach((b) => {
    const A = bx(b);
    if (A.x0 < sides.loMm - 0.01 || A.x1 > sides.hiMm + 0.01) note('DRAWER_BOX_OUTSIDE_SIDES', { label, key: facadeKey(f), x: [A.x0, A.x1], inner: [sides.loMm, sides.hiMm], omit: cab.omitSides });
    if (A.z0 < -D / 2 - 0.01) note('DRAWER_BOX_BEHIND_BACK', { label, key: facadeKey(f), z0: A.z0, D, runner: b.sizeMm });
    geo.boxes.filter((o) => ['bottom', 'divider', 'rail', 'roof', 'shelf', 'vdivider'].includes(o.kind)).forEach((o) => { const Bx = bx(o); if (dist(A, Bx) < -0.01 && !pr.issues.some((i) => i.code === 'DRAWER_BOX_TOO_LOW')) note('DRAWER_BOX_HITS_' + o.kind.toUpperCase(), { label, key: facadeKey(f), board: o.key }); });
  }));

  // 6. appliance niche really inside the carcase
  geo.appliances.forEach((a) => {
    const A = bx(a);
    if (A.x0 < sides.loMm - 0.01 || A.x1 > sides.hiMm + 0.01 || A.z0 < -D / 2 - 0.01) note('APPLIANCE_OUTSIDE_CARCASE', { label, z0: A.z0, D });
  });

  // 7. shelves stay inside the opening of their zone
  const bands = pr.model.layout.bands;
  geo.boxes.filter((b) => b.kind === 'shelf').forEach((b) => {
    const zi = Number(/^shelf-(\d+)/.exec(b.key)?.[1]); const band = bands[zi]; const A = bx(b);
    if (band && (A.y0 < band.openingBottomMm - 0.01 || A.y1 > band.openingBottomMm + band.openingHeightMm + 0.01)) note('SHELF_OUTSIDE_OPENING', { label, key: b.key });
  });

  // 8. standard-size rules the engine never warns about
  geo.facades.filter((f) => f.kind === 'DOOR').forEach((f) => {
    if (f.widthMm > 600 && !f.frame) note('DOOR_WIDER_THAN_600_NO_WARNING', { label, w: f.widthMm, h: f.heightMm });
    if (f.heightMm > 2000 && f.widthMm > 500) note('DOOR_HEAVY_TALL_NO_WARNING', { label, w: f.widthMm, h: f.heightMm });
  });
  geo.boxes.filter((b) => b.kind === 'shelf').forEach((b) => { if (b.sizeMm[0] > 800) note('SHELF_SPAN_OVER_800_UNSUPPORTED', { label, spanMm: b.sizeMm[0], th }); });
  geo.facades.filter((f) => f.kind === 'DRAWER').forEach((f) => { if (f.widthMm > 1000) note('DRAWER_FRONT_OVER_1000', { label, w: f.widthMm }); });
  if (pr.model.plan.facades.some((f) => f.kind === 'DOOR') && W - 2 * th > 1000 && !pr.model.layout.bands.some((b) => b.split)) note('WIDE_CARCASE_NO_CENTRE_PARTITION', { label, W });

  // 9. base unit stands on the floor: no plinth / leg height anywhere in the geometry
  if (cab.category === 'BASE_UNIT') {
    const bottom = geo.boxes.find((b) => b.kind === 'bottom'); const lowFront = Math.min(...geo.facades.map((f) => f.yMm));
    if (bottom && bx(bottom).y0 < 1) note('BASE_BOTTOM_ON_FLOOR_NO_PLINTH_NO_LEGS', { label, bottomY0: bx(bottom).y0, lowestFrontY: lowFront });
  }

  // 11. a facade / basket frame must not occupy the same space as a board
  const pen = (A, B) => Math.min(A.x1, B.x1) - Math.max(A.x0, B.x0) > 0.5 && Math.min(A.y1, B.y1) - Math.max(A.y0, B.y0) > 0.5 && Math.min(A.z1, B.z1) - Math.max(A.z0, B.z0) > 0.5;
  geo.facades.forEach((f) => {
    const F = fxBox(f, fth);
    geo.boxes.filter((b) => b.kind !== 'back').forEach((b) => { if (pen(F, bx(b))) note('FACADE_PENETRATES_BOARD' + (opt.inset ? '_INSET' : ''), { label, facade: facadeKey(f), board: b.key }); });
    if (f.frame) geo.boxes.filter((b) => b.kind !== 'back').forEach((b) => { if (pen(bx(f.frame), bx(b))) note('PULL_OUT_FRAME_HITS_BOARD', { label, facade: facadeKey(f), board: b.key }); });
  });
  // 12. lift doors only make sense on the TOP zone (a lower lift door would swing up through the zone above)
  const lifts = geo.facades.filter((f) => f.motion === 'LIFT');
  if (lifts.some((l) => l.zoneIndex !== pr.model.layout.bands.length - 1) || (lifts.length && geo.facades.some((f) => f.kind === 'DOOR' && f.zoneIndex !== lifts[0].zoneIndex))) note('LIFT_DOOR_BELOW_ANOTHER_ZONE', { label });
  // 13. hinge arm length (standard hinge: cup -> plate is ~ 10-16 mm)
  fasts.filter((q) => q.kind === 'HINGE_ARM').forEach((q) => { if (q.sizeMm[0] > 40) note('HINGE_ARM_LONGER_THAN_40MM', { label, armMm: Math.round(q.sizeMm[0]), parent: q.parent }); });
  // 10. back overlay sits outside the carcase depth (inside the wall plane)
  const back = geo.boxes.find((b) => b.kind === 'back');
  if (back) note('BACK_PANEL_BEHIND_WALL_PLANE', { label, extraMm: back.sizeMm[2] });
}

// ---------------- build the matrix
let id = 0;
const mk = (d, over = {}, hwSet = HW) => {
  const r = P.resolveDraft({ ...d, ...over }, WOODS, hwSet, ROLLS);
  const cab = { ...P.draftToNewCabinet(r, { id: 'c' + id++, name: 'c' + id, positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  return cab;
};
const z = {
  doors: (n, s = 0, h) => ({ kind: 'DOORS', count: n, shelves: s, ...(h ? { heightMm: h } : {}) }),
  drawers: (n, h) => ({ kind: 'DRAWERS', count: n, ...(h ? { heightMm: h } : {}) }),
  open: (s) => ({ kind: 'OPEN', shelves: s }),
  app: (a, h, panel = false) => ({ kind: 'APPLIANCE', appliance: a, panelFront: panel, ...(h ? { heightMm: h } : {}) }),
  apron: (h) => ({ kind: 'APRON', heightMm: h }),
};
const zoneStacks = [
  [z.doors(1)], [z.doors(2, 2)], [z.doors(3, 1)], [z.drawers(3)], [z.drawers(1)], [z.open(3)],
  [z.drawers(2, 300), z.doors(2, 1)], [z.apron(120), z.doors(2)], [z.apron(120), z.drawers(3)],
  [z.app('OVEN', 600), z.drawers(2)], [z.app('OVEN', 600), z.doors(2, 1)], [z.doors(2, 1, 600), z.app('MICROWAVE', 400), z.doors(2)],
  [z.app('DISHWASHER', undefined, true)], [z.app('DISHWASHER')], [z.app('FRIDGE')], [z.app('WASHER')],
  [z.drawers(1, 200), z.drawers(1, 200), z.doors(2)], [z.doors(2, 3, 900), z.doors(2, 3)],
  [{ ...z.doors(1, 0), split: { mainSide: 'LEFT', fill: 'PULL_OUT' } }], [{ ...z.app('OVEN', 600), split: { mainSide: 'RIGHT', fill: 'DOOR' } }, z.drawers(2)],
  [{ ...z.doors(1), kinematic: 'PULL_OUT_FRAME' }], [{ ...z.drawers(2), kinematic: 'PULL_OUT_FRAME' }],
  [z.apron(80), z.app('OVEN', 600), z.apron(80), z.doors(2)],
];
const dimsets = { BASE_UNIT: [[300, 870, 560], [450, 870, 560], [600, 870, 600], [800, 720, 560], [900, 870, 600], [1000, 870, 600], [1200, 870, 600], [600, 2100, 600], [600, 2300, 600]], WALL_UNIT: [[300, 720, 350], [600, 720, 350], [800, 900, 350], [1000, 720, 350], [600, 1200, 320]] };
const modes = ['HANDLE', 'GOLA', 'PUSH'];
let count = 0;
for (const category of ['BASE_UNIT', 'WALL_UNIT']) {
  const base = P.draftFromPreset(category === 'BASE_UNIT' ? 'Standard_Base' : 'Standard_Wall');
  for (const zones of zoneStacks) for (const [w, h, d] of dimsets[category]) for (const openingMode of modes) for (const inset of [false, true]) for (const lift of category === 'WALL_UNIT' ? [false, true] : [false]) for (const dividerBoards of [1, 2]) {
    if (inset && lift) continue;
    const hwSet = inset ? HW_INSET : HW;
    if (dividerBoards === 2 && zones.length === 1) continue;
    const cab = mk(base, { zones: zones.map((x) => ({ ...x })), width: w, height: h, depth: d, openingMode, dividerBoards, category, ...(lift ? { preferLift: true } : {}) }, hwSet);
    auditCabinet(cab, `${category} ${w}x${h}x${d} ${openingMode}${inset ? ' inset' : ''}${lift ? ' lift' : ''} ${zones.map((q) => q.kind[0] + (q.count ?? '')).join('+')}`, hwSet);
    count++;
  }
}

// ---------------- L corners
let corners = 0;
for (const category of ['BASE_UNIT', 'WALL_UNIT']) for (const wall of ['B', 'C']) for (const [aA, aB] of [[300, 300], [600, 600], [700, 400], [450, 700]]) {
  const depthMm = category === 'WALL_UNIT' ? 350 : 600;
  const draft = P.resolveDraft(P.draftFromPreset(category === 'WALL_UNIT' ? 'L_Corner_Wall' : 'L_Corner_Base'), WOODS, HW, ROLLS);
  const p = { category, wall, roomWidthMm: 3600, depthMm, armAMm: aA, armBMm: aB };
  let n = 0;
  const cabs = lCornerCabinets(p, { draft, woods: WOODS, hardware: HW, edgeRolls: ROLLS, groupId: 'g', newId: () => 'k' + n++, name: 'L' }).map((c) => ({ ...c, carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 }));
  cabs.forEach((c) => auditCabinet(c, `L ${category} wall${wall} arms ${aA}/${aB} ${c.name.split('—')[1]}`));
  corners++;

  // world-space collision between the doors of the three boxes (run frames of kitchenLayout.ts)
  const worldFacades = [];
  cabs.forEach((c) => {
    const run = c.run ?? 'A';
    const th = 18;
    const geo = assemblyGeometry(c, { carcaseTh: th, frontTh: th, lift: false, inset: false });
    const fc = toFrame(c, run);
    geo.facades.forEach((f) => {
      const F = fxBox(f, th);
      // cabinet-local -> run frame: x + positionX, z + depth/2 - positionZ
      const x0 = F.x0 + fc.positionX, x1 = F.x1 + fc.positionX, z0 = F.z0 + c.depth / 2 - c.positionZ, z1 = F.z1 + c.depth / 2 - c.positionZ;
      let wb;
      if (run === 'A') wb = { x0, x1, z0, z1 };
      else if (run === 'B') wb = { x0: z0, x1: z1, z0: -x1, z1: -x0 };
      else wb = { x0: 3600 - z1, x1: 3600 - z0, z0: x0, z1: x1 };
      worldFacades.push({ name: c.name.split('—')[1].trim() + ' ' + facadeKey(f), y0: F.y0, y1: F.y1, ...wb });
    });
  });
  for (let i = 0; i < worldFacades.length; i++) for (let j = i + 1; j < worldFacades.length; j++) {
    const a = worldFacades[i], b = worldFacades[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0);
    if (ox > 0.01 && oz > 0.01 && oy > 0.01) note('L_CORNER_DOORS_INTERPENETRATE', { category, wall, arms: [aA, aB], a: a.name, b: b.name, overlapMm: [Math.round(ox * 10) / 10, Math.round(oz * 10) / 10] });
  }
  // group footprint: boxes must tile an L without overlap and without gap
  const lay = { type: 'L', widthMm: 3600, lSide: wall === 'B' ? 'LEFT' : 'RIGHT' };
  const rects = cabs.map((c) => footprintOf(c, lay));
  for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) {
    const a = rects[i], b = rects[j];
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oz = Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0);
    if (ox > 0.5 && oz > 0.5) note('L_BOXES_OVERLAP_ON_FLOOR', { category, wall, i, j, ox, oz });
    if (ox < -0.5 || oz < -0.5) note('L_BOXES_GAP_ON_FLOOR', { category, wall, i, j, ox, oz });
  }
}

console.log(`\ncabinets audited: ${count} straight + ${corners} L corners (x3 boxes)\n`);
Object.entries(found).sort((a, b) => b[1].n - a[1].n).forEach(([k, v]) => console.log(String(v.n).padStart(6), k, '\n        ', JSON.stringify(v.ex[0]).slice(0, 330)));
