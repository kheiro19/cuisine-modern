// @ts-nocheck  (plain node:test file, run with: npm test)
// Poly Haven and ambientCG live in the "Workshop Matrix Online" tab: parsers, the zip reader and the loader with its error kinds.
import test from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { extractZipEntry, ZipError } from '../src/data/zipRead';
import {
  ambientColorPreviewUrl, ambientListUrl, ambientZipFallbackUrl, filterTextures, parseAmbientList, parsePolyHavenList, pickPolyHavenColor, polyHavenFilesUrl, polyHavenListUrl,
} from '../src/data/onlineSources';
import { OnlineLoadError, checkSources, clearTextureCache, loadTextureBlobUrl } from '../src/data/onlineTextureLoader';
import { makeRewrite } from '../src/data/onlineConfig';

/** A real zip file built by hand: entries are { name, data, stored? }. */
function makeZip(entries, { extra = false } = {}) {
  const parts = [], central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, 'utf8');
    const data = Buffer.from(e.data);
    const comp = e.stored ? data : deflateRawSync(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(e.stored ? 0 : 8, 8);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(name.length, 26); local.writeUInt16LE(extra ? 4 : 0, 28);
    const ext = extra ? Buffer.from([1, 2, 3, 4]) : Buffer.alloc(0);
    parts.push(local, name, ext, comp);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0); c.writeUInt16LE(20, 4); c.writeUInt16LE(20, 6); c.writeUInt16LE(e.stored ? 0 : 8, 10);
    c.writeUInt32LE(comp.length, 20); c.writeUInt32LE(data.length, 24); c.writeUInt16LE(name.length, 28); c.writeUInt32LE(offset, 42);
    central.push(c, name);
    offset += 30 + name.length + ext.length + comp.length;
  }
  const cd = Buffer.concat(central);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10); eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, eocd]);
}

const JPEG = (n = 300) => { const b = Buffer.alloc(n, 7); b[0] = 0xff; b[1] = 0xd8; b[2] = 0xff; return b; };

test('zip: reads the colour file out of a pack, deflated or stored, among other maps', async () => {
  const color = JPEG(5000);
  const zip = makeZip([
    { name: 'Bricks092_1K-JPG_NormalGL.jpg', data: JPEG(2000) },
    { name: 'Bricks092_1K-JPG_Color.jpg', data: color },
    { name: 'Bricks092.usdc', data: 'x', stored: true },
  ]);
  const hit = await extractZipEntry(zip, (n) => /_Color\.jpg$/.test(n));
  assert.equal(hit.name, 'Bricks092_1K-JPG_Color.jpg');
  assert.ok(Buffer.from(hit.data).equals(color), 'the bytes come back identical');
  const stored = await extractZipEntry(zip, (n) => n.endsWith('.usdc'));
  assert.equal(Buffer.from(stored.data).toString(), 'x');
  assert.equal(await extractZipEntry(zip, (n) => n.endsWith('.nope')), null);
  const withExtra = makeZip([{ name: 'a_Color.jpg', data: color }], { extra: true });
  assert.ok(Buffer.from((await extractZipEntry(withExtra, (n) => n.includes('Color'))).data).equals(color), 'local extra fields are skipped');
  const viewOfBigger = new Uint8Array(Buffer.concat([Buffer.alloc(10), zip])).subarray(10);
  assert.equal((await extractZipEntry(viewOfBigger, (n) => n.includes('Color'))).name, 'Bricks092_1K-JPG_Color.jpg', 'a view into a bigger buffer works');
});

test('zip: a broken, cut or empty download says what is wrong', async () => {
  const zip = makeZip([{ name: 'a_Color.jpg', data: JPEG(4000) }]);
  await assert.rejects(() => extractZipEntry(Buffer.from('tiny'), () => true), ZipError);
  await assert.rejects(() => extractZipEntry(Buffer.from('<html>' + 'x'.repeat(200) + '</html>'), () => true), /نهاية الفهرس/);
  await assert.rejects(() => extractZipEntry(zip.subarray(0, zip.length - 30), () => true), ZipError, 'the end of the index is gone');
  const cutData = Buffer.from(zip); cutData.writeUInt32LE(0x99999999, cutData.length - 22 + 16);
  await assert.rejects(() => extractZipEntry(cutData, () => true), ZipError, 'the index points nowhere');
  const unsupported = makeZip([{ name: 'a.bin', data: 'zzzz', stored: true }]);
  unsupported.writeUInt16LE(9, unsupported.length - 22 - 46 - 5 + 10); // central header compression method
  await assert.rejects(() => extractZipEntry(unsupported, () => true), /غير مدعومة/);
});

test('poly haven: the list is parsed, the colour map found at 1k, with fallbacks', () => {
  const list = parsePolyHavenList({
    wood_floor: { name: 'Wood Floor', categories: ['wood', 'floor'], tags: ['Parquet'], authors: { 'Rob Tuytel': 'All' } },
    marble_01: { categories: ['stone'], thumbnail_url: 'https://cdn.polyhaven.com/asset_img/thumbs/marble_01.png?width=256' },
    broken: 5,
  });
  assert.deepEqual(list.map((t) => t.id), ['marble_01', 'wood_floor'].sort((a, b) => a.localeCompare(b)) , 'sorted by name');
  const wood = list.find((t) => t.id === 'wood_floor');
  assert.equal(wood.key, 'polyhaven:wood_floor');
  assert.deepEqual(wood.categories, ['wood', 'floor', 'parquet']);
  assert.equal(wood.author, 'Rob Tuytel');
  assert.equal(wood.thumbUrl, 'https://cdn.polyhaven.com/asset_img/thumbs/wood_floor.png?width=256&height=256');
  assert.equal(wood.pageUrl, 'https://polyhaven.com/a/wood_floor');
  assert.equal(list.find((t) => t.id === 'marble_01').name, 'Marble 01', 'a name is made from the id when missing');
  assert.equal(list.find((t) => t.id === 'marble_01').thumbUrl, 'https://cdn.polyhaven.com/asset_img/thumbs/marble_01.png?width=256');
  assert.deepEqual(parsePolyHavenList(null), []);
  assert.equal(polyHavenListUrl(), 'https://api.polyhaven.com/assets?type=textures');
  assert.equal(polyHavenFilesUrl('a b'), 'https://api.polyhaven.com/files/a%20b');

  const files = { Diffuse: { '4k': { jpg: { url: 'https://dl.polyhaven.org/x_4k.jpg' } }, '1k': { jpg: { url: 'https://dl.polyhaven.org/x_1k.jpg' }, png: { url: 'https://dl.polyhaven.org/x_1k.png' } } }, nor_gl: {} };
  assert.equal(pickPolyHavenColor(files), 'https://dl.polyhaven.org/x_1k.jpg', '1k first, jpg before png');
  assert.equal(pickPolyHavenColor({ diff: { '2k': { png: { url: 'https://dl.polyhaven.org/y.png' } } } }), 'https://dl.polyhaven.org/y.png');
  assert.equal(pickPolyHavenColor({ Diffuse: { '1k': { jpg: { url: 'http://insecure/x.jpg' } } } }), null, 'only https');
  assert.equal(pickPolyHavenColor({ Rough: {} }), null);
  assert.equal(pickPolyHavenColor('nonsense'), null);
});

test('ambientCG: the list, thumbnails, the 1K-JPG pack anywhere in the download tree, and the fallbacks', () => {
  const raw = {
    numberOfResults: 3000,
    foundAssets: [
      { assetId: 'Bricks092', displayName: 'Bricks 092', category: 'Bricks', previewImage: { '128-JPG-FFFFFF': 'https://x/128.jpg', '256-JPG-FFFFFF': 'https://x/256.jpg' },
        downloadFolders: { default: { downloadFiletypeCategories: { zip: { downloads: [{ attribute: '2K-JPG', downloadLink: 'https://a/2k' }, { attribute: '1K-JPG', fileName: 'Bricks092_1K-JPG.zip', downloadLink: 'https://ambientcg.com/get?file=Bricks092_1K-JPG.zip', size: 7340032 }] } } } } },
      { assetId: 'Wood001', previewImage: 'https://x/wood.jpg' },
      { assetId: 'Tiles010', customDisplayName: 'Blue tiles', displayCategory: 'Tiles' },
      { name: 'no id' },
    ],
  };
  const { items, total } = parseAmbientList(raw);
  assert.equal(total, 3000);
  assert.equal(items.length, 3);
  assert.equal(items[0].thumbUrl, 'https://x/256.jpg');
  assert.equal(items[0].zipUrl, 'https://ambientcg.com/get?file=Bricks092_1K-JPG.zip');
  assert.equal(items[0].sizeBytes, 7340032);
  assert.equal(items[0].name, 'Bricks 092');
  assert.equal(items[1].thumbUrl, 'https://x/wood.jpg');
  assert.equal(items[1].zipUrl, ambientZipFallbackUrl('Wood001'), 'no download data: the documented get?file= link');
  assert.equal(ambientZipFallbackUrl('Wood001'), 'https://ambientcg.com/get?file=Wood001_1K-JPG.zip');
  assert.match(items[2].thumbUrl, /acg-media\.struffelproductions\.com.*Tiles010\.jpg$/);
  assert.equal(items[2].name, 'Blue tiles');
  assert.deepEqual(parseAmbientList({}), { items: [], total: 0 });
  const url = ambientListUrl({ q: 'dark wood', offset: 48, limit: 9999 });
  assert.match(url, /full_json\?type=Material&sort=Popular&limit=250&offset=48&include=downloadData,previewData&q=dark%20wood$/);
  assert.match(ambientListUrl(), /limit=48&offset=0/);
});

test('filter: every word must match the name, id or categories', () => {
  const list = parsePolyHavenList({ wood_floor: { name: 'Wood Floor', categories: ['wood'] }, marble_01: { name: 'Marble', categories: ['stone'] }, dark_wood: { name: 'Dark Wood', categories: ['wood'] } });
  assert.equal(filterTextures(list, 'wood').length, 2);
  assert.equal(filterTextures(list, 'dark wood').length, 1);
  assert.equal(filterTextures(list, 'STONE').length, 1);
  assert.equal(filterTextures(list, '  ').length, 3);
  assert.equal(filterTextures(list, 'zzz').length, 0);
});

const ok = (body) => ({ ok: true, status: 200, arrayBuffer: async () => (body instanceof Uint8Array ? body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength) : new ArrayBuffer(0)), json: async () => body });

test('loader: a Poly Haven texture goes list -> files -> image -> blob address, once', async () => {
  clearTextureCache();
  const calls = [];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes('/files/')) return ok({ Diffuse: { '1k': { jpg: { url: 'https://dl.polyhaven.org/wood_1k.jpg' } } } });
    if (url.endsWith('wood_1k.jpg')) return ok(new Uint8Array(JPEG(900)));
    return { ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) };
  };
  const made = [];
  const tex = parsePolyHavenList({ wood: { name: 'Wood' } })[0];
  const url = await loadTextureBlobUrl(tex, { fetcher, makeUrl: (b) => { made.push(b); return 'blob:ph-1'; } });
  assert.equal(url, 'blob:ph-1');
  assert.equal(made[0].type, 'image/jpeg');
  assert.equal(made[0].size, 900);
  assert.deepEqual(calls, ['https://api.polyhaven.com/files/wood', 'https://dl.polyhaven.org/wood_1k.jpg']);
  assert.equal(await loadTextureBlobUrl(tex, { fetcher, makeUrl: () => 'blob:other' }), 'blob:ph-1', 'the second click costs nothing');
  assert.equal(calls.length, 2);
});

test('loader: an ambientCG texture is downloaded as a zip and only its colour map is kept', async () => {
  clearTextureCache();
  const color = JPEG(4000);
  const zip = new Uint8Array(makeZip([{ name: 'Wood001_1K-JPG_Roughness.jpg', data: JPEG(10) }, { name: 'Wood001_1K-JPG_Color.jpg', data: color }]));
  const progress = [];
  const tex = parseAmbientList({ foundAssets: [{ assetId: 'Wood001' }] }).items[0];
  const url = await loadTextureBlobUrl(tex, { fetcher: async () => ok(zip), makeUrl: () => 'blob:amb', onProgress: (f) => progress.push(f) });
  assert.equal(url, 'blob:amb');
  assert.ok(progress.length > 0);
});

test('loader: each way it can fail has its own kind and an Arabic sentence', async () => {
  clearTextureCache();
  const tex = parsePolyHavenList({ t: { name: 'T' } })[0];
  const amb = parseAmbientList({ foundAssets: [{ assetId: 'Bad001' }] }).items[0];
  const kind = async (t, fetcher) => { clearTextureCache(); try { await loadTextureBlobUrl(t, { fetcher, makeUrl: () => 'x' }); } catch (e) { assert.ok(e instanceof OnlineLoadError); return e; } assert.fail('should fail'); };
  const blocked = await kind(tex, async () => { throw new TypeError('Failed to fetch'); });
  assert.equal(blocked.kind, 'network'); assert.match(blocked.message, /CORS/);
  const missing = await kind(tex, async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) }));
  assert.equal(missing.kind, 'http'); assert.equal(missing.status, 404);
  const noColor = await kind(tex, async () => ok({ Rough: {} }));
  assert.equal(noColor.kind, 'notfound');
  const html = await kind(tex, async (u) => (u.includes('/files/') ? ok({ Diffuse: { '1k': { jpg: { url: 'https://dl.polyhaven.org/x.jpg' } } } }) : ok(new Uint8Array(Buffer.from('<html>not found</html>')))));
  assert.equal(html.kind, 'format');
  const notZip = await kind(amb, async () => ok(new Uint8Array(Buffer.from('<html>' + 'x'.repeat(100) + '</html>'))));
  assert.equal(notZip.kind, 'zip');
  const zipNoColor = await kind(amb, async () => ok(new Uint8Array(makeZip([{ name: 'Bad001_1K-JPG_Normal.jpg', data: JPEG(50) }]))));
  assert.equal(zipNoColor.kind, 'zip'); assert.match(zipNoColor.message, /Color/);
  const noLink = await kind({ ...amb, zipUrl: undefined, colorUrl: undefined }, async () => ok({}));
  assert.equal(noLink.kind, 'notfound');
  const previewOnly = await kind({ ...amb, zipUrl: undefined }, async () => ok({}));
  assert.equal(previewOnly.kind, 'format', 'no zip to fall back on: the reason of the preview failure is the one reported');
});

test('connection test: reports each site on its own, with the reason', async () => {
  const fetcher = async (url) => {
    if (url.includes('polyhaven')) return ok({ a: { name: 'A' }, b: { name: 'B' } });
    throw new TypeError('Failed to fetch');
  };
  const r = await checkSources({ fetcher });
  assert.equal(r.polyhaven.ok, true);
  assert.match(r.polyhaven.message, /2/);
  assert.equal(r.ambientcg.ok, false);
  assert.match(r.ambientcg.message, /CORS/);
  const empty = await checkSources({ fetcher: async () => ok({}) });
  assert.equal(empty.polyhaven.ok, false);
  assert.match(empty.polyhaven.message, /غير متوقع/);
});

test('ambient thumbnails prefer the light WEBP, then JPG; the colour preview URL is the one of the site viewer', () => {
  const previewImage = { '256-PNG': 'https://x/256.png', '256-JPG-FFFFFF': 'https://x/256.jpg', '256-WEBP': 'https://x/256.webp', '128-WEBP': 'https://x/128.webp' };
  assert.equal(parseAmbientList({ foundAssets: [{ assetId: 'A1', previewImage }] }).items[0].thumbUrl, 'https://x/256.webp');
  assert.equal(parseAmbientList({ foundAssets: [{ assetId: 'A1', previewImage: { '256-PNG': 'https://x/256.png', '256-JPG-FFFFFF': 'https://x/256.jpg' } }] }).items[0].thumbUrl, 'https://x/256.jpg');
  assert.equal(ambientColorPreviewUrl('PavingStones151'), 'https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/PavingStones151/PavingStones151_SQ_Color.jpg');
  assert.equal(parseAmbientList({ foundAssets: [{ assetId: 'Wood001' }] }).items[0].colorUrl, ambientColorPreviewUrl('Wood001'));
});

test('proxy: in development ambientCG goes through the same-origin paths, elsewhere only when a proxy is configured', () => {
  const dev = makeRewrite({ DEV: true });
  assert.equal(dev('https://ambientcg.com/api/v2/full_json?type=Material'), '/proxy/ambientcg/api/v2/full_json?type=Material');
  assert.equal(dev('https://ambientcg.com/get?file=Wood001_1K-JPG.zip'), '/proxy/ambientcg/get?file=Wood001_1K-JPG.zip');
  assert.equal(dev('https://f003.backblazeb2.com/file/ambientCG-Web/media/surface-preview/A/A_SQ_Color.jpg'), '/proxy/acgmedia/file/ambientCG-Web/media/surface-preview/A/A_SQ_Color.jpg');
  assert.equal(dev('https://api.polyhaven.com/assets?type=textures'), 'https://api.polyhaven.com/assets?type=textures', 'Poly Haven is never proxied');
  assert.equal(dev('https://acg-media.struffelproductions.com/x.webp'), 'https://acg-media.struffelproductions.com/x.webp', 'thumbnails are plain images, no CORS needed');
  assert.ok(!'/proxy/acgmedia/x'.startsWith('/proxy/ambientcg'), 'the two proxy prefixes do not overlap (Vite matches by the start of the address)');
  const direct = makeRewrite({});
  assert.equal(direct('https://ambientcg.com/api/v2/x'), 'https://ambientcg.com/api/v2/x');
  const worker = makeRewrite({ VITE_AMBIENTCG_PROXY: 'https://my-proxy.example.workers.dev/' });
  assert.equal(worker('https://ambientcg.com/get?file=a.zip'), 'https://my-proxy.example.workers.dev/proxy/ambientcg/get?file=a.zip');
  assert.equal(worker('https://f003.backblazeb2.com/file/x.jpg'), 'https://my-proxy.example.workers.dev/proxy/acgmedia/file/x.jpg');
  assert.equal(makeRewrite({ DEV: true, VITE_AMBIENTCG_PROXY: 'https://w.dev' })('https://ambientcg.com/a'), '/proxy/ambientcg/a', 'development wins');
});

test('loader: an ambientCG texture uses the small colour preview first and the zip only when the preview fails', async () => {
  clearTextureCache();
  const calls = [];
  const tex = parseAmbientList({ foundAssets: [{ assetId: 'Wood001' }] }).items[0];
  const fetcher = async (url) => {
    calls.push(url);
    if (url.includes('_SQ_Color.jpg')) return ok(new Uint8Array(JPEG(1200)));
    throw new Error('the zip must not be asked for');
  };
  const rewritten = [];
  const url = await loadTextureBlobUrl(tex, { fetcher, makeUrl: () => 'blob:sq', rewrite: (u) => { rewritten.push(u); return u; } });
  assert.equal(url, 'blob:sq');
  assert.equal(calls.length, 1, 'one small image, no zip');
  assert.equal(rewritten.length, 1, 'the address went through the proxy rewrite');

  clearTextureCache();
  const zip = new Uint8Array(makeZip([{ name: 'Wood001_1K-JPG_Color.jpg', data: JPEG(3000) }]));
  const seen = [];
  const fb = await loadTextureBlobUrl(tex, {
    fetcher: async (u) => { seen.push(u); return u.includes('_SQ_Color') ? { ok: false, status: 403, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) } : ok(zip); },
    makeUrl: () => 'blob:zip',
  });
  assert.equal(fb, 'blob:zip', 'the preview was refused: the zip pack is the fallback');
  assert.equal(seen.length, 2);
  assert.match(seen[1], /Wood001_1K-JPG\.zip$/);

  clearTextureCache();
  await assert.rejects(() => loadTextureBlobUrl({ ...tex, zipUrl: undefined }, { fetcher: async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}) }), makeUrl: () => 'x' }), (e) => e.kind === 'http' && e.status === 404, 'preview refused and no zip: the real reason is reported');
});

test('connection test: ambientCG list fine but colour images blocked is reported as such', async () => {
  const fetcher = async (url) => {
    if (url.includes('polyhaven')) return ok({ a: { name: 'A' } });
    if (url.includes('full_json')) return ok({ numberOfResults: 3000, foundAssets: [{ assetId: 'Wood001' }] });
    throw new TypeError('Failed to fetch');
  };
  const r = await checkSources({ fetcher });
  assert.equal(r.ambientcg.ok, false);
  assert.match(r.ambientcg.message, /3000/);
  assert.match(r.ambientcg.message, /صورة اللون ممنوعة/);
  const all = await checkSources({ fetcher: async (url) => (url.includes('full_json') ? ok({ numberOfResults: 5, foundAssets: [{ assetId: 'W1' }] }) : url.includes('polyhaven') ? ok({ a: { name: 'A' } }) : ok(new Uint8Array(JPEG(100)))) });
  assert.equal(all.ambientcg.ok, true);
  assert.match(all.ambientcg.message, /متاحة/);
});
