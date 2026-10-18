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
  /** small regions (right side) meshed on a finer grid: feet, hands */
  refine: Refine[];
}

/**
 * A region re-meshed at `scale` x the base grid spacing inside [min, max]
 * (x >= 0, mirrored). Its "core" is where dot(n, p) > d: there the fine mesh
 * replaces the coarse one; the fine mesh extends `overlap` past the core so
 * the seam is covered.
 */
export interface Refine {
  min: [number, number, number];
  max: [number, number, number];
  scale: number;
  n: [number, number, number];
  d: number;
  overlap: number;
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
  const UP: V = [0, 1, 0];

  // ---- landmarks (right side) ----
  const SH: V = [0.185, 1.445, -0.008];
  const EL: V = [0.292, 1.168, -0.014];
  const WR: V = [0.392, 0.928, 0.016];
  const HE: V = [0.442, 0.76, 0.026];
  const HP: V = [0.09, 0.93, 0.0];
  const KN: V = [0.106, 0.5, 0.012];
  const AN: V = [0.112, 0.085, -0.02];
  const HY = -0.018; // head sits a little lower: shorter neck

  // ---- trunk base: rib cage tipped back (thoracic kyphosis), lumbar pulled in (lordosis) ----
  ell("skin", [0, 1.325, -0.014], [0.128, 0.18, 0.11], [-10, 0, 0], { k: 0.06, bias: DEEP });
  ell("skin", [0, 1.12, 0.012], [0.106, 0.14, 0.088], [0, 0, 0], { k: 0.07, bias: DEEP });
  ell("skin", [0, 0.97, -0.014], [0.138, 0.092, 0.102], [0, 0, 0], { k: 0.06, bias: DEEP });
  cone("traps", [0, 1.45, -0.016], [0.162, 1.458, -0.024], 0.058, 0.044, { k: 0.05, bias: 0.012 });
  ell("skin", [0, 0.882, 0.008], [0.042, 0.038, 0.05], [0, 0, 0], { k: 0.04, bias: DEEP });
  // clavicle
  cone("skin", [0.02, 1.48, 0.056], [0.16, 1.486, 0.004], 0.011, 0.01, { k: 0.02, bias: 0.012 });

  // ---- neck & head (shorter, thicker neck) ----
  cone("neck", [0, 1.485, -0.012], [0, 1.6, -0.008], 0.04, 0.032, { k: 0.032, part: 1 });
  cone("neck", [0.05, 1.6, -0.02], [0.018, 1.492, 0.052], 0.018, 0.016, { k: KM, part: 2 });
  ell("skin", [0, 1.705 + HY, -0.006], [0.076, 0.1, 0.095], [0, 0, 0], { k: 0.04 });
  ell("skin", [0, 1.635 + HY, 0.026], [0.059, 0.058, 0.072], [15, 0, 0], { k: 0.04 });
  ell("skin", [0, 1.593 + HY, 0.066], [0.026, 0.02, 0.022], [0, 0, 0], { k: 0.02 });
  ell("skin", [0, 1.67 + HY, 0.098], [0.011, 0.022, 0.016], [-15, 0, 0], { k: 0.012 });
  ell("skin", [0, 1.712 + HY, 0.076], [0.058, 0.016, 0.024], [0, 0, 0], { k: 0.02 });
  ell("skin", [0.042, 1.66 + HY, 0.066], [0.022, 0.016, 0.018], [0, 0, 0], { k: 0.02 });
  ell("skin", [0.077, 1.672 + HY, -0.008], [0.011, 0.029, 0.019], [0, 0, 0], { k: 0.01 });

  // ---- traps: yoke rising up the neck + raised diamond down the spine ----
  ell("traps", [0.075, 1.515, -0.036], [0.1, 0.042, 0.056], [0, 0, -26], { k: 0.03 });
  cone("traps", [0.02, 1.585, -0.036], [0.13, 1.497, -0.026], 0.02, 0.02, { k: 0.022 });
  ell("traps", [0.05, 1.4, -0.098], [0.09, 0.08, 0.016], [0, 0, -8], { k: 0.03 });
  ell("traps", [0.026, 1.272, -0.104], [0.04, 0.1, 0.013], [0, 0, 14], { k: 0.024 });
  // back of the neck reads as upper traps
  ell("traps", [0, 1.545, -0.048], [0.052, 0.07, 0.03], [0, 0, 0], { op: "paint" });

  // ---- shoulders: deltoid cap + anterior / lateral / posterior heads, rotator cuff ----
  ell("shoulders", [0.2, 1.443, -0.006], [0.046, 0.054, 0.052], [0, 0, -18], { k: 0.02, part: 2 });
  limb("shoulders", SH, EL, -0.06, 0.42, 0.028, 0.031, -0.002, 0.031, { k: KM, part: 1 });
  limb("shoulders", SH, EL, -0.1, 0.47, 0.033, 0.034, -0.027, 0, { k: KM, part: 2 });
  limb("shoulders", SH, EL, -0.06, 0.42, 0.029, 0.033, -0.004, -0.034, { k: KM, part: 3 });
  // infraspinatus on the scapula
  limb("shoulders", [0.108, 1.392, -0.1], [0.172, 1.338, -0.068], 0, 1, 0.036, 0.013, 0, 0, { k: 0.016, part: 4 }, [0.5, 0.1, -0.86]);

  // ---- chest: athletic pec with a clean lower edge, clavicular head up to the collarbone ----
  ell("chest", [0.063, 1.35, 0.074], [0.064, 0.054, 0.028], [-12, 16, 4], { k: 0.02, part: 1 });
  ell("chest", [0.114, 1.362, 0.05], [0.046, 0.032, 0.018], [-10, 40, 8], { k: 0.024, part: 1 });
  ell("chest", [0.056, 1.41, 0.068], [0.056, 0.03, 0.016], [-32, 14, 6], { k: 0.028, part: 1 });

  // ---- lats: flared wing from the armpit into the lumbar fascia + teres ----
  limb("lats", [0.16, 1.385, -0.04], [0.104, 1.2, -0.076], 0, 1, 0.038, 0.026, 0, 0, { k: KB, part: 1 }, [0.75, 0, -0.66]);
  limb("lats", [0.11, 1.25, -0.08], [0.045, 1.065, -0.074], 0, 1, 0.027, 0.013, 0, 0, { k: KB, part: 1 }, [0.35, 0, -0.94]);
  cone("lats", [0.135, 1.37, -0.05], [0.19, 1.4, -0.028], 0.03, 0.019, { k: KM, part: 1 });
  limb("lats", [0.115, 1.318, -0.094], [0.178, 1.372, -0.058], 0, 1, 0.015, 0.014, 0, 0, { k: KM, part: 2 }, [0.4, 0.2, -0.9]);

  // ---- lower back: raised erector columns with a deep spinal groove, following the S-curve ----
  limb("lowerback", [0.032, 0.97, -0.074], [0.034, 1.17, -0.076], 0, 1, 0.024, 0.022, 0, 0, { k: KM, part: 1 }, [0, 0, -1]);
  limb("lowerback", [0.03, 1.15, -0.086], [0.024, 1.31, -0.114], 0, 1, 0.02, 0.012, 0, 0, { k: 0.02, part: 2, bias: 0.01 }, [0, 0, -1]);

  // ---- abs: raised rectus blocks; gaps = tendinous intersections + linea alba ----
  rbox("abs", [0.029, 1.256, 0.09], [0.024, 0.024, 0.014], 0.012, [-16, 10, 0], { k: 0.008, part: 1 });
  rbox("abs", [0.03, 1.194, 0.088], [0.025, 0.024, 0.014], 0.012, [-6, 10, 0], { k: 0.008, part: 2 });
  rbox("abs", [0.03, 1.132, 0.09], [0.025, 0.024, 0.014], 0.012, [0, 10, 0], { k: 0.008, part: 3 });
  ell("abs", [0.025, 1.035, 0.074], [0.025, 0.066, 0.022], [10, 10, 4], { k: 0.01, part: 4 });

  // ---- obliques: external oblique sheet + serratus fingers under the pec ----
  limb("obliques", [0.11, 1.21, 0.044], [0.106, 0.975, 0.046], 0, 1, 0.046, 0.013, 0, 0, { k: 0.022, part: 1 }, [0.86, 0, 0.5]);
  limb("obliques", [0.118, 1.2, -0.008], [0.112, 1.02, -0.014], 0, 1, 0.04, 0.014, 0, 0, { k: 0.024, part: 1 }, [1, 0, -0.15]);
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

  // ---- hand: palm, four separated fingers (slightly curled), thumb ----
  const hf = frame(WR, HE);
  const hp = (t: number, ox: number, oz: number): V => add(add(lerp(WR, HE, t), mul(hf.X, ox)), mul(hf.Z, oz));
  limb("skin", WR, HE, -0.02, 0.54, 0.035, 0.015, 0, 0, { k: 0.02 });
  const fingers: [number, number, number][] = [
    [-0.024, 0.0084, 0.92], // index (thumb side)
    [-0.008, 0.0088, 1.0], // middle
    [0.008, 0.0084, 0.96], // ring
    [0.022, 0.0074, 0.85], // little
  ];
  fingers.forEach(([ox, r, tl], i) => {
    cone("skin", hp(0.5, ox, 0.002), hp(tl, ox * 1.08, 0.014), r, r * 0.82, { k: 0.004, part: 31 + i });
  });
  cone("skin", hp(0.13, -0.027, 0.01), hp(0.5, -0.037, 0.026), 0.012, 0.0085, { k: 0.008, part: 35 });

  // ---- leg ----
  cone("skin", HP, KN, 0.066, 0.046, { k: 0.03, bias: DEEP });
  ell("glutes", [0.07, 0.935, -0.066], [0.07, 0.078, 0.048], [8, 0, 8], { k: KB, part: 1 });
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
  // ankle bones: lateral malleolus sits lower than the medial one
  sph("skin", add(AN, [0.025, -0.004, -0.004]), 0.012, { k: 0.01 });
  sph("skin", add(AN, [-0.022, 0.01, 0.002]), 0.012, { k: 0.01 });

  // ---- foot: ~26 cm long, toes out 10 deg; heel, instep, arch, ball, five toes ----
  const toeOut = 10 * D2R;
  const fF: V = [Math.sin(toeOut), 0, Math.cos(toeOut)]; // forward
  const fL: V = [Math.cos(toeOut), 0, -Math.sin(toeOut)]; // lateral (outward)
  const FO: V = [AN[0], 0, AN[2] + 0.004];
  const fp = (u: number, v: number, w: number): V => add(add(add(FO, mul(fL, u)), mul(UP, v)), mul(fF, w));
  const footAx: [V, V, V] = [fL, UP, fF];
  ellAxes("skin", fp(0, 0.031, -0.04), footAx, [0.024, 0.03, 0.028], { k: 0.03 }); // heel
  limb("skin", fp(0.002, 0.052, -0.012), fp(0.008, 0.024, 0.112), 0, 1, 0.034, 0.021, 0, 0, { k: 0.03 }, UP); // instep
  ellAxes("skin", fp(0.024, 0.013, 0.05), footAx, [0.014, 0.013, 0.062], { k: 0.022 }); // outer edge
  ellAxes("skin", fp(0.0, 0.019, 0.118), footAx, [0.041, 0.018, 0.026], { k: 0.02 }); // ball
  const toes: [number, number, number][] = [
    [-0.025, 0.0115, 0.182], // big toe
    [-0.005, 0.0082, 0.174],
    [0.01, 0.0078, 0.165],
    [0.023, 0.0073, 0.155],
    [0.035, 0.0068, 0.143],
  ];
  toes.forEach(([u, r, tip], i) => {
    cone("skin", fp(u, 0.02, 0.124), fp(u * 1.06, r * 0.95, tip - r), r * 1.05, r, { k: 0.004, part: 11 + i });
  });
  // big-toe nail
  const [bu, br, btip] = toes[0];
  ellAxes("skin", fp(bu * 1.06, br * 1.75, btip - br * 1.3), footAx, [br * 0.72, br * 0.22, br * 0.85], {
    k: 0.003,
    part: 21,
  });

  // ---- carved details (subtractions last) ----
  ell("skin", [0, 1.085, 0.098], [0.007, 0.008, 0.01], [0, 0, 0], { k: 0.01, op: "sub" });
  ell("skin", [0.03, 1.69 + HY, 0.094], [0.016, 0.009, 0.008], [0, 0, 0], { k: 0.012, op: "sub" });
  ellAxes("skin", fp(-0.036, 0.0, 0.036), footAx, [0.022, 0.016, 0.046], { k: 0.012, op: "sub" }); // medial arch

  const handDir = norm(sub(HE, WR));
  const refine: Refine[] = [
    // feet: everything below the ankle
    { min: [0.04, -0.02, -0.12], max: [0.215, 0.108, 0.23], scale: 0.58, n: [0, -1, 0], d: -0.075, overlap: 0.012 },
    // hands: everything 1.5 cm past the wrist
    {
      min: [0.335, 0.715, -0.035],
      max: [0.5, 0.965, 0.08],
      scale: 0.72,
      n: handDir,
      d: dot(handDir, WR) + 0.015,
      overlap: 0.012,
    },
  ];

  return { data: Float64Array.from(recs), stride: STRIDE, count, box: Float64Array.from(boxes), refine };
}
