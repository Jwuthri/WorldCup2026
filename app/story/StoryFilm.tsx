"use client";

import { useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import PlayerCard from "@/components/PlayerCard";
import type { Card } from "@/lib/cards";

gsap.registerPlugin(useGSAP, ScrollTrigger);
ScrollTrigger.config({ ignoreMobileResize: true }); // URL-bar collapse must not refresh pins mid-film

export type Film = {
  home: { name: string; color: string; formation: string };
  away: { name: string; color: string; formation: string };
  score: string;
  nodes: { x: number; y: number; name: string; rating: number | null; color: string; side: "home" | "away" }[];
  shots: { x: number; y: number; r: number; goal: boolean; color: string; minute: number; xg: number | null }[];
  xg: { home: number; away: number };
  tiles: { goals: number; attendanceM: number; topSpeed: number; topSpeedName: string; distanceKm: number };
  cards: Card[];
};

const W = 1050, H = 680;

function Pitch({ children, lineClass }: { children?: React.ReactNode; lineClass: string }) {
  const s = { stroke: "var(--chalk)", strokeOpacity: 0.25, strokeWidth: 2, fill: "none" as const, className: lineClass };
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      <rect x={1} y={1} width={W - 2} height={H - 2} {...s} />
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} {...s} />
      <circle cx={W / 2} cy={H / 2} r={91.5} {...s} />
      {[0, 1].map((side) => {
        const mx = (x: number) => (side ? W - x : x);
        return (
          <g key={side}>
            <rect x={Math.min(mx(0), mx(165))} y={H / 2 - 201.6} width={165} height={403.2} {...s} />
            <rect x={Math.min(mx(0), mx(55))} y={H / 2 - 91.6} width={55} height={183.2} {...s} />
          </g>
        );
      })}
      {children}
    </svg>
  );
}

export default function StoryFilm({ film }: { film: Film }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        gsap.defaults({ ease: "power3.out" });

        /* Scene 1 — hero (autoplay) */
        const hero = gsap.timeline();
        hero
          .from(".hero-eyebrow", { y: 20, autoAlpha: 0, duration: 0.6 })
          .from(".hero-word", { y: 90, autoAlpha: 0, duration: 0.9, stagger: 0.09 }, 0.15)
          .from(".hero-sub", { y: 24, autoAlpha: 0, duration: 0.7 }, "-=0.4")
          .from(".hero-tile", { y: 30, autoAlpha: 0, duration: 0.6, stagger: 0.07 }, "-=0.3");
        gsap.utils.toArray<HTMLElement>(".count").forEach((el, i) => {
          const target = parseFloat(el.dataset.v ?? "0");
          const dec = el.dataset.dec === "1";
          el.textContent = dec ? "0.0" : "0"; // SSR renders the real value; zero only when we'll count up
          const obj = { v: 0 };
          hero.to(obj, {
            v: target, duration: 1.3, ease: "power2.out",
            onUpdate: () => { el.textContent = dec ? obj.v.toFixed(1) : Math.round(obj.v).toLocaleString("en-US"); },
          }, 0.7 + i * 0.08);
        });
        gsap.to(".scroll-cue", { y: 8, repeat: -1, yoyo: true, duration: 0.9, ease: "sine.inOut" });
        gsap.to(".hero-glow", { scale: 1.15, opacity: 0.5, repeat: -1, yoyo: true, duration: 3.2, ease: "sine.inOut" });

        /* Scene 2 — formations draw in */
        gsap.utils.toArray<SVGGeometryElement>(".draw").forEach((el) => {
          const len = el.getTotalLength();
          gsap.set(el, { strokeDasharray: len, strokeDashoffset: len });
        });
        gsap.timeline({
          scrollTrigger: { trigger: ".scene-pitch", start: "top top", end: "+=1600", scrub: 1, pin: true },
        })
          .to(".draw", { strokeDashoffset: 0, duration: 1.4, stagger: 0.08, ease: "power2.inOut" })
          .from(".node-home", { scale: 0, transformOrigin: "center", duration: 0.5, stagger: 0.05, ease: "back.out(1.4)" }, "-=0.5")
          .from(".node-away", { scale: 0, transformOrigin: "center", duration: 0.5, stagger: 0.05, ease: "back.out(1.4)" }, "-=0.2")
          .from(".pitch-caption", { y: 30, autoAlpha: 0, duration: 0.6 });

        /* Scene 3 — the shots rain in */
        gsap.timeline({
          scrollTrigger: { trigger: ".scene-shots", start: "top top", end: "+=2000", scrub: 1, pin: true },
        })
          .from(".shot-dot", { scale: 0, transformOrigin: "center", duration: 0.35, stagger: 0.09, ease: "back.out(1.2)" })
          .from(".shots-caption-1", { y: 24, autoAlpha: 0, duration: 0.5 }, "<60%")
          .to(".shot-dot:not(.shot-goal)", { opacity: 0.18, duration: 0.6 }, "+=0.3")
          .fromTo(".goal-ring", { scale: 0.6, opacity: 0 }, { scale: 1.8, opacity: 1, transformOrigin: "center", duration: 0.7, ease: "power2.out" }, "<")
          .from(".shots-caption-2", { y: 24, autoAlpha: 0, duration: 0.6 }, "<40%");

        /* Scene 4 — the sprint (energetic beat) */
        const speedObj = { v: 0 };
        {
          const sn = root.current?.querySelector(".speed-num");
          if (sn) sn.textContent = "0.0"; // SSR shows the real top speed; zero only when animating
        }
        gsap.timeline({
          scrollTrigger: { trigger: ".scene-speed", start: "top top", end: "+=1200", scrub: 1, pin: true },
        })
          .fromTo(".speed-streak", { xPercent: -120 }, { xPercent: 120, duration: 1.1, ease: "none" })
          .to(speedObj, {
            v: film.tiles.topSpeed, duration: 1,
            onUpdate: () => {
              const el = root.current?.querySelector(".speed-num");
              if (el) el.textContent = speedObj.v.toFixed(1);
            },
          }, 0)
          .from(".speed-label", { y: 30, autoAlpha: 0, duration: 0.5 }, 0.55)
          .from(".speed-sub", { y: 24, autoAlpha: 0, duration: 0.5 }, 0.8);

        /* Scene 5 — the cards fan out */
        const fan = [-24, -12, 0, 12, 24];
        gsap.timeline({
          scrollTrigger: { trigger: ".scene-cards", start: "top top", end: "+=1600", scrub: 1, pin: true },
        })
          .from(".film-card", {
            y: 260, rotation: 0, autoAlpha: 0, duration: 1, stagger: 0.08, ease: "power2.out",
          })
          .to(".film-card", {
            rotation: (i) => fan[i] ?? 0,
            x: (i) => ((i - 2) * 40),
            duration: 0.8, ease: "power2.inOut",
          }, "-=0.2")
          .from(".cards-cta", { y: 30, autoAlpha: 0, duration: 0.6 });
      });
    },
    { scope: root }
  );

  const t = film.tiles;
  return (
    <div ref={root} className="overflow-x-clip">
      {/* Scene 1 — hero */}
      <section className="relative flex min-h-svh flex-col items-center justify-center px-4 text-center">
        <div className="hero-glow pointer-events-none absolute left-1/2 top-1/3 h-96 w-96 -translate-x-1/2 rounded-full opacity-30"
          style={{ background: "radial-gradient(circle, color-mix(in oklab, var(--gold) 22%, transparent), transparent 70%)" }} />
        <p className="hero-eyebrow eyebrow mb-6">June 11 — July 19, 2026 · 48 nations · one dataset</p>
        <h1 className="display text-6xl font-bold leading-[0.95] tracking-tight sm:text-8xl">
          <span className="hero-word inline-block">EVERY</span>{" "}
          <span className="hero-word inline-block">NUMBER</span>
          <br />
          <span className="hero-word inline-block text-gold">THAT</span>{" "}
          <span className="hero-word inline-block text-gold">MATTERED</span>
        </h1>
        <p className="hero-sub mt-6 max-w-xl text-sm text-dim">
          Formations, xG, heatmaps, sprints — harvested from every match of the 2026 tournament.
          Scroll to see what the data can do.
        </p>
        <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { v: 104, label: "matches" },
            { v: t.goals, label: "goals" },
            { v: t.attendanceM, label: "million fans", dec: true },
            { v: t.distanceKm, label: "km run" },
          ].map((x) => (
            <div key={x.label} className="hero-tile rounded-lg border border-pitchline bg-surface px-5 py-3">
              <p className="count data text-2xl text-chalk" data-v={x.v} data-dec={x.dec ? "1" : "0"}>
                {x.dec ? x.v.toFixed(1) : x.v.toLocaleString("en-US")}
              </p>
              <p className="eyebrow mt-0.5">{x.label}</p>
            </div>
          ))}
        </div>
        <p className="scroll-cue eyebrow absolute bottom-8">scroll ↓</p>
      </section>

      {/* Scene 2 — formations */}
      <section className="scene-pitch flex min-h-svh flex-col items-center justify-center px-4">
        <div className="w-full max-w-4xl">
          <Pitch lineClass="draw">
            {film.nodes.map((n, i) => (
              <g key={i} className={n.side === "home" ? "node-home" : "node-away"} transform={`translate(${n.x},${n.y})`}>
                <circle r={16} fill="var(--raised)" stroke={n.color} strokeWidth={2.5} />
                {n.rating != null && (
                  <text textAnchor="middle" dy={4.5} fontSize={12} fill="var(--chalk)" fontFamily="var(--font-plex-mono)">
                    {n.rating.toFixed(1)}
                  </text>
                )}
                <text textAnchor="middle" y={31} fontSize={12} fill="var(--dim)">{n.name}</text>
              </g>
            ))}
          </Pitch>
          <p className="pitch-caption mt-6 text-center">
            <span className="display text-2xl font-semibold">
              <span style={{ color: film.home.color }}>{film.home.formation}</span>
              <span className="text-faint"> vs </span>
              <span style={{ color: film.away.color }}>{film.away.formation}</span>
            </span>
            <span className="mt-1 block text-sm text-dim">
              Real lineups with real match ratings — for all 104 matches.
            </span>
          </p>
        </div>
      </section>

      {/* Scene 3 — shot map */}
      <section className="scene-shots flex min-h-svh flex-col items-center justify-center px-4">
        <div className="w-full max-w-4xl">
          <p className="shots-caption-1 mb-4 text-center">
            <span className="display text-2xl font-semibold">The final, shot by shot</span>
          </p>
          <Pitch lineClass="static-line">
            {film.shots.map((s, i) => (
              <g key={i}>
                {s.goal && <circle className="goal-ring" cx={s.x} cy={s.y} r={s.r + 8} fill="none" stroke="var(--gold)" strokeWidth={2} />}
                <circle
                  className={`shot-dot${s.goal ? " shot-goal" : ""}`}
                  cx={s.x} cy={s.y} r={s.r}
                  fill={s.goal ? "var(--gold)" : s.color}
                  fillOpacity={0.8}
                  stroke={s.goal ? "var(--gold)" : s.color}
                />
              </g>
            ))}
          </Pitch>
          <p className="shots-caption-2 mt-6 text-center">
            <span className="data text-xl text-chalk">
              {film.shots.length} shots · xG {film.xg.home.toFixed(2)}–{film.xg.away.toFixed(2)} · {film.score}
            </span>
            <span className="mt-1 block text-sm text-dim">
              Every attempt with its expected-goals value and pitch coordinates.
            </span>
          </p>
        </div>
      </section>

      {/* Scene 4 — the sprint */}
      <section className="scene-speed relative flex min-h-svh flex-col items-center justify-center overflow-hidden px-4 text-center">
        <div className="speed-streak pointer-events-none absolute top-1/2 h-1 w-2/3 -translate-y-14 rounded-full"
          style={{ background: "linear-gradient(90deg, transparent, var(--gold), transparent)" }} />
        <p className="data text-7xl text-gold sm:text-9xl">
          <span className="speed-num">{t.topSpeed.toFixed(1)}</span>
          <span className="text-3xl text-dim"> km/h</span>
        </p>
        <p className="speed-label display mt-4 text-3xl font-semibold">{t.topSpeedName}</p>
        <p className="speed-sub mt-2 max-w-md text-sm text-dim">
          The fastest sprint of the tournament — measured by the stadium tracking cameras.
          Speed, distance and sprint counts, on every player card.
        </p>
      </section>

      {/* Scene 5 — the cards */}
      <section className="scene-cards flex min-h-svh flex-col items-center justify-center px-4">
        <p className="mb-8 text-center">
          <span className="display text-3xl font-semibold">1,038 players. 1,038 cards.</span>
          <span className="mt-1 block text-sm text-dim">Every stat a tournament percentile. No opinions.</span>
        </p>
        <div className="relative flex items-center justify-center">
          {film.cards.map((c) => (
            <div key={c.id} className="film-card -mx-16 first:ml-0 last:mr-0" style={{ transformOrigin: "50% 120%" }}>
              <PlayerCard card={c} size="sm" />
            </div>
          ))}
        </div>
        <div className="cards-cta mt-12 flex flex-wrap justify-center gap-3 px-4">
          <Link href="/match/400021543" className="display rounded border border-gold bg-surface px-6 py-3 font-semibold text-gold transition-colors hover:bg-raised">
            Open the match theater
          </Link>
          <Link href="/players" className="display rounded border border-pitchline bg-surface px-6 py-3 font-semibold text-dim transition-colors hover:text-chalk">
            Browse the cards
          </Link>
          <Link href="/tournament" className="display rounded border border-pitchline bg-surface px-6 py-3 font-semibold text-dim transition-colors hover:text-chalk">
            Tournament overview
          </Link>
        </div>
      </section>
    </div>
  );
}
