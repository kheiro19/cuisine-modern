// Gola on wall units and towers (one channel per doors / drawers zone) and the front frame of built-in appliances.
import * as M from '../fixtures/matrix';
import test from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../../src/math/cabinetPresets';
import * as E from '../../src/math/partsEngine';
import { assemblyGeometry } from '../../src/math/assemblyGeometry';

const wood = (id, th, type = 'MDF Melamine Matt', price = 15000) => ({ id, brand: id, type, thickness: th, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 10, averagePriceDA: price });
const hw = (id, category, modelType = 'x', price = 300, qty = 100) => ({ id, category, brand: 'B', modelType, pricePerUnitDA: price, availableQty: qty });
const WOODS = [wood('hdf', 3, 'HDF Standard 3mm', 4000), wood('mel', 18)];
const HW_BASE = [hw('hinge', 'Cabinet Hinges', 'Clip Top'), hw('slide', 'Drawer Slide Systems', 'Tandem'), hw('legs', 'Assembly & Fixing', 'Adjustable Kitchen Legs', 120), hw('hang', 'Assembly & Fixing', 'Cabinet Hanger Plates', 200)];
const HW = [...HW_BASE, hw('gola', 'Gola & Handle Profiles', 'Gola C', 1800)];
const ROLLS = [{ id: 'e1', brand: 'PVC', thickness: 1, width: 22, totalLengthMeters: 100, rollPriceDA: 3000 }];
const EPS = 1e-6;

const build = (draft: any, mod = (d) => d, items = HW) => {
  const d = P.resolveDraft(mod(draft), WOODS, items, ROLLS);
  const cab = { ...P.draftToNewCabinet(d, { id: 'c', name: 'c', positionX: 0 }), carcaseThickness: 18, frontThickness: 18, calculatedCostDA: 0 };
  return { d, cab, pr: E.priceCabinet(cab, WOODS, items, ROLLS) };
};
const gola = (d) => ({ ...d, openingMode: 'GOLA' });
const overlap1 = (a0: number, a1: number, b0: number, b1: number) => Math.min(a1, b1) - Math.max(a0, b0);
/** Spread of a pair, for the three axes (a tuple keeps TypeScript happy where a plain array does not). */
const span = (p: number[]) => [p[0], p[1]] as [number, number];
const facadeBox = (f) => ({ x: [f.xMm, f.xMm + f.widthMm], y: [f.yMm, f.yMm + f.heightMm], z: [f.zMm - 9, f.zMm + 9] });
const boxOf = (c, s) => ({ x: [c[0] - s[0] / 2, c[0] + s[0] / 2], y: [c[1] - s[1] / 2, c[1] + s[1] / 2], z: [c[2] - s[2] / 2, c[2] + s[2] / 2] });
const intersects = (a, b) => overlap1(...span(a.x), ...span(b.x)) > EPS && overlap1(...span(a.y), ...span(b.y)) > EPS && overlap1(...span(a.z), ...span(b.z)) > EPS;

test('gola on a wall unit: the channel runs along the BOTTOM of the doors and is priced once', () => {
  const { cab, pr } = build(M.config('standardWall'), gola);
  assert.equal(cab.frontConfig.hasGolaProfile, true);
  const { facades, channels } = pr.model.plan;
  assert.equal(channels.length, 1);
  const doors = facades.filter((f) => f.kind === 'DOOR');
  doors.forEach((f) => assert.equal(f.yMm, channels[0].yMm + channels[0].heightMm, 'doors start right above the channel'));
  assert.equal(channels[0].heightMm, 45);
  assert.ok(Math.abs(doors[0].heightMm + 45 + 4 - cab.height) <= 1, 'door + channel + 4 mm clearance = cabinet height');
  assert.equal(pr.hardware.find((h) => h.item.id === 'gola').quantity, 1);
  assert.ok(E.priceCabinet(cab, WOODS, HW_BASE, ROLLS).issues.some((i) => i.code === 'NO_GOLA_ITEM'));
});

test('gola on a two-storey wall unit: one channel under the doors of EACH storey', () => {
  const { pr } = build(M.config('ceilingHeight'), gola);
  const { facades, channels } = pr.model.plan;
  assert.equal(channels.length, 2);
  channels.forEach((c) => facades.filter((f) => f.zoneIndex === c.zoneIndex).forEach((f) => assert.equal(f.yMm, c.yMm + c.heightMm)));
  assert.equal(pr.hardware.find((h) => h.item.id === 'gola').quantity, 2);
});

test('gola on a built-in tower: a channel per doors / drawers zone, low zones on top, doors above reach underneath', () => {
  const { cab, pr } = build(M.config('ovenColumn'), gola);
  assert.equal(cab.frontConfig.hasGolaProfile, true);
  const { facades, channels } = pr.model.plan;
  assert.equal(channels.length, 2, 'the drawer zone and the doors zone (the oven and microwave zones have no front to open)');
  const drawer = facades.find((f) => f.kind === 'DRAWER');
  const drawerChannel = channels.find((c) => c.zoneIndex === drawer.zoneIndex);
  assert.equal(drawerChannel.yMm, drawer.yMm + drawer.heightMm, 'low drawer: channel above it');
  const doors = facades.filter((f) => f.kind === 'DOOR');
  const doorChannel = channels.find((c) => c.zoneIndex === doors[0].zoneIndex);
  assert.ok(doors[0].yMm + doors[0].heightMm > 1500, 'these doors reach above 1.5 m');
  doors.forEach((f) => assert.equal(f.yMm, doorChannel.yMm + doorChannel.heightMm, 'high doors: channel underneath, within reach'));
  channels.forEach((c) => facades.forEach((f) => assert.ok(overlap1(c.yMm, c.yMm + c.heightMm, f.yMm, f.yMm + f.heightMm) <= EPS, 'channel never overlaps a front')));
  assert.equal(pr.hardware.find((h) => h.item.id === 'gola').quantity, 2);
});

test('gola on a floor unit with doors keeps the channel on TOP (unchanged behaviour)', () => {
  const { pr } = build(M.config('deepDrawers'), (d) => ({ ...d, zones: [{ kind: 'DOORS', count: 2 }], openingMode: 'GOLA' }));
  const { facades, channels } = pr.model.plan;
  assert.equal(channels.length, 1);
  facades.forEach((f) => assert.equal(channels[0].yMm, f.yMm + f.heightMm));
});

test('appliance trim: the oven and microwave frames sit OVER the cabinet edges, in front of the carcase', () => {
  const { cab } = build(M.config('ovenColumn'));
  const geo = assemblyGeometry(cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
  const inner = cab.width - 36;
  const withTrim = geo.appliances.filter((a) => a.trim);
  assert.deepEqual(withTrim.map((a) => a.appliance).sort(), ['MICROWAVE', 'OVEN']);
  withTrim.forEach((a) => {
    const t = a.trim;
    assert.ok(t.sizeMm[0] > a.sizeMm[0], 'wider than the niche');
    assert.ok(t.sizeMm[0] > inner, 'wider than the inside of the cabinet: it covers the front edge of both side boards');
    assert.ok(t.sizeMm[0] <= cab.width, 'never wider than the cabinet');
    assert.ok(t.sizeMm[1] > a.sizeMm[1], 'taller than the niche');
    assert.ok(Math.abs(t.centerMm[2] - t.sizeMm[2] / 2 - cab.depth / 2) < EPS, 'its back face is on the front plane of the carcase');
    assert.ok(t.centerMm[2] - t.sizeMm[2] / 2 >= a.centerMm[2] + a.sizeMm[2] / 2 - EPS, 'in front of the appliance body');
  });
  // the frame never touches a board, a front or the other appliance's frame
  const others = [...geo.boxes.map((b) => boxOf(b.centerMm, b.sizeMm)), ...geo.facades.map(facadeBox)];
  withTrim.forEach((a) => others.forEach((o) => assert.ok(!intersects(boxOf(a.trim.centerMm, a.trim.sizeMm), o), 'trim collides with something')));
  assert.ok(!intersects(boxOf(withTrim[0].trim.centerMm, withTrim[0].trim.sizeMm), boxOf(withTrim[1].trim.centerMm, withTrim[1].trim.sizeMm)));
});

test('appliance trim: none behind a decor panel, none on a dishwasher or a fridge', () => {
  // The draft only keeps panelFront on a dishwasher / fridge, so the guard is exercised on the saved cabinet itself.
  const panel = build(M.config('ovenColumn'));
  const hidden = { ...panel.cab, zones: panel.cab.zones.map((z) => (z.appliance === 'OVEN' ? { ...z, panelFront: true } : z)) };
  const g1 = assemblyGeometry(hidden, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
  assert.equal(g1.appliances.find((a) => a.appliance === 'OVEN').trim, undefined);
  assert.ok(g1.appliances.find((a) => a.appliance === 'MICROWAVE').trim);
  const dish = build(M.config('ovenColumn'), (d) => ({ ...d, zones: [{ kind: 'APPLIANCE', appliance: 'DISHWASHER', heightMm: 820 }, { kind: 'DOORS', count: 1 }] }));
  const g2 = assemblyGeometry(dish.cab, { carcaseTh: 18, frontTh: 18, lift: false, inset: false });
  assert.ok(g2.appliances.length > 0 && g2.appliances.every((a) => !a.trim));
});
