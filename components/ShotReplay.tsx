"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import PitchLines, { PITCH_W as W, PITCH_H as H } from "./PitchLines";
import type { Shot } from "@/lib/data";

type Side = { name: string; abbr: string; color: string };

/** "90 + 3'" -> 93 */
const parseMin = (m: string) => {
  const parts = String(m).replace(/[^0-9+]/g, "").split("+").filter(Boolean);
  return parts.reduce((s, p) => s + (parseInt(p) || 0), 0);
};

/** The whole match in 15 seconds: shots pop in match order, score and clock tick. */
export default function ShotReplay({ shots, home, away }: { shots: Shot[]; home: Side; away: Side }) {
  const dotRefs = useRef<(SVGGElement | null)[]>([]);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);

  const ordered = [...shots].map((s, i) => ({ ...s, i, min: parseMin(s.minute) })).sort((a, b) => a.min - b.min);
  const maxMin = Math.max(...ordered.map((s) => s.min), 90);

  useEffect(() => () => void tlRef.current?.kill(), []);

  const play = () => {
    tlRef.current?.kill();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      dotRefs.current.forEach((d) => d && gsap.set(d, { scale: 1, opacity: 1 }));
      return;
    }
    let h = 0, a = 0;
    const D = 15;
    const tl = gsap.timeline();
    tlRef.current = tl;
    tl.set(dotRefs.current.filter(Boolean), { scale: 0, opacity: 0, transformOrigin: "center center" });
    if (scoreRef.current) scoreRef.current.textContent = "0:0";
    tl.to(barRef.current, { width: "100%", duration: D, ease: "none" }, 0);
    tl.eventCallback("onUpdate", () => {
      if (clockRef.current) clockRef.current.textContent = `${Math.min(Math.round((tl.time() / D) * maxMin), maxMin)}'`;
    });
    for (const s of ordered) {
      const t = 0.4 + (s.min / maxMin) * (D - 0.8);
      const dot = dotRefs.current[s.i];
      if (!dot) continue;
      tl.to(dot, { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(1.4)" }, t);
      if (s.outcome === "Goal") {
        const ring = dot.querySelector(".ring");
        if (ring) tl.fromTo(ring, { scale: 1, opacity: 0.9 }, { scale: 3.2, opacity: 0, duration: 0.7, ease: "power2.out" }, t);
        tl.call(() => {
          if (s.team === "home") h++;
          else a++;
          if (scoreRef.current) {
            scoreRef.current.textContent = `${h}:${a}`;
            gsap.fromTo(scoreRef.current, { scale: 1.5 }, { scale: 1, duration: 0.4, ease: "power3.out" });
          }
        }, [], t + 0.1);
      }
    }
  };

  return (
    <div className="rounded-lg border border-pitchline bg-surface p-4">
      <div className="mb-2 flex items-center gap-3">
        <button
          onClick={play}
          className="display rounded border border-gold/60 px-3 py-1 text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-bg"
        >
          ▶ 15-second match
        </button>
        <span className="data text-lg text-chalk">
          <span style={{ color: home.color }}>{home.abbr}</span>{" "}
          <span ref={scoreRef}>0:0</span>{" "}
          <span style={{ color: away.color }}>{away.abbr}</span>
        </span>
        <span ref={clockRef} className="data text-sm text-faint">0&apos;</span>
        <div className="ml-auto hidden h-1 w-32 rounded-full bg-raised sm:block">
          <div ref={barRef} className="h-1 w-0 rounded-full bg-gold" />
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="15-second shot replay">
        <PitchLines />
        {ordered.map((s) => {
          const px = s.team === "home" ? (s.x / 100) * W : W - (s.x / 100) * W;
          const py = s.team === "home" ? (s.y / 100) * H : H - (s.y / 100) * H;
          const r = 7 + (s.xg ?? 0) * 26;
          const color = s.team === "home" ? home.color : away.color;
          const goal = s.outcome === "Goal";
          return (
            <g key={s.i} ref={(el) => void (dotRefs.current[s.i] = el)} opacity={0} transform-origin="center">
              {goal && <circle className="ring" cx={px} cy={py} r={r + 4} fill="none" stroke="var(--gold)" strokeWidth={3} opacity={0} />}
              <circle cx={px} cy={py} r={r} fill={color} fillOpacity={goal ? 0.95 : 0.45} stroke={goal ? "var(--chalk)" : "none"} strokeWidth={2}>
                <title>{`${s.minute} ${s.player} — xG ${(s.xg ?? 0).toFixed(2)} · ${s.outcome}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
