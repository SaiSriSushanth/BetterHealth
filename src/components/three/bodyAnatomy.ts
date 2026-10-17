/**
 * Anatomy as SDF primitives (metres, feet at y = 0, facing +z).
 * Only the right side (x > 0) is authored; the field is mirrored at x = 0,
 * which also gives the sternal, linea alba and spinal grooves for free.
 * Each primitive carries the muscle zone it paints and a "part" id: borders
 * between parts of one zone become faint detail lines (six-pack, delt heads...).
 * "bias" pushes a primitive back in the zone vote, so deep structural shapes
 * (rib cage, pelvis) only show as bare skin where no muscle is close.
 */
import { SKIN, ZONES, type Zone } from "./zones";

export interface Anatomy {
  data: Float64Array;
  stride: number;
  count: number;
  /** per primitive AABB: minx, miny, minz, maxx, maxy, maxz */
  box: Float64Array;
}

type V = [number, number, number];
type ZoneName = Zone | "skin";
interface Opt {
  k?: number;
  part?: number;
  bias?: number;
  op?: "add" | "sub" | "paint";
}

const STRIDE = 24;
const D2R = Math.PI / 180;

const add = (a: V, b: V): V => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const sub = (a: V, b: V): V => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const mul = (a: V, s: number): V => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V, b: V) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a: V) => Math.sqrt(dot(a, a));
const norm = (a: V): V => mul(a, 1 / (len(a) || 1));
const cross = (a: V, b: V): V => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lerp = (a: V, b: V, t: number): V => add(a, mul(sub(b, a), t));

/** Segment frame: Y along a->b, Z toward `fwd`, X = medial for right-side limbs. */
function frame(a: V, b: V, fwd: V = [0, 0, 1]) {
  const Y = norm(sub(b, a));
  const Z = norm(sub(fwd, mul(Y, dot(fwd, Y))));
  const X = cross(Y, Z);
  return { X, Y, Z, l: len(sub(b, a)) };
}

/** Columns of three.js' Euler('XYZ') rotation matrix (degrees). */
function eulerAxes(deg: V): [V, V, V] {
  const a = Math.cos(deg[0] * D2R);
  const b = Math.sin(deg[0] * D2R);
  const c = Math.cos(deg[1] * D2R);
  const d = Math.sin(deg[1] * D2R);
  const e = Math.cos(deg[2] * D2R);
  const f = Math.sin(deg[2] * D2R);
  const ae = a * e;
  const af = a * f;
  const be = b * e;
  const bf = b * f;
  return [
    [c * e, af + be * d, bf - ae * d],
    [-c * f, ae - bf * d, be + af * d],
    [d, -b * c, a * c],
  ];
}

export function buildAnatomy(): Anatomy {
  const recs: number[] = [];
  const boxes: number[] = [];
  let count = 0;
  const zi = (z: ZoneName) => (z === "skin" ? SKIN : ZONES.indexOf(z));

  function head(type: number, zone: ZoneName, o: Opt): number[] {
    const z = zi(zone);
    const op = o.op === "sub" ? 1 : o.op === "paint" ? 2 : 0;
    return [type, o.k ?? 0.02, op, z, o.part ?? 0, o.bias ?? (z === SKIN ? 0.004 : 0)];
  }
  function push(rec: number[], bmin: V, bmax: V) {
    while (rec.length < STRIDE) rec.push(0);
    recs.push(...rec);
    boxes.push(...bmin, ...bmax);
    count++;
  }
  function extent(ax: [V, V, V], r: V): V {
    const ext: V = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
      ext[i] = Math.sqrt((ax[0][i] * r[0]) ** 2 + (ax[1][i] * r[1]) ** 2 + (ax[2][i] * r[2]) ** 2);
    }
    return ext;
  }

  function ellAxes(zone: ZoneName, c: V, ax: [V, V, V], r: V, o: Opt = {}) {
    const ext = extent(ax, r);
    push([...head(0, zone, o), ...c, ...ax[0], ...ax[1], ...ax[2], ...r], sub(c, ext), add(c, ext));
  }
  function ell(zone: ZoneName, c: V, r: V, rot: V = [0, 0, 0], o: Opt = {}) {
    ellAxes(zone, c, eulerAxes(rot), r, o);
  }
  /** Rounded box: half extents `h`, edge radius `r`. */
  function rbox(zone: ZoneName, c: V, h: V, r: number, rot: V = [0, 0, 0], o: Opt = {}) {
    const ax = eulerAxes(rot);
    const ext = mul(extent(ax, h), 1.75);
    push([...head(3, zone, o), ...c, ...ax[0], ...ax[1], ...ax[2], ...h, r], sub(c, ext), add(c, ext));
  }
  function sph(zone: ZoneName, c: V, r: number, o: Opt = {}) {
    push([...head(2, zone, o), ...c, r], sub(c, [r, r, r]), add(c, [r, r, r]));
  }
  function cone(zone: ZoneName, a: V, b: V, ra: number, rb: number, o: Opt = {}) {
    const ba = sub(b, a);
    const l2 = dot(ba, ba);
    const rr = ra - rb;
    const a2 = l2 - rr * rr;
    const rm = Math.max(ra, rb);
    const mn: V = [Math.min(a[0], b[0]) - rm, Math.min(a[1], b[1]) - rm, Math.min(a[2], b[2]) - rm];
    const mx: V = [Math.max(a[0], b[0]) + rm, Math.max(a[1], b[1]) + rm, Math.max(a[2], b[2]) + rm];
    push([...head(1, zone, o), ...a, ...ba, l2, rr, a2, 1 / l2, ra, rb], mn, mx);
  }
  /**
   * Ellipsoid laid along segment a->b between t0 and t1, offset medial (ox) and
   * toward `fwd` (oz); rz is the radius toward `fwd` (use a surface normal as
   * `fwd` with a small rz for flat sheet muscles).
   */
  function limb(
    zone: ZoneName,
    a: V,
    b: V,
    t0: number,
    t1: number,
    rx: number,
    rz: number,
    ox: number,
    oz: number,
    o: Opt = {},
    fwd: V = [0, 0, 1],
  ) {
    const f = frame(a, b, fwd);
    const c = add(add(lerp(a, b, (t0 + t1) / 2), mul(f.X, ox)), mul(f.Z, oz));
    ellAxes(zone, c, [f.X, f.Y, f.Z], [rx, ((t1 - t0) * f.l) / 2, rz], o);
  }
  const DEEP = 0.03; // bias for structural (non-muscle) trunk shapes
  // Blend radii: muscle bellies use small radii so neighbouring bellies meet in
  // a real crease (separation groove) instead of melting into each other.
  const KM = 0.012; // between heads of one muscle / tight neighbours
  const KB = 0.016; // muscle belly onto the body

  // ---- landmarks (right side) ----
  const SH: V = [0.185, 1.445, -0.008];
  const EL: V = [0.292, 1.168, -0.014];
  const WR: V = [0.392, 0.928, 0.016];
  const HE: V = [0.442, 0.76, 0.026];
  const HP: V = [0.09, 0.93, 0.0];
  const KN: V = [0.106, 0.5, 0.012];
  const AN: V = [0.112, 0.085, -0.02];

  // ---- trunk base (rounder, deeper rib cage and abdomen) ----
  ell("skin", [0, 1.325, -0.008], [0.128, 0.18, 0.11], [0, 0, 0], { k: 0.06, bias: DEEP });
  ell("skin", [0, 1.12, -0.002], [0.106, 0.14, 0.092], [0, 0, 0], { k: 0.07, bias: DEEP });
  ell("skin", [0, 0.97, -0.014], [0.138, 0.092, 0.102], [0, 0, 0], { k: 0.06, bias: DEEP });
  cone("traps", [0, 1.445, -0.016], [0.162, 1.455, -0.024], 0.056, 0.043, { k: 0.05, bias: 0.012 });
  ell("skin", [0, 0.882, 0.008], [0.042, 0.038, 0.05], [0, 0, 0], { k: 0.04, bias: DEEP });
  // clavicle
  cone("skin", [0.02, 1.468, 0.056], [0.16, 1.478, 0.004], 0.011, 0.01, { k: 0.02, bias: 0.012 });

  // ---- neck & head ----
  cone("neck", [0, 1.495, -0.012], [0, 1.63, -0.006], 0.057, 0.048, { k: 0.05, part: 1 });
  cone("neck", [0.048, 1.625, -0.02], [0.017, 1.49, 0.052], 0.016, 0.014, { k: KM, part: 2 });
  ell("skin", [0, 1.705, -0.006], [0.076, 0.1, 0.095], [0, 0, 0], { k: 0.04 });
  ell("skin", [0, 1.635, 0.026], [0.059, 0.058, 0.072], [15, 0, 0], { k: 0.04 });
  ell("skin", [0, 1.593, 0.066], [0.026, 0.02, 0.022], [0, 0, 0], { k: 0.02 });
  ell("skin", [0, 1.67, 0.098], [0.011, 0.022, 0.016], [-15, 0, 0], { k: 0.012 });
  ell("skin", [0, 1.712, 0.076], [0.058, 0.016, 0.024], [0, 0, 0], { k: 0.02 });
  ell("skin", [0.042, 1.66, 0.066], [0.022, 0.016, 0.018], [0, 0, 0], { k: 0.02 });
  ell("skin", [0.077, 1.672, -0.008], [0.011, 0.029, 0.019], [0, 0, 0], { k: 0.01 });

  // ---- traps: yoke over the shoulders + kite down the spine ----
  ell("traps", [0.078, 1.505, -0.036], [0.102, 0.036, 0.054], [0, 0, -24], { k: 0.03 });
  ell("traps", [0.05, 1.405, -0.098], [0.09, 0.08, 0.016], [0, 0, -8], { k: 0.03 });
  ell("traps", [0.026, 1.272, -0.104], [0.04, 0.1, 0.014], [0, 0, 14], { k: KB });
  // back of the neck reads as upper traps
  ell("traps", [0, 1.56, -0.045], [0.05, 0.075, 0.03], [0, 0, 0], { op: "paint" });

  // ---- shoulders: deltoid cap + anterior / lateral / posterior heads, rotator cuff ----
  ell("shoulders", [0.2, 1.443, -0.006], [0.046, 0.054, 0.052], [0, 0, -18], { k: 0.02, part: 2 });
  limb("shoulders", SH, EL, -0.06, 0.42, 0.028, 0.031, -0.002, 0.031, { k: KM, part: 1 });
  limb("shoulders", SH, EL, -0.1, 0.47, 0.033, 0.034, -0.027, 0, { k: KM, part: 2 });
  limb("shoulders", SH, EL, -0.06, 0.4, 0.028, 0.029, -0.004, -0.031, { k: KM, part: 3 });
  limb("shoulders", [0.12, 1.385, -0.096], [0.168, 1.348, -0.07], 0, 1, 0.03, 0.012, 0, 0, { k: KM, part: 4 }, [0.5, 0.1, -0.86]);

  // ---- chest: sternal mass with a hard lower edge + clavicular head to the arm ----
  ell("chest", [0.063, 1.346, 0.082], [0.066, 0.058, 0.036], [-18, 16, 4], { k: KB, part: 1 });
  ell("chest", [0.118, 1.368, 0.058], [0.05, 0.036, 0.024], [-10, 40, 14], { k: 0.02, part: 1 });

  // ---- lats: wing from the armpit into the lumbar fascia + teres bulge ----
  limb("lats", [0.155, 1.385, -0.04], [0.1, 1.2, -0.084], 0, 1, 0.048, 0.028, 0, 0, { k: KB, part: 1 }, [0.75, 0, -0.66]);
  limb("lats", [0.11, 1.25, -0.084], [0.045, 1.065, -0.098], 0, 1, 0.034, 0.016, 0, 0, { k: KB, part: 1 }, [0.35, 0, -0.94]);
  cone("lats", [0.135, 1.37, -0.05], [0.19, 1.4, -0.028], 0.03, 0.019, { k: KM, part: 1 });
  limb("lats", [0.115, 1.318, -0.1], [0.178, 1.372, -0.056], 0, 1, 0.018, 0.016, 0, 0, { k: KM, part: 2 }, [0.4, 0.2, -0.9]);

  // ---- lower back: erector columns either side of the spine ----
  ell("lowerback", [0.032, 1.09, -0.094], [0.026, 0.15, 0.026], [0, 0, 0], { k: KM });

  // ---- abs: raised rectus blocks; gaps = tendinous intersections + linea alba ----
  rbox("abs", [0.029, 1.256, 0.09], [0.024, 0.024, 0.014], 0.012, [-16, 10, 0], { k: 0.008, part: 1 });
  rbox("abs", [0.03, 1.194, 0.084], [0.025, 0.024, 0.014], 0.012, [-6, 10, 0], { k: 0.008, part: 2 });
  rbox("abs", [0.03, 1.132, 0.086], [0.025, 0.024, 0.014], 0.012, [0, 10, 0], { k: 0.008, part: 3 });
  ell("abs", [0.025, 1.035, 0.07], [0.025, 0.066, 0.022], [10, 10, 4], { k: 0.01, part: 4 });

  // ---- obliques: external oblique sheet + serratus fingers under the pec ----
  limb("obliques", [0.11, 1.21, 0.04], [0.106, 0.975, 0.042], 0, 1, 0.046, 0.013, 0, 0, { k: 0.022, part: 1 }, [0.86, 0, 0.5]);
  limb("obliques", [0.118, 1.2, -0.012], [0.112, 1.02, -0.02], 0, 1, 0.04, 0.014, 0, 0, { k: 0.024, part: 1 }, [1, 0, -0.15]);
  for (let i = 0; i < 3; i++) {
    const y = 1.318 - 0.03 * i;
    limb("obliques", [0.124, y + 0.012, 0.03], [0.104, y - 0.012, 0.074], 0, 1, 0.008, 0.009, 0, -0.002, {
      k: 0.008,
      part: 2 + i,
    }, [0.85, 0, 0.5]);
  }

  // ---- arm ----
  const af = frame(SH, EL);
  cone("skin", SH, EL, 0.04, 0.032, { k: 0.02, bias: 0.012 });
  limb("biceps", SH, EL, 0.22, 0.95, 0.033, 0.042, 0.003, 0.02, { k: KM, part: 1 });
  limb("triceps", SH, EL, 0.1, 0.8, 0.03, 0.035, 0.012, -0.025, { k: KM, part: 1 });
  limb("triceps", SH, EL, 0.15, 0.68, 0.026, 0.029, -0.02, -0.015, { k: KM, part: 2 });
  limb("triceps", SH, EL, 0.6, 0.95, 0.024, 0.016, 0, -0.027, { k: KM, part: 3 });
  sph("skin", EL, 0.032, { k: 0.02, bias: 0.01 });
  sph("skin", add(EL, mul(af.Z, -0.02)), 0.011, { k: 0.015 });
  cone("forearms", EL, WR, 0.034, 0.021, { k: 0.02, bias: 0.006 });
  limb("forearms", EL, WR, -0.02, 0.6, 0.03, 0.029, 0.014, 0.013, { k: KM, part: 1 });
  limb("forearms", EL, WR, -0.07, 0.55, 0.03, 0.033, -0.021, 0.004, { k: KM, part: 2 });
  limb("forearms", EL, WR, 0.05, 0.62, 0.024, 0.022, -0.004, -0.022, { k: KM, part: 3 });
  const hf = frame(WR, HE);
  limb("skin", WR, HE, -0.02, 0.5, 0.036, 0.015, 0, 0, { k: 0.02 });
  limb("skin", WR, HE, 0.42, 1.0, 0.032, 0.011, 0.002, -0.004, { k: 0.015 });
  cone(
    "skin",
    add(add(lerp(WR, HE, 0.14), mul(hf.X, -0.026)), mul(hf.Z, 0.01)),
    add(add(lerp(WR, HE, 0.48), mul(hf.X, -0.034)), mul(hf.Z, 0.02)),
    0.012,
    0.009,
    { k: 0.012 },
  );

  // ---- leg ----
  cone("skin", HP, KN, 0.066, 0.046, { k: 0.03, bias: DEEP });
  ell("glutes", [0.07, 0.94, -0.068], [0.073, 0.082, 0.054], [12, 0, 8], { k: KB, part: 1 });
  limb("glutes", [0.128, 1.035, -0.03], [0.112, 0.955, -0.052], 0, 1, 0.042, 0.02, 0, -0.004, { k: 0.026, part: 2 }, [0.75, 0, -0.66]);
  limb("quads", HP, KN, 0.04, 0.86, 0.034, 0.042, 0, 0.042, { k: KM, part: 1 });
  limb("quads", HP, KN, 0.08, 0.9, 0.045, 0.052, -0.04, 0.008, { k: KM, part: 2 });
  limb("quads", HP, KN, 0.58, 0.97, 0.037, 0.038, 0.034, 0.025, { k: KM, part: 3 });
  limb("hamstrings", HP, KN, 0.12, 0.9, 0.033, 0.044, -0.022, -0.038, { k: KM, part: 1 });
  limb("hamstrings", HP, KN, 0.12, 0.95, 0.033, 0.044, 0.022, -0.038, { k: KM, part: 2 });
  limb("adductors", HP, KN, -0.02, 0.6, 0.041, 0.052, 0.043, 0, { k: KB, part: 1 });
  limb("adductors", HP, KN, 0, 0.92, 0.017, 0.025, 0.053, -0.008, { k: KM, part: 2 });
  sph("skin", KN, 0.039, { k: 0.04, bias: 0.03 });
  ell("skin", add(KN, [0, 0.006, 0.038]), [0.016, 0.019, 0.01], [0, 0, 0], { k: 0.02, bias: 0.006 });
  cone("calves", KN, AN, 0.04, 0.025, { k: 0.025, bias: 0.008 });
  limb("calves", KN, AN, 0.08, 0.7, 0.019, 0.022, -0.017, 0.031, { k: 0.01, part: 3 });
  limb("calves", KN, AN, 0.06, 0.5, 0.032, 0.041, 0.02, -0.036, { k: 0.01, part: 1 });
  limb("calves", KN, AN, 0.06, 0.44, 0.028, 0.036, -0.021, -0.033, { k: 0.01, part: 2 });
  limb("calves", KN, AN, 0.3, 0.8, 0.044, 0.029, 0, -0.019, { k: 0.014, part: 4 });
  cone("skin", add(lerp(KN, AN, 0.75), [0, 0, -0.026]), add(AN, [0, -0.03, -0.04]), 0.011, 0.012, { k: 0.02 });
  ell("skin", AN, [0.025, 0.032, 0.027], [0, 0, 0], { k: 0.03 });
  sph("skin", add(AN, [0.024, 0.005, 0]), 0.011, { k: 0.012 });
  sph("skin", add(AN, [-0.021, 0.012, 0.002]), 0.011, { k: 0.012 });
  ell("skin", [0.112, 0.032, -0.038], [0.024, 0.03, 0.03], [0, 0, 0], { k: 0.03 });
  ell("skin", [0.118, 0.026, 0.05], [0.033, 0.023, 0.09], [0, -5, 0], { k: 0.035 });
  ell("skin", [0.123, 0.014, 0.128], [0.037, 0.013, 0.032], [0, -5, 0], { k: 0.03 });

  // ---- carved details (subtractions last) ----
  ell("skin", [0, 1.085, 0.094], [0.007, 0.008, 0.01], [0, 0, 0], { k: 0.01, op: "sub" });
  ell("skin", [0.03, 1.69, 0.094], [0.016, 0.009, 0.008], [0, 0, 0], { k: 0.012, op: "sub" });

  return { data: Float64Array.from(recs), stride: STRIDE, count, box: Float64Array.from(boxes) };
}
