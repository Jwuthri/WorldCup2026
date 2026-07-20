"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import PitchLines, { PITCH_W as W, PITCH_H as H } from "./PitchLines";
import { formationXY } from "./MatchTheater";

export type MorphPlayer = {
  id: string;
  shortName: string;
  shirt: number;
  slot: { line: number; side: number };
  /** heatmap centroid, fraction of full pitch, own goal at left (home orientation) */
  played: { fx: number; fy: number };
};
export type MorphSide = { abbr: string; color: string; formation: string | null; players: MorphPlayer[] };

type Mode = "paper" | "played";

/** One pitch, both lineups: toggle glides every starter between their formation slot
 *  and the centroid of their actual heatmap. The gap between the two is the story. */
export default function PaperVsPlayed({ home, away }: { home: MorphSide; away: MorphSide }) {
  const [mode, setMode] = useState<Mode>("paper");
  const nodeRefs = useRef(new Map<string, SVGGElement>());
  const trailRefs = useRef(new Map<string, SVGLineElement>());

  const coords = (side: "home" | "away", s: MorphSide) => {
    const lineCount = 1 + Math.max(0, ...s.players.map((p) => p.slot.line));
    return s.players.map((p) => {
      const paper = formationXY(p, side, lineCount);
      const played =
        side === "home"
          ? { x: p.played.fx * W, y: p.played.fy * H }
          : { x: W - p.played.fx * W, y: H - p.played.fy * H };
      return { p, side, color: s.color, paper, played };
    });
  };
  const nodes = [...coords("home", home), ...coords("away", away)];

  // place nodes at their paper spots on mount
  useEffect(() => {
    for (const n of nodes) {
      const el = nodeRefs.current.get(n.p.id);
      if (el) gsap.set(el, { x: n.paper.x, y: n.paper.y });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const go = (next: Mode) => {
    if (next === mode) return;
    setMode(next);
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
    nodes.forEach((n, i) => {
      const el = nodeRefs.current.get(n.p.id);
      const to = next === "paper" ? n.paper : n.played;
      if (el)
        gsap.to(el, { x: to.x, y: to.y, duration: reduce ? 0 : 0.95, ease: "power3.inOut", delay: reduce ? 0 : i * 0.022 });
      const trail = trailRefs.current.get(n.p.id);
      if (trail) gsap.to(trail, { opacity: next === "played" ? 0.32 : 0, duration: reduce ? 0 : 0.6, delay: reduce ? 0 : 0.3 });
    });
  };

  const seg = (m: Mode, label: string) => (
    <button
      key={m}
      onClick={() => go(m)}
      aria-pressed={mode === m}
      className={`display rounded px-3 py-1 text-sm font-semibold transition-colors ${
        mode === m ? "bg-gold text-bg" : "text-gold hover:bg-raised"
      }`}
    >
      {label}
    </button>
  );

  return (
    <section className="mt-8 rounded-lg border border-pitchline bg-surface p-4 sm:p-6">
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <h2 className="display text-2xl font-semibold">
          On paper vs as played{" "}
          <span className="text-sm font-normal text-faint">— formation sheet vs heatmap reality</span>
        </h2>
        <div className="ml-auto flex gap-1 rounded border border-gold/60 p-0.5">
          {seg("paper", "ON PAPER")}
          {seg("played", "AS PLAYED")}
        </div>
      </div>
      <p className="mb-4 text-sm text-dim">
        <span style={{ color: home.color }}>{home.abbr} {home.formation ?? ""}</span> attack →, ←{" "}
        <span style={{ color: away.color }}>{away.abbr} {away.formation ?? ""}</span> attack.{" "}
        {mode === "paper"
          ? "The teamsheet, as announced."
          : "Every starter at the center of gravity of their real heatmap — the ghost line shows the drift."}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Formations: on paper vs average true positions">
        <PitchLines />
        {nodes.map((n) => (
          <line
            key={`t-${n.p.id}`}
            ref={(el) => { if (el) trailRefs.current.set(n.p.id, el); }}
            x1={n.paper.x} y1={n.paper.y} x2={n.played.x} y2={n.played.y}
            stroke={n.color} strokeWidth={1.5} strokeDasharray="4 5" opacity={0}
          />
        ))}
        {nodes.map((n) => (
          <g
            key={n.p.id}
            ref={(el) => { if (el) nodeRefs.current.set(n.p.id, el); }}
          >
            <circle r={15} fill="var(--raised)" stroke={n.color} strokeWidth={2.5} />
            <text textAnchor="middle" dy={4.5} fontSize={12.5} fill="var(--chalk)" className="display">
              {n.p.shirt}
            </text>
            <text textAnchor="middle" y={28} fontSize={10} fill="var(--chalk)" opacity={0.8}>
              {n.p.shortName}
              <title>{n.p.shortName}</title>
            </text>
          </g>
        ))}
      </svg>
    </section>
  );
}
