// The accessories library: catalog integrity, the shapes stay inside their box, and the placement rules.
import test from 'node:test';
import assert from 'node:assert/strict';
import { ACCESSORY_CATALOG, ACCESSORY_CATEGORIES, CODE_MODEL_IDS, FINISHES, getAccessory, accessoriesOf, resolveFinish, searchAccessories } from '../../src/data/accessoryCatalog';
import { ACCESSORY_MODEL_KEYS, modelPrims, primBounds } from '../../src/math/accessoryModels';
import { LAYOUT } from '../../src/math/constants';
import { cabinetsClashingPieces, placeAlongWall, type KitchenLayout } from '../../src/math/kitchenLayout';
import { buildRenderScene } from '../../src/math/renderScene';
import { buildAiRenderPrompt } from '../../src/math/renderPrompt';
import * as M from '../fixtures/matrix';
import * as P from '../../src/math/cabinetPresets';
const WOODS_T = [{ id: 'w16', brand: 'B', type: 'MDF', thickness: 16, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 9, averagePriceDA: 9000 }, { id: 'w19', brand: 'B', type: 'MDF', thickness: 19, widthSheet: 2800, heightSheet: 2070, edgeThickness: 0, edgeWidth: 0, currentQty: 9, averagePriceDA: 11000 }];
import { auditDesign } from '../../src/math/designAudit';
import { flipAccessory, footprintOf, nudgeAccessory, placeAccessory, reconcileAccessories, removeAccessory, resetAccessoryTransform, resizeAccessory, rotateAccessory, sceneRefOf, setFinish, type TransformResult } from '../../src/math/accessoryPlacement';
import type { CabinetLite, NudgeResult, PlaceResult } from '../../src/math/accessoryPlacement';

/** The union has a success and a failure shape; a test that places something needs the success one, with its message. */
const okPlace = (r: PlaceResult) => { if ('error' in r) throw new Error(r.error); return r; };
const okNudge = (r: NudgeResult) => { if ('error' in r) throw new Error(r.error); return r; };
const okTransform = (r: TransformResult) => { if ('error' in r) throw new Error(r.error); return r.list; };

const cab = (id: string, over: Partial<CabinetLite> = {}): CabinetLite => ({ id, name: id, category: 'BASE_UNIT', positionX: 0, positionZ: 0, width: 600, height: 720, depth: 560, frontThickness: 18, carcaseThickness: 18, ...over });
const RUN = [cab('b1', { positionX: 0 }), cab('b2', { positionX: 600 }), cab('b3', { positionX: 1200 }), cab('w1', { category: 'WALL_UNIT', positionX: 0, height: 720, depth: 320 }), cab('w2', { category: 'WALL_UNIT', positionX: 600, depth: 320 })];
const SCENE = sceneRefOf(RUN, 600);

// A big kitchen: 3.6 m of base units, a 1 m and a 0.6 m wall unit, and a tall unit at the end of the run.
const BIG = [
  ...[0, 1, 2, 3, 4, 5].map((i) => cab(`b${i}`, { positionX: i * 600 })),
  cab('w1', { category: 'WALL_UNIT', positionX: 0, width: 1000, height: 720, depth: 320 }),
  cab('w2', { category: 'WALL_UNIT', positionX: 1000, width: 600, height: 720, depth: 320 }),
  cab('tall', { positionX: 3600, height: 2100, depth: 600 }),
];
const BIGSCENE = sceneRefOf(BIG, 600);

function addAll(ids: string[], cabs: ReadonlyArray<CabinetLite> = RUN, scene = SCENE, host?: string[]) {
  let list = [];
  ids.forEach((cid, i) => {
    const r = okPlace(placeAccessory(cid, `p${i}`, list, cabs, scene, host?.[i]));
    list = [...list, r.placed];
  });
  return list;
}

test('catalog: a big library, unique ids, every model has a builder and every builder is used', () => {
  const ids = new Set();
  ACCESSORY_CATALOG.forEach((a) => {
    assert.ok(!ids.has(a.id), `duplicate id ${a.id}`);
    ids.add(a.id);
    assert.ok(a.sizeMm.w > 0 && a.sizeMm.h > 0 && a.sizeMm.d > 0, a.id);
    assert.ok(ACCESSORY_MODEL_KEYS.includes(a.model), `${a.id}: no builder for ${a.model}`);
    assert.ok(a.nameAr && a.nameEn && a.icon, a.id);
    (a.finishes ?? []).forEach((k) => assert.ok(FINISHES[k], `${a.id}: unknown finish ${k}`));
    if (a.rest) assert.ok(a.restGroup, `${a.id}: a piece fixed on a sink needs a group`);
  });
  assert.ok(ACCESSORY_CATALOG.length >= 110, `only ${ACCESSORY_CATALOG.length} pieces`);
  ACCESSORY_CATEGORIES.forEach((c) => assert.ok(accessoriesOf(c).length >= 5, `${c} has too few pieces`));
  ACCESSORY_MODEL_KEYS.filter((k) => k !== 'placeholder').forEach((k) => assert.ok(ACCESSORY_CATALOG.some((a) => a.model === k), `builder ${k} is never used`));
  ['COUNTERTOP', 'BACKSPLASH', 'ABOVE_HOB', 'HANGING', 'FLOOR', 'CABINET_UNDER', 'CABINET_INSIDE'].forEach((m) => assert.ok(ACCESSORY_CATALOG.some((a) => a.mount === m), `no piece for ${m}`));
});

test('models: every shape of every piece, in every finish, stays inside its w x h x d box', () => {
  const TOL = 1.5;
  ACCESSORY_CATALOG.forEach((a) => {
    const { w, h, d } = a.sizeMm;
    (a.finishes?.length ? a.finishes : [undefined]).forEach((fk) => {
      const prims = modelPrims(a.model, w, h, d, a.opts ?? {}, resolveFinish(a, fk));
      assert.ok(prims.length >= 2, `${a.id}: too few shapes`);
      assert.ok(prims.length <= 600, `${a.id}: ${prims.length} shapes is too many`);
      prims.forEach((p, i) => {
        const b = primBounds(p);
        b.forEach((v) => assert.ok(Number.isFinite(v), `${a.id}#${i} not finite`));
        const [x0, x1, y0, y1, z0, z1] = b;
        assert.ok(x0 >= -w / 2 - TOL && x1 <= w / 2 + TOL, `${a.id}#${i} x ${x0.toFixed(1)}..${x1.toFixed(1)} outside ±${w / 2}`);
        assert.ok(y0 >= -TOL && y1 <= h + TOL, `${a.id}#${i} y ${y0.toFixed(1)}..${y1.toFixed(1)} outside 0..${h}`);
        assert.ok(z0 >= -d / 2 - TOL && z1 <= d / 2 + TOL, `${a.id}#${i} z ${z0.toFixed(1)}..${z1.toFixed(1)} outside ±${d / 2}`);
        assert.match(p.c, /^#[0-9a-f]{6}$/i, `${a.id}#${i} bad colour ${p.c}`);
      });
    });
  });
});

test('models: the splashback panels adapt to any wall length and the finish changes the colour', () => {
  [1200, 3000, 6000].forEach((span) => {
    const prims = modelPrims('panel', span, 600, 12, { style: 'tile' }, FINISHES.white);
    assert.ok(prims.length <= 600, `${prims.length} shapes for ${span} mm`);
    prims.forEach((p) => { const [x0, x1] = primBounds(p); assert.ok(x0 >= -span / 2 - 1.5 && x1 <= span / 2 + 1.5); });
  });
  const steel = modelPrims('tap', 60, 420, 220, { reach: 150, drop: 90 }, FINISHES.chrome);
  const gold = modelPrims('tap', 60, 420, 220, { reach: 150, drop: 90 }, FINISHES.gold);
  assert.notEqual(steel[0].c, gold[0].c);
  assert.equal(resolveFinish(getAccessory('tap-pulldown'), 'gold').c, FINISHES.gold.c);
  assert.equal(resolveFinish(getAccessory('tap-pulldown'), 'wood').c, FINISHES.chrome.c, 'a finish the piece does not offer falls back to its first');
});

test('search: Arabic, English, category and several words', () => {
  assert.ok(searchAccessories('محبس').length >= 6);
  assert.ok(searchAccessories('fridge').length >= 5);
  assert.ok(searchAccessories('pendant light').length >= 4);
  assert.ok(searchAccessories('أحواض').length >= 10, 'by category name');
  assert.equal(searchAccessories('zzzzqq').length, 0);
  assert.equal(searchAccessories('   ').length, 0);
});

test('scene: the worktop numbers match the 3D canvas (height + 40 mm, overhang 20 mm)', () => {
  assert.equal(SCENE.hasCounter, true);
  assert.equal(SCENE.counterTopYMm, 720 + LAYOUT.COUNTERTOP_THICKNESS_MM);
  assert.equal(SCENE.counterXStartMm, 0);
  assert.equal(SCENE.counterXEndMm, 1800);
  assert.equal(SCENE.zFrontMm, 560 + 18 + LAYOUT.COUNTERTOP_FRONT_OVERHANG_MM);
  assert.equal(SCENE.wallBottomYMm, 760 + 600);
  assert.equal(SCENE.splashMm, 600);
  assert.equal(sceneRefOf([cab('t', { height: 2100 })], 600).hasCounter, false, 'a tall unit carries no worktop');
});

test('placement: EVERY piece of the library can be placed in a normal kitchen', () => {
  ACCESSORY_CATALOG.forEach((a) => {
    let list = [];
    if (a.rest) {
      const s = placeAccessory('sink-double', 'sink', [], BIG, BIGSCENE);
      assert.ok(s.ok, 'sink for ' + a.id);
      list = [s.placed];
    }
    if (a.id === 'hood-island') list = [];
    const host = a.mount === 'CABINET_UNDER' ? 'w1' : a.mount === 'CABINET_INSIDE' ? 'tall' : undefined;
    const r = okPlace(placeAccessory(a.id, 'x', list, BIG, BIGSCENE, host));
    const all = [...list, r.placed];
    const f = footprintOf(r.placed, all, BIG, BIGSCENE);
    assert.ok(f, `${a.id}: no footprint`);
    [f.xMm, f.yMm, f.zMm, f.w, f.h, f.d].forEach((v) => assert.ok(Number.isFinite(v), `${a.id}: bad footprint`));
    assert.ok(f.w > 0 && f.h > 0 && f.d > 0);
    if (a.mount === 'COUNTERTOP' && !a.rest) {
      assert.ok(f.xMm - f.w / 2 >= BIGSCENE.counterXStartMm - 1e-6 && f.xMm + f.w / 2 <= BIGSCENE.counterXEndMm + 1e-6, `${a.id} off the worktop`);
      assert.equal(f.yMm, BIGSCENE.counterTopYMm);
    }
    if (a.mount === 'FLOOR' && !a.noCollide && a.zPlace !== 'FRONT') {
      BIG.filter((c) => c.category === 'BASE_UNIT').forEach((c) => {
        const clear = f.xMm + f.w / 2 <= c.positionX || f.xMm - f.w / 2 >= c.positionX + c.width;
        assert.ok(clear, `${a.id} stands inside the cabinet ${c.id}`);
      });
    }
  });
});

test('placement: no worktop, no sink, no wall unit: each says why', () => {
  const none = sceneRefOf([], 600);
  assert.equal(placeAccessory('sink-single', 'a', [], [], none).ok, false);
  assert.equal(placeAccessory('tap-pulldown', 'a', [], RUN, SCENE).ok, false, 'a tap needs a sink');
  assert.equal(placeAccessory('led-strip', 'a', [], RUN, SCENE).ok, false, 'a hosted piece needs its cabinet');
  assert.equal(placeAccessory('led-strip', 'a', [], RUN, SCENE, 'b1').ok, false, 'LED strips go under WALL units');
  assert.equal(placeAccessory('cutlery-tray', 'a', [], RUN, SCENE).ok, false);
  assert.equal(placeAccessory('nope', 'a', [], RUN, SCENE).ok, false);
  assert.equal(placeAccessory('pendant-dome', 'a', [], [], none).ok, false, 'a pendant light needs a worktop to hang over');
});

test('placement: pieces on the worktop never overlap each other and stay on the worktop', () => {
  const list = addAll(['sink-single', 'hob-induction-60', 'flush-4', 'popup-3', 'wireless-charger']);
  list.forEach((p) => {
    const f = footprintOf(p, list, RUN, SCENE);
    assert.ok(f.xMm - f.w / 2 >= SCENE.counterXStartMm - 1e-6 && f.xMm + f.w / 2 <= SCENE.counterXEndMm + 1e-6, `${p.catalogId} off the worktop`);
    assert.equal(f.yMm, SCENE.counterTopYMm);
    assert.ok(f.zMm - f.d / 2 >= SCENE.zBackMm - 1e-6 && f.zMm + f.d / 2 <= SCENE.zFrontMm + 1e-6, `${p.catalogId} sticks out in depth`);
  });
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = footprintOf(list[i], list, RUN, SCENE), b = footprintOf(list[j], list, RUN, SCENE);
    const clear = Math.abs(a.xMm - b.xMm) >= (a.w + b.w) / 2 || Math.abs(a.zMm - b.zMm) >= (a.d + b.d) / 2;
    assert.ok(clear, `${list[i].catalogId} overlaps ${list[j].catalogId}`);
  }
});

test('placement: a worktop that is full refuses one more piece', () => {
  const short = [cab('only', { positionX: 0 })];
  const scene = sceneRefOf(short, 600);
  assert.equal(placeAccessory('sink-double', 'a', [], short, scene).ok, false, '860 mm sink on a 600 mm worktop');
  const first = placeAccessory('hob-induction-60', 'h1', [], short, scene);
  assert.equal(first.ok, true, '590 mm hob fits a 600 mm worktop');
  assert.equal(placeAccessory('hob-induction-60', 'h2', [first.placed], short, scene).ok, false, 'a second hob does not');
});

test('placement: taps, dispensers and racks sit on a sink, follow it, and go when it goes', () => {
  let list = addAll(['sink-single']);
  const sinkId = list[0].id;
  let r = placeAccessory('tap-pulldown', 't1', list, RUN, SCENE);
  assert.ok(r.ok); list = [...list, r.placed];
  assert.equal(r.placed.hostId, sinkId);
  assert.equal(placeAccessory('tap-gooseneck', 't2', list, RUN, SCENE).ok, false, 'one tap per sink');
  r = placeAccessory('soap-dispenser', 's1', list, RUN, SCENE);
  assert.ok(r.ok); list = [...list, r.placed];
  r = placeAccessory('sink-rack', 'k1', list, RUN, SCENE);
  assert.ok(r.ok, 'a rack goes in the bowl'); list = [...list, r.placed];
  const sink = footprintOf(list[0], list, RUN, SCENE), tap = footprintOf(list[1], list, RUN, SCENE), soap = footprintOf(list[2], list, RUN, SCENE), rack = footprintOf(list[3], list, RUN, SCENE);
  assert.equal(tap.xMm, sink.xMm, 'the tap is centred on the sink');
  assert.ok(soap.xMm > sink.xMm && soap.xMm < sink.xMm + sink.w / 2, 'the dispenser is on the right of the bowl');
  assert.ok(tap.zMm < sink.zMm, 'the tap is at the back of the sink');
  assert.equal(rack.zMm, sink.zMm, 'the rack is in the middle of the bowl');
  const moved = nudgeAccessory(sinkId, 100, list, RUN, SCENE);
  assert.ok(moved.ok);
  const sink2 = footprintOf(moved.list[0], moved.list, RUN, SCENE), tap2 = footprintOf(moved.list[1], moved.list, RUN, SCENE);
  assert.equal(tap2.xMm - sink2.xMm, 0, 'the tap followed the sink');
  assert.equal(removeAccessory(list, sinkId).length, 0, 'removing the sink removes everything fixed on it');
  assert.equal(placeAccessory('sink-board', 'b', [], RUN, SCENE).ok, false, 'no sink, no board');
  const small = addAll(['sink-round']);
  assert.equal(placeAccessory('sink-board', 'b', small, RUN, SCENE).ok, false, 'a 420 board does not fit a 450 sink with margins');
  assert.equal(placeAccessory('colander', 'c', small, RUN, SCENE).ok, true, 'a 290 colander does');
  assert.equal(placeAccessory('sink-board', 'b', list, RUN, SCENE).ok, true, 'the board fits the 540 sink');
});

test('placement: hood goes above the hob and warns when it hits a wall unit', () => {
  const list = addAll(['sink-single', 'hob-induction-60']);
  const hob = footprintOf(list[1], list, RUN, SCENE);
  const r = placeAccessory('hood-chimney-60', 'h', list, RUN, SCENE);
  assert.ok(r.ok);
  assert.equal(r.placed.xMm, hob.xMm, 'centred on the hob');
  assert.ok(r.warnings.length >= 1, 'a 600 mm hood in a row of wall units overlaps one');
  const f = footprintOf(r.placed, [...list, r.placed], RUN, SCENE);
  assert.equal(f.yMm, SCENE.counterTopYMm + 650);
  assert.equal(f.zMm, SCENE.zBackMm + 225, 'against the wall');
  const noWall = [RUN[0], RUN[1], RUN[2]];
  const hood = placeAccessory('hood-chimney-60', 'h', list, noWall, sceneRefOf(noWall, 600));
  assert.ok(hood.ok);
  assert.equal(hood.warnings.length, 0, 'no wall units, no warning');
  const pot = placeAccessory('pot-filler', 'p', list, RUN, SCENE);
  assert.ok(pot.ok);
  assert.equal(pot.placed.xMm, hob.xMm, 'the pot filler is above the hob');
});

test('placement: pendant lights hang over the worktop and do not hit each other', () => {
  let list = addAll(['pendant-trio']);
  const f = footprintOf(list[0], list, RUN, SCENE);
  assert.equal(f.yMm, SCENE.counterTopYMm + 800);
  assert.equal(f.zMm, (SCENE.zBackMm + SCENE.zFrontMm) / 2, 'above the middle of the worktop');
  const second = placeAccessory('pendant-linear', 'b', list, RUN, SCENE);
  assert.equal(second.ok, false, '900 + 1200 does not fit on 1800 with margins');
  const third = placeAccessory('pendant-globe', 'c', list, RUN, SCENE);
  assert.ok(third.ok); list = [...list, third.placed];
  const a = footprintOf(list[0], list, RUN, SCENE), b = footprintOf(list[1], list, RUN, SCENE);
  assert.ok(Math.abs(a.xMm - b.xMm) >= (a.w + b.w) / 2, 'no overlap');
});

test('placement: a splashback panel covers the whole wall strip, once, and never blocks another piece', () => {
  let list = addAll(['panel-tile']);
  const f = footprintOf(list[0], list, RUN, SCENE);
  assert.equal(f.w, 1800);
  assert.equal(f.h, 600);
  assert.equal(f.yMm, SCENE.counterTopYMm);
  assert.equal(f.zMm, SCENE.zBackMm + 6);
  assert.equal(placeAccessory('panel-marble', 'x', list, RUN, SCENE).ok, false, 'one panel at a time');
  const socket = placeAccessory('wall-socket', 's', list, RUN, SCENE);
  assert.ok(socket.ok, 'sockets go on the panel');
  assert.equal(footprintOf(socket.placed, [...list, socket.placed], RUN, SCENE).yMm, SCENE.counterTopYMm + 150);
  assert.equal(nudgeAccessory(list[0].id, 50, list, RUN, SCENE).ok, false, 'a panel does not move');
  assert.equal(placeAccessory('wall-clock', 'c', [], RUN, sceneRefOf(RUN, 250)).ok, false, 'a 300 mm clock does not fit a 250 mm strip');
});

test('placement: floor pieces stand next to the run, never inside a cabinet, and stools stand in front', () => {
  const r1 = placeAccessory('fridge-single', 'f1', [], BIG, BIGSCENE);
  assert.ok(r1.ok);
  const f1 = footprintOf(r1.placed, [r1.placed], BIG, BIGSCENE);
  assert.ok(f1.xMm - f1.w / 2 >= 4200, 'beyond the tall unit that ends the run (3600 + 600)');
  assert.equal(f1.yMm, 0);
  assert.equal(f1.zMm, BIGSCENE.zBackMm + 325, 'against the wall');
  const r2 = placeAccessory('fridge-sbs', 'f2', [r1.placed], BIG, BIGSCENE);
  assert.ok(r2.ok);
  const f2 = footprintOf(r2.placed, [r1.placed, r2.placed], BIG, BIGSCENE);
  assert.ok(f2.xMm - f2.w / 2 >= f1.xMm + f1.w / 2, 'the second fridge is next to the first');
  const lonely = sceneRefOf([], 600);
  const alone = placeAccessory('fridge-single', 'a', [], [], lonely);
  assert.ok(alone.ok, 'a fridge in an empty kitchen');
  const stool = placeAccessory('bar-stool', 's1', [], BIG, BIGSCENE);
  assert.ok(stool.ok);
  const sf = footprintOf(stool.placed, [stool.placed], BIG, BIGSCENE);
  assert.ok(sf.zMm - sf.d / 2 >= BIGSCENE.zFrontMm, 'in front of the worktop');
  assert.ok(sf.xMm >= BIGSCENE.counterXStartMm && sf.xMm <= BIGSCENE.counterXEndMm);
  const stool2 = placeAccessory('bar-stool', 's2', [stool.placed], BIG, BIGSCENE);
  assert.ok(stool2.ok);
  assert.ok(Math.abs(stool2.placed.xMm - stool.placed.xMm) >= 380, 'two stools do not overlap');
  const rug = placeAccessory('runner-rug', 'r', [stool.placed], BIG, BIGSCENE);
  assert.ok(rug.ok, 'a rug lies under the stools');
});

test('placement: LED strip follows the wall unit width and hangs under it', () => {
  const list = addAll(['led-strip'], RUN, SCENE, ['w1']);
  const f = footprintOf(list[0], list, RUN, SCENE);
  assert.equal(f.w, 560);
  assert.equal(f.yMm, SCENE.wallBottomYMm - 12);
  assert.equal(f.xMm, 300);
  assert.equal(placeAccessory('led-strip', 'x', list, RUN, SCENE, 'w1').ok, false, 'not twice under the same unit');
  assert.equal(placeAccessory('led-strip', 'x', list, RUN, SCENE, 'w2').ok, true);
  assert.equal(placeAccessory('hood-slim-90', 'x', [], RUN, SCENE, 'w1').ok, false, 'a 900 hood does not fit a 600 wall unit');
});

test('placement: interior pieces fit the cabinet, stack up and refuse what does not fit', () => {
  const list = addAll(['cutlery-tray', 'wire-basket'], RUN, SCENE, ['b1', 'b1']);
  const a = footprintOf(list[0], list, RUN, SCENE), b = footprintOf(list[1], list, RUN, SCENE);
  assert.equal(a.yMm, 18, 'on the bottom board');
  assert.equal(b.yMm, 18 + 55, 'the second one stacks on the first');
  assert.equal(a.xMm, 300);
  assert.equal(placeAccessory('corner-carousel', 'x', [], RUN, SCENE, 'b1').ok, true, '520 fits a 564 opening');
  const narrow = [cab('n', { width: 300 })];
  assert.equal(placeAccessory('wire-basket', 'x', [], narrow, sceneRefOf(narrow, 600), 'n').ok, false, '450 does not fit 264');
  const low = [cab('l', { height: 300 })];
  assert.equal(placeAccessory('bottle-rack', 'x', [], low, sceneRefOf(low, 600), 'l').ok, false, '500 does not fit 264 high');
  let full = [];
  for (let i = 0; i < 20; i++) {
    const r = placeAccessory('cutlery-tray', `c${i}`, full, RUN, SCENE, 'b2');
    if (!r.ok) { assert.ok(i >= 5 && i <= 12, `stack stopped after ${i}`); return; }
    full = [...full, r.placed];
  }
  assert.fail('the stack never stopped');
});

test('finish: chosen among the ones a piece offers, changeable later', () => {
  const r = placeAccessory('tap-gooseneck', 't', addAll(['sink-single']), RUN, SCENE, undefined, 'gold');
  assert.ok(r.ok);
  assert.equal(r.placed.finish, 'gold');
  const bad = okPlace(placeAccessory('tap-gooseneck', 't', addAll(['sink-single']), RUN, SCENE, undefined, 'wood'));
  assert.equal(bad.placed.finish, undefined, 'a finish the tap does not offer is ignored');
  const list = [r.placed];
  assert.equal(setFinish(list, 't', 'copper')[0].finish, 'copper');
  assert.equal(setFinish(list, 't', 'wood')[0].finish, 'gold');
});

test('nudge: stays in range, stops before the piece in the way, fixed pieces do not move', () => {
  const list = addAll(['hob-induction-60', 'flush-4']);
  const [hob, flush] = list;
  assert.equal(footprintOf(hob, list, RUN, SCENE).xMm, 295, 'the hob starts at the left end');
  assert.equal(nudgeAccessory(hob.id, -50, list, RUN, SCENE).ok, false, 'already at the left edge');
  assert.equal(nudgeAccessory(hob.id, 5000, list, RUN, SCENE).ok, false, 'the hob cannot go through the flush socket');
  assert.equal(nudgeAccessory(flush.id, -5000, list, RUN, SCENE).ok, false, 'nor the socket through the hob');
  const right = okNudge(nudgeAccessory(flush.id, 100, list, RUN, SCENE));
  assert.equal(right.ok, true);
  assert.equal(footprintOf(right.list[1], right.list, RUN, SCENE).xMm, flush.xMm + 100);
  const far = okNudge(nudgeAccessory(flush.id, 99999, list, RUN, SCENE));
  assert.equal(footprintOf(far.list[1], far.list, RUN, SCENE).xMm, 1800 - 150, 'clamped to the right end');
  const inside = addAll(['cutlery-tray'], RUN, SCENE, ['b1']);
  assert.equal(nudgeAccessory(inside[0].id, 50, inside, RUN, SCENE).ok, false, 'hosted pieces move with their cabinet');
  const fridge = okPlace(placeAccessory('fridge-single', 'f', [], BIG, BIGSCENE)).placed;
  const slid = okNudge(nudgeAccessory(fridge.id, 300, [fridge], BIG, BIGSCENE));
  assert.ok(slid.ok && slid.list[0].xMm === fridge.xMm + 300, 'a fridge slides along the floor');
  assert.equal(nudgeAccessory(fridge.id, -9000, [fridge], BIG, BIGSCENE).ok, false, 'it is already against the tall unit');
  const back = nudgeAccessory(fridge.id, 500, [slid.list[0]], BIG, BIGSCENE);
  assert.ok(back.ok);
  const home = nudgeAccessory(fridge.id, -9000, back.list, BIG, BIGSCENE);
  assert.ok(home.ok && home.list[0].xMm >= fridge.xMm, 'sliding back stops at the tall unit, not through it');
});

test('reconcile: a deleted cabinet or sink takes its pieces away', () => {
  const list = addAll(['cutlery-tray', 'led-strip', 'sink-single', 'tap-pulldown'], RUN, SCENE, ['b1', 'w1']);
  assert.equal(reconcileAccessories(list, RUN).length, 4);
  assert.equal(reconcileAccessories(list, RUN.filter((c) => c.id !== 'b1')).length, 3);
  assert.equal(reconcileAccessories(list, RUN.filter((c) => c.id !== 'w1')).length, 3);
  assert.equal(reconcileAccessories(list.filter((a) => a.catalogId !== 'sink-single'), RUN).length, 2, 'the orphan tap goes too');
  assert.equal(reconcileAccessories([{ id: 'z', catalogId: 'gone', xMm: 0 }], RUN).length, 0, 'unknown catalog ids are dropped');
});

test('code models: the washer is in the catalog, uses a known code model and keeps built-in shapes as its fallback', () => {
  const lg = getAccessory('washer-lg-thinq');
  assert.ok(lg, 'the LG ThinQ washer is in the library');
  assert.equal(lg.category, 'FREESTANDING');
  assert.equal(lg.mount, 'FLOOR');
  assert.ok(CODE_MODEL_IDS.includes(lg.codeModel));
  ACCESSORY_CATALOG.filter((a) => a.codeModel).forEach((a) => assert.ok(CODE_MODEL_IDS.includes(a.codeModel), `${a.id}: unknown code model`));
  assert.ok(modelPrims(lg.model, lg.sizeMm.w, lg.sizeMm.h, lg.sizeMm.d).length >= 5, 'the fallback shapes exist');
  // Extent of the original model, worked out from its code: body 1.54 + 2 x 0.018 bevel wide, 1.94 + 0.036 high plus the feet that
  // stand 0.019 lower (1.995), and the door frame and the knob that stand 0.082 in front of the body (1.558 deep).
  const [mw, mh, md] = [1.576, 1.995, 1.558];
  const ratio = mw / mh / (lg.sizeMm.w / lg.sizeMm.h), depth = md / mh / (lg.sizeMm.d / lg.sizeMm.h);
  assert.ok(Math.abs(ratio - 1) < 0.02 && Math.abs(depth - 1) < 0.02, 'the catalog size has the proportions of the model, so contain fits it fully');
});

test('coordination: with a room, a floor piece takes the first real gap on its wall and never leaves the wall', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  // The screenshot kitchen on the back wall: corner 0-679, two units, then a 610 mm gap, then the fridge column.
  const wall = [
    cab('corner', { positionX: 0, width: 679 }),
    cab('b1', { positionX: 680, width: 800 }),
    cab('b2', { positionX: 1480, width: 800 }),
    cab('tall', { positionX: 2890, width: 750, height: 2100 }),
  ];
  const scene = sceneRefOf(wall, 600);
  const r = okPlace(placeAccessory('washer', 'w1', [], wall, scene, undefined, undefined, { layout }));
  assert.equal(r.placed.xMm, 2585, 'the washer stands in the 2280-2890 gap, centred — not past the wall end');
  // A second washer has nowhere to go on this wall: a clear refusal, not an exile outside the room.
  const again = placeAccessory('washer', 'w2', [r.placed], wall, scene, undefined, undefined, { layout });
  assert.ok('error' in again && again.error.includes('لا توجد فجوة'), 'a full wall refuses in Arabic');
  // Without a room the historic behaviour is untouched (the old tests above rely on it).
  const legacy = okPlace(placeAccessory('washer', 'w3', [], wall, scene));
  assert.ok(legacy.placed.xMm > 3650, 'legacy placement is unchanged when no layout is given');
});

test('coordination: a cabinet placed later treats the floor piece as occupied floor', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  const wall = [cab('b1', { positionX: 0, width: 800 }), cab('b2', { positionX: 800, width: 800 })];
  const scene = sceneRefOf(wall, 600);
  const w = okPlace(placeAccessory('washer', 'w1', [], wall, scene, undefined, undefined, { layout })).placed;
  assert.equal(w.xMm, 1905, 'washer right after the run: 1600 + 300 + the 5 mm cabinet margin');
  // A new 600 base cabinet must skip over the washer, exactly as if she were a cabinet.
  const place = placeAlongWall(wall, layout, 'A', 'BASE_UNIT', 600, 0, [{ positionX: w.xMm - 300, width: 600 }]);
  assert.ok(place.ok && place.positionX === 2205, `cabinet goes after the washer, got ${JSON.stringify(place)}`);
  // And the clash detector names a cabinet that (in an older save) stands inside her.
  const squatter = cab('sq', { positionX: 1700, width: 600 });
  assert.deepEqual(cabinetsClashingPieces([...wall, squatter], [{ run: 'A', xMm: w.xMm, w: 600 }]), ['sq']);
  assert.deepEqual(cabinetsClashingPieces(wall, [{ run: 'A', xMm: w.xMm, w: 600 }]), []);
});

test('coordination: nudge is fenced by the wall, and a trapped piece can walk out of a cabinet', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  const wall = [cab('b1', { positionX: 0, width: 800 }), cab('b2', { positionX: 800, width: 800 })];
  const scene = sceneRefOf(wall, 600);
  const w = okPlace(placeAccessory('washer', 'w1', [], wall, scene, undefined, undefined, { layout })).placed;
  // 40 pushes of 50 mm to the right used to exile her to x=5950; now the wall end (3650) fences her at 3350.
  let list = [w];
  for (let i = 0; i < 40; i++) { const r = nudgeAccessory('w1', 50, list, wall, scene, layout); if (r.ok) list = r.list; }
  assert.equal(list[0].xMm, 3350, 'centre stops at wall - w/2');
  // Trapped: a cabinet built over her (the old bug). Every nudge used to refuse; now she walks out to the first free spot.
  const trapped = [{ ...w, xMm: 1200 }]; // inside b2 (800-1600)
  const out = okNudge(nudgeAccessory('w1', 50, trapped, wall, scene, layout));
  assert.ok(out.list[0].xMm >= 1900, `she escaped to ${out.list[0].xMm}`);
  // And from her proper place (flush, 5 mm from the cabinet) a step towards it is refused, while a step away works.
  const back = nudgeAccessory('w1', -50, out.list, wall, scene, layout);
  assert.ok('error' in back, 'flush against a cabinet, the step into it is refused');
  const away = okNudge(nudgeAccessory('w1', 50, out.list, wall, scene, layout));
  assert.equal(away.list[0].xMm, out.list[0].xMm + 50);
});

test('coordination: a floor piece may stand on a side wall, and only competes there', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  const wallB = [cab('bb', { positionX: 0, width: 900, run: 'B' as const })];
  const scene = sceneRefOf(wallB, 600);
  const r = okPlace(placeAccessory('washer', 'w1', [], wallB, scene, undefined, undefined, { layout, run: 'B' }));
  assert.equal(r.placed.run, 'B');
  assert.equal(r.placed.xMm, 1205, 'after the 900 mm unit on the 2750 mm side wall (900 + 5 margin + 300)');
  // The same centre on wall A is a different floor: no clash across walls.
  const onA = okPlace(placeAccessory('washer', 'w2', [r.placed], wallB, scene, undefined, undefined, { layout, run: 'A' }));
  assert.equal(onA.placed.xMm, 300);
});

test('transform: a placed piece takes the user size — footprint, drawing size and collisions all follow', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  const wall = [cab('b1', { positionX: 0, width: 800 }), cab('b2', { positionX: 800, width: 800 })];
  const scene = sceneRefOf(wall, 600);
  const w = okPlace(placeAccessory('washer', 'w1', [], wall, scene, undefined, undefined, { layout })).placed;
  const fp0 = footprintOf(w, [w], wall, scene);
  assert.equal(fp0?.w, 600);
  // Slimmer washer: 500 wide. The footprint (what the 3D layer draws and collides with) is 500 from now on.
  const slim = okTransform(resizeAccessory('w1', { w: 500, h: 850, d: 600 }, [w], wall, scene, layout));
  const fp1 = footprintOf(slim[0], slim, wall, scene);
  assert.equal(fp1?.w, 500, 'footprint follows the user size');
  assert.equal(slim[0].sizeMm?.w, 500);
  // Too wide for the wall end she stands against: refused, and the refusal names the largest width that fits here.
  const wide = resizeAccessory('w1', { w: 3000, h: 850, d: 600 }, [w], wall, scene, layout);
  assert.ok('error' in wide && wide.error.includes('أقصى عرض ممكن هنا'), `refusal carries the max: ${'error' in wide ? wide.error : ''}`);
  // Reset restores the catalog size.
  const back = resetAccessoryTransform(slim, 'w1');
  assert.equal(back[0].sizeMm, undefined);
  assert.equal(footprintOf(back[0], back, wall, scene)?.w, 600);
});

test('transform: quarter turns swap the footprint, mirroring does not move it, and a turn that cannot stand is refused', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  const wall = [
    cab('corner', { positionX: 0, width: 679 }),
    cab('b1', { positionX: 680, width: 800 }),
    cab('b2', { positionX: 1480, width: 800 }),
    cab('tall', { positionX: 2890, width: 750, height: 2100 }),
  ];
  const scene = sceneRefOf(wall, 600);
  // A fridge (600 wide x 650 deep) in the 610 mm gap: she fits one way only — turning her must be refused, not clipped.
  const f = okPlace(placeAccessory('fridge-single', 'f1', [], wall, scene, undefined, undefined, { layout })).placed;
  assert.equal(f.xMm, 2585);
  const turned = rotateAccessory('f1', 1, [f], wall, scene, layout);
  assert.ok('error' in turned && turned.error.includes('لا يتسع'), 'a 650 mm front in a 610 mm gap cannot turn');
  // In open floor she turns, and the footprint really swaps.
  const open = [cab('b1', { positionX: 0, width: 800 })];
  const f2 = okPlace(placeAccessory('fridge-single', 'f2', [], open, scene, undefined, undefined, { layout })).placed;
  const moved = okNudge(nudgeAccessory('f2', 200, [f2], open, scene, layout)).list; // room to turn: she was flush against the cabinet
  const rot = okTransform(rotateAccessory('f2', 1, moved, open, scene, layout));
  assert.equal(rot[0].rotY, 90);
  const fp = footprintOf(rot[0], rot, open, scene);
  assert.equal(fp?.w, 650); assert.equal(fp?.d, 600);
  const back = okTransform(rotateAccessory('f2', -1, rot, open, scene, layout));
  assert.equal(back[0].rotY, 0);
  // Mirroring: same place, same footprint, just the other door side.
  const mir = okTransform(flipAccessory(back, 'f2'));
  assert.equal(mir[0].flip, true);
  assert.equal(footprintOf(mir[0], mir, open, scene)?.w, 600);
});

test('transform: hosted pieces answer to their host — inside a cabinet and on a sink', () => {
  const host = cab('host', { positionX: 0, width: 600, height: 720, depth: 560 });
  const scene = sceneRefOf([host], 600);
  const inside = ACCESSORY_CATALOG.find((a) => a.mount === 'CABINET_INSIDE');
  assert.ok(inside, 'the catalog has interior pieces');
  const placedIn = okPlace(placeAccessory(inside.id, 'in1', [], [host], scene, 'host')).placed;
  const tooWide = resizeAccessory('in1', { w: 900, h: inside.sizeMm.h, d: inside.sizeMm.d }, [placedIn], [host], scene);
  assert.ok('error' in tooWide && tooWide.error.includes('الفتحة الداخلية'), 'wider than the cabinet interior is refused');
  const fitsIn = resizeAccessory('in1', { w: 400, h: inside.sizeMm.h, d: 300 }, [placedIn], [host], scene);
  assert.ok('list' in fitsIn, 'a size inside the host is accepted');
  // A tap on a sink cannot outgrow the sink.
  const sink = okPlace(placeAccessory('sink-single', 's1', [], RUN, SCENE)).placed;
  const tapItem = ACCESSORY_CATALOG.find((a) => a.rest === 'SINK' && a.restGroup === 'TAP');
  assert.ok(tapItem, 'the catalog has taps');
  const tap = okPlace(placeAccessory(tapItem.id, 't1', [sink], RUN, SCENE)).placed;
  const bigTap = resizeAccessory('t1', { w: 900, h: tapItem.sizeMm.h, d: tapItem.sizeMm.d }, [sink, tap], RUN, SCENE);
  assert.ok('error' in bigTap && bigTap.error.includes('أكبر من الحوض'), 'a tap wider than its sink is refused');
});

test('render scene: the external renderer gets the same kitchen — boxes, fronts, worktop, room and cameras', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  const wall = [cab('b1', { positionX: 0, width: 800 }), cab('b2', { positionX: 800, width: 800 })];
  const scene = sceneRefOf(wall, 600);
  const w = okPlace(placeAccessory('washer', 'w1', [], wall, scene, undefined, undefined, { layout })).placed;
  const full = wall.map((c, i) => {
    const d = P.resolveDraft({ ...M.config('deepDrawers'), width: 800, zones: [{ kind: 'DOORS', count: 2 }] }, WOODS_T, [], []);
    return { ...P.draftToNewCabinet(d, { id: c.id, name: c.id, positionX: i * 800 }), carcaseThickness: 16, frontThickness: 19, calculatedCostDA: 0 };
  }) as never;
  const rs = buildRenderScene({ cabinets: full, layout, accessories: [w], countertop: { visible: true, thicknessMm: 40, depthMm: 600 }, woods: [], splashMm: 600 });
  assert.equal(rs.format, 'cuisine-render-scene');
  assert.ok(rs.boxes.some((b) => b.role === 'front'), 'fronts are exported');
  assert.ok(rs.boxes.some((b) => b.role === 'countertop'), 'the worktop slab is exported');
  const accBox = rs.boxes.find((b) => b.id === 'acc-w1');
  assert.ok(accBox, 'the washer is a box');
  assert.deepEqual(accBox.sizeMm, [600, 850, 600]);
  assert.ok(Math.abs(accBox.centerMm[0] - 1905) < 1, 'at her real centre');
  assert.ok(rs.boxes.every((b) => b.sizeMm.every((v) => v > 0) && b.centerMm.every(Number.isFinite)), 'every box is finite and positive');
  assert.equal(rs.cameras.length, 3);
});

test('audit: the fitter checks name clashes, wall escapes and wasted gaps — from the same numbers', () => {
  const layout: KitchenLayout = { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 };
  const mk = (id: string, positionX: number, width: number) => ({ id, name: id, category: 'BASE_UNIT', positionX, positionZ: 0, width, height: 900, depth: 560, frontThickness: 19, carcaseThickness: 16, zones: [{ kind: 'DOORS', count: 2 }] }) as never;
  const findings = auditDesign({ cabinets: [mk('a', 0, 800), mk('b', 700, 800)], layout, accessories: [], counterTopMm: 940, splashMm: 600 });
  assert.ok(findings.some((f) => f.level === 'error' && f.text.includes('تتداخل')), 'the overlap is named');
  const gapped = auditDesign({ cabinets: [mk('a', 0, 800), mk('b', 2000, 800)], layout, accessories: [], counterTopMm: 940, splashMm: 600 });
  assert.ok(gapped.some((f) => f.text.includes('فجوة 1200 مم')), 'the exploitable gap is measured');
  assert.ok(gapped.some((f) => f.text.includes('تغطية')), 'coverage is reported');
});

// buildAiRenderPrompt (📋 تجهيز للذكاء الاصطناعي): exact design data into the copy-paste prompt.
test('ai prompt: real cabinets, room and the preserve-geometry instruction', () => {
  const stub = (id: string, category: string) => ({ id, name: id, category, positionX: 0, positionZ: 0, width: 800, height: 900, depth: 560, frontThickness: 19, carcaseThickness: 16, zones: [] }) as never;
  const text = buildAiRenderPrompt({
    cabinets: [stub('b1', 'BASE_UNIT'), stub('w1', 'WALL_UNIT')],
    layout: { type: 'L', lSide: 'LEFT', widthMm: 3650, depthMm: 2750, heightMm: 2800 } as never,
    accessories: [{ id: 'x', catalogId: 'lg-thinq-washer', xMm: 1 } as never],
    countertopThicknessMm: 40,
    woods: [{ brand: 'Egger', type: 'Wood MDF' }, { brand: 'Egger', type: 'Wood MDF' }],
  });
  assert.match(text, /Do not add, remove, move or resize/);
  assert.match(text, /3650 x 2750 mm, height 2800 mm/);
  assert.match(text, /Base cabinets \(1\): b1 800x900x560/);
  assert.match(text, /Worktop thickness: 40 mm/);
  assert.equal((text.match(/Egger — Wood MDF/g) ?? []).length, 1);
  assert.match(text, /Wall cabinets \(1\)/);
});
