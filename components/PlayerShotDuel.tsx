"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import PitchLines, { PITCH_W as W, PITCH_H as H } from "./PitchLines";

export type DuelShot = { x: number; y: number; xg: number; outcome: string; minute: string; opp: string };
type ShotSide = { name: string; color: string; shots: DuelShot[] };

/** Two players' entire tournaments of shots on one pitch, both attacking →.
 *  Dot size = xG, ringed = goal. Dots pop in one player at a time. */
export default function PlayerShotDuel({ a, b }: { a: ShotSide; b: ShotSide }) {
  const root = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    const show = () => gsap.set(q(".psd-dot"), { opacity: 1, scale: 1 });
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return void show();
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        gsap.fromTo(q(".psd-dot"),
          { scale: 0, opacity: 0, transformOrigin: "center center" },
          { scale: 1, opacity: 1, duration: 0.3, ease: "back.out(1.8)", stagger: 0.02 });
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [a.name, b.name]); // eslint-disable-line react-hooks/exhaustive-deps

  const tally = (s: ShotSide) => {
    const goals = s.shots.filter((x) => x.outcome === "Goal").length;
    const xg = s.shots.reduce((t, x) => t + x.xg, 0);
    return `${s.shots.length} shots · ${goals} goals · ${xg.toFixed(1)} xG`;
  };

  return (
    <div ref={root}>
      <div className="mb-2 space-y-1 text-xs">
        <p className="data" style={{ color: a.color }}>{a.name} — {tally(a)}</p>
        <p className="data" style={{ color: b.color }}>{b.name} — {tally(b)}</p>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img"
        aria-label={`Every tournament shot: ${a.name} vs ${b.name}, both attacking left to right`}>
        <PitchLines />
        {[a, b].map((side) =>
          side.shots.map((s, i) => {
            const px = (s.x / 100) * W;
            const py = (s.y / 100) * H;
            const r = 6 + s.xg * 26;
            const goal = s.outcome === "Goal";
            return (
              <g key={`${side.name}-${i}`} className="psd-dot" opacity={0}>
                {goal && <circle cx={px} cy={py} r={r + 4} fill="none" stroke="var(--gold)" strokeWidth={2.5} />}
                <circle cx={px} cy={py} r={r} fill={side.color} fillOpacity={goal ? 0.95 : 0.4}
                  stroke={goal ? "var(--chalk)" : "none"} strokeWidth={1.5}>
                  <title>{`${side.name} ${s.minute} vs ${s.opp} — xG ${s.xg.toFixed(2)} · ${s.outcome}`}</title>
                </circle>
              </g>
            );
          })
        )}
      </svg>
      <p className="mt-1.5 text-xs text-faint">Both attacking → · dot size is xG · ringed dots are goals · hover any shot.</p>
    </div>
  );
}
