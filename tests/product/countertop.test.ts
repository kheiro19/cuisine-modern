// The worktop the customer buys separately: it is DRAWN and dimensioned, never priced.
// The panel owns three numbers — visible, thickness (20–40 mm), depth (580–650 mm) — and these are the rules behind them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COUNTERTOP, LAYOUT } from '../../src/math/constants';
import {
  COUNTERTOP_DEFAULT,
  carriesCountertop,
  clampCountertopSettings,
  computeCountertopOutline,
  countertopDepthMm,
} from '../../src/math/countertop';

test('the allowed numbers are a real slab: 20–40 mm thick, 580–650 mm deep', () => {
  assert.deepEqual(COUNTERTOP.THICKNESS_MM, [20, 40]);
  assert.deepEqual(COUNTERTOP.DEPTH_MM, [580, 650]);
  // the factory default is still the one the rest of the app knows
  assert.equal(LAYOUT.COUNTERTOP_THICKNESS_MM, COUNTERTOP.DEFAULT_THICKNESS_MM);
  assert.deepEqual(COUNTERTOP_DEFAULT, { visible: true, thicknessMm: 40, depthMm: 600, texturePath: undefined });
});

test('a typed number is clamped to the slab, rounded to whole millimetres', () => {
  assert.equal(clampCountertopSettings({ thicknessMm: 10 }).thicknessMm, 20, 'too thin → 20');
  assert.equal(clampCountertopSettings({ thicknessMm: 99 }).thicknessMm, 40, 'too thick → 40');
  assert.equal(clampCountertopSettings({ thicknessMm: 33.4 }).thicknessMm, 33, 'whole mm');
  assert.equal(clampCountertopSettings({ depthMm: 500 }).depthMm, 580, 'too narrow → 580');
  assert.equal(clampCountertopSettings({ depthMm: 900 }).depthMm, 650, 'too wide → 650');
});

test('the finish picked for the slab is kept, and clearing it goes back to plain stone', () => {
  assert.equal(clampCountertopSettings({ texturePath: '/textures/marble.webp' }).texturePath, '/textures/marble.webp');
  assert.equal(clampCountertopSettings({ texturePath: '' }).texturePath, undefined);
  assert.equal(clampCountertopSettings({ texturePath: '   ' }).texturePath, undefined);
  assert.equal(clampCountertopSettings(undefined).texturePath, undefined);
});

test('a missing or non-numeric entry falls back to the default, never to NaN', () => {
  const d = clampCountertopSettings(undefined);
  assert.deepEqual(d, COUNTERTOP_DEFAULT);
  assert.equal(clampCountertopSettings({ thicknessMm: Number.NaN }).thicknessMm, 40);
  assert.equal(clampCountertopSettings({ depthMm: Number.POSITIVE_INFINITY }).depthMm, 600);
  assert.equal(clampCountertopSettings({ visible: false }).visible, false);
  assert.equal(clampCountertopSettings({ visible: undefined }).visible, true, 'shown unless hidden on purpose');
});

test('the slab is drawn with the width that was typed — never stretched behind the user', () => {
  // The old rule drew max(typed, front): 600 over a 648 front was drawn 648 and the field looked locked, because typing
  // 611, 620 or 640 all drew 648. The width is the user's; a short slab says how many mm it lacks and nothing else.
  assert.deepEqual(countertopDepthMm(600, 598), { depthMm: 600, shortByMm: 0 });
  assert.deepEqual(countertopDepthMm(650, 598), { depthMm: 650, shortByMm: 0 });
  assert.deepEqual(countertopDepthMm(580, 598), { depthMm: 580, shortByMm: 18 }, 'short, and it says by how much');
  assert.deepEqual(countertopDepthMm(611, 648), { depthMm: 611, shortByMm: 37 }, 'the 648 case: 611 stays 611');
  // a run whose front is unknown (nothing installed) keeps the requested depth
  assert.deepEqual(countertopDepthMm(600, 0), { depthMm: 600, shortByMm: 0 });
});

test('only the floor units under counter height carry it — a 2200 pantry goes through', () => {
  assert.equal(carriesCountertop({ category: 'BASE_UNIT', height: 870 }), true);
  assert.equal(carriesCountertop({ category: 'BASE_UNIT', height: 2200 }), false, 'tall / pantry unit');
  assert.equal(carriesCountertop({ category: 'BASE_UNIT', height: LAYOUT.COUNTERTOP_MAX_UNIT_HEIGHT_MM }), true, 'the limit itself counts');
  assert.equal(carriesCountertop({ category: 'WALL_UNIT', height: 720 }), false);
});

test('the outline follows the depth the user set, and stays a closed ring', () => {
  const ring = computeCountertopOutline([{ x: 0, zOffset: 0 }], 0, 2400, 0, 650);
  assert.ok(ring.length >= 3, 'a ring');
  const zs = ring.map(([, z]) => z);
  assert.equal(Math.min(...zs), 0, 'the back edge sits on the wall');
  assert.equal(Math.max(...zs), 650, 'the front edge is the depth typed in the panel');
  // the same run at 580 is wider than the slab? no: the ring is simply the smaller one
  const narrow = computeCountertopOutline([{ x: 0, zOffset: 0 }], 0, 2400, 0, 580);
  assert.equal(Math.max(...narrow.map(([, z]) => z)), 580);
});
