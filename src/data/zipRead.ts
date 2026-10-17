// src/data/zipRead.ts
// Reads ONE file out of a .zip held in memory, with no library: ambientCG gives its textures as zip packs and only the colour
// map is needed. Supports "stored" and "deflate" entries (all that ambientCG uses). Pure and testable (needs
// DecompressionStream, which every browser of the last years and Node 18+ have).

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;

export class ZipError extends Error {}

/** Inflates raw deflate data (zip entries have no zlib header). */
export async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') throw new ZipError('هذا المتصفح قديم ولا يفك الضغط داخله');
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The first entry whose name satisfies `pick`, decompressed; null when there is none. */
export async function extractZipEntry(
  input: ArrayBuffer | Uint8Array,
  pick: (name: string) => boolean,
): Promise<{ name: string; data: Uint8Array } | null> {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 22) throw new ZipError('الملف أصغر من أن يكون zip');

  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65535); i--) {
    if (view.getUint32(i, true) === EOCD_SIG) { eocd = i; break; }
  }
  if (eocd < 0) throw new ZipError('لا يبدو أن هذا ملف zip كاملًا (نهاية الفهرس غير موجودة)');

  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  if (off === 0xffffffff || count === 0xffff) throw new ZipError('zip64 غير مدعوم');

  const decoder = new TextDecoder();
  for (let n = 0; n < count; n++) {
    if (off + 46 > bytes.length || view.getUint32(off, true) !== CENTRAL_SIG) throw new ZipError('فهرس zip تالف');
    const method = view.getUint16(off + 10, true);
    const compSize = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true), extraLen = view.getUint16(off + 30, true), commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = decoder.decode(bytes.subarray(off + 46, off + 46 + nameLen));
    off += 46 + nameLen + extraLen + commentLen;
    if (!pick(name)) continue;

    if (compSize === 0xffffffff) throw new ZipError('zip64 غير مدعوم');
    if (localOff + 30 > bytes.length || view.getUint32(localOff, true) !== LOCAL_SIG) throw new ZipError('رأس الملف داخل zip تالف');
    const start = localOff + 30 + view.getUint16(localOff + 26, true) + view.getUint16(localOff + 28, true);
    if (start + compSize > bytes.length) throw new ZipError('الملف مقطوع: التنزيل لم يكتمل');
    const comp = bytes.subarray(start, start + compSize);
    if (method === 0) return { name, data: comp.slice() };
    if (method === 8) return { name, data: await inflateRaw(comp) };
    throw new ZipError(`طريقة ضغط غير مدعومة (${method})`);
  }
  return null;
}
