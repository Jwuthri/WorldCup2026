"use client";

/**
 * ReplayTheater — a data-driven match reconstruction on a 2D canvas.
 * Player dots wander through their REAL match heatmap (decoded 20x14 grid,
 * attacking → for both teams; away side mirrored for display). Shots fire at
 * their real minutes from the shooter's dot toward the real goal-mouth lateral
 * position. Not tracking data, and labeled as such by the page.
 */

import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

// mirrors lib/heatmap.ts (server-only module — it touches fs, so no client import)
const GRID_W = 20, GRID_H = 14;

export type RPlayer = {
  id: string;
  name: string;
  shirt: number;
  grid: number[] | null; // 280 cells, attacking →
  slot: { line: number; side: number } | null;
  enter: number; // sim minute they come on
  exit: number;  // sim minute they go off
};
export type Replay = {
  home: { name: string; abbr: string; color: string; players: RPlayer[] };
  away: { name: string; abbr: string; color: string; players: RPlayer[] };
  shots: { minute: number; team: "home" | "away"; x: number; y: number; gateY: number | null; outcome: string; goal: boolean; player: string; xg: number | null }[];
  goals: { minute: number; team: "home" | "away" }[];
  ticker: { minute: number; desc: string }[];
  maxMinute: number;
};

const W = 1050, H = 680;
const SPEEDS = [
  { label: "1×", mps: 3 },   // 90' in 30s
  { label: "2×", mps: 6 },
  { label: "4×", mps: 12 },
];

type Sim = {
  pos: { x: number; y: number };
  target: { x: number; y: number };
  retargetAt: number;
  cdf: Float64Array | null;
  p: RPlayer;
  team: "home" | "away";
  color: string;
};

type Ball = {
  x: number; y: number; h: number; // h = fake height for shadow/scale
  mode: "drift" | "flight" | "burst";
  flight?: { fx: number; fy: number; tx: number; ty: number; t: number; dur: number; goal: boolean; outcome: string };
  burstT?: number;
  focus: { x: number; y: number };
};

const mirror = (team: "home" | "away", x: number, y: number) =>
  team === "home" ? { x, y } : { x: W - x, y: H - y };

function makeCdf(grid: number[] | null): Float64Array | null {
  if (!grid || !grid.some((v) => v > 0)) return null;
  const cdf = new Float64Array(grid.length);
  let acc = 0;
  for (let i = 0; i < grid.length; i++) { acc += grid[i]; cdf[i] = acc; }
  return cdf;
}

function samplePos(s: Sim): { x: number; y: number } {
  if (s.cdf) {
    const r = Math.random() * s.cdf[s.cdf.length - 1];
    let lo = 0, hi = s.cdf.length - 1;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (s.cdf[mid] < r) lo = mid + 1; else hi = mid; }
    const col = lo % GRID_W, row = Math.floor(lo / GRID_W);
    const x = ((col + Math.random()) / GRID_W) * W;
    const y = ((row + Math.random()) / GRID_H) * H;
    return mirror(s.team, x, y);
  }
  // no heatmap: hover near formation slot
  const slot = s.p.slot ?? { line: 50, side: 50 };
  const x = 55 + (slot.line / 100) * 380 + (Math.random() - 0.5) * 90;
  const y = 60 + (slot.side / 100) * (H - 120) + (Math.random() - 0.5) * 90;
  return mirror(s.team, x, y);
}

function drawPitch(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#0b1a10";
  ctx.fillRect(0, 0, W, H);
  for (let i = 1; i < 12; i += 2) {
    ctx.fillStyle = "rgba(237,242,232,0.02)";
    ctx.fillRect((i * W) / 12, 0, W / 12, H);
  }
  ctx.strokeStyle = "rgba(237,242,232,0.22)";
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, W - 2, H - 2);
  ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
  ctx.beginPath(); ctx.arc(W / 2, H / 2, 91.5, 0, Math.PI * 2); ctx.stroke();
  for (const end of [0, 1]) {
    const x0 = end ? W : 0, dir = end ? -1 : 1;
    ctx.strokeRect(Math.min(x0, x0 + dir * 165), H / 2 - 201.6, 165, 403.2);
    ctx.strokeRect(Math.min(x0, x0 + dir * 55), H / 2 - 91.6, 55, 183.2);
  }
}

export default function ReplayTheater({ replay }: { replay: Replay }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speedIdx, setSpeedIdx] = useState(0);
  const [clock, setClock] = useState(0); // state mirror of simMinute for UI (throttled)
  const sim = useRef({ minute: 0, shotIdx: 0 });
  const sims = useRef<Sim[]>([]);
  const ball = useRef<Ball>({ x: W / 2, y: H / 2, h: 0, mode: "drift", focus: { x: W / 2, y: H / 2 } });
  const pitchCache = useRef<HTMLCanvasElement | null>(null);
  const playingRef = useRef(false);
  const speedRef = useRef(SPEEDS[0].mps);

  // build sims once
  useEffect(() => {
    sims.current = ([["home", replay.home], ["away", replay.away]] as const).flatMap(([team, side]) =>
      side.players.map((p): Sim => {
        const s: Sim = { pos: { x: 0, y: 0 }, target: { x: 0, y: 0 }, retargetAt: 0, cdf: makeCdf(p.grid), p, team, color: side.color };
        s.pos = samplePos(s);
        s.target = samplePos(s);
        return s;
      })
    );
    const pc = document.createElement("canvas");
    pc.width = W; pc.height = H;
    const pctx = pc.getContext("2d");
    if (pctx) drawPitch(pctx);
    pitchCache.current = pc;
  }, [replay]);

  const scoreAt = (m: number) => ({
    home: replay.goals.filter((g) => g.team === "home" && g.minute <= m).length,
    away: replay.goals.filter((g) => g.team === "away" && g.minute <= m).length,
  });

  const jumpTo = (m: number) => {
    sim.current.minute = m;
    sim.current.shotIdx = replay.shots.findIndex((s) => s.minute > m);
    if (sim.current.shotIdx === -1) sim.current.shotIdx = replay.shots.length;
    for (const s of sims.current) { s.pos = samplePos(s); s.target = samplePos(s); s.retargetAt = m; }
    ball.current = { x: W / 2, y: H / 2, h: 0, mode: "drift", focus: { x: W / 2, y: H / 2 } };
    setClock(m);
    draw();
  };

  const draw = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx || !pitchCache.current) return;
    const m = sim.current.minute;
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(pitchCache.current, 0, 0);

    for (const s of sims.current) {
      if (m < s.p.enter || m > s.p.exit) continue;
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, 10, 0, Math.PI * 2);
      ctx.fillStyle = s.color;
      ctx.fill();
      ctx.strokeStyle = "rgba(5,13,8,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = "#050d08";
      ctx.font = "700 10px var(--font-plex-mono), monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(s.p.shirt), s.pos.x, s.pos.y + 0.5);
    }

    // ball: shadow + white dot lifted by fake height
    const b = ball.current;
    ctx.beginPath();
    ctx.ellipse(b.x, b.y + 3, 5 + b.h * 0.3, 2.5, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(b.x, b.y - b.h, 6 + b.h * 0.12, 0, Math.PI * 2);
    ctx.fillStyle = "#f6f3e8";
    ctx.fill();
    if (b.mode === "burst" && b.burstT != null) {
      const t = b.burstT;
      ctx.strokeStyle = `rgba(227,190,86,${1 - t})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(b.x, b.y, 10 + t * 60, 0, Math.PI * 2);
      ctx.stroke();
    }
  };

  // main loop on gsap's ticker (auto-shared rAF)
  useEffect(() => {
    let uiAccum = 0;
    const tick = (_t: number, dtMs: number) => {
      const dt = Math.min(dtMs / 1000, 0.1);
      const S = sim.current;
      if (playingRef.current) {
        S.minute = Math.min(S.minute + speedRef.current * dt, replay.maxMinute);
        if (S.minute >= replay.maxMinute) { playingRef.current = false; setPlaying(false); }
      }
      const m = S.minute;

      // movement: ease toward heatmap-sampled targets
      for (const s of sims.current) {
        if (m < s.p.enter || m > s.p.exit) continue;
        if (playingRef.current && m >= s.retargetAt) {
          s.target = samplePos(s);
          s.retargetAt = m + 1.2 + Math.random() * 2.2; // re-aim every 1-3 sim minutes
        }
        const k = 1 - Math.pow(0.0015, dt); // smooth chase
        s.pos.x += (s.target.x - s.pos.x) * k;
        s.pos.y += (s.target.y - s.pos.y) * k;
      }

      const b = ball.current;
      if (playingRef.current && b.mode === "drift") {
        // fire due shots
        const next = replay.shots[S.shotIdx];
        if (next && m >= next.minute) {
          S.shotIdx++;
          const shooter = sims.current.find((s) => s.team === next.team && next.player && s.p.name.toUpperCase().includes(next.player.split(" ").pop()?.toUpperCase() ?? "@"));
          const from = shooter ? { ...shooter.pos } : mirror(next.team, (next.x / 100) * W, (next.y / 100) * H);
          const gate = next.gateY != null ? (next.gateY / 100) * H : (next.y / 100) * H;
          const to = next.team === "home" ? { x: W - 2, y: gate } : { x: 2, y: H - gate };
          b.mode = "flight";
          b.flight = { fx: from.x, fy: from.y, tx: to.x, ty: to.y, t: 0, dur: 0.55, goal: next.goal, outcome: next.outcome };
        } else {
          // possession drift: bias toward the next shot's team
          const focusTeam = next?.team ?? (Math.random() < 0.5 ? "home" : "away");
          const cands = sims.current.filter((s) => s.team === focusTeam && m >= s.p.enter && m <= s.p.exit);
          if (cands.length && Math.random() < dt * 0.8) {
            const c = cands[Math.floor(Math.random() * cands.length)];
            b.focus = { x: c.pos.x, y: c.pos.y };
          }
          const k = 1 - Math.pow(0.01, dt);
          b.x += (b.focus.x - b.x) * k;
          b.y += (b.focus.y - b.y) * k;
          b.h = 0;
        }
      } else if (b.mode === "flight" && b.flight) {
        const f = b.flight;
        f.t = Math.min(f.t + dt / f.dur, 1);
        b.x = f.fx + (f.tx - f.fx) * f.t;
        b.y = f.fy + (f.ty - f.fy) * f.t;
        b.h = Math.sin(f.t * Math.PI) * 26; // arc
        if (f.t >= 1) {
          if (f.goal) { b.mode = "burst"; b.burstT = 0; }
          else { b.mode = "drift"; b.focus = { x: W / 2 + (Math.random() - 0.5) * 200, y: H / 2 + (Math.random() - 0.5) * 160 }; }
        }
      } else if (b.mode === "burst" && b.burstT != null) {
        b.burstT += dt * 1.6;
        if (b.burstT >= 1) { b.mode = "drift"; b.burstT = undefined; b.focus = { x: W / 2, y: H / 2 }; }
      }

      // UI clock at ~5fps to avoid re-render storms
      uiAccum += dtMs;
      if (uiAccum > 200) { uiAccum = 0; setClock(S.minute); }
      draw();
    };
    gsap.ticker.add(tick);
    draw();
    return () => gsap.ticker.remove(tick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  useEffect(() => { playingRef.current = playing; }, [playing]);
  useEffect(() => { speedRef.current = SPEEDS[speedIdx].mps; }, [speedIdx]);

  const m = Math.floor(clock);
  const score = scoreAt(clock);
  const lastEvent = [...replay.ticker].reverse().find((e) => e.minute <= clock);

  return (
    <section aria-label="match replay">
      {/* scoreboard row */}
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button
          onClick={() => setPlaying(!playing)}
          className="display min-h-11 rounded border border-gold bg-surface px-5 text-lg font-semibold text-gold transition-colors hover:bg-raised"
          aria-pressed={playing}
        >
          {playing ? "❚❚ pause" : "▶ play"}
        </button>
        <div className="flex gap-1 rounded-md border border-pitchline bg-surface p-1">
          {SPEEDS.map((s, i) => (
            <button key={s.label} onClick={() => setSpeedIdx(i)} aria-pressed={speedIdx === i}
              className={`data min-h-9 rounded px-3 text-sm ${speedIdx === i ? "bg-raised text-gold" : "text-dim hover:text-chalk"}`}>
              {s.label}
            </button>
          ))}
        </div>
        <p className="data ml-auto text-2xl text-chalk">
          <span style={{ color: replay.home.color }}>{replay.home.abbr}</span>{" "}
          {score.home}–{score.away}{" "}
          <span style={{ color: replay.away.color }}>{replay.away.abbr}</span>
          <span className="ml-3 text-dim">{m}&#8242;</span>
        </p>
      </div>

      {/* pitch */}
      <div className="overflow-hidden rounded-lg border border-pitchline bg-surface">
        <canvas ref={canvasRef} width={W} height={H} className="w-full"
          role="img"
          aria-label={`Replay reconstruction, minute ${m}: ${replay.home.name} ${score.home}, ${replay.away.name} ${score.away}`} />
      </div>

      {/* scrub with goal markers */}
      <div className="relative mt-3">
        <input
          type="range"
          min={0}
          max={replay.maxMinute}
          step={0.5}
          value={clock}
          onChange={(e) => { setPlaying(false); playingRef.current = false; jumpTo(parseFloat(e.target.value)); }}
          className="w-full accent-[#e3be56]"
          aria-label="replay position in minutes"
        />
        {replay.goals.map((g, i) => (
          <span key={i}
            className="pointer-events-none absolute top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-gold"
            style={{ left: `${(g.minute / replay.maxMinute) * 100}%` }}
            title={`goal ${g.minute}'`} />
        ))}
      </div>

      {/* ticker */}
      <p className="data mt-2 min-h-6 text-sm text-dim" aria-live="polite">
        {lastEvent ? `${lastEvent.minute}′ — ${lastEvent.desc}` : "kick-off ready"}
      </p>
    </section>
  );
}
