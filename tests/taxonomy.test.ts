// The test suite has one rule now, and this file keeps it: NO CATALOGUE, ONE VOCABULARY.
//
//   tests/fixtures/matrix.ts — the control panel's vocabulary as data: a category, three sizes, zones, an opening mode,
//                              a front style, a divider, a base. Every engine test builds its cabinets from it.
//   tests/product/           — the product we ship: the four starting points, the engines, the screen.
//   tests/compat/            — the engines' promises swept over the whole matrix (drawing = cutting list, dimensions add
//                              up, fasteners = BOM, fuzz on random cabinets).
//
// Why the guard exists: the app used to keep 28 old templates alive as fixtures. They are gone (priority 10). What replaced
// them is not a smaller catalogue but a vocabulary — and a test that walks back into an old template name would be testing a
// shape the panel cannot produce. So:
//   - no test may import a catalogue of old shapes (the folder is gone; this file makes sure it does not come back),
//   - every compat test must sweep the matrix instead of naming one cabinet,
//   - the matrix itself may not know an old template name: it writes field values.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const PRODUCT = join(HERE, 'product');
const COMPAT = join(HERE, 'compat');
const FIXTURES = join(HERE, 'fixtures');

const filesOf = (dir) => readdirSync(dir).filter((f) => f.endsWith('.test.ts')).sort();
const read = (dir, f) => readFileSync(join(dir, f), 'utf8');

/** The 28 names of the retired catalogue. None of them may appear in a test or in the matrix. */
const RETIRED = [
  'Deep_Drawers', 'Pull_Out_Sink', 'Cargo_Pull_Out', 'Panel_Ready', 'Washer_Bay', 'Dryer_Bay',
  'Under_Counter_Fridge_Bay', 'Push_To_Open_Base', 'Hinged_Pull_Out_Trays', 'Ceiling_Height', 'Lift_Up',
  'Glass_Front', 'Over_Fridge', 'Open_Shelving', 'Double_Depth', 'Magic_Corner', 'Lazy_Susan', 'Corner_Drawers',
  'LeMans_Curve', 'Blind_Corner', 'Wall_Blind_Corner', 'Diagonal_Corner', 'Built_In_Appliance', 'Tall_Pantry_Cargo',
  'Tandem_Pantry', 'Pocket_Door_Pantry', 'Push_To_Open_Tall',
];
const RETIRED_RE = new RegExp(`\\b(${RETIRED.join('|')})\\b`);
/** Reaching for one as an INPUT — the thing that must never come back. A string field ("a saved project carries an old
 *  subtype") is not an input: templates4.test.ts checks exactly that an old saved cabinet still opens. */
const RETIRED_INPUT = new RegExp(`(?:config|draft)\\(\\s*'(${RETIRED.join('|')})'`);
/** The catalogue came through these two paths; both folders are deleted. */
const CATALOGUE_IMPORT = /from '[^']*fixtures\/(legacy|corpus)'/;
/** A sweep: a test that walks the matrix rather than naming one cabinet. */
const SWEEP = /\b(MATRIX|CONFIGS)\b/;

test('both folders exist and each one holds tests', () => {
  assert.ok(existsSync(PRODUCT), 'tests/product/ must exist');
  assert.ok(existsSync(COMPAT), 'tests/compat/ must exist');
  assert.ok(filesOf(PRODUCT).length >= 10, 'the product suite is not empty');
  assert.ok(filesOf(COMPAT).length >= 3, 'the engine-promise suite is not empty');
});

test('the matrix is the only vocabulary: it exists, it is not empty, and it holds only field values', () => {
  assert.ok(existsSync(join(FIXTURES, 'matrix.ts')), 'tests/fixtures/matrix.ts must exist');
  const m = read(FIXTURES, 'matrix.ts');
  assert.ok(!RETIRED_RE.test(m), 'the matrix names a retired template: a configuration is a set of field values');
  assert.ok(Object.keys(readdirSync(FIXTURES)).length >= 1, 'fixtures/ holds the matrix');
  assert.ok(!existsSync(join(FIXTURES, 'legacy')), 'the old catalogue must stay deleted');
  assert.ok(!existsSync(join(FIXTURES, 'corpus.ts')), 'the corpus indirection went with it: the matrix is the corpus');
});

test('no test drags an old template name back in as an input', () => {
  const all = [...filesOf(PRODUCT).map((f) => [PRODUCT, f]), ...filesOf(COMPAT).map((f) => [COMPAT, f])];
  const calls = all.filter(([dir, f]) => RETIRED_INPUT.test(read(dir, f))).map(([, f]) => f);
  assert.deepEqual(calls, [], `these tests build a retired template instead of a configuration: ${calls.join(', ')}`);
  const imports = all.filter(([dir, f]) => CATALOGUE_IMPORT.test(read(dir, f))).map(([, f]) => f);
  assert.deepEqual(imports, [], `these tests import the deleted catalogue: ${imports.join(', ')}`);
});

test('a compat test really sweeps the matrix, it is not a product test parked in the wrong folder', () => {
  const lonely = filesOf(COMPAT).filter((f) => !SWEEP.test(read(COMPAT, f)));
  assert.deepEqual(lonely, [], `these compat tests do not walk the matrix: ${lonely.join(', ')}`);
});

test('no test file is left loose in tests/ — the folder says what a test protects', () => {
  // this file is the referee, not a test of either side
  const loose = readdirSync(HERE).filter((f) => f.endsWith('.test.ts') && f !== 'taxonomy.test.ts');
  assert.deepEqual(loose, [], `move these into tests/product/ or tests/compat/: ${loose.join(', ')}`);
});

test('the app still ships exactly four starting points, and the matrix is bigger than them', async () => {
  const CUR = await import('../src/rules/templates');
  assert.equal(CUR.SUBTYPES.length, 4, 'the app offers four starting points');
  const M = await import('./fixtures/matrix');
  assert.ok(M.MATRIX.length >= 30, `the matrix must cover the panel's vocabulary, got ${M.MATRIX.length}`);
  M.MATRIX.forEach((c) => assert.ok(c.name && c.draft.zones.length >= 1, `${c.name}: a configuration needs a zone`));
});

test('every engine promise is swept by at least three compat files', () => {
  const sweeps = filesOf(COMPAT).map((f) => read(COMPAT, f)).filter((s) => SWEEP.test(s));
  assert.ok(sweeps.length >= 3, 'several compat tests must sweep the whole matrix, not just one or two');
});
