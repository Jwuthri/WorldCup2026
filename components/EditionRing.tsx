"use client";

/**
 * EditionRing — the dataset chooser. Every competition-season is a lit monolith on a
 * carousel ring; the face carries that season's real competitive shape as a skyline
 * (league points, or goals scored at a tournament), so no two tiles look alike.
 *
 * Scroll / drag / arrow keys spin the ring. Enter flies the front card at the camera
 * and hands off to its dataset.
 *
 * No-WebGL or prefers-reduced-motion gets a plain grid of the same cards — same links,
 * same numbers, no scene.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import * as THREE from "three";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Grid } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import type { Edition } from "@/lib/editions";

const BG = "#050d08";
const CARD_W = 2.4;
const CARD_H = 1.5;
const RADIUS = 5.2;

/* ---------------- helpers ---------------- */

const hexA = (hex: string, a: number) => {
  const h = hex.replace("#", "");
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

const nf = new Intl.NumberFormat("en-US");

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

/** next/font hands us generated family names through CSS variables */
function fonts(): { display: string; data: string } {
  if (typeof window === "undefined") return { display: "sans-serif", data: "monospace" };
  const v = (name: string) => getComputedStyle(document.body).getPropertyValue(name).trim();
  return {
    display: v("--font-barlow") || "'Arial Narrow', sans-serif",
    data: v("--font-plex-mono") || "monospace",
  };
}

const nfInt = new Intl.NumberFormat("en-US");

/* ---------------- card face ---------------- */

/**
 * The card face, painted as an editorial data plate: near-black ground, hairline
 * rules, one accent, and the season's real shape as the only ink that shouts.
 * Deliberately NOT a neon-bordered slab — the border lives here as a 1px stroke so
 * it stays crisp at any distance instead of glowing.
 */
function drawCard(ctx: CanvasRenderingContext2D, w: number, h: number, ed: Edition, f: { display: string; data: string }) {
  const px = w * 0.068;
  const ls = (v: number) => ((ctx as any).letterSpacing = `${v}px`); // Chromium-only, no-op elsewhere

  // ground: almost black, lifted by a breath of the accent at the base
  ctx.fillStyle = "#060d09";
  ctx.fillRect(0, 0, w, h);
  const wash = ctx.createLinearGradient(0, h * 0.35, 0, h);
  wash.addColorStop(0, hexA(ed.accent, 0));
  wash.addColorStop(1, hexA(ed.accent, 0.07));
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, w, h);

  // the season's shape, tallest first
  const vals = ed.skyline.length ? ed.skyline : [1];
  const max = Math.max(...vals, 1);
  const base = h * 0.775;
  const maxH = h * 0.40;
  const slot = (w - 2 * px) / vals.length;
  const barW = Math.max(1.5, slot * 0.62);
  vals.forEach((v, i) => {
    const bh = Math.max(h * 0.006, (v / max) * maxH);
    const g = ctx.createLinearGradient(0, base - bh, 0, base);
    g.addColorStop(0, hexA(ed.accent, 0.95));
    g.addColorStop(1, hexA(ed.accent, 0.10));
    ctx.fillStyle = g;
    ctx.fillRect(px + i * slot + (slot - barW) / 2, base - bh, barW, bh);
  });
  // baseline: a hairline, not a bar
  ctx.fillStyle = hexA(ed.accent, 0.5);
  ctx.fillRect(px, base, w - 2 * px, Math.max(1, h * 0.002));

  ctx.textBaseline = "alphabetic";

  // eyebrow
  ls(h * 0.016);
  ctx.fillStyle = "rgba(148,167,150,0.85)";
  ctx.font = `500 ${Math.round(h * 0.042)}px ${f.display}`;
  ctx.fillText(`${ed.country.toUpperCase()}  ·  ${ed.season}`, px, h * 0.135);

  // title
  ls(0);
  ctx.fillStyle = "#edf2e8";
  ctx.font = `700 ${Math.round(h * 0.15)}px ${f.display}`;
  ctx.fillText(ed.name.toUpperCase(), px - h * 0.004, h * 0.30);

  // hairline rule under the masthead
  ctx.fillStyle = "rgba(237,242,232,0.10)";
  ctx.fillRect(px, h * 0.365, w - 2 * px, 1);

  // caption + the one hero number
  ls(h * 0.014);
  ctx.fillStyle = "rgba(125,143,128,0.9)";
  ctx.font = `500 ${Math.round(h * 0.038)}px ${f.display}`;
  ctx.fillText(ed.skylineLabel.toUpperCase(), px, h * 0.865);

  ls(0);
  ctx.textAlign = "right";
  ctx.fillStyle = hexA(ed.accent, 0.95);
  ctx.font = `500 ${Math.round(h * 0.062)}px ${f.data}`;
  ctx.fillText(`${nfInt.format(ed.goals)} goals`, w - px, h * 0.872);
  ctx.textAlign = "left";

  // edges: a hairline frame plus a glass highlight along the top
  ctx.strokeStyle = hexA(ed.accent, 0.30);
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  const top = ctx.createLinearGradient(0, 0, 0, h * 0.18);
  top.addColorStop(0, "rgba(237,242,232,0.09)");
  top.addColorStop(1, "rgba(237,242,232,0)");
  ctx.fillStyle = top;
  ctx.fillRect(0, 0, w, h * 0.18);
}

export type CardArt = { face: THREE.Texture; reflection: THREE.Texture };

/** all faces painted in one pass, outside the Canvas, once the display webfont lands */
function useCardTextures(editions: Edition[]): (CardArt | null)[] {
  const [texes, setTexes] = useState<(CardArt | null)[]>([]);
  useEffect(() => {
    let dead = false;
    const build = () => {
      if (dead) return;
      const family = fonts();
      const W = 1400;
      const H = Math.round((1400 * CARD_H) / CARD_W);

      const tex = (c: HTMLCanvasElement) => {
        const t = new THREE.CanvasTexture(c);
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 4;
        return t;
      };

      setTexes(
        editions.map((ed) => {
          const face = document.createElement("canvas");
          face.width = W;
          face.height = H;
          const fc = face.getContext("2d");
          if (!fc) return null;
          drawCard(fc, W, H, ed, family);

          // the reflection is baked flipped AND faded. Reusing the face texture with a
          // negative scale left mirror-image text legible on the floor, which reads as a
          // duplicate card rather than a reflection; the alpha ramp is what sells it.
          const refl = document.createElement("canvas");
          refl.width = W;
          refl.height = H;
          const rc = refl.getContext("2d");
          if (!rc) return null;
          rc.translate(0, H);
          rc.scale(1, -1);
          rc.drawImage(face, 0, 0);
          rc.setTransform(1, 0, 0, 1, 0, 0);
          // after the flip, canvas y=0 is the card's BOTTOM edge, and a plane maps y=0 to
          // its top — which is the edge nearest the card. So keep the top, erase downward.
          const fade = rc.createLinearGradient(0, 0, 0, H);
          // fully gone by the halfway mark, so the mirrored masthead never reads as text
          fade.addColorStop(0, "rgba(0,0,0,0)"); // touching the card: kept
          fade.addColorStop(0.22, "rgba(0,0,0,0.72)");
          fade.addColorStop(0.5, "rgba(0,0,0,1)"); // far from the card: erased
          fade.addColorStop(1, "rgba(0,0,0,1)");
          rc.globalCompositeOperation = "destination-out";
          rc.fillStyle = fade;
          rc.fillRect(0, 0, W, H);

          return { face: tex(face), reflection: tex(refl) };
        })
      );
    };
    if (document.fonts) document.fonts.ready.then(build);
    else build();
    return () => {
      dead = true;
    };
  }, [editions]);
  return texes;
}

const glowTexture = (() => {
  let cached: THREE.Texture | null = null;
  return () => {
    if (cached) return cached;
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const x = c.getContext("2d")!;
    const g = x.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.32, "rgba(255,255,255,0.4)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    x.fillStyle = g;
    x.fillRect(0, 0, 256, 256);
    cached = new THREE.CanvasTexture(c);
    cached.colorSpace = THREE.SRGBColorSpace;
    return cached;
  };
})();

/* ---------------- scene ---------------- */

type CardProps = {
  ed: Edition;
  i: number;
  step: number;
  rot: { current: number };
  launch: { current: number };
  art: CardArt | null;
  onSelect: (i: number) => void;
};

function Card({ ed, i, step, rot, launch, art, onSelect }: CardProps) {
  const grp = useRef<THREE.Group>(null);
  const halo = useRef<THREE.MeshBasicMaterial>(null);
  const mirror = useRef<THREE.MeshBasicMaterial>(null);
  const glow = useMemo(glowTexture, []);
  const theta = i * step;
  const home = useMemo(
    () => new THREE.Vector3(Math.sin(theta) * RADIUS, 0, Math.cos(theta) * RADIUS),
    [theta]
  );

  useFrame((state) => {
    const g = grp.current;
    if (!g) return;
    // wrapped to (-pi, pi] — the raw sum reads ~308 deg for the card one step to the
    // left, and the cover-flow turn below needs the signed distance from the front
    const raw = theta + rot.current;
    const a = Math.atan2(Math.sin(raw), Math.cos(raw));
    const front = Math.max(0, Math.cos(a));
    const f = front * front * front; // 1 only when it's really at the front
    const t = state.clock.elapsedTime;

    // the front card is the one being launched, so it rides toward the camera
    const fly = launch.current * f;
    g.position.set(home.x * (1 - fly * 0.55), 0, home.z + fly * 4.6);
    g.position.y = 0.13 * f + Math.sin(t * 0.55 + i * 1.7) * 0.022;
    g.scale.setScalar(1 + 0.07 * f + fly * 0.5);
    // cover-flow: neighbours turn only part-way instead of going edge-on, while the
    // front card squares up to the camera (world facing = 0.42 * a, zero at the front)
    g.rotation.y = a * 0.42 - rot.current;

    if (halo.current) halo.current.opacity = 0.02 + 0.09 * f + fly * 0.2;
    if (mirror.current) mirror.current.opacity = (0.02 + 0.12 * f) * (1 - launch.current);
  });

  return (
    <group ref={grp} position={home} rotation={[0, theta, 0]}>
      {/* a whisper of accent behind the slab, so it sits in air rather than on nothing */}
      <mesh position={[0, 0, -0.2]}>
        <planeGeometry args={[CARD_W * 1.2, CARD_H * 1.3]} />
        <meshBasicMaterial
          ref={halo}
          map={glow}
          color={ed.accent}
          transparent
          opacity={0.03}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>

      {/* the slab: real thickness, matte, so the plate reads as an object. Its front
          face sits behind the artwork — coplanar with it, the two z-fight into bands. */}
      <mesh position={[0, 0, -0.055]}>
        <boxGeometry args={[CARD_W + 0.02, CARD_H + 0.02, 0.08]} />
        <meshBasicMaterial color="#0c1712" />
      </mesh>

      <mesh
        onPointerDown={(e) => {
          e.stopPropagation();
          onSelect(i);
        }}
      >
        <planeGeometry args={[CARD_W, CARD_H]} />
        {/* the key matters: gaining a map changes the shader, and three won't recompile
            an existing material for it — it would just render the flat colour */}
        <meshBasicMaterial
          key={art ? "mapped" : "plain"}
          map={art?.face ?? null}
          color={art ? "#ffffff" : "#0a1410"}
          toneMapped={false}
        />
      </mesh>

      {/* reflection on the polished floor: pre-flipped and pre-faded (see useCardTextures) */}
      <mesh position={[0, -CARD_H * 0.71, 0]} scale={[1, 0.42, 1]}>
        <planeGeometry args={[CARD_W, CARD_H]} />
        <meshBasicMaterial
          key={art ? "refl" : "none"}
          ref={mirror}
          map={art?.reflection ?? null}
          color="#ffffff"
          transparent
          opacity={0.05}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  );
}

/** keep the front card fully in frame on any aspect ratio */
function Rig() {
  const { camera, size } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    // a freshly opened tab can report 0x0, and 0/0 would push NaN into the camera
    // matrix, which renders nothing at all and never recovers
    if (!size.width || !size.height) return;
    const aspect = Math.max(0.35, size.width / size.height);
    const halfV = THREE.MathUtils.degToRad(cam.fov) / 2;
    const halfH = Math.atan(Math.tan(halfV) * aspect);
    const needW = (CARD_W / 2) * 1.5 / Math.tan(halfH);
    const needH = (CARD_H / 2) * 3.1 / Math.tan(halfV);
    const back = THREE.MathUtils.clamp(Math.max(needW, needH), 3.4, 13);
    cam.position.set(0, 0.8, RADIUS + back);
    // aim below the front card so it sits high and the stat rail owns the lower third
    cam.lookAt(0, -0.42, RADIUS);
    cam.updateProjectionMatrix();
  }, [camera, size]);
  return null;
}

function Ring({
  editions,
  index,
  launching,
  texes,
  onSelect,
  reduced,
}: {
  editions: Edition[];
  index: number;
  launching: boolean;
  texes: (CardArt | null)[];
  onSelect: (i: number) => void;
  reduced: boolean;
}) {
  const grp = useRef<THREE.Group>(null);
  const rot = useRef(0);
  const target = useRef(0);
  const launch = useRef(0);
  const seen = useRef(index);
  const n = editions.length;
  const step = (Math.PI * 2) / n;

  useEffect(() => {
    // move by whole steps only, the short way round. Nudging the target by an exact
    // number of steps keeps it on the grid; solving for an absolute angle and folding
    // it into the nearest turn does not, and the ring ends up parked between cards.
    let d = (((index - seen.current) % n) + n) % n;
    if (d > n / 2) d -= n;
    target.current -= d * step;
    seen.current = index;
  }, [index, n, step]);

  useFrame((_, dt) => {
    const k = reduced ? 1 : 1 - Math.pow(0.0016, Math.min(dt, 0.05));
    rot.current += (target.current - rot.current) * k;
    launch.current += ((launching ? 1 : 0) - launch.current) * (reduced ? 1 : 1 - Math.pow(0.05, Math.min(dt, 0.05)));
    if (grp.current) grp.current.rotation.y = rot.current;
  });

  return (
    <>
      <group ref={grp}>
        {editions.map((ed, i) => (
          <Card
            key={ed.slug}
            ed={ed}
            i={i}
            step={step}
            rot={rot}
            launch={launch}
            art={texes[i] ?? null}
            onSelect={onSelect}
          />
        ))}
      </group>
      <Grid
        position={[0, -1.22, 0]}
        args={[40, 40]}
        cellSize={0.9}
        cellThickness={0.4}
        cellColor="#0d1c13"
        sectionSize={4.5}
        sectionThickness={0.6}
        sectionColor="#16281d"
        fadeDistance={21}
        fadeStrength={1.8}
        infiniteGrid
      />
    </>
  );
}

/* ---------------- component ---------------- */

export default function EditionRing({ editions }: { editions: Edition[] }) {
  const router = useRouter();
  const reduced = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [launching, setLaunching] = useState(false);
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const wheelAcc = useRef(0);
  const drag = useRef<{ x: number; moved: boolean } | null>(null);

  const texes = useCardTextures(editions);

  const n = editions.length;
  // index is always 0..n-1; the ring below turns the short way on its own, so nothing
  // here has to track winding — that is what let the overlay and the scene drift apart
  const current = editions[index];

  useEffect(() => {
    try {
      const c = document.createElement("canvas");
      const gl = c.getContext("webgl2") ?? c.getContext("webgl");
      setWebgl(!!gl);
      // hand the context straight back — browsers cap how many can be live at once,
      // and a probe that keeps one starves the real canvas after a few remounts
      gl?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      setWebgl(false);
    }
  }, []);

  const move = useCallback((d: number) => setIndex((i) => (i + d + n) % n), [n]);

  const open = useCallback(
    (ed: Edition) => {
      if (launching) return;
      if (reduced) {
        router.push(ed.href);
        return;
      }
      setLaunching(true);
      window.setTimeout(() => router.push(ed.href), 520);
    },
    [launching, reduced, router]
  );

  // clicking the front card opens it; clicking any other brings it to the front
  const onSelect = useCallback(
    (i: number) => (i === index ? open(editions[i]) : setIndex(i)),
    [editions, index, open]
  );

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); move(1); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); move(-1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(current); }
  };

  const stats: [string, string][] = [
    [current.crownLabel, current.crown ?? "—"],
    ["Matches", nf.format(current.matches)],
    ["Goals", nf.format(current.goals)],
    ["Per game", current.goalsPerGame != null ? current.goalsPerGame.toFixed(2) : "—"],
    ["Top scorer", current.topScorer ? `${current.topScorer.player} · ${current.topScorer.value}` : "—"],
  ];

  return (
    <div
      className="relative isolate h-[100svh] w-full touch-pan-y select-none overflow-hidden"
      style={{ background: BG }}
      tabIndex={0}
      onKeyDown={onKey}
      role="group"
      aria-label="Choose a dataset"
      onWheel={(e) => {
        wheelAcc.current += e.deltaY + e.deltaX;
        if (Math.abs(wheelAcc.current) > 90) {
          move(Math.sign(wheelAcc.current));
          wheelAcc.current = 0;
        }
      }}
      onPointerDown={(e) => (drag.current = { x: e.clientX, moved: false })}
      onPointerMove={(e) => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x;
        if (Math.abs(dx) > 60) {
          move(dx < 0 ? 1 : -1);
          d.x = e.clientX;
          d.moved = true;
        }
      }}
      onPointerUp={() => (drag.current = null)}
      onPointerLeave={() => (drag.current = null)}
    >
      {webgl && !reduced ? (
        <Canvas
          className="absolute inset-0"
          camera={{ position: [0, 0.85, 10.4], fov: 40, near: 0.1, far: 60 }}
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: false, powerPreference: "high-performance" }}
        >
          <color attach="background" args={["#030806"]} />
          <fog attach="fog" args={["#030806", 8.5, 16]} />
          <ambientLight intensity={0.8} />
          <Rig />
          <Ring
            editions={editions}
            index={index}
            launching={launching}
            texes={texes}
            onSelect={onSelect}
            reduced={reduced}
          />
          <EffectComposer>
            <Bloom luminanceThreshold={0.62} intensity={0.32} mipmapBlur radius={0.5} />
            <Vignette offset={0.28} darkness={0.62} eskil={false} />
          </EffectComposer>
        </Canvas>
      ) : (
        <FlatGrid editions={editions} />
      )}

      {webgl && !reduced && (
        <>
          {/* top rail */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex flex-col items-center gap-1 px-4 pt-6 text-center">
            <p className="eyebrow">{n} datasets · every number harvested from public feeds</p>
            <p className="display text-sm font-semibold text-dim">
              scroll, drag or use ← → · enter to open
            </p>
          </div>

          {/* stat rail under the front card */}
          <div className="pointer-events-none absolute inset-x-0 bottom-0 px-4 pb-7 sm:pb-9">
            <div className="mx-auto max-w-5xl">
              <p className="eyebrow text-center" style={{ color: current.accent }}>
                {current.country}
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-5">
                {stats.map(([k, v]) => (
                  <div key={k} className="text-center">
                    <dt className="eyebrow truncate">{k}</dt>
                    <dd className="data mt-0.5 truncate text-sm text-chalk sm:text-base">{v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 flex items-center justify-center gap-4">
                <button
                  type="button"
                  onClick={() => move(-1)}
                  aria-label="Previous dataset"
                  className="pointer-events-auto rounded-full border border-pitchline px-3 py-2 text-dim transition hover:border-chalk hover:text-chalk"
                >
                  ‹
                </button>
                <button
                  type="button"
                  onClick={() => open(current)}
                  aria-label={`Open ${current.name} ${current.season}`}
                  className="pointer-events-auto rounded-full px-7 py-3 font-semibold text-bg transition"
                  style={{ background: current.accent }}
                >
                  <span className="display">
                    {current.depth === "full" ? "Enter the data theater" : "Open the season"}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => move(1)}
                  aria-label="Next dataset"
                  className="pointer-events-auto rounded-full border border-pitchline px-3 py-2 text-dim transition hover:border-chalk hover:text-chalk"
                >
                  ›
                </button>
              </div>

              <p className="eyebrow mt-3 text-center" style={{ opacity: 0.7 }}>
                {current.depth === "full"
                  ? `Full per-match data · ${current.matches} matches`
                  : "Final table + leaders · per-match data not harvested yet"}
              </p>

              <div className="mt-5 flex items-center justify-center gap-2">
                {editions.map((ed, i) => (
                  // the bar is 6px tall; the button around it carries a real hit area
                  <button
                    key={ed.slug}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-label={`${ed.name} ${ed.season}`}
                    aria-current={i === index}
                    className="pointer-events-auto grid place-items-center px-1.5 py-3"
                  >
                    <span
                      className="block h-1.5 rounded-full transition-all"
                      style={{
                        width: i === index ? 26 : 6,
                        background: i === index ? ed.accent : "var(--line)",
                      }}
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* launch wash */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 transition-opacity duration-500"
            style={{ background: current.accent, opacity: launching ? 1 : 0 }}
          />
        </>
      )}

      {/* always present: real links for keyboard, screen readers and crawlers */}
      <nav className="sr-only" aria-label="All datasets">
        <ul>
          {editions.map((ed) => (
            <li key={ed.slug}>
              <Link href={ed.href}>
                {ed.name} {ed.season} — {ed.matches} matches, {ed.goals} goals
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/* ---------------- fallback ---------------- */

function FlatGrid({ editions }: { editions: Edition[] }) {
  return (
    <div className="h-full overflow-y-auto px-4 py-10">
      <p className="eyebrow mb-6 text-center">{editions.length} datasets · pick one</p>
      <ul className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {editions.map((ed) => (
          <li key={ed.slug}>
            <Link
              href={ed.href}
              className="block rounded-lg border border-pitchline bg-surface p-5 transition hover:border-chalk"
              style={{ borderLeft: `3px solid ${ed.accent}` }}
            >
              <p className="display text-2xl font-bold text-chalk">{ed.name}</p>
              <p className="data text-sm" style={{ color: ed.accent }}>
                {ed.season} · {ed.country}
              </p>
              <dl className="mt-4 grid grid-cols-3 gap-2">
                {[
                  [ed.crownLabel, ed.crown ?? "—"],
                  ["Matches", nf.format(ed.matches)],
                  ["Goals", nf.format(ed.goals)],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="eyebrow truncate">{k}</dt>
                    <dd className="data mt-0.5 truncate text-sm text-chalk">{v}</dd>
                  </div>
                ))}
              </dl>
              <p className="eyebrow mt-4" style={{ opacity: 0.7 }}>
                {ed.depth === "full" ? "Full per-match data" : "Table + leaders only"}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
