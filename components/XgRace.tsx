"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import type { Shot } from "@/lib/data";

type Side = { abbr: string; color: string };

const W = 900;
const H = 320;
const PAD = { l: 52, r: 76, t: 26, b: 34 };
const PW = W - PAD.l - PAD.r;
const PH = H - PAD.t - PAD.b;

const parseMin = (m: string) => {
  const parts = String(m).replace(/[^0-9+]/g, "").split("+").filter(Boolean);
  return parts.reduce((s, p) => s + (parseInt(p) || 0), 0);
};

/** Cumulative xG race: both lines reveal minute-by-minute; goals punch and flip the score. */
export default function XgRace({ shots, home, away, maxMinute }: {
  shots: Shot[]; home: Side; away: Side; maxMinute: number;
}) {
  const clipRef = useRef<SVGRectElement>(null);
  const headRef = useRef<SVGLineElement>(null);
  const clockRef = useRef<SVGTextElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const goalRefs = useRef<(SVGGElement | null)[]>([]);
  const endRefs = useRef<(SVGTextElement | null)[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const playedRef = useRef(false);

  const ordered = [...shots]
    .map((s, i) => ({ ...s, i, min: parseMin(s.minute), v: s.xg ?? 0 }))
    .sort((a, b) => a.min - b.min);

  // cumulative step points per team
  const build = (team: "home" | "away") => {
    let cum = 0;
    const pts: { min: number; cum: number; goal: boolean; who: string; label: string }[] = [];
    for (const s of ordered)
      if (s.team === team) {
        cum += s.v;
        pts.push({ min: s.min, cum, goal: s.outcome === "Goal", who: s.player, label: s.minute });
      }
    return pts;
  };
  const hPts = build("home");
  const aPts = build("away");
  const maxXg = Math.max(0.5, ...hPts.map((p) => p.cum), ...aPts.map((p) => p.cum)) * 1.08;

  const X = (min: number) => PAD.l + (min / maxMinute) * PW;
  const Y = (xg: number) => PAD.t + PH - (xg / maxXg) * PH;

  const stepPath = (pts: { min: number; cum: number }[]) => {
    let d = `M ${PAD.l} ${Y(0)}`;
    for (const p of pts) d += ` H ${X(p.min)} V ${Y(p.cum)}`;
    d += ` H ${X(maxMinute)}`;
    return d;
  };

  const goals = [
    ...hPts.filter((p) => p.goal).map((p) => ({ ...p, team: "home" as const })),
    ...aPts.filter((p) => p.goal).map((p) => ({ ...p, team: "away" as const })),
  ].sort((a, b) => a.min - b.min);

  const finals: { team: "home" | "away"; cum: number }[] = [
    { team: "home", cum: hPts.at(-1)?.cum ?? 0 },
    { team: "away", cum: aPts.at(-1)?.cum ?? 0 },
  ];

  useEffect(() => () => void tlRef.current?.kill(), []);

  const showFinal = () => {
    if (clipRef.current) gsap.set(clipRef.current, { attr: { width: PW + PAD.r } });
    goalRefs.current.forEach((g) => g && gsap.set(g, { scale: 1, opacity: 1 }));
    endRefs.current.forEach((e) => e && gsap.set(e, { opacity: 1 }));
    if (headRef.current) gsap.set(headRef.current, { opacity: 0 });
    if (scoreRef.current)
      scoreRef.current.textContent = `${goals.filter((g) => g.team === "home").length}:${goals.filter((g) => g.team === "away").length}`;
  };

  const play = () => {
    tlRef.current?.kill();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return showFinal();
    const D = 8;
    let h = 0, a = 0;
    const tl = gsap.timeline();
    tlRef.current = tl;

    tl.set(clipRef.current, { attr: { width: 0 } });
    tl.set(goalRefs.current.filter(Boolean), { scale: 0, opacity: 0, transformOrigin: "center center" });
    tl.set(endRefs.current.filter(Boolean), { opacity: 0 });
    tl.set(headRef.current, { opacity: 1 });
    if (scoreRef.current) scoreRef.current.textContent = "0:0";

    tl.to(clipRef.current, { attr: { width: PW + PAD.r }, duration: D, ease: "none" }, 0);
    tl.fromTo(headRef.current, { attr: { x1: PAD.l, x2: PAD.l } },
      { attr: { x1: PAD.l + PW, x2: PAD.l + PW }, duration: D, ease: "none" }, 0);
    tl.eventCallback("onUpdate", () => {
      if (clockRef.current) {
        const min = Math.min(Math.round((tl.time() / D) * maxMinute), maxMinute);
        clockRef.current.textContent = `${min}'`;
        clockRef.current.setAttribute("x", String(Math.min(X(min), PAD.l + PW)));
      }
    });

    goals.forEach((g, gi) => {
      const t = D * (g.min / maxMinute);
      const dot = goalRefs.current[gi];
      if (dot) {
        tl.to(dot, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.5)" }, t);
        const ring = dot.querySelector(".ring");
        if (ring) tl.fromTo(ring, { scale: 1, opacity: 0.9 }, { scale: 3, opacity: 0, duration: 0.8, ease: "power2.out" }, t);
      }
      tl.call(() => {
        if (g.team === "home") h++; else a++;
        if (scoreRef.current) {
          scoreRef.current.textContent = `${h}:${a}`;
          gsap.fromTo(scoreRef.current, { scale: 1.6 }, { scale: 1, duration: 0.5, ease: "back.out(3)" });
        }
      }, [], t + 0.05);
    });

    tl.to(headRef.current, { opacity: 0, duration: 0.3 }, D);
    tl.to(endRefs.current.filter(Boolean), { opacity: 1, duration: 0.5, stagger: 0.1 }, D - 0.2);
  };

  // auto-play once when scrolled into view
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || playedRef.current) return;
        playedRef.current = true;
        io.disconnect();
        play();
      },
      { threshold: 0.35 }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const yStep = maxXg <= 1.6 ? 0.5 : 1;
  const yTicks: number[] = [];
  for (let v = yStep; v <= maxXg; v += yStep) yTicks.push(v);
  const xTicks = Array.from({ length: Math.floor(maxMinute / 15) + 1 }, (_, i) => i * 15);

  return (
    <div ref={rootRef} className="rounded-lg border border-pitchline bg-surface p-4 sm:p-6">
      <div className="mb-2 flex flex-wrap items-center gap-3">
        <h2 className="display text-2xl font-semibold">
          The xG race <span className="text-sm font-normal text-faint">— cumulative expected goals, minute by minute</span>
        </h2>
        <span className="data ml-auto text-lg text-chalk">
          <span style={{ color: home.color }}>{home.abbr}</span>{" "}
          <span ref={scoreRef} className="inline-block">0:0</span>{" "}
          <span style={{ color: away.color }}>{away.abbr}</span>
        </span>
        <button
          onClick={play}
          className="display rounded border border-gold/60 px-3 py-1 text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-bg"
        >
          ⟲ Replay
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Cumulative xG race between ${home.abbr} and ${away.abbr}`}>
        <defs>
          <clipPath id="xgrace-clip">
            <rect ref={clipRef} x={PAD.l} y={0} width={0} height={H} />
          </clipPath>
        </defs>

        {/* grid + axes */}
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={PAD.l} x2={PAD.l + PW} y1={Y(v)} y2={Y(v)} stroke="var(--pitchline)" strokeWidth={1} />
            <text x={PAD.l - 8} y={Y(v) + 4} textAnchor="end" fontSize={12} fill="var(--faint)" fontFamily="var(--font-plex-mono)">
              {v.toFixed(1)}
            </text>
          </g>
        ))}
        {xTicks.map((m) => (
          <g key={m}>
            <line x1={X(m)} x2={X(m)} y1={PAD.t} y2={PAD.t + PH} stroke="var(--pitchline)" strokeWidth={1} opacity={m % 45 === 0 ? 1 : 0.45} />
            <text x={X(m)} y={H - 12} textAnchor="middle" fontSize={12} fill="var(--faint)" fontFamily="var(--font-plex-mono)">
              {m}&#8242;
            </text>
          </g>
        ))}

        {/* the race, revealed left→right */}
        <g clipPath="url(#xgrace-clip)">
          <path d={stepPath(hPts)} fill="none" stroke={home.color} strokeWidth={3} strokeLinejoin="round" />
          <path d={stepPath(aPts)} fill="none" stroke={away.color} strokeWidth={3} strokeLinejoin="round" />
        </g>

        {/* playhead */}
        <line ref={headRef} x1={PAD.l} x2={PAD.l} y1={PAD.t} y2={PAD.t + PH} stroke="var(--gold)" strokeWidth={1.5} opacity={0} />
        <text ref={clockRef} x={PAD.l} y={PAD.t - 8} textAnchor="middle" fontSize={13} fill="var(--gold)" fontFamily="var(--font-plex-mono)" />

        {/* goal punches */}
        {goals.map((g, gi) => (
          <g key={gi} ref={(el) => void (goalRefs.current[gi] = el)} opacity={0}>
            <circle className="ring" cx={X(g.min)} cy={Y(g.cum)} r={11} fill="none" stroke="var(--gold)" strokeWidth={2.5} opacity={0} />
            <circle cx={X(g.min)} cy={Y(g.cum)} r={7} fill="var(--gold)" stroke="var(--bg)" strokeWidth={2}>
              <title>{`${g.label} ${g.who} — GOAL`}</title>
            </circle>
          </g>
        ))}

        {/* final xG labels */}
        {finals.map((f, fi) => (
          <text
            key={f.team}
            ref={(el) => void (endRefs.current[fi] = el)}
            x={PAD.l + PW + 10}
            y={Y(f.cum) + 5}
            fontSize={15}
            fontWeight={700}
            fill={f.team === "home" ? home.color : away.color}
            fontFamily="var(--font-plex-mono)"
            opacity={0}
          >
            {f.cum.toFixed(2)}
          </text>
        ))}
      </svg>
    </div>
  );
}
