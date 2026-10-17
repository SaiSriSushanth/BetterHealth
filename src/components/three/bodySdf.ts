/**
 * Procedural anatomy mesh.
 *
 * The body is one signed distance field: a smooth union of ~100 ellipsoids,
 * rounded boxes and tapered capsules (see bodyAnatomy.ts), mirrored across x = 0.
 * It is sampled on a 7.4 mm grid (only near the surface, using per-block
 * primitive lists), polygonised with surface nets into one indexed
 * BufferGeometry (~90k triangles), and each vertex gets:
 *   - a normal from the SDF gradient (smooth shading, no faceting)
 *   - a baked ambient-occlusion term (probes along the normal, darkens creases)
 *   - two muscle zones + blend factor (nearest primitive of each zone)
 *   - a groove value (distance to the nearest zone / sub-muscle border)
 * The build is a generator so it can be time-sliced and never blocks a frame.
 */
import { buildAnatomy, type Anatomy } from "./bodyAnatomy";
import { SKIN, ZONE_COUNT } from "./zones";

export interface BodyData {
  position: Float32Array;
  normal: Float32Array;
  index: Uint32Array;
  /** per vertex: zoneA, zoneB, mix (0 = all A, 0.5 = on the border) */
  zone: Float32Array;
  /** per vertex: distance to zone border, distance to sub-muscle border */
  line: Float32Array;
  ao: Float32Array;
  /** coarse proxy used for raycasting */
  pickPosition: Float32Array;
  pickIndex: Uint32Array;
  /** zone index at a point on / near the surface (SKIN if none) */
  zoneAt: (x: number, y: number, z: number) => number;
  triangles: number;
  ms: number;
}

const H = 0.0074; // grid spacing (m)
const B = 4; // block size (cells) for primitive culling
const BAND = 0.03; // primitives this close to a block are evaluated for it
const BIG = 1;
const BLEND = 0.01; // zone colour blend width

const X_MAX = 0.56;
const Y0 = -0.02;
const Y1 = 1.84;
const Z0 = -0.2;
const Z1 = 0.22;

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return (a < b ? a : b) - h * h * k * 0.25;
}

function makeDist(an: Anatomy) {
  const P = an.data;
  const S = an.stride;
  return function primDist(p: number, x: number, y: number, z: number): number {
    const o = p * S;
    const t = P[o];
    if (t === 0) {
      const qx = x - P[o + 6];
      const qy = y - P[o + 7];
      const qz = z - P[o + 8];
      const rx = P[o + 18];
      const ry = P[o + 19];
      const rz = P[o + 20];
      const ax = (qx * P[o + 9] + qy * P[o + 10] + qz * P[o + 11]) / rx;
      const ay = (qx * P[o + 12] + qy * P[o + 13] + qz * P[o + 14]) / ry;
      const az = (qx * P[o + 15] + qy * P[o + 16] + qz * P[o + 17]) / rz;
      const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
      const bx = ax / rx;
      const by = ay / ry;
      const bz = az / rz;
      const k1 = Math.sqrt(bx * bx + by * by + bz * bz);
      return k1 > 1e-9 ? (k0 * (k0 - 1)) / k1 : -Math.min(rx, ry, rz);
    }
    if (t === 3) {
      // rounded box in a local frame
      const qx = x - P[o + 6];
      const qy = y - P[o + 7];
      const qz = z - P[o + 8];
      const r = P[o + 21];
      const ax = Math.abs(qx * P[o + 9] + qy * P[o + 10] + qz * P[o + 11]) - P[o + 18] + r;
      const ay = Math.abs(qx * P[o + 12] + qy * P[o + 13] + qz * P[o + 14]) - P[o + 19] + r;
      const az = Math.abs(qx * P[o + 15] + qy * P[o + 16] + qz * P[o + 17]) - P[o + 20] + r;
      const mx = ax > 0 ? ax : 0;
      const my = ay > 0 ? ay : 0;
      const mz = az > 0 ? az : 0;
      const inner = Math.max(ax, ay, az);
      return Math.sqrt(mx * mx + my * my + mz * mz) + (inner < 0 ? inner : 0) - r;
    }
    if (t === 2) {
      const dx = x - P[o + 6];
      const dy = y - P[o + 7];
      const dz = z - P[o + 8];
      return Math.sqrt(dx * dx + dy * dy + dz * dz) - P[o + 9];
    }
    // round cone (iq)
    const pax = x - P[o + 6];
    const pay = y - P[o + 7];
    const paz = z - P[o + 8];
    const bax = P[o + 9];
    const bay = P[o + 10];
    const baz = P[o + 11];
    const l2 = P[o + 12];
    const rr = P[o + 13];
    const a2 = P[o + 14];
    const il2 = P[o + 15];
    const r1 = P[o + 16];
    const r2 = P[o + 17];
    const yy = pax * bax + pay * bay + paz * baz;
    const zz = yy - l2;
    const wx = pax * l2 - bax * yy;
    const wy = pay * l2 - bay * yy;
    const wz = paz * l2 - baz * yy;
    const x2 = wx * wx + wy * wy + wz * wz;
    const y2 = yy * yy * l2;
    const z2 = zz * zz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(zz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(yy) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + yy * rr) * il2 - r1;
  };
}

const EDGES: [number, number][] = [];
for (let c = 0; c < 8; c++) for (let b = 0; b < 3; b++) if (!(c & (1 << b))) EDGES.push([c, c | (1 << b)]);

/** Surface nets over a dense grid; x = x0 + i*h etc. Appends to pos / idx. */
function* surfaceNets(
  g: Float32Array,
  nx: number,
  ny: number,
  nz: number,
  x0: number,
  y0: number,
  z0: number,
  h: number,
  pos: number[],
  idx: number[],
): Generator<undefined, void, undefined> {
  const nxy = nx * ny;
  const cellV = new Int32Array(nx * ny * nz).fill(-1);
  const off = [0, 1, nx, nx + 1, nxy, nxy + 1, nxy + nx, nxy + nx + 1];
  const v = new Float64Array(8);
  const far = h * 3; // a corner this far from the surface means no crossing in the cell
  for (let k = 0; k < nz - 1; k++) {
    for (let j = 0; j < ny - 1; j++) {
      for (let i = 0; i < nx - 1; i++) {
        const id = i + nx * j + nxy * k;
        const g0 = g[id];
        if (g0 > far || g0 < -far) continue;
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          const val = g[id + off[c]];
          v[c] = val;
          if (val < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0;
        let sy = 0;
        let sz = 0;
        let n = 0;
        for (let e = 0; e < 12; e++) {
          const c0 = EDGES[e][0];
          const c1 = EDGES[e][1];
          const a = v[c0];
          const b = v[c1];
          if (a < 0 === b < 0) continue;
          const t = a / (a - b);
          sx += (c0 & 1) + t * ((c1 & 1) - (c0 & 1));
          sy += ((c0 >> 1) & 1) + t * (((c1 >> 1) & 1) - ((c0 >> 1) & 1));
          sz += ((c0 >> 2) & 1) + t * (((c1 >> 2) & 1) - ((c0 >> 2) & 1));
          n++;
        }
        const vi = pos.length / 3;
        cellV[id] = vi;
        pos.push(x0 + (i + sx / n) * h, y0 + (j + sy / n) * h, z0 + (k + sz / n) * h);

        const in0 = (mask & 1) !== 0;
        // x edge (corner 0 -> 1)
        if (in0 !== ((mask & 2) !== 0) && j > 0 && k > 0) {
          quad(idx, cellV, id - nx - nxy, id - nxy, id, id - nx, in0);
        }
        // y edge (corner 0 -> 2)
        if (in0 !== ((mask & 4) !== 0) && i > 0 && k > 0) {
          quad(idx, cellV, id - 1 - nxy, id - 1, id, id - nxy, in0);
        }
        // z edge (corner 0 -> 4)
        if (in0 !== ((mask & 16) !== 0) && i > 0 && j > 0) {
          quad(idx, cellV, id - 1 - nx, id - nx, id, id - 1, in0);
        }
      }
    }
    yield;
  }
}

function quad(idx: number[], cellV: Int32Array, c00: number, c10: number, c11: number, c01: number, inside: boolean) {
  const a = cellV[c00];
  const b = cellV[c10];
  const c = cellV[c11];
  const d = cellV[c01];
  if (a < 0 || b < 0 || c < 0 || d < 0) return;
  if (inside) idx.push(a, b, c, a, c, d);
  else idx.push(a, d, c, a, c, b);
}

function smooth01(e: number, x: number) {
  const t = Math.min(Math.max(x / e, 0), 1);
  return t * t * (3 - 2 * t);
}

export function* buildBody(): Generator<undefined, BodyData, undefined> {
  const t0 = performance.now();
  const an = buildAnatomy();
  const P = an.data;
  const S = an.stride;
  const count = an.count;
  const box = an.box;
  const primDist = makeDist(an);

  const nh = Math.ceil(X_MAX / H);
  const nx = nh * 2;
  const ny = Math.ceil((Y1 - Y0) / H) + 1;
  const nz = Math.ceil((Z1 - Z0) / H) + 1;
  const nbx = Math.ceil(nh / B);
  const nby = Math.ceil(ny / B);
  const nbz = Math.ceil(nz / B);
  const nBlocks = nbx * nby * nbz;

  // --- per-block candidate primitive lists (half space, x >= 0) ---
  const start = new Uint32Array(nBlocks + 1);
  const listArr: number[] = [];
  for (let bk = 0; bk < nbz; bk++) {
    for (let bj = 0; bj < nby; bj++) {
      for (let bi = 0; bi < nbx; bi++) {
        const b = bi + nbx * (bj + nby * bk);
        start[b] = listArr.length;
        const x0 = (bi * B + 0.5) * H - BAND;
        const x1 = (Math.min(bi * B + B, nh) - 0.5) * H + BAND;
        const y0 = Y0 + bj * B * H - BAND;
        const y1 = Y0 + (Math.min(bj * B + B, ny) - 1) * H + BAND;
        const z0 = Z0 + bk * B * H - BAND;
        const z1 = Z0 + (Math.min(bk * B + B, nz) - 1) * H + BAND;
        for (let p = 0; p < count; p++) {
          const o = p * 6;
          const kk = P[p * S + 1];
          if (
            box[o] - kk <= x1 &&
            box[o + 3] + kk >= x0 &&
            box[o + 1] - kk <= y1 &&
            box[o + 4] + kk >= y0 &&
            box[o + 2] - kk <= z1 &&
            box[o + 5] + kk >= z0
          )
            listArr.push(p);
        }
      }
    }
  }
  start[nBlocks] = listArr.length;
  const list = Uint16Array.from(listArr);
  yield;

  const evalRange = (x: number, y: number, z: number, s: number, e: number): number => {
    let d = BIG;
    for (let n = s; n < e; n++) {
      const p = list[n];
      const o = p * S;
      const op = P[o + 2];
      if (op === 2) continue;
      const di = primDist(p, x, y, z);
      if (op === 0) d = smin(d, di, P[o + 1]);
      else d = -smin(-d, di, P[o + 1]);
    }
    return d;
  };
  const blockOf = (ax: number, y: number, z: number): number => {
    let bi = Math.floor((ax / H - 0.5) / B);
    let bj = Math.floor((y - Y0) / H / B);
    let bk = Math.floor((z - Z0) / H / B);
    bi = bi < 0 ? 0 : bi >= nbx ? nbx - 1 : bi;
    bj = bj < 0 ? 0 : bj >= nby ? nby - 1 : bj;
    bk = bk < 0 ? 0 : bk >= nbz ? nbz - 1 : bk;
    return bi + nbx * (bj + nby * bk);
  };
  const sdfAt = (x: number, y: number, z: number): number => {
    const ax = Math.abs(x);
    const b = blockOf(ax, y, z);
    return evalRange(ax, y, z, start[b], start[b + 1]);
  };

  // --- sample the grid (only near the surface) ---
  const g = new Float32Array(nx * ny * nz).fill(BIG);
  const nxy = nx * ny;
  const skip = (Math.sqrt(3) * B * 0.5 * H + H) * 1.5;
  for (let bk = 0; bk < nbz; bk++) {
    for (let bj = 0; bj < nby; bj++) {
      for (let bi = 0; bi < nbx; bi++) {
        const b = bi + nbx * (bj + nby * bk);
        const s = start[b];
        const e = start[b + 1];
        if (s === e) continue;
        const i0 = bi * B;
        const i1 = Math.min(i0 + B, nh);
        const j0 = bj * B;
        const j1 = Math.min(j0 + B, ny);
        const k0 = bk * B;
        const k1 = Math.min(k0 + B, nz);
        const cx = ((i0 + i1) * 0.5) * H;
        const cy = Y0 + ((j0 + j1 - 1) * 0.5) * H;
        const cz = Z0 + ((k0 + k1 - 1) * 0.5) * H;
        const dc = evalRange(cx, cy, cz, s, e);
        const uniform = Math.abs(dc) > skip;
        for (let k = k0; k < k1; k++) {
          const z = Z0 + k * H;
          for (let j = j0; j < j1; j++) {
            const y = Y0 + j * H;
            const row = nx * j + nxy * k;
            for (let i = i0; i < i1; i++) {
              const d = uniform ? dc : evalRange((i + 0.5) * H, y, z, s, e);
              g[row + nh + i] = d;
              g[row + nh - 1 - i] = d;
            }
          }
        }
      }
      yield;
    }
  }

  // --- polygonise ---
  const posArr: number[] = [];
  const idxArr: number[] = [];
  const gx0 = (-nh + 0.5) * H;
  yield* surfaceNets(g, nx, ny, nz, gx0, Y0, Z0, H, posArr, idxArr);

  // coarse proxy for picking: every 2nd sample
  const mx = Math.floor(nx / 2);
  const my = Math.floor(ny / 2);
  const mz = Math.floor(nz / 2);
  const g2 = new Float32Array(mx * my * mz);
  for (let k = 0; k < mz; k++)
    for (let j = 0; j < my; j++)
      for (let i = 0; i < mx; i++) g2[i + mx * (j + my * k)] = g[2 * i + nx * (2 * j) + nxy * (2 * k)];
  const pickPos: number[] = [];
  const pickIdx: number[] = [];
  yield* surfaceNets(g2, mx, my, mz, gx0, Y0, Z0, H * 2, pickPos, pickIdx);

  // --- per-vertex attributes ---
  const nv = posArr.length / 3;
  const position = Float32Array.from(posArr);
  const normal = new Float32Array(nv * 3);
  const zone = new Float32Array(nv * 3);
  const line = new Float32Array(nv * 2);
  const ao = new Float32Array(nv);

  const best = new Float64Array(ZONE_COUNT);
  const second = new Float64Array(ZONE_COUNT);
  const bestPart = new Int32Array(ZONE_COUNT);
  const classify = (x: number, y: number, z: number): [number, number, number, number] => {
    const ax = Math.abs(x);
    const b = blockOf(ax, y, z);
    best.fill(BIG);
    second.fill(BIG);
    bestPart.fill(-1);
    for (let n = start[b]; n < start[b + 1]; n++) {
      const p = list[n];
      const o = p * S;
      if (P[o + 2] === 1) continue;
      const zn = P[o + 3];
      const part = P[o + 4];
      const d = primDist(p, ax, y, z) + P[o + 5];
      if (d < best[zn]) {
        if (part !== bestPart[zn]) {
          second[zn] = best[zn];
          bestPart[zn] = part;
        }
        best[zn] = d;
      } else if (part !== bestPart[zn] && d < second[zn]) second[zn] = d;
    }
    let z1 = SKIN;
    for (let q = 0; q < ZONE_COUNT; q++) if (best[q] < best[z1]) z1 = q;
    let z2 = z1 === 0 ? 1 : 0;
    for (let q = 0; q < ZONE_COUNT; q++) if (q !== z1 && best[q] < best[z2]) z2 = q;
    const groove = best[z2] - best[z1];
    const detail = bestPart[z1] > 0 ? second[z1] - best[z1] : BIG;
    return [z1, z2, groove, detail];
  };

  /** trilinear grid lookup (AO probes; accurate enough away from the surface) */
  const gridAt = (x: number, y: number, z: number): number => {
    const fx = (x - gx0) / H;
    const fy = (y - Y0) / H;
    const fz = (z - Z0) / H;
    if (fx < 0 || fy < 0 || fz < 0 || fx >= nx - 1 || fy >= ny - 1 || fz >= nz - 1) return BIG;
    const i = fx | 0;
    const j = fy | 0;
    const k = fz | 0;
    const tx = fx - i;
    const ty = fy - j;
    const tz = fz - k;
    const id = i + nx * j + nxy * k;
    const c00 = g[id] + (g[id + 1] - g[id]) * tx;
    const c10 = g[id + nx] + (g[id + nx + 1] - g[id + nx]) * tx;
    const c01 = g[id + nxy] + (g[id + nxy + 1] - g[id + nxy]) * tx;
    const c11 = g[id + nxy + nx] + (g[id + nxy + nx + 1] - g[id + nxy + nx]) * tx;
    const c0 = c00 + (c10 - c00) * ty;
    const c1 = c01 + (c11 - c01) * ty;
    return c0 + (c1 - c0) * tz;
  };

  const e = H * 0.6;
  const aoSteps = [0.012, 0.03, 0.06];
  const aoW = [0.4, 0.35, 0.25];
  for (let v = 0; v < nv; v++) {
    const x = position[v * 3];
    const y = position[v * 3 + 1];
    const z = position[v * 3 + 2];
    // tetrahedral gradient (4 taps)
    const a = sdfAt(x + e, y - e, z - e);
    const b = sdfAt(x - e, y - e, z + e);
    const c = sdfAt(x - e, y + e, z - e);
    const d = sdfAt(x + e, y + e, z + e);
    let gxv = a - b - c + d;
    let gyv = -a - b + c + d;
    let gzv = -a + b - c + d;
    const gl = Math.hypot(gxv, gyv, gzv) || 1;
    gxv /= gl;
    gyv /= gl;
    gzv /= gl;
    normal[v * 3] = gxv;
    normal[v * 3 + 1] = gyv;
    normal[v * 3 + 2] = gzv;

    let occ = 0;
    for (let s = 0; s < 3; s++) {
      const st = aoSteps[s];
      const d = gridAt(x + gxv * st, y + gyv * st, z + gzv * st);
      occ += (aoW[s] * Math.max(0, st - d)) / st;
    }
    ao[v] = Math.min(1, Math.max(0, 1 - occ * 1.15));

    const [z1, z2, groove, detail] = classify(x, y, z);
    zone[v * 3] = z1;
    zone[v * 3 + 1] = z2;
    zone[v * 3 + 2] = 0.5 * (1 - smooth01(BLEND, groove));
    line[v * 2] = groove;
    line[v * 2 + 1] = detail;
    if ((v & 2047) === 2047) yield;
  }

  const zoneAt = (x: number, y: number, z: number) => classify(x, y, z)[0];
  const index = Uint32Array.from(idxArr);
  return {
    position,
    normal,
    index,
    zone,
    line,
    ao,
    pickPosition: Float32Array.from(pickPos),
    pickIndex: Uint32Array.from(pickIdx),
    zoneAt,
    triangles: index.length / 3,
    ms: performance.now() - t0,
  };
}

let cache: Promise<BodyData> | null = null;

/** Builds the body once per page, time-sliced (~10 ms chunks) so frames keep flowing. */
export function loadBody(): Promise<BodyData> {
  if (cache) return cache;
  cache = new Promise<BodyData>((resolve, reject) => {
    const it = buildBody();
    const step = () => {
      try {
        const t = performance.now();
        for (;;) {
          const r = it.next();
          if (r.done) {
            ch?.port1.close();
            resolve(r.value);
            return;
          }
          if (performance.now() - t > 10) break;
        }
        schedule();
      } catch (err) {
        cache = null;
        reject(err);
      }
    };
    // MessageChannel is not clamped like nested setTimeout
    const ch = typeof MessageChannel !== "undefined" ? new MessageChannel() : null;
    const schedule = () => (ch ? ch.port2.postMessage(0) : setTimeout(step, 0));
    if (ch) ch.port1.onmessage = step;
    schedule();
  });
  return cache;
}
