"use client";

import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Float } from "@react-three/drei";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";

const C = {
  tangerine: "#ff5a1f",
  sun: "#ffd23f",
  teal: "#0fb5a6",
  bubble: "#ff8cc6",
  lime: "#d7ff3f",
  ink: "#0b1f1d",
} as const;

type V3 = [number, number, number];

/** Glossy toy-but-premium material. */
function Gloss({ color, rough = 0.32 }: { color: string; rough?: number }) {
  return (
    <meshPhysicalMaterial
      color={color}
      roughness={rough}
      metalness={0.02}
      clearcoat={1}
      clearcoatRoughness={0.14}
    />
  );
}

/**
 * Wraps one object: floats, spins, leans toward the pointer and pops on hover.
 * When `still` is set (reduced motion) nothing animates.
 */
function Item({
  position,
  scale = 1,
  rotation = [0, 0, 0],
  spin = 0.4,
  still,
  children,
}: {
  position: V3;
  scale?: number;
  rotation?: V3;
  spin?: number;
  still: boolean;
  children: ReactNode;
}) {
  const group = useRef<THREE.Group>(null);
  const body = useRef<THREE.Group>(null);
  const hovered = useRef(false);
  const s = useRef({ v: 1, vel: 0, spin: 0, tx: 0, ty: 0 });

  useFrame((state, delta) => {
    const g = group.current;
    const b = body.current;
    if (!g || !b || still) return;
    const dt = Math.min(delta, 0.05);
    const st = s.current;
    // spring scale (underdamped so it "pops")
    const target = hovered.current ? 1.22 : 1;
    st.vel += ((target - st.v) * 120 - st.vel * 9) * dt;
    st.v += st.vel * dt;
    g.scale.setScalar(scale * st.v);
    // spin + gentle look-at toward pointer
    st.spin += spin * dt;
    st.tx = THREE.MathUtils.damp(st.tx, -state.pointer.y * 0.35, 4, dt);
    st.ty = THREE.MathUtils.damp(st.ty, state.pointer.x * 0.5, 4, dt);
    b.rotation.set(st.tx, st.spin + st.ty, 0);
  });

  const over = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    hovered.current = true;
  };
  const out = () => {
    hovered.current = false;
  };

  const inner = (
    <group
      ref={group}
      scale={scale}
      onPointerOver={over}
      onPointerOut={out}
    >
      <group ref={body}>{children}</group>
    </group>
  );

  return (
    <group position={position} rotation={rotation}>
      {still ? (
        inner
      ) : (
        <Float speed={1.4} rotationIntensity={0.25} floatIntensity={0.9} floatingRange={[-0.12, 0.12]}>
          {inner}
        </Float>
      )}
    </group>
  );
}

function Dumbbell() {
  return (
    <group rotation={[0, 0, Math.PI / 2.6]}>
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 2.1, 16]} />
        <Gloss color={C.ink} rough={0.25} />
      </mesh>
      {[1, -1].map((s) => (
        <group key={s} position={[0, s * 0.78, 0]}>
          <mesh>
            <cylinderGeometry args={[0.52, 0.52, 0.26, 28]} />
            <Gloss color={C.tangerine} />
          </mesh>
          <mesh position={[0, s * 0.2, 0]}>
            <cylinderGeometry args={[0.4, 0.4, 0.18, 28]} />
            <Gloss color={C.sun} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function Apple() {
  return (
    <group>
      <mesh scale={[1, 0.88, 1]}>
        <sphereGeometry args={[0.8, 28, 20]} />
        <Gloss color={C.tangerine} />
      </mesh>
      <mesh position={[0, 0.72, 0]} scale={[1, 0.6, 1]}>
        <sphereGeometry args={[0.3, 16, 10]} />
        <Gloss color={C.tangerine} />
      </mesh>
      <mesh position={[0.02, 0.88, 0]} rotation={[0, 0, 0.2]}>
        <cylinderGeometry args={[0.04, 0.05, 0.3, 8]} />
        <Gloss color={C.ink} rough={0.5} />
      </mesh>
      <mesh position={[0.26, 0.94, 0]} rotation={[0, 0, -0.5]} scale={[1, 0.28, 0.55]}>
        <sphereGeometry args={[0.3, 16, 10]} />
        <Gloss color={C.lime} />
      </mesh>
    </group>
  );
}

function Donut() {
  const sprinkles = useMemo(
    () =>
      [0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i / 6) * Math.PI * 2 + 0.3;
        return { a, c: [C.sun, C.teal, C.lime, C.tangerine][i % 4] };
      }),
    [],
  );
  return (
    <group rotation={[Math.PI / 2.4, 0, 0]}>
      <mesh>
        <torusGeometry args={[0.7, 0.34, 18, 40]} />
        <Gloss color={C.sun} />
      </mesh>
      <mesh position={[0, 0, 0.13]} scale={[1, 1, 0.55]}>
        <torusGeometry args={[0.7, 0.33, 18, 40]} />
        <Gloss color={C.bubble} />
      </mesh>
      {sprinkles.map((p, i) => (
        <mesh
          key={i}
          position={[Math.cos(p.a) * 0.7, Math.sin(p.a) * 0.7, 0.36]}
          rotation={[0, 0, p.a + 1]}
        >
          <capsuleGeometry args={[0.03, 0.12, 3, 6]} />
          <Gloss color={p.c} />
        </mesh>
      ))}
    </group>
  );
}

function Avocado() {
  return (
    <group>
      <mesh scale={[0.78, 1.08, 0.78]}>
        <sphereGeometry args={[0.8, 28, 20]} />
        <Gloss color={C.teal} />
      </mesh>
      <mesh position={[0, -0.02, 0.2]} scale={[0.64, 0.94, 0.52]}>
        <sphereGeometry args={[0.8, 24, 16]} />
        <Gloss color={C.lime} rough={0.4} />
      </mesh>
      <mesh position={[0, -0.12, 0.42]}>
        <sphereGeometry args={[0.27, 20, 14]} />
        <Gloss color={C.tangerine} />
      </mesh>
    </group>
  );
}

function Carrot() {
  return (
    <group rotation={[0, 0, -0.7]}>
      <mesh rotation={[Math.PI, 0, 0]}>
        <coneGeometry args={[0.34, 1.9, 24]} />
        <Gloss color={C.tangerine} />
      </mesh>
      {[-0.14, 0, 0.14].map((x, i) => (
        <mesh key={i} position={[x, 1.15, 0]} rotation={[0, 0, -x * 2.6]}>
          <coneGeometry args={[0.09, 0.55, 10]} />
          <Gloss color={C.lime} />
        </mesh>
      ))}
    </group>
  );
}

function Lemon() {
  return (
    <group rotation={[0, 0, 0.4]}>
      <mesh scale={[1.18, 0.86, 0.86]}>
        <sphereGeometry args={[0.7, 28, 20]} />
        <Gloss color={C.sun} />
      </mesh>
      {[1, -1].map((s) => (
        <mesh key={s} position={[s * 0.8, 0, 0]} scale={[1, 0.8, 0.8]}>
          <sphereGeometry args={[0.13, 12, 10]} />
          <Gloss color={C.sun} />
        </mesh>
      ))}
    </group>
  );
}

function Drop() {
  const geo = useMemo(() => {
    const pts: THREE.Vector2[] = [];
    const n = 28;
    for (let i = 0; i <= n; i++) {
      const t = (i / n) * Math.PI;
      const x = Math.sin(t) * Math.sin(t / 2) * 0.62;
      const y = Math.cos(t) * 0.85;
      pts.push(new THREE.Vector2(Math.max(x, 0.0001), y));
    }
    return new THREE.LatheGeometry(pts, 28);
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <mesh geometry={geo}>
      <Gloss color={C.teal} rough={0.18} />
    </mesh>
  );
}

function Cluster({ still }: { still: boolean }) {
  const root = useRef<THREE.Group>(null);
  const viewport = useThree((s) => s.viewport);
  const k = Math.min(1, Math.max(0.55, viewport.width / 9));

  useFrame((state, delta) => {
    const r = root.current;
    if (!r || still) return;
    const dt = Math.min(delta, 0.05);
    r.rotation.y = THREE.MathUtils.damp(r.rotation.y, state.pointer.x * 0.28, 3, dt);
    r.rotation.x = THREE.MathUtils.damp(r.rotation.x, -state.pointer.y * 0.18, 3, dt);
    r.position.x = THREE.MathUtils.damp(r.position.x, state.pointer.x * 0.25, 3, dt);
    r.position.y = THREE.MathUtils.damp(r.position.y, state.pointer.y * 0.18, 3, dt);
  });

  return (
    <group ref={root} scale={k}>
      <Item position={[0.1, -0.1, 0.5]} scale={1.15} spin={0.5} rotation={[0.2, 0, 0]} still={still}>
        <Dumbbell />
      </Item>
      <Item position={[-2.5, 0.8, -0.2]} scale={1} spin={0.45} still={still}>
        <Apple />
      </Item>
      <Item position={[2.5, 1.0, -0.4]} scale={1} spin={0.35} still={still}>
        <Donut />
      </Item>
      <Item position={[2.3, -1.5, 0.1]} scale={0.95} spin={0.4} still={still}>
        <Avocado />
      </Item>
      <Item position={[-2.1, -1.5, 0.2]} scale={0.9} spin={0.3} still={still}>
        <Carrot />
      </Item>
      <Item position={[-0.3, 1.9, -0.6]} scale={0.85} spin={0.5} still={still}>
        <Lemon />
      </Item>
      <Item position={[1.1, 2.0, 0]} scale={0.8} spin={0.6} still={still}>
        <Drop />
      </Item>
    </group>
  );
}

export function HeroScene({ className }: { className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);

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
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={wrap} className={className} style={{ width: "100%", height: "100%", minHeight: 0 }}>
      <Canvas
        frameloop={reduced ? "demand" : visible ? "always" : "never"}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
        camera={{ fov: 38, position: [0, 0, 7], near: 0.1, far: 40 }}
        style={{ background: "transparent" }}
      >
        <hemisphereLight args={["#ffffff", "#9fd8d0", 1.1]} />
        <directionalLight position={[3, 5, 4]} intensity={2.2} />
        <pointLight position={[-5, 1, 2]} intensity={40} color={C.tangerine} distance={14} />
        <pointLight position={[5, -2, 3]} intensity={40} color={C.teal} distance={14} />
        <pointLight position={[0, 4, -4]} intensity={30} color={C.bubble} distance={14} />
        <Cluster still={reduced} />
      </Canvas>
    </div>
  );
}
