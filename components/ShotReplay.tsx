"use client";
import { useEffect, useRef, useState } from "react";
import gsap from "gsap";
import PitchLines, { PITCH_W as W, PITCH_H as H } from "./PitchLines";
import type { Shot } from "@/lib/data";

type Side = { name: string; abbr: string; color: string };

/** "90 + 3'" -> 93 */
const parseMin = (m: string) => {
  const parts = String(m).replace(/[^0-9+]/g, "").split("+").filter(Boolean);
  return parts.reduce((s, p) => s + (parseInt(p) || 0), 0);
};

const D = 15; // seconds of replay for the full match

/** The whole match in 15 seconds: shots pop in match order, score and clock tick.
 *  Scrub-safe: score, clock and caption derive from the playhead, so dragging
 *  backwards through the match always shows the true state at that minute. */
export default function ShotReplay({ shots, home, away }: { shots: Shot[]; home: Side; away: Side }) {
  const dotRefs = useRef<(SVGGElement | null)[]>([]);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const clockRef = useRef<HTMLSpanElement>(null);
  const capRef = useRef<HTMLSpanElement>(null);
  const rangeRef = useRef<HTMLInputElement>(null);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const prevScoreRef = useRef("0:0");
  const [playing, setPlaying] = useState(false);

  const ordered = [...shots].map((s, i) => ({ ...s, i, min: parseMin(s.minute) })).sort((a, b) => a.min - b.min);
  const maxMin = Math.max(...ordered.map((s) => s.min), 90);

  // everything below derives from the current minute — that's what makes scrubbing honest
  const sync = () => {
    const tl = tlRef.current;
    if (!tl) return;
    const p = tl.progress();
    const min = Math.min(Math.round(p * maxMin), maxMin);
    if (clockRef.current) clockRef.current.textContent = `${min}'`;
    if (rangeRef.current) rangeRef.current.value = String(Math.round(p * 1000));
    let h = 0, a = 0;
    let last: (typeof ordered)[number] | null = null;
    for (const s of ordered) {
      if (s.min > min) break;
      last = s;
      if (s.outcome === "Goal") s.team === "home" ? h++ : a++;
    }
    const score = `${h}:${a}`;
    if (scoreRef.current && score !== prevScoreRef.current) {
      prevScoreRef.current = score;
      scoreRef.current.textContent = score;
      gsap.fromTo(scoreRef.current, { scale: 1.5 }, { scale: 1, duration: 0.4, ease: "power3.out" });
    }
    if (capRef.current)
      capRef.current.textContent = last
        ? `${last.minute} ${last.player} — xG ${(last.xg ?? 0).toFixed(2)} · ${last.outcome}`
        : "kickoff";
  };

  // build the timeline once, paused; play/scrub drive it from then on
  useEffect(() => {
    const tl = gsap.timeline({ paused: true, onUpdate: sync, onComplete: () => setPlaying(false) });
    tlRef.current = tl;
    tl.set(dotRefs.current.filter(Boolean), { scale: 0, opacity: 0, transformOrigin: "center center" }, 0);
    tl.to({}, { duration: D }, 0); // full-length spacer so progress maps 0..D
    for (const s of ordered) {
      const t = 0.4 + (s.min / maxMin) * (D - 0.8);
      const dot = dotRefs.current[s.i];
      if (!dot) continue;
      tl.to(dot, { scale: 1, opacity: 1, duration: 0.32, ease: "back.out(1.4)" }, t);
      if (s.outcome === "Goal") {
        const ring = dot.querySelector(".ring");
        if (ring) tl.fromTo(ring, { scale: 1, opacity: 0.9 }, { scale: 3.2, opacity: 0, duration: 0.7, ease: "power2.out" }, t);
      }
    }
    tl.progress(0).pause();
    sync();
    return () => void tl.kill();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = () => {
    const tl = tlRef.current;
    if (!tl) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      tl.progress(1).pause(); // jump to full picture; the scrubber still works
      setPlaying(false);
      return;
    }
    if (playing) {
      tl.pause();
      setPlaying(false);
    } else {
      if (tl.progress() >= 1) tl.progress(0);
      tl.play();
      setPlaying(true);
    }
  };

  const scrub = (v: number) => {
    const tl = tlRef.current;
    if (!tl) return;
    tl.pause();
    setPlaying(false);
    tl.progress(v / 1000);
  };

  return (
    <div className="rounded-lg border border-pitchline bg-surface p-4">
      <div className="mb-2 flex items-center gap-3">
        <button
          onClick={toggle}
          aria-label={playing ? "Pause replay" : "Play 15-second match replay"}
          className="display rounded border border-gold/60 px-3 py-1 text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-bg"
        >
          {playing ? "❚❚ Pause" : "▶ 15-second match"}
        </button>
        <span className="data text-lg text-chalk">
          <span style={{ color: home.color }}>{home.abbr}</span>{" "}
          <span ref={scoreRef} className="inline-block">0:0</span>{" "}
          <span style={{ color: away.color }}>{away.abbr}</span>
        </span>
        <span ref={clockRef} className="data text-sm text-faint">0&apos;</span>
        <span ref={capRef} className="data min-w-0 flex-1 truncate text-right text-sm text-dim">kickoff</span>
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
            <g key={s.i} ref={(el) => void (dotRefs.current[s.i] = el)} opacity={0}>
              {goal && <circle className="ring" cx={px} cy={py} r={r + 4} fill="none" stroke="var(--gold)" strokeWidth={3} opacity={0} />}
              <circle cx={px} cy={py} r={r} fill={color} fillOpacity={goal ? 0.95 : 0.45} stroke={goal ? "var(--chalk)" : "none"} strokeWidth={2}>
                <title>{`${s.minute} ${s.player} — xG ${(s.xg ?? 0).toFixed(2)} · ${s.outcome}`}</title>
              </circle>
            </g>
          );
        })}
      </svg>
      <input
        ref={rangeRef}
        type="range"
        min={0}
        max={1000}
        defaultValue={0}
        onInput={(e) => scrub(+(e.target as HTMLInputElement).value)}
        aria-label="Scrub through the match"
        className="mt-2 block w-full cursor-pointer"
        style={{ accentColor: "var(--gold)", height: 14 }}
      />
    </div>
  );
}
