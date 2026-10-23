// scripts/lib/glb.mjs
// Reads what the app needs from a .glb file WITHOUT any dependency: its bounding box (node transforms included), the number of
// triangles, the material names and the glTF extensions (Draco / Meshopt need a decoder at load time).
// Used by scripts/build-model-manifest.mjs and by the tests.

const MAGIC = 0x46546c67; // "glTF"
const CHUNK_JSON = 0x4e4f534a;

/** Splits a binary glTF into its JSON part. Throws a readable Error when the file is not a glTF 2 binary. */
export function parseGlb(buf) {
  if (buf.length < 20) throw new Error('file too small to be a .glb');
  if (buf.readUInt32LE(0) !== MAGIC) throw new Error('not a .glb file (wrong header)');
  const version = buf.readUInt32LE(4);
  if (version !== 2) throw new Error(`glTF version ${version} is not supported (need 2)`);
  const total = Math.min(buf.readUInt32LE(8), buf.length);
  let off = 12;
  while (off + 8 <= total) {
    const len = buf.readUInt32LE(off), type = buf.readUInt32LE(off + 4);
    if (type === CHUNK_JSON) return JSON.parse(buf.toString('utf8', off + 8, off + 8 + len));
    off += 8 + len + ((4 - (len % 4)) % 4);
  }
  throw new Error('no JSON chunk in the .glb');
}

// ---- 4x4 column-major matrices --------------------------------------------------------------------------------------
const IDENTITY = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

function mul(a, b) {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

function nodeMatrix(n) {
  if (Array.isArray(n.matrix) && n.matrix.length === 16) return n.matrix;
  const [tx, ty, tz] = n.translation ?? [0, 0, 0];
  const [qx, qy, qz, qw] = n.rotation ?? [0, 0, 0, 1];
  const [sx, sy, sz] = n.scale ?? [1, 1, 1];
  const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
  const xx = qx * x2, xy = qx * y2, xz = qx * z2, yy = qy * y2, yz = qy * z2, zz = qz * z2, wx = qw * x2, wy = qw * y2, wz = qw * z2;
  return [
    (1 - (yy + zz)) * sx, (xy + wz) * sx, (xz - wy) * sx, 0,
    (xy - wz) * sy, (1 - (xx + zz)) * sy, (yz + wx) * sy, 0,
    (xz + wy) * sz, (yz - wx) * sz, (1 - (xx + yy)) * sz, 0,
    tx, ty, tz, 1,
  ];
}

const apply = (m, [x, y, z]) => [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]];

/**
 * Summary of a .glb buffer: { bbox: {min, max}, triangles, materials, meshes, extensions, images, warnings }.
 * The box is the one of the default scene with every node transform applied, in the model's own units.
 */
export function glbSummary(buf) {
  return summaryOfJson(parseGlb(buf));
}

/** Same summary for a .gltf (plain JSON text, its .bin and textures are separate files next to it). */
export function gltfSummary(text) {
  return summaryOfJson(JSON.parse(text));
}

/** The files a .gltf points to (buffers and images that are not embedded as data: URIs), relative to the .gltf. */
export function externalUris(json) {
  return [...(json.buffers ?? []), ...(json.images ?? [])]
    .map((x) => x.uri)
    .filter((u) => typeof u === 'string' && !u.startsWith('data:'))
    .map((u) => decodeURIComponent(u));
}

function summaryOfJson(json) {
  const warnings = [];
  const accessors = json.accessors ?? [], nodes = json.nodes ?? [], meshes = json.meshes ?? [];
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  let triangles = 0, noMinMax = 0;
  const visiting = new Set();

  const visit = (index, parent) => {
    const n = nodes[index];
    if (!n || visiting.has(index)) return;
    visiting.add(index);
    const m = mul(parent, nodeMatrix(n));
    if (typeof n.mesh === 'number' && meshes[n.mesh]) {
      for (const prim of meshes[n.mesh].primitives ?? []) {
        const pos = accessors[prim.attributes?.POSITION];
        if (!pos || !pos.min || !pos.max) { noMinMax++; continue; }
        for (const x of [pos.min[0], pos.max[0]]) for (const y of [pos.min[1], pos.max[1]]) for (const z of [pos.min[2], pos.max[2]]) {
          const p = apply(m, [x, y, z]);
          for (let i = 0; i < 3; i++) { min[i] = Math.min(min[i], p[i]); max[i] = Math.max(max[i], p[i]); }
        }
        if (prim.mode === undefined || prim.mode === 4) {
          const idx = typeof prim.indices === 'number' ? accessors[prim.indices] : undefined;
          triangles += Math.floor((idx ? idx.count : pos.count) / 3);
        }
      }
    }
    for (const c of n.children ?? []) visit(c, m);
    visiting.delete(index);
  };

  const sceneIndex = json.scene ?? 0;
  const roots = json.scenes?.[sceneIndex]?.nodes ?? (nodes.length > 0 ? nodes.map((_, i) => i).filter((i) => !nodes.some((o) => (o.children ?? []).includes(i))) : []);
  for (const r of roots) visit(r, IDENTITY());

  if (!Number.isFinite(min[0])) throw new Error('no geometry with a bounding box in this file');
  if (noMinMax > 0) warnings.push(`${noMinMax} mesh part(s) without min/max on POSITION were not measured`);
  return {
    bbox: { min, max },
    triangles,
    materials: (json.materials ?? []).map((m, i) => m.name ?? `material-${i}`),
    meshes: meshes.length,
    extensions: json.extensionsUsed ?? [],
    images: (json.images ?? []).length,
    warnings,
  };
}
