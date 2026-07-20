"use client";

/**
 * ShotScene3D — every shot of a match as a 3D trajectory into (or past) a goal
 * at the +X end of a 105x68 pitch. X along pitch (goal line +52.5), Y up, Z across.
 *
 * Goal-mouth semantics (verified against raw 365scores data):
 *   gateY = % of PITCH WIDTH (68m). The 7.32m frame spans 44.6%..55.4%.
 *   gateZ = height off the ground on a ~8m scale (crossbar 2.44m ≈ 30.5%).
 * So misses land where they really went — wide of the post, over the bar.
 * Blocked shots (gateY set, gateZ null) get a short interrupted arc.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Html, useCursor } from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";

export type Shot3D = {
  x: number; // pitch meters 0..105 toward goal at 105
  y: number; // pitch meters 0..68
  gateY: number | null;
  gateZ: number | null;
  goal: boolean;
  onTarget: boolean;
  color: string;
  xg: number | null;
  player: string;
  minute: string;
};

type Props = { shots: Shot3D[]; homeName: string; awayName: string; title: string };

const PITCH_L = 105, PITCH_W = 68, HALF_L = 52.5, HALF_W = 34;
const GOAL_W = 7.32, GOAL_H = 2.44;
const GATE_Z_SCALE = 8; // gateZ 100% ≈ 8m off the ground
const BG = "#050d08", GOLD = "#e3be56", CHALK = "#edf2e8";

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const cleanMin = (m: string) => m.replace(/[′']/g, "").trim();

function hash01(n: number, salt: number): number {
  let h = (n * 374761393 + salt * 668265263) >>> 0;
  h = (h ^ (h >>> 13)) >>> 0;
  h = Math.imul(h, 1274126177) >>> 0;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

/* ---------------- pitch ---------------- */

function drawPitch(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const M = (m: number) => (m * w) / PITCH_L;
  ctx.fillStyle = "#0b1a10";
  ctx.fillRect(0, 0, w, h);
  for (let i = 1; i < 14; i += 2) {
    ctx.fillStyle = "rgba(237,242,232,0.022)";
    ctx.fillRect((i * w) / 14, 0, w / 14, h);
  }
  ctx.strokeStyle = "rgba(237,242,232,0.45)";
  ctx.fillStyle = "rgba(237,242,232,0.45)";
  ctx.lineWidth = Math.max(3, M(0.15));
  ctx.strokeRect(ctx.lineWidth, ctx.lineWidth, w - 2 * ctx.lineWidth, h - 2 * ctx.lineWidth);
  ctx.beginPath(); ctx.moveTo(w / 2, 0); ctx.lineTo(w / 2, h); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, h / 2, M(9.15), 0, Math.PI * 2); ctx.stroke();
  for (const end of [0, 1] as const) {
    const x0 = end === 0 ? ctx.lineWidth : w - ctx.lineWidth;
    const dir = end === 0 ? 1 : -1;
    ctx.strokeRect(Math.min(x0, x0 + dir * M(16.5)), h / 2 - M(20.16), M(16.5), M(40.32));
    ctx.strokeRect(Math.min(x0, x0 + dir * M(5.5)), h / 2 - M(9.16), M(5.5), M(18.32));
    ctx.beginPath(); ctx.arc(x0 + dir * M(11), h / 2, M(0.3), 0, Math.PI * 2); ctx.fill();
  }
}

function Pitch() {
  const texture = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = 2100; c.height = 1360;
    const ctx = c.getContext("2d");
    if (ctx) drawPitch(ctx, c.width, c.height);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  }, []);
  useEffect(() => () => texture.dispose(), [texture]);
  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PITCH_L, PITCH_W]} />
        <meshStandardMaterial map={texture} roughness={1} metalness={0} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, 0]}>
        <planeGeometry args={[500, 500]} />
        <meshStandardMaterial color={BG} roughness={1} metalness={0} />
      </mesh>
    </group>
  );
}

/* ---------------- goal: posts, crossbar, net ---------------- */

function GoalFrame() {
  const post = useMemo(() => new THREE.CylinderGeometry(0.09, 0.09, 1, 12), []);
  const mat = useMemo(() => new THREE.MeshStandardMaterial({ color: CHALK, roughness: 0.3, metalness: 0.15 }), []);
  const netMat = useMemo(
    () => new THREE.MeshBasicMaterial({ color: CHALK, wireframe: true, transparent: true, opacity: 0.12, depthWrite: false }),
    []
  );
  useEffect(() => () => { post.dispose(); mat.dispose(); netMat.dispose(); }, [post, mat, netMat]);
  const D = 1.9; // net depth
  return (
    <group position={[HALF_L, 0, 0]}>
      <mesh geometry={post} material={mat} position={[0, GOAL_H / 2, -GOAL_W / 2]} scale={[1, GOAL_H, 1]} />
      <mesh geometry={post} material={mat} position={[0, GOAL_H / 2, GOAL_W / 2]} scale={[1, GOAL_H, 1]} />
      <mesh geometry={post} material={mat} position={[0, GOAL_H, 0]} rotation={[Math.PI / 2, 0, 0]} scale={[1, GOAL_W + 0.18, 1]} />
      {/* net: segmented wireframe planes — back, roof, both sides */}
      <mesh material={netMat} position={[D, GOAL_H / 2, 0]} rotation={[0, Math.PI / 2, 0]}>
        <planeGeometry args={[GOAL_W, GOAL_H, 16, 6]} />
      </mesh>
      <mesh material={netMat} position={[D / 2, GOAL_H, 0]} rotation={[-Math.PI / 2, 0, Math.PI / 2]}>
        <planeGeometry args={[GOAL_W, D, 16, 4]} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} material={netMat} position={[D / 2, GOAL_H / 2, (s * GOAL_W) / 2]}>
          <planeGeometry args={[D, GOAL_H, 4, 6]} />
        </mesh>
      ))}
    </group>
  );
}

/* ---------------- arcs ---------------- */

const isBlocked = (s: Shot3D) => !s.onTarget && s.gateY != null && s.gateZ == null;

function endPoint(s: Shot3D, i: number): THREE.Vector3 {
  if (s.gateY != null) {
    // real landing: gateY % of pitch width -> world Z; gateZ on the ~8m scale -> height
    const z = clamp((s.gateY / 100) * PITCH_W - HALF_W, -HALF_W, HALF_W);
    const y = s.gateZ != null ? clamp((s.gateZ / 100) * GATE_Z_SCALE, 0.06, 9) : 0.4;
    const behind = s.goal ? 1.1 : s.onTarget ? 0.0 : 1.6; // goals ripple the net
    return new THREE.Vector3(HALF_L + behind, y, z);
  }
  // no data at all (rare): deterministic wide/over
  const side = hash01(i, 4) < 0.5 ? -1 : 1;
  return hash01(i, 3) < 0.62
    ? new THREE.Vector3(HALF_L + 1.4, 0.3 + hash01(i, 6), side * (GOAL_W / 2 + 1 + hash01(i, 5) * 2))
    : new THREE.Vector3(HALF_L + 1.4, GOAL_H + 0.6 + hash01(i, 8) * 1.4, (hash01(i, 7) - 0.5) * (GOAL_W + 2));
}

type Built = {
  geo: THREE.TubeGeometry;
  mat: THREE.MeshStandardMaterial;
  end: THREE.Vector3;
  start: THREE.Vector3;
  maxIndex: number;
  shot: Shot3D;
  minute: number;
};

function buildArcs(shots: Shot3D[]) {
  const materials = new Map<string, THREE.MeshStandardMaterial>();
  const matFor = (s: Shot3D) => {
    const kind = s.goal ? "goal" : s.onTarget ? "on" : "off";
    const key = `${kind}|${s.color}`;
    let m = materials.get(key);
    if (!m) {
      m =
        kind === "goal"
          ? new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 1.9, roughness: 0.3, toneMapped: false })
          : kind === "on"
            ? new THREE.MeshStandardMaterial({ color: s.color, emissive: s.color, emissiveIntensity: 0.75, roughness: 0.45 })
            : new THREE.MeshStandardMaterial({ color: s.color, transparent: true, opacity: 0.4, depthWrite: false, roughness: 0.6 });
      materials.set(key, m);
    }
    return m;
  };

  const items: Built[] = shots.map((s, i) => {
    const start = new THREE.Vector3(Math.min(clamp(s.x, 0, PITCH_L) - HALF_L, HALF_L - 1.5), 0.06, clamp(s.y, 0, PITCH_W) - HALF_W);
    let end = endPoint(s, i);
    if (isBlocked(s)) {
      // interrupted: stop ~22% toward where it was heading, at boot height
      end = start.clone().lerp(end, 0.22);
      end.y = 0.5;
    }
    const mid = start.clone().add(end).multiplyScalar(0.5);
    const dist = start.distanceTo(end);
    mid.y = Math.max(start.y, end.y) * 0.6 + 0.7 + Math.min(dist * 0.11, 3.8);
    const curve = new THREE.QuadraticBezierCurve3(start, mid, end);
    const geo = new THREE.TubeGeometry(curve, 48, s.goal ? 0.17 : s.onTarget ? 0.11 : 0.08, 6, false);
    return { geo, mat: matFor(s), end, start, maxIndex: geo.index?.count ?? 0, shot: s, minute: parseInt(cleanMin(s.minute)) || 0 };
  });
  items.sort((a, b) => a.minute - b.minute);
  return { items, materials: [...materials.values()], ballGeo: new THREE.SphereGeometry(0.4, 16, 12), ringGeo: new THREE.RingGeometry(0.72, 1, 28) };
}

const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

function ShotArcs({ shots }: { shots: Shot3D[] }) {
  const reduced = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  useCursor(hovered != null);
  const built = useMemo(() => buildArcs(shots), [shots]);
  const balls = useRef<(THREE.Mesh | null)[]>([]);
  // skip the reveal when frozen (hidden tab) or reduced motion — arcs must never be stuck invisible
  const done = useRef(false);
  const t0 = useRef<number | null>(null);

  useEffect(() => {
    const skip = reduced || document.visibilityState === "hidden";
    for (const [i, it] of built.items.entries()) {
      it.geo.setDrawRange(0, skip ? Infinity : 0);
      balls.current[i]?.scale.setScalar(skip ? 1 : 0.001);
    }
    done.current = skip;
    t0.current = null;
    return () => {
      built.items.forEach((it) => it.geo.dispose());
      built.materials.forEach((m) => m.dispose());
      built.ballGeo.dispose();
      built.ringGeo.dispose();
    };
  }, [built, reduced]);

  useFrame(({ clock }) => {
    if (done.current) return;
    if (t0.current == null) t0.current = clock.elapsedTime;
    const t = clock.elapsedTime - t0.current + 0.4;
    let all = true;
    built.items.forEach((it, i) => {
      const p = clamp((t - i * 0.12) / 0.6, 0, 1);
      if (p < 1) all = false;
      it.geo.setDrawRange(0, Math.round(it.maxIndex * easeOut(p)));
      balls.current[i]?.scale.setScalar(p === 1 ? (it.shot.goal ? 1.4 : 1) : 0.001);
    });
    if (all) done.current = true;
  });

  return (
    <group>
      {built.items.map((it, i) => (
        <group key={i}>
          <mesh
            geometry={it.geo}
            material={it.mat}
            onPointerOver={(e) => { e.stopPropagation(); setHovered(i); }}
            onPointerOut={() => setHovered((h) => (h === i ? null : h))}
          />
          {/* origin ring sized by xG */}
          <mesh geometry={built.ringGeo} position={[it.start.x, 0.02, it.start.z]} rotation={[-Math.PI / 2, 0, 0]}
            scale={0.55 + (it.shot.xg ?? 0.03) * 2.4}>
            <meshBasicMaterial color={it.shot.goal ? GOLD : it.shot.color} transparent opacity={0.5} depthWrite={false} />
          </mesh>
          <mesh ref={(m) => { balls.current[i] = m; }} geometry={built.ballGeo} material={it.mat} position={it.end} />
          {(it.shot.goal || hovered === i) && (
            <Html position={[it.end.x, it.end.y + 1.2, it.end.z]} center distanceFactor={30}
              style={{ pointerEvents: "none", whiteSpace: "nowrap" }}>
              <span className="eyebrow rounded border border-pitchline bg-bg/85 px-2 py-1"
                style={{ color: it.shot.goal ? GOLD : CHALK }}>
                {it.shot.player || "shot"} {cleanMin(it.shot.minute)}&#8242;
                {it.shot.xg != null ? ` · xG ${it.shot.xg.toFixed(2)}` : ""}
                {it.shot.goal ? " · GOAL" : it.shot.onTarget ? " · saved" : isBlocked(it.shot) ? " · blocked" : " · off target"}
              </span>
            </Html>
          )}
        </group>
      ))}
    </group>
  );
}

function SceneControls() {
  const reduced = useReducedMotion();
  const [interacted, setInteracted] = useState(false);
  return (
    <OrbitControls
      makeDefault
      enableDamping
      dampingFactor={0.08}
      enablePan={false}
      minDistance={8}
      maxDistance={130}
      maxPolarAngle={Math.PI / 2 - 0.05}
      target={[41, 1.2, 0]}
      autoRotate={!reduced && !interacted}
      autoRotateSpeed={0.35}
      onStart={() => setInteracted(true)}
    />
  );
}

/* ---------------- component ---------------- */

export default function ShotScene3D({ shots, homeName, awayName, title }: Props) {
  const goals = shots.filter((s) => s.goal).length;
  return (
    <div
      className="relative h-full w-full"
      role="img"
      aria-label={`3D shot map, ${title}: ${shots.length} shots, ${goals} ${goals === 1 ? "goal" : "goals"}, shown as arcs into one goal frame`}
      style={{ background: BG }}
    >
      <Canvas
        camera={{ position: [24, 13, 38], fov: 42, near: 0.5, far: 500 }}
        dpr={[1, 2]}
        gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
      >
        <color attach="background" args={[BG]} />
        <fog attach="fog" args={[BG, 90, 300]} />
        <ambientLight intensity={0.5} />
        <directionalLight position={[30, 50, 20]} intensity={1.15} color="#fff7e0" />
        <pointLight position={[HALF_L - 2, 7, 0]} intensity={140} color={GOLD} distance={44} />
        <Pitch />
        <GoalFrame />
        <ShotArcs shots={shots} />
        <SceneControls />
        <EffectComposer>
          <Bloom luminanceThreshold={0.32} intensity={0.75} mipmapBlur radius={0.7} />
        </EffectComposer>
      </Canvas>

      <div className="pointer-events-none absolute left-4 top-4">
        <p className="display text-xl font-semibold text-chalk">{title}</p>
        <p className="eyebrow mt-0.5">{homeName} + {awayName} · all shots toward one goal · hover an arc</p>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-4 flex flex-wrap items-center gap-x-4 gap-y-1">
        {[
          { bg: GOLD, opacity: 1, label: "goal" },
          { bg: CHALK, opacity: 0.9, label: "on target (team colour)" },
          { bg: CHALK, opacity: 0.3, label: "off target / blocked" },
        ].map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: s.bg, opacity: s.opacity }} />
            <span className="eyebrow">{s.label}</span>
          </span>
        ))}
        <span className="eyebrow" style={{ opacity: 0.55 }}>drag to orbit · pinch or scroll to zoom</span>
      </div>
    </div>
  );
}
