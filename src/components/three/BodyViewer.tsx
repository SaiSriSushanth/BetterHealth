"use client";

import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ElementRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";

type V3 = [number, number, number];
type Area = "upper" | "arms" | "core" | "lower";

const AREA_COLOR: Record<Area, string> = {
  upper: "#ff5a1f",
  arms: "#ff8cc6",
  core: "#ffd23f",
  lower: "#0fb5a6",
};
const PALE_MIX = 0.3; // share of white mixed into untrained tint
const INK = new THREE.Color("#0b1f1d");
const WHITE = new THREE.Color("#ffffff");

const FRONT = new Set([
  "chest",
  "abs",
  "obliques",
  "biceps",
  "quads",
  "adductors",
  "neck",
  "shoulders",
  "forearms",
]);

const SPHERE = new THREE.SphereGeometry(1, 28, 18);

interface ViewerState {
  trained: Set<string>;
  selected: string | null;
  hovered: string | null;
  setHovered: (fn: (cur: string | null) => string | null) => void;
  onSelect: (id: string) => void;
}
const ViewerCtx = createContext<ViewerState | null>(null);

interface MuscleHandle {
  material: THREE.MeshPhysicalMaterial;
  pop: MutableRefObject<number>;
  over: (e: ThreeEvent<PointerEvent>) => void;
  out: (e: ThreeEvent<PointerEvent>) => void;
  click: (e: ThreeEvent<MouseEvent>) => void;
}

function useMuscle(id: string, area: Area): MuscleHandle {
  const ctx = useContext(ViewerCtx);
  if (!ctx) throw new Error("ViewerCtx missing");
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const pop = useRef(0);
  const material = useMemo(
    () =>
      new THREE.MeshPhysicalMaterial({
        roughness: 0.42,
        metalness: 0.02,
        clearcoat: 0.5,
        clearcoatRoughness: 0.3,
        emissive: new THREE.Color(AREA_COLOR[area]),
        emissiveIntensity: 0,
      }),
    [area],
  );
  useEffect(() => () => material.dispose(), [material]);

  const full = useMemo(() => new THREE.Color(AREA_COLOR[area]), [area]);
  const pale = useMemo(() => full.clone().lerp(WHITE, PALE_MIX), [full]);
  const target = useMemo(() => new THREE.Color(), []);

  useFrame((state, delta) => {
    const c = ctxRef.current;
    const dt = Math.min(delta, 0.05);
    const sel = c.selected === id;
    const hov = c.hovered === id;
    target.copy(c.trained.has(id) ? full : pale);
    if (sel) target.lerp(INK, 0.32);
    material.color.lerp(target, 1 - Math.exp(-dt * 12));
    const emis = sel ? 0.28 + 0.16 * Math.sin(state.clock.elapsedTime * 4) : hov ? 0.3 : 0;
    material.emissiveIntensity = THREE.MathUtils.damp(material.emissiveIntensity, emis, 12, dt);
    pop.current = THREE.MathUtils.damp(pop.current, sel ? 1 : hov ? 0.55 : 0, 10, dt);
  });

  return useMemo(
    () => ({
      material,
      pop,
      over: (e) => {
        e.stopPropagation();
        ctxRef.current.setHovered(() => id);
      },
      out: () => {
        ctxRef.current.setHovered((cur) => (cur === id ? null : cur));
      },
      click: (e) => {
        e.stopPropagation();
        ctxRef.current.onSelect(id);
      },
    }),
    [material, id],
  );
}

/** One ellipsoid piece of a muscle group. */
function Part({
  m,
  p,
  s,
  r = [0, 0, 0],
  geo = SPHERE,
}: {
  m: MuscleHandle;
  p: V3;
  s: V3;
  r?: V3;
  geo?: THREE.BufferGeometry;
}) {
  const ref = useRef<THREE.Mesh>(null);
  useFrame(() => {
    const k = 1 + m.pop.current * 0.07;
    ref.current?.scale.set(s[0] * k, s[1] * k, s[2] * k);
  });
  return (
    <mesh
      ref={ref}
      geometry={geo}
      material={m.material}
      position={p}
      rotation={r}
      scale={s}
      onPointerOver={m.over}
      onPointerOut={m.out}
      onClick={m.click}
    />
  );
}

const NEUTRAL = new THREE.MeshStandardMaterial({ color: "#d9e4e1", roughness: 0.6, metalness: 0 });
const block = (e: ThreeEvent<PointerEvent | MouseEvent>) => e.stopPropagation();

/** Non-interactive body part (still occludes clicks on muscles behind it). */
function Neutral({
  p,
  s,
  r = [0, 0, 0],
  geo = SPHERE,
}: {
  p: V3;
  s: V3;
  r?: V3;
  geo?: THREE.BufferGeometry;
}) {
  return (
    <mesh
      geometry={geo}
      material={NEUTRAL}
      position={p}
      rotation={r}
      scale={s}
      onPointerOver={block}
      onClick={block}
    />
  );
}

function useTaper(top: number, bottom: number, h: number, seg = 18) {
  const g = useMemo(() => new THREE.CylinderGeometry(top, bottom, h, seg, 1), [top, bottom, h, seg]);
  useEffect(() => () => g.dispose(), [g]);
  return g;
}

const SIDES = [1, -1] as const;

function Body() {
  const neck = useMuscle("neck", "upper");
  const traps = useMuscle("traps", "upper");
  const shoulders = useMuscle("shoulders", "upper");
  const chest = useMuscle("chest", "upper");
  const lats = useMuscle("lats", "upper");
  const lowerback = useMuscle("lowerback", "core");
  const abs = useMuscle("abs", "core");
  const obliques = useMuscle("obliques", "core");
  const biceps = useMuscle("biceps", "arms");
  const triceps = useMuscle("triceps", "arms");
  const forearms = useMuscle("forearms", "arms");
  const glutes = useMuscle("glutes", "lower");
  const quads = useMuscle("quads", "lower");
  const hamstrings = useMuscle("hamstrings", "lower");
  const adductors = useMuscle("adductors", "lower");
  const calves = useMuscle("calves", "lower");

  const torso = useTaper(0.42, 0.3, 1.0, 28);
  const neckGeo = useTaper(0.09, 0.115, 0.28, 16);
  const thighCore = useTaper(0.1, 0.07, 0.8, 14);
  const upperArm = useTaper(0.07, 0.055, 0.7, 12);
  const forearmGeo = useTaper(0.075, 0.042, 0.62, 14);
  const shin = useTaper(0.075, 0.045, 0.74, 14);

  return (
    <group scale={[1.2, 1, 1.15]}>
      {/* neutral: head, torso core, pelvis */}
      <Neutral p={[0, 3.42, 0.01]} s={[0.2, 0.26, 0.225]} />
      <Neutral p={[0, 2.4, 0]} s={[1, 1, 0.55]} geo={torso} />
      <Neutral p={[0, 1.86, 0]} s={[0.37, 0.22, 0.21]} />

      {/* neck */}
      <Part m={neck} p={[0, 3.07, 0]} s={[1, 1, 1]} geo={neckGeo} />

      {/* traps: sloped bands (visible front + back) and back diamond */}
      {SIDES.map((s) => (
        <Part key={`tr${s}`} m={traps} p={[s * 0.24, 2.96, -0.015]} s={[0.21, 0.06, 0.13]} r={[0, 0, -s * 0.2]} />
      ))}
      <Part m={traps} p={[0, 2.74, -0.165]} s={[0.24, 0.3, 0.075]} />

      {/* chest */}
      {SIDES.map((s) => (
        <Part key={`ch${s}`} m={chest} p={[s * 0.17, 2.66, 0.125]} s={[0.19, 0.15, 0.105]} r={[0.1, 0, -s * 0.12]} />
      ))}

      {/* lats (V-taper), lower back */}
      {SIDES.map((s) => (
        <Part key={`la${s}`} m={lats} p={[s * 0.2, 2.5, -0.135]} s={[0.15, 0.31, 0.085]} r={[0, 0, -s * 0.28]} />
      ))}
      {SIDES.map((s) => (
        <Part key={`lb${s}`} m={lowerback} p={[s * 0.09, 2.03, -0.115]} s={[0.1, 0.14, 0.06]} />
      ))}

      {/* abs: 6 plates */}
      {[
        [2.4, 0.178, 0.068],
        [2.26, 0.168, 0.066],
        [2.12, 0.152, 0.062],
      ].map(([y, z, w], row) =>
        SIDES.map((s) => (
          <Part key={`ab${row}${s}`} m={abs} p={[s * 0.07, y, z]} s={[w, 0.058, 0.032]} />
        )),
      )}

      {/* obliques */}
      {SIDES.map((s) => (
        <Part key={`ob${s}`} m={obliques} p={[s * 0.3, 2.22, 0.055]} s={[0.065, 0.2, 0.12]} r={[0, 0, -s * 0.12]} />
      ))}

      {/* arms */}
      {SIDES.map((s) => (
        <group key={`arm${s}`} position={[s * 0.53, 2.84, 0]} rotation={[0, 0, s * 0.1]}>
          <Part m={shoulders} p={[0, -0.03, 0]} s={[0.125, 0.145, 0.125]} />
          <Neutral p={[0, -0.4, 0]} s={[1, 1, 1]} geo={upperArm} />
          <Part m={biceps} p={[0, -0.33, 0.035]} s={[0.075, 0.2, 0.07]} />
          <Part m={triceps} p={[0, -0.33, -0.038]} s={[0.075, 0.2, 0.07]} />
          <Neutral p={[0, -0.72, 0]} s={[0.062, 0.062, 0.062]} />
          <Part m={forearms} p={[0, -1.03, 0]} s={[1, 1, 1]} r={[0.05, 0, 0]} geo={forearmGeo} />
          <Neutral p={[0, -1.42, 0.01]} s={[0.05, 0.1, 0.032]} />
        </group>
      ))}

      {/* glutes */}
      {SIDES.map((s) => (
        <Part key={`gl${s}`} m={glutes} p={[s * 0.14, 1.74, -0.1]} s={[0.17, 0.18, 0.15]} />
      ))}

      {/* legs */}
      {SIDES.map((s) => (
        <group key={`leg${s}`} position={[s * 0.17, 1.75, 0]} rotation={[0, 0, s * 0.03]}>
          <Neutral p={[0, -0.4, 0]} s={[1, 1, 1]} geo={thighCore} />
          <Part m={quads} p={[0, -0.42, 0.035]} s={[0.14, 0.36, 0.125]} />
          <Part m={hamstrings} p={[0, -0.42, -0.045]} s={[0.14, 0.36, 0.115]} />
          <Part m={adductors} p={[-s * 0.095, -0.36, 0]} s={[0.065, 0.3, 0.1]} />
          <Neutral p={[0, -0.82, 0.005]} s={[0.088, 0.088, 0.088]} />
          <Neutral p={[0, -1.19, 0.005]} s={[1, 1, 1]} geo={shin} />
          <Part m={calves} p={[0, -1.07, -0.045]} s={[0.088, 0.22, 0.09]} />
          <Neutral p={[0, -1.7, 0.07]} s={[0.065, 0.05, 0.16]} />
        </group>
      ))}
    </group>
  );
}

/** Spins the body to face a muscle; auto-rotates the camera until the user interacts. */
function Rig({
  selected,
  controls,
  children,
}: {
  selected: string | null;
  controls: MutableRefObject<ElementRef<typeof OrbitControls> | null>;
  children: ReactNode;
}) {
  const model = useRef<THREE.Group>(null);
  const target = useRef(0);

  useEffect(() => {
    const m = model.current;
    if (!m || !selected) return;
    const az = controls.current?.getAzimuthalAngle() ?? 0;
    const desired = (FRONT.has(selected) ? 0 : Math.PI) + az;
    const d = ((((desired - m.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    target.current = m.rotation.y + d;
    if (controls.current) controls.current.autoRotate = false;
  }, [selected, controls]);

  useFrame((_, delta) => {
    const m = model.current;
    if (!m) return;
    m.rotation.y = THREE.MathUtils.damp(m.rotation.y, target.current, 4, Math.min(delta, 0.05));
  });

  return <group ref={model}>{children}</group>;
}

export function BodyViewer({
  trained,
  selected,
  onSelect,
  className,
}: {
  trained: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  className?: string;
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const controls = useRef<ElementRef<typeof OrbitControls> | null>(null);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [hovered, setHoveredState] = useState<string | null>(null);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReduced(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    document.body.style.cursor = hovered ? "pointer" : "";
    return () => {
      document.body.style.cursor = "";
    };
  }, [hovered]);

  // let vertical swipes scroll the page; only horizontal drags rotate
  useEffect(() => {
    const el = controls.current?.domElement as HTMLElement | undefined;
    if (el) el.style.touchAction = "pan-y";
  });

  const state = useMemo<ViewerState>(
    () => ({ trained, selected, hovered, setHovered: setHoveredState, onSelect }),
    [trained, selected, hovered, onSelect],
  );

  return (
    <div
      ref={wrap}
      role="img"
      aria-label="Interactive 3D body. Use the muscle buttons beside it for keyboard access."
      className={className}
      style={{ width: "100%", height: "100%", minHeight: 0, touchAction: "pan-y" }}
    >
      <Canvas
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 35, position: [0, 2.3, 6.5], near: 0.1, far: 40 }}
        style={{ background: "transparent", touchAction: "pan-y" }}
      >
        <hemisphereLight args={["#ffffff", "#a9cfc8", 1.15]} />
        <directionalLight position={[3, 6, 5]} intensity={2.1} />
        <directionalLight position={[-4, 3, -5]} intensity={1.2} />
        <pointLight position={[-4, 2, 3]} intensity={16} color="#ff8cc6" distance={14} />
        <pointLight position={[4, 1, -3]} intensity={16} color="#0fb5a6" distance={14} />
        <ViewerCtx.Provider value={state}>
          <Rig selected={selected} controls={controls}>
            <Body />
          </Rig>
        </ViewerCtx.Provider>
        <ContactShadows
          position={[0, 0.002, 0]}
          opacity={0.38}
          scale={5}
          blur={2.6}
          far={1.2}
          resolution={256}
          frames={1}
          color="#0b1f1d"
        />
        <OrbitControls
          ref={controls}
          target={[0, 1.78, 0]}
          enableZoom={false}
          enablePan={false}
          enableDamping
          dampingFactor={0.08}
          minPolarAngle={Math.PI * 0.4}
          maxPolarAngle={Math.PI * 0.52}
          autoRotate={!reduced && !selected}
          autoRotateSpeed={1.1}
          onStart={() => {
            if (controls.current) controls.current.autoRotate = false;
          }}
        />
      </Canvas>
    </div>
  );
}
