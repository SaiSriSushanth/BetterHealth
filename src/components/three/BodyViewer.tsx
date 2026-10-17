"use client";

import { Canvas, useFrame, type ThreeEvent } from "@react-three/fiber";
import { ContactShadows, OrbitControls } from "@react-three/drei";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type MutableRefObject,
  type ReactNode,
} from "react";
import * as THREE from "three";
import { MUSCLE_BY_ID } from "@/lib/exercises";
import { loadBody, type BodyData } from "./bodySdf";
import { SKIN, ZONE_COUNT, ZONES } from "./zones";

type Controls = ComponentRef<typeof OrbitControls>;
type Area = "upper" | "arms" | "core" | "lower";

const AREA_COLOR: Record<Area, string> = {
  upper: "#ff5a1f",
  arms: "#ff8cc6",
  core: "#ffd23f",
  lower: "#0fb5a6",
};
const SKIN_COLOR = new THREE.Color("#efe9e1");
const WHITE = new THREE.Color("#ffffff");
const PALE_MIX = 0.55; // share of white in the untrained tint
const INK = new THREE.Color("#0b1f1d");

const FULL = ZONES.map((id) => {
  const area = MUSCLE_BY_ID[id]?.area ?? "upper";
  const c = new THREE.Color(AREA_COLOR[area]);
  // the viewer sits on a teal card: deepen trained teal a touch so legs separate from it
  return area === "lower" ? c.lerp(INK, 0.14) : c;
});
const PALE = ZONES.map((id) =>
  new THREE.Color(AREA_COLOR[MUSCLE_BY_ID[id]?.area ?? "upper"]).lerp(WHITE, PALE_MIX),
);
const FRONT = new Set(ZONES.filter((id) => MUSCLE_BY_ID[id]?.side !== "back"));

interface ZoneUniforms {
  [name: string]: THREE.IUniform;
  uColor: THREE.IUniform<Float32Array>;
  uGlow: THREE.IUniform<Float32Array>;
  uLift: THREE.IUniform<Float32Array>;
  uSel: THREE.IUniform<number>;
  uPulse: THREE.IUniform<number>;
}

const N = ZONE_COUNT;

function makeBodyMaterial(u: ZoneUniforms) {
  const m = new THREE.MeshStandardMaterial({ roughness: 0.56, metalness: 0 });
  m.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute vec3 aZone;
attribute vec2 aLine;
attribute float aAO;
uniform vec3 uColor[${N}];
uniform float uGlow[${N}];
uniform float uLift[${N}];
uniform float uSel;
varying vec3 vZoneColor;
varying float vGlow;
varying vec2 vLine;
varying float vAO;
varying float vSelW;
varying float vSelEdge;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
int zA = int(aZone.x + 0.5);
int zB = int(aZone.y + 0.5);
float zM = aZone.z;
vZoneColor = mix(uColor[zA], uColor[zB], zM);
vGlow = mix(uGlow[zA], uGlow[zB], zM);
float sA = abs(aZone.x - uSel) < 0.5 ? 1.0 : 0.0;
float sB = abs(aZone.y - uSel) < 0.5 ? 1.0 : 0.0;
vSelW = mix(sA, sB, zM);
vSelEdge = max(sA, sB);
vLine = aLine;
vAO = aAO;
transformed += objectNormal * mix(uLift[zA], uLift[zB], zM);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
uniform float uPulse;
varying vec3 vZoneColor;
varying float vGlow;
varying vec2 vLine;
varying float vAO;
varying float vSelW;
varying float vSelEdge;`,
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        `float groove = 1.0 - smoothstep(0.0, 0.0065, vLine.x);
float detail = 1.0 - smoothstep(0.0, 0.0045, vLine.y);
vec3 baseCol = vZoneColor * (1.0 - 0.34 * groove) * (1.0 - 0.18 * detail);
baseCol *= mix(0.48, 1.0, vAO);
vec4 diffuseColor = vec4( baseCol, opacity );`,
      )
      .replace(
        "vec3 totalEmissiveRadiance = emissive;",
        `vec3 totalEmissiveRadiance = vZoneColor * vGlow + vec3(1.0, 0.97, 0.92) * groove * vSelEdge * (0.35 + 0.45 * uPulse);`,
      )
      .replace(
        "#include <opaque_fragment>",
        `float ndv = clamp(dot(normal, normalize(vViewPosition)), 0.0, 1.0);
float rim = pow(1.0 - ndv, 3.0);
outgoingLight += vec3(1.0) * rim * 0.16 * vAO + vZoneColor * rim * vSelW * (0.5 + 0.7 * uPulse);
#include <opaque_fragment>`,
      );
  };
  m.customProgramCacheKey = () => "bh-body-zones";
  return m;
}

/** Thin ink silhouette (inverted hull) so the figure reads on the teal card. */
function makeHullMaterial() {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide,
    uniforms: { uWidth: { value: 0.0045 }, uInk: { value: INK.clone() } },
    vertexShader: `uniform float uWidth;
void main() {
  vec3 p = position + normal * uWidth;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  // push the hull ~7 cm back so shallow creases never pick up stray ink
  gl_Position.z += 0.0015 * gl_Position.w;
}`,
    fragmentShader: `uniform vec3 uInk;
void main() {
  gl_FragColor = vec4(uInk, 1.0);
  #include <colorspace_fragment>
}`,
  });
}

function Body({
  data,
  trained,
  selected,
  onSelect,
  reduced,
}: {
  data: BodyData;
  trained: Set<string>;
  selected: string | null;
  onSelect: (id: string) => void;
  reduced: boolean;
}) {
  const geo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.position, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(data.normal, 3));
    g.setAttribute("aZone", new THREE.BufferAttribute(data.zone, 3));
    g.setAttribute("aLine", new THREE.BufferAttribute(data.line, 2));
    g.setAttribute("aAO", new THREE.BufferAttribute(data.ao, 1));
    g.setIndex(new THREE.BufferAttribute(data.index, 1));
    g.computeBoundingSphere();
    return g;
  }, [data]);
  // coarse proxy (~1/4 of the triangles): raycast target and outline hull
  const pickGeo = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(data.pickPosition, 3));
    g.setIndex(new THREE.BufferAttribute(data.pickIndex, 1));
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
  }, [data]);

  const uniforms = useMemo<ZoneUniforms>(() => {
    const color = new Float32Array(N * 3);
    for (let z = 0; z < N; z++) {
      const c = z === SKIN ? SKIN_COLOR : PALE[z];
      color.set([c.r, c.g, c.b], z * 3);
    }
    return {
      uColor: { value: color },
      uGlow: { value: new Float32Array(N) },
      uLift: { value: new Float32Array(N) },
      uSel: { value: -1 },
      uPulse: { value: 0 },
    };
  }, []);
  const material = useMemo(() => makeBodyMaterial(uniforms), [uniforms]);
  const hull = useMemo(() => makeHullMaterial(), []);
  const pickMat = useMemo(() => new THREE.MeshBasicMaterial({ visible: false }), []);

  useEffect(
    () => () => {
      geo.dispose();
      pickGeo.dispose();
    },
    [geo, pickGeo],
  );
  useEffect(
    () => () => {
      material.dispose();
      hull.dispose();
      pickMat.dispose();
    },
    [material, hull, pickMat],
  );

  const live = useRef({ trained, selected, reduced });
  useEffect(() => {
    live.current = { trained, selected, reduced };
  }, [trained, selected, reduced]);

  const hovered = useRef(-1);
  const setHover = (z: number) => {
    if (hovered.current === z) return;
    hovered.current = z;
    document.body.style.cursor = z >= 0 ? "pointer" : "";
  };
  useEffect(
    () => () => {
      document.body.style.cursor = "";
    },
    [],
  );

  const tmp = useMemo(() => new THREE.Color(), []);
  const target = useMemo(() => new THREE.Color(), []);
  const primed = useRef(false);
  useFrame((state, delta) => {
    const { trained: tr, selected: sel, reduced: rm } = live.current;
    const dt = Math.min(delta, 0.05);
    // first frame snaps to the current state; later changes ease
    const a = primed.current ? 1 - Math.exp(-dt * 10) : 1;
    primed.current = true;
    const selIdx = sel ? ZONES.indexOf(sel as (typeof ZONES)[number]) : -1;
    const pulse = rm ? 0.6 : 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * 3.6);
    const col = uniforms.uColor.value;
    const glow = uniforms.uGlow.value;
    const lift = uniforms.uLift.value;
    for (let z = 0; z < ZONES.length; z++) {
      const isSel = z === selIdx;
      // an untrained selection is tinted toward its area colour so the glow does not wash to white
      if (tr.has(ZONES[z])) target.copy(FULL[z]);
      else target.copy(PALE[z]).lerp(FULL[z], isSel ? 0.45 : 0);
      tmp.setRGB(col[z * 3], col[z * 3 + 1], col[z * 3 + 2]).lerp(target, a);
      col[z * 3] = tmp.r;
      col[z * 3 + 1] = tmp.g;
      col[z * 3 + 2] = tmp.b;
      const isHov = z === hovered.current;
      const gTarget = isSel ? 0.14 + 0.2 * pulse : isHov ? 0.2 : 0;
      glow[z] = isSel ? gTarget : THREE.MathUtils.lerp(glow[z], gTarget, a);
      lift[z] = THREE.MathUtils.lerp(lift[z], isHov ? 0.006 : isSel ? 0.004 : 0, a);
    }
    uniforms.uSel.value = selIdx;
    uniforms.uPulse.value = pulse;
  });

  const zoneOf = (e: ThreeEvent<PointerEvent | MouseEvent>) => {
    const p = e.object.worldToLocal(e.point.clone());
    return data.zoneAt(p.x, p.y, p.z);
  };

  return (
    <group>
      <mesh geometry={geo} material={material} />
      <mesh geometry={pickGeo} material={hull} />
      <mesh
        geometry={pickGeo}
        material={pickMat}
        onPointerMove={(e) => {
          e.stopPropagation();
          const z = zoneOf(e);
          setHover(z === SKIN ? -1 : z);
        }}
        onPointerOut={() => setHover(-1)}
        onClick={(e) => {
          e.stopPropagation();
          if (e.delta > 8) return;
          const z = zoneOf(e);
          if (z !== SKIN) onSelect(ZONES[z]);
        }}
      />
    </group>
  );
}

/** Spins the body to face a muscle; auto-rotates the camera until the user interacts. */
function Rig({
  selected,
  ready,
  reduced,
  controls,
  children,
}: {
  selected: string | null;
  ready: boolean;
  reduced: boolean;
  controls: MutableRefObject<Controls | null>;
  children: ReactNode;
}) {
  const model = useRef<THREE.Group>(null);
  const target = useRef(0);
  const appear = useRef(0);

  useEffect(() => {
    const m = model.current;
    if (!m || !selected) return;
    const az = controls.current?.getAzimuthalAngle() ?? 0;
    const desired = (FRONT.has(selected as (typeof ZONES)[number]) ? 0 : Math.PI) + az;
    const d = ((((desired - m.rotation.y + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
    target.current = m.rotation.y + d;
    if (controls.current) controls.current.autoRotate = false;
  }, [selected, controls]);

  useFrame((_, delta) => {
    const m = model.current;
    if (!m) return;
    const dt = Math.min(delta, 0.05);
    m.rotation.y = THREE.MathUtils.damp(m.rotation.y, target.current, reduced ? 9 : 4, dt);
    if (ready) appear.current = reduced ? 1 : THREE.MathUtils.damp(appear.current, 1, 6, dt);
    const s = 0.94 + 0.06 * appear.current;
    m.scale.set(s, s, s);
    m.visible = ready;
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
  const controls = useRef<Controls | null>(null);
  const [visible, setVisible] = useState(true);
  const [reduced, setReduced] = useState(false);
  const [data, setData] = useState<BodyData | null>(null);

  useEffect(() => {
    let alive = true;
    loadBody()
      .then((d) => {
        if (alive) setData(d);
      })
      .catch(() => {
        /* leave the canvas empty; the page keeps its muscle list */
      });
    return () => {
      alive = false;
    };
  }, []);

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

  // let vertical swipes scroll the page; only horizontal drags rotate
  useEffect(() => {
    const el = controls.current?.domElement as HTMLElement | undefined;
    if (el) el.style.touchAction = "pan-y";
  });

  return (
    <div
      ref={wrap}
      role="img"
      aria-label="Interactive 3D body. Use the muscle buttons beside it for keyboard access."
      className={className}
      style={{ width: "100%", height: "100%", minHeight: 0, touchAction: "pan-y" }}
    >
      <Canvas
        flat
        frameloop={visible ? "always" : "never"}
        dpr={[1, 1.75]}
        gl={{ antialias: true, alpha: true }}
        camera={{ fov: 33.5, position: [0, 0.95, 3.15], near: 0.1, far: 20 }}
        style={{ background: "transparent", touchAction: "pan-y" }}
      >
        <hemisphereLight args={["#ffffff", "#9fb8b2", 0.85]} />
        <directionalLight position={[2.6, 3.2, 2.8]} intensity={3.4} />
        <directionalLight position={[-3, 1.2, 2]} intensity={0.7} color="#ffe6dc" />
        <directionalLight position={[-2.6, 2.6, -3]} intensity={1.9} color="#fff4e8" />
        <directionalLight position={[2.8, 1.4, -2.6]} intensity={1.2} color="#f2fbff" />
        <Rig selected={selected} ready={data !== null} reduced={reduced} controls={controls}>
          {data && <Body data={data} trained={trained} selected={selected} onSelect={onSelect} reduced={reduced} />}
        </Rig>
        {data && (
          <ContactShadows
            position={[0, 0.001, 0]}
            opacity={0.42}
            scale={1.8}
            blur={2.4}
            far={0.6}
            resolution={256}
            frames={1}
            color="#0b1f1d"
          />
        )}
        <OrbitControls
          ref={controls}
          target={[0, 0.905, 0]}
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
