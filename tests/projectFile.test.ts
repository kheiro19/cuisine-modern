import test from 'node:test';
import assert from 'node:assert/strict';
import { fileNameFor, fingerprint, parseProject, serializeProject, PROJECT_FORMAT, PROJECT_VERSION } from '../src/project/projectFile';
import type { ProjectData } from '../src/project/projectFile';

const cab = (id: string, positionX = 0) => ({ id, name: `خزانة ${id}`, width: 600, depth: 560, height: 720, positionX, calculatedCostDA: 123 });
const sample = (): ProjectData => ({
  cabinets: [cab('a'), cab('b', 600)] as unknown as ProjectData['cabinets'],
  baselineInventory: { woodPanels: [], hardwareItems: [], edgeBandRolls: [] } as unknown as ProjectData['baselineInventory'],
  layout: { widthMm: 3000 } as unknown as ProjectData['layout'],
  counterTop: { thicknessMm: 38 } as unknown as ProjectData['counterTop'],
  accessories: [],
});

test('الحفظ ثم القراءة يعيدان المشروع كما هو', () => {
  const data = sample();
  const r = parseProject(serializeProject('مطبخ أحمد', data));
  assert.ok(r.ok);
  if (!r.ok) return;
  assert.equal(r.project.format, PROJECT_FORMAT);
  assert.equal(r.project.version, PROJECT_VERSION);
  assert.equal(r.project.name, 'مطبخ أحمد');
  assert.deepEqual(r.project.data, data);
});

test('البصمة تتجاهل التكلفة المخزّنة وتلتقط أي تعديل حقيقي', () => {
  const data = sample();
  const costOnly = { ...data, cabinets: data.cabinets.map((c) => ({ ...c, calculatedCostDA: 9 })) };
  const moved = { ...data, cabinets: [data.cabinets[0], { ...data.cabinets[1], positionX: 650 }] };
  assert.equal(fingerprint(data), fingerprint(costOnly));
  assert.notEqual(fingerprint(data), fingerprint(moved));
});

test('ملف قديم بلا إكسسوارات أو بلا رولات الحواف يُقبل', () => {
  const obj = JSON.parse(serializeProject('x', sample()));
  delete obj.data.accessories;
  delete obj.data.baselineInventory.edgeBandRolls;
  const r = parseProject(JSON.stringify(obj));
  assert.ok(r.ok);
  if (r.ok) {
    assert.deepEqual(r.project.data.accessories, []);
    assert.deepEqual(r.project.data.baselineInventory.edgeBandRolls, []);
  }
});

test('ملفات غير صالحة تُرفض برسالة واضحة', () => {
  const rejects = (x: unknown, part: string) => {
    const r = parseProject(typeof x === 'string' ? x : JSON.stringify(x));
    assert.equal(r.ok, false);
    if (!r.ok) assert.ok(r.error.includes(part), r.error);
  };
  rejects('ليس json', 'JSON');
  rejects({ format: 'other' }, 'ليس ملف مشروع');
  rejects({ format: PROJECT_FORMAT, version: PROJECT_VERSION + 1, data: {} }, 'أحدث');
  rejects({ format: PROJECT_FORMAT, version: 1, data: { cabinets: [{ id: 'a', width: 'x' }] } }, 'width');
  rejects({ format: PROJECT_FORMAT, version: 1, data: { cabinets: [cab('a'), cab('a')], baselineInventory: {} } }, 'مكرّر');
  rejects({ format: PROJECT_FORMAT, version: 1, data: { cabinets: [], baselineInventory: {} } }, 'مخزون');
});

test('اسم الملف يُنظَّف من محارف ممنوعة ويحمل الامتداد', () => {
  assert.equal(fileNameFor('مطبخ/أحمد: 1'), 'مطبخ-أحمد- 1.cuisine.json');
  assert.equal(fileNameFor('   '), 'مشروع.cuisine.json');
});
