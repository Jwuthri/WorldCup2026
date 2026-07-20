"use client";

import { useMemo, useRef, useState } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import PitchLines, { PITCH_W as W, PITCH_H as H } from "./PitchLines";

gsap.registerPlugin(useGSAP);

/* ---------- serializable props (built server-side in the match page) ---------- */

export type TPanelRow = { name: string; value: string; pct: number };
export type TPanelSection = { label: string; rows: TPanelRow[] };
export type TPlayer = {
  id: string;
  shortName: string;
  shirt: number;
  photo: string | null;
  rating: number | null;
  heatmap: string | null;
  positionName: string | null;
  slot: { line: number; side: number } | null;
  starter: boolean;
  panel: TPanelSection[];
};
export type TSide = {
  name: string;
  abbr: string;
  color: string;
  formation: string | null;
  flag: string;
  players: TPlayer[];
};
export type TShot = {
  team: "home" | "away";
  minute: string;
  player: string;
  xg: number | null;
  xgot: number | null;
  bodyPart: string | null;
  outcome: string;
  x: number;
  y: number;
  gateY: number | null;
  gateZ: number | null;
};
export type TPulseEvent = {
  minute: number;
  team: "home" | "away";
  xg: number;
  kind: "shot" | "goal" | "yellow" | "red";
  who?: string | null; // player, when known
  note?: string | null; // outcome ("Saved", "Yellow card", …)
  label?: string; // raw minute display, keeps "45+2"
};
export type TPulse = TPulseEvent[];

type Props = { home: TSide; away: TSide; shots: TShot[]; pulse: TPulse; maxMinute: number };

const ratingTone = (r: number | null) =>
  r == null ? "var(--faint)" : r >= 8 ? "var(--gold)" : r >= 6.5 ? "var(--chalk)" : "var(--ember)";

/** formation coordinates: depth lines from yardFormation, own half, GK at edge */
export function formationXY(p: Pick<TPlayer, "slot">, side: "home" | "away", lineCount: number) {
  const slot = p.slot ?? { line: 0, side: 50 };
  const depth = lineCount > 1 ? slot.line / (lineCount - 1) : 0; // 0=GK line .. 1=front line
  const x = 55 + depth * 380; // 55..435 inside own half
  const y = 60 + (slot.side / 100) * (H - 120);
  return side === "home" ? { x, y } : { x: W - x, y: H - y };
}

function PlayerNode({ p, x, y, color, active, onClick }: {
  p: TPlayer; x: number; y: number; color: string; active: boolean; onClick: () => void;
}) {
  const R = 24;
  return (
    <g
      transform={`translate(${x},${y})`}
      onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      tabIndex={0}
      style={{ cursor: "pointer" }}
      role="button"
      aria-label={`${p.shortName}, rating ${p.rating ?? "n/a"}`}
    >
      <circle r={44} fill="transparent" />
      {active && <circle r={R + 7} fill="none" stroke="var(--gold)" strokeWidth={2} />}
      <circle r={R} fill="var(--raised)" stroke={color} strokeWidth={2.5} />
      {p.photo ? (
        <>
          <clipPath id={`clip-${p.id}`}>
            <circle r={R - 2} />
          </clipPath>
          <image
            href={p.photo}
            x={-R + 2}
            y={-R + 2}
            width={(R - 2) * 2}
            height={(R - 2) * 2}
            clipPath={`url(#clip-${p.id})`}
            preserveAspectRatio="xMidYMin slice"
          />
        </>
      ) : (
        <text textAnchor="middle" dy={5} fontSize={15} fill="var(--dim)" className="display">
          {p.shirt}
        </text>
      )}
      <text textAnchor="middle" y={R + 15} fontSize={12.5} fill="var(--chalk)" opacity={0.92}>
        {p.shortName}
      </text>
      {p.rating != null && (
        <g transform={`translate(${R - 6},${-R + 2})`}>
          <rect x={-13} y={-9} width={27} height={17} rx={3} fill="var(--bg)" stroke={ratingTone(p.rating)} strokeWidth={1} />
          <text textAnchor="middle" dy={4} fontSize={11} fill={ratingTone(p.rating)} fontFamily="var(--font-plex-mono)">
            {p.rating.toFixed(1)}
          </text>
        </g>
      )}
    </g>
  );
}

/* ---------- shot layer ---------- */

const shotXY = (s: TShot) =>
  s.team === "home"
    ? { x: (s.x / 100) * W, y: (s.y / 100) * H }
    : { x: W - (s.x / 100) * W, y: H - (s.y / 100) * H };

function ShotDot({ s, color, active, onClick }: { s: TShot; color: string; active: boolean; onClick: () => void }) {
  const { x, y } = shotXY(s);
  const goal = s.outcome === "Goal";
  const onTarget = goal || s.outcome === "Saved";
  const r = 5 + (s.xg ?? 0.03) * 26;
  return (
    <g onClick={onClick}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      tabIndex={0} style={{ cursor: "pointer" }} role="button"
      aria-label={`${s.player} ${s.minute}, ${s.outcome}, xG ${s.xg ?? "?"}`}>
      {/* hit area floored for touch: ~30px on a 375px-wide screen */}
      <circle cx={x} cy={y} r={Math.max(r + 6, 48)} fill="transparent" />
      {goal && <circle cx={x} cy={y} r={r + 4} fill="none" stroke="var(--gold)" strokeWidth={1.5} opacity={0.9} />}
      <circle
        cx={x}
        cy={y}
        r={r}
        fill={goal ? "var(--gold)" : onTarget ? color : "transparent"}
        fillOpacity={goal ? 0.95 : 0.75}
        stroke={active ? "var(--chalk)" : goal ? "var(--gold)" : color}
        strokeWidth={active ? 2.5 : 1.5}
      />
    </g>
  );
}

function GoalMouth({ shot, color }: { shot: TShot; color: string }) {
  // 365scores semantics: gateY = % of PITCH WIDTH (frame spans 44.6..55.4%);
  // gateZ = height off the ground on a ~8m scale (crossbar 2.44m ≈ 30.5%)
  const gw = 146, gh = 49, cx0 = 93, ground = 88;
  const pxPerM = gw / 7.32;
  const cx = shot.gateY != null
    ? Math.min(180, Math.max(6, cx0 + ((shot.gateY / 100) * 68 - 34) * pxPerM))
    : null;
  const cy = shot.gateZ != null
    ? Math.min(ground - 2, Math.max(6, ground - (shot.gateZ / 100) * 8 * (gh / 2.44)))
    : null;
  return (
    <svg viewBox="0 0 186 96" className="w-full" aria-label="shot placement in the goal frame">
      <line x1={0} y1={ground} x2={186} y2={ground} stroke="var(--chalk)" strokeOpacity={0.25} strokeWidth={2} />
      <rect x={20} y={ground - gh} width={gw} height={gh} fill="none" stroke="var(--chalk)" strokeOpacity={0.7} strokeWidth={2.5} />
      {cx != null && cy != null ? (
        <circle cx={cx} cy={cy} r={6}
          fill={shot.outcome === "Goal" ? "var(--gold)" : color}
          stroke="var(--bg)" strokeWidth={1.5} />
      ) : cx != null ? (
        // blocked: direction known, never reached the frame
        <circle cx={cx} cy={ground - 5} r={5} fill="none" stroke={color} strokeWidth={2} strokeDasharray="3 3" />
      ) : (
        <text x={93} y={60} textAnchor="middle" fontSize={11} fill="var(--faint)">
          no placement data
        </text>
      )}
    </svg>
  );
}

/* ---------- pulse strip: the match's heartbeat in xG ---------- */

function PulseStrip({ pulse, maxMinute, homeColor, awayColor, homeAbbr, awayAbbr }: {
  pulse: TPulse; maxMinute: number; homeColor: string; awayColor: string; homeAbbr: string; awayAbbr: string;
}) {
  const PW = 1050, PH = 150, mid = PH / 2;
  const [win, setWin] = useState<number | null>(null);
  const mx = (m: number) => 30 + (Math.min(m, maxMinute) / maxMinute) * (PW - 60);
  const nWin = Math.max(1, Math.ceil(maxMinute / 5));
  const wOf = (m: number) => Math.min(Math.floor(m / 5), nWin - 1);
  const { sums, events } = useMemo(() => {
    const sums: Record<string, number> = {};
    const events: TPulseEvent[][] = Array.from({ length: nWin }, () => []);
    for (const e of pulse) {
      events[wOf(e.minute)].push(e);
      if (e.kind === "shot" || e.kind === "goal")
        sums[`${e.team}:${wOf(e.minute)}`] = (sums[`${e.team}:${wOf(e.minute)}`] ?? 0) + Math.max(e.xg, 0.02);
    }
    // "90+8" parses as 90 — break ties on added time so stoppage reads in order
    const at = (e: TPulseEvent) => e.minute + (+(String(e.label ?? "").match(/\+\s*(\d+)/)?.[1] ?? 0)) / 30;
    for (const w of events) w.sort((a, b) => at(a) - at(b));
    return { sums, events };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse, nWin]);
  const maxB = Math.max(0.4, ...Object.values(sums));
  const winW = ((PW - 60) * 5) / maxMinute;

  const teamColor = (t: "home" | "away") => (t === "home" ? homeColor : awayColor);
  const eventTone = (e: TPulseEvent) =>
    e.kind === "goal" ? "var(--gold)" : e.kind === "red" ? "var(--ember)" : teamColor(e.team);
  const eventNote = (e: TPulseEvent) =>
    [e.note, e.kind === "shot" || e.kind === "goal" ? `${e.xg.toFixed(2)} xG` : null].filter(Boolean).join(" · ");
  // no window hovered -> the headlines: every goal, both teams
  const shown = win == null ? pulse.filter((e) => e.kind === "goal").sort((a, b) => a.minute - b.minute) : events[win];

  return (
    <div>
      <svg viewBox={`0 0 ${PW} ${PH}`} className="w-full" aria-label="xG pulse by five-minute period — hover for detail"
        onPointerLeave={() => setWin(null)}>
        {win != null && (
          <rect x={mx(win * 5)} y={4} width={winW} height={PH - 8} rx={4} fill="var(--chalk)" opacity={0.06} />
        )}
        <line x1={30} y1={mid} x2={PW - 30} y2={mid} stroke="var(--line)" strokeWidth={1.5} />
        {(maxMinute > 100 ? [45, 90, 105, maxMinute] : [45, 90]).map((m, i) => (
          <text key={i} x={mx(m)} y={mid + 4} fontSize={10} fill="var(--faint)" textAnchor="middle" fontFamily="var(--font-plex-mono)">
            {m}&#8242;
          </text>
        ))}
        {Object.entries(sums).map(([k, xg]) => {
          const [team, bi] = k.split(":");
          const h = (xg / maxB) * (mid - 26);
          const x = mx(parseInt(bi) * 5 + 2.5);
          return (
            <rect key={k} x={x - 7} width={14} rx={3}
              y={team === "home" ? mid - 8 - h : mid + 8}
              height={h}
              fill={team === "home" ? homeColor : awayColor}
              opacity={win == null ? 0.8 : parseInt(bi) === win ? 1 : 0.3}
            />
          );
        })}
        {pulse.filter((e) => e.kind === "goal").map((e, i) => (
          <circle key={`g${i}`} cx={mx(e.minute)} cy={e.team === "home" ? 16 : PH - 16} r={7}
            fill="var(--gold)" stroke="var(--bg)" strokeWidth={2}
            opacity={win == null || wOf(e.minute) === win ? 1 : 0.35} />
        ))}
        {pulse.filter((e) => e.kind === "yellow" || e.kind === "red").map((e, i) => (
          <rect key={`c${i}`} x={mx(e.minute) - 3.5} y={e.team === "home" ? 28 : PH - 38} width={7} height={10} rx={1.5}
            fill={e.kind === "red" ? "var(--ember)" : "var(--gold)"}
            opacity={win == null ? 0.75 : wOf(e.minute) === win ? 1 : 0.3} />
        ))}
        <text x={30} y={18} fontSize={11} fill={homeColor} fontFamily="var(--font-plex-mono)">{homeAbbr}</text>
        <text x={30} y={PH - 8} fontSize={11} fill={awayColor} fontFamily="var(--font-plex-mono)">{awayAbbr}</text>
        {/* hover targets, one per 5' window */}
        {Array.from({ length: nWin }, (_, i) => (
          <rect key={`w${i}`} x={mx(i * 5)} y={0} width={winW} height={PH} fill="transparent"
            onPointerEnter={() => setWin(i)} onFocus={() => setWin(i)} onBlur={() => setWin(null)}
            tabIndex={0} role="button"
            aria-label={`minutes ${i * 5} to ${i * 5 + 5}: ${events[i].length} events`} />
        ))}
      </svg>

      {/* who did what */}
      <div className="mt-2 border-t border-pitchline pt-2">
        <p className="eyebrow mb-1.5">
          {win == null ? "goals — hover the strip for every shot and card, with names" : `minutes ${win * 5}–${Math.min(win * 5 + 5, maxMinute)}`}
        </p>
        <ul className="grid max-h-28 gap-x-6 gap-y-1 overflow-y-auto text-sm sm:grid-cols-2">
          {shown.length === 0 && <li className="text-faint">quiet five minutes — nothing on record</li>}
          {shown.map((e, i) => (
            <li key={i} className="flex items-baseline gap-2">
              <span className="inline-block h-2.5 w-2.5 shrink-0 self-center rounded-full" style={{ background: eventTone(e) }} />
              <span className="data shrink-0 text-dim">{String(e.label ?? e.minute).replace(/['′′]+$/, "").replace(/\s+/g, "")}&#8242;</span>
              <span className={e.kind === "goal" ? "text-gold" : "text-chalk"}>{e.who ?? (e.kind === "goal" ? "Goal" : e.kind)}</span>
              <span className="truncate text-faint">{eventNote(e)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

/* ---------- the theater ---------- */

export default function MatchTheater({ home, away, shots, pulse, maxMinute }: Props) {
  const [layer, setLayer] = useState<"formation" | "shots">("formation");
  const [sel, setSel] = useState<TPlayer | null>(null);
  const [selShot, setSelShot] = useState<TShot | null>(null);
  const rootRef = useRef<HTMLElement>(null);
  const prevLayer = useRef(layer);

  // morph between layers: outgoing dots collapse, incoming pop in — one continuous scene
  useGSAP(
    () => {
      const outSel = layer === "formation" ? ".layer-shots" : ".layer-formation";
      const inSel = layer === "formation" ? ".layer-formation" : ".layer-shots";
      if (prevLayer.current === layer) {
        gsap.set(outSel, { autoAlpha: 0 });
        return;
      }
      prevLayer.current = layer;
      if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
        gsap.set(outSel, { autoAlpha: 0 });
        gsap.set(inSel, { autoAlpha: 1 });
        return;
      }
      const outEls = gsap.utils.toArray<SVGGElement>(`${outSel} > g`);
      const inEls = gsap.utils.toArray<SVGGElement>(`${inSel} > g`);
      gsap.timeline()
        .set(inSel, { autoAlpha: 1 })
        .to(outEls, { scale: 0, transformOrigin: "50% 50%", duration: 0.22, stagger: { each: 0.012, from: "random" }, ease: "power2.in" })
        .set(outSel, { autoAlpha: 0 })
        .set(outEls, { scale: 1 })
        .fromTo(inEls, { scale: 0, transformOrigin: "50% 50%" },
          { scale: 1, duration: 0.32, stagger: { each: 0.018, from: "random" }, ease: "back.out(1.5)" }, "-=0.04");
    },
    { scope: rootRef, dependencies: [layer] }
  );

  const lineCount = (ps: TPlayer[]) =>
    1 + Math.max(0, ...ps.filter((p) => p.starter && p.slot).map((p) => p.slot!.line));
  const hLines = lineCount(home.players);
  const aLines = lineCount(away.players);
  const starters = (s: TSide) => s.players.filter((p) => p.starter && p.slot);
  const subsUsed = (s: TSide) => s.players.filter((p) => !p.starter && p.rating != null);

  const colorOf = (t: "home" | "away") => (t === "home" ? home.color : away.color);

  return (
    <section aria-label="match theater" ref={rootRef}>
      {/* layer switch */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex gap-1 rounded-md border border-pitchline bg-surface p-1">
          {(["formation", "shots"] as const).map((l) => (
            <button
              key={l}
              aria-pressed={layer === l}
              onClick={() => { setLayer(l); setSelShot(null); }}
              className={`display min-h-11 rounded px-4 text-sm font-semibold tracking-wide transition-colors ${
                layer === l ? "bg-raised text-chalk" : "text-dim hover:text-chalk"
              }`}
            >
              {l === "formation" ? "Formations" : "Shot map"}
            </button>
          ))}
        </div>
        <p className="eyebrow mt-1 sm:mt-0">
          {layer === "formation" ? "tap a player for their match file" : "dot size = xG · tap a shot"}
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        {/* pitch */}
        <div className="rounded-lg border border-pitchline bg-surface p-2 sm:p-4">
          <div className="mb-2 flex justify-between px-2">
            {[{ s: home, c: home.color }, { s: away, c: away.color }].map(({ s, c }, i) => (
              <div key={i} className={`flex items-center gap-2 ${i ? "flex-row-reverse" : ""}`}>
                <img src={s.flag} alt="" width={22} height={22} className="rounded-sm" />
                <span className="display text-lg font-semibold" style={{ color: c }}>{s.name}</span>
                {s.formation && <span className="data text-xs text-dim">{s.formation}</span>}
              </div>
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full" aria-label="pitch">
            <PitchLines />
            {/* both layers stay mounted; GSAP morphs between them on toggle */}
            <g className="layer-formation" style={{ pointerEvents: layer === "formation" ? "auto" : "none" }}>
              {([["home", home, hLines], ["away", away, aLines]] as const).map(([t, side, lines]) =>
                starters(side).map((p) => {
                  const { x, y } = formationXY(p, t, lines);
                  return (
                    <PlayerNode key={p.id} p={p} x={x} y={y} color={side.color}
                      active={sel?.id === p.id}
                      onClick={() => setSel(sel?.id === p.id ? null : p)} />
                  );
                })
              )}
            </g>
            {/* `invisible` prevents pre-hydration double-render; GSAP inline styles own it after mount */}
            <g className="layer-shots invisible" style={{ pointerEvents: layer === "shots" ? "auto" : "none" }}>
              {shots.map((s, i) => (
                <ShotDot key={i} s={s} color={colorOf(s.team)} active={selShot === s}
                  onClick={() => setSelShot(selShot === s ? null : s)} />
              ))}
            </g>
          </svg>
          {/* subs strip */}
          {layer === "formation" && (
            <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-pitchline px-2 pt-3">
              <span className="eyebrow mr-1">from the bench</span>
              {[home, away].flatMap((s) =>
                subsUsed(s).map((p) => (
                  <button key={p.id} onClick={() => setSel(sel?.id === p.id ? null : p)}
                    className={`flex min-h-11 items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors ${
                      sel?.id === p.id ? "border-gold text-chalk" : "border-pitchline text-dim hover:text-chalk"
                    }`}>
                    <span className="h-2 w-2 rounded-full" style={{ background: s.color }} />
                    {p.shortName}
                    {p.rating != null && (
                      <span className="data" style={{ color: ratingTone(p.rating) }}>{p.rating.toFixed(1)}</span>
                    )}
                  </button>
                ))
              )}
            </div>
          )}
        </div>

        {/* side panel */}
        <aside className="rounded-lg border border-pitchline bg-surface p-4" aria-live="polite">
          {layer === "shots" && selShot ? (
            <ShotPanel shot={selShot} color={colorOf(selShot.team)}
              team={selShot.team === "home" ? home : away} />
          ) : sel ? (
            <PlayerPanel p={sel}
              side={home.players.some((x) => x.id === sel.id) ? home : away} />
          ) : (
            <div className="flex h-full min-h-48 flex-col items-center justify-center gap-2 text-center">
              <p className="display text-xl text-dim">
                {layer === "shots" ? "Select a shot" : "Select a player"}
              </p>
              <p className="max-w-52 text-xs text-faint">
                {layer === "shots"
                  ? "See its xG, body part and exact placement in the goal frame."
                  : "Real match file: rating, heatmap, attack, passing, defending and physical data."}
              </p>
            </div>
          )}
        </aside>
      </div>

      {/* pulse */}
      <div className="mt-4 rounded-lg border border-pitchline bg-surface p-4">
        <p className="eyebrow mb-2">match pulse — xG per 5 minutes · goals · cards</p>
        <PulseStrip pulse={pulse} maxMinute={maxMinute}
          homeColor={home.color} awayColor={away.color} homeAbbr={home.abbr} awayAbbr={away.abbr} />
      </div>
    </section>
  );
}

function ShotPanel({ shot, color, team }: { shot: TShot; color: string; team: TSide }) {
  return (
    <div>
      <p className="eyebrow mb-1">{team.name} · {shot.minute}</p>
      <h3 className="display text-3xl font-bold">{shot.player || "Unknown"}</h3>
      <p className="mb-4 text-sm" style={{ color: shot.outcome === "Goal" ? "var(--gold)" : "var(--dim)" }}>
        {shot.outcome === "Goal" ? "GOAL" : shot.outcome}
        {shot.bodyPart ? ` · ${shot.bodyPart.toLowerCase()}` : ""}
      </p>
      <div className="mb-4 grid grid-cols-2 gap-2">
        <div className="rounded border border-pitchline bg-raised p-3">
          <p className="eyebrow">xG</p>
          <p className="data text-2xl text-chalk">{shot.xg?.toFixed(2) ?? "—"}</p>
        </div>
        <div className="rounded border border-pitchline bg-raised p-3">
          <p className="eyebrow">xG on target</p>
          <p className="data text-2xl text-chalk">{shot.xgot?.toFixed(2) ?? "—"}</p>
        </div>
      </div>
      <p className="eyebrow mb-1">where it went</p>
      <GoalMouth shot={shot} color={color} />
    </div>
  );
}

function PlayerPanel({ p, side }: { p: TPlayer; side: TSide }) {
  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        {p.photo && (
          <img src={p.photo} alt="" width={56} height={56}
            className="rounded-full border-2 object-cover" style={{ borderColor: side.color }} />
        )}
        <div>
          <p className="eyebrow">{side.name} · #{p.shirt}{p.positionName ? ` · ${p.positionName}` : ""}</p>
          <h3 className="display text-2xl font-bold leading-tight">{p.shortName}</h3>
        </div>
        {p.rating != null && (
          <span className="data ml-auto rounded border px-2 py-1 text-xl"
            style={{ color: ratingTone(p.rating), borderColor: ratingTone(p.rating) }}>
            {p.rating.toFixed(1)}
          </span>
        )}
      </div>
      {p.heatmap && (
        <div className="mb-3 overflow-hidden rounded border border-pitchline">
          <img src={p.heatmap} alt={`${p.shortName} heatmap`} className="w-full" loading="lazy" />
        </div>
      )}
      <div className="space-y-3">
        {p.panel.map((sec) => (
          <div key={sec.label}>
            <p className="eyebrow mb-1.5">{sec.label}</p>
            <div className="space-y-1.5">
              {sec.rows.map((r) => (
                <div key={r.name} className="grid grid-cols-[1fr_auto] items-center gap-2 text-xs">
                  <div>
                    <div className="mb-0.5 flex justify-between">
                      <span className="text-dim">{r.name}</span>
                      <span className="data text-chalk">{r.value}</span>
                    </div>
                    <div className="h-1 rounded-full bg-raised">
                      <div className="h-1 rounded-full" style={{ width: `${Math.round(r.pct * 100)}%`, background: side.color }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
