import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import {
  getCalendar,
  getMatchBundle,
  flagUrl,
  type MatchPlayer,
  type MatchSide,
} from "@/lib/data";
import { getConditions } from "@/lib/context";
import MatchTheater, {
  type TPlayer,
  type TSide,
  type TPulse,
  type TPanelSection,
} from "@/components/MatchTheater";
import DuelBars, { type DuelRow } from "@/components/DuelBars";
import ShotReplay from "@/components/ShotReplay";
import MatchColumn, { readColumn } from "@/components/MatchColumn";
import Heatmap from "@/components/Heatmap";
import { matchTerritory, hasHeat } from "@/lib/heatmap";

export function generateStaticParams() {
  return getCalendar().map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = getCalendar().find((x) => x.id === id);
  if (!m) return {};
  return {
    title: `${m.home.name} ${m.home.score ?? ""}–${m.away.score ?? ""} ${m.away.name} — MUNDIAL·26`,
    description: `${m.stage}${m.group ? ` · ${m.group}` : ""} · ${m.stadium}, ${m.city}. Formations, xG shot map, heatmaps, ratings and physical data.`,
  };
}

/* ---- player panel: merge FIFA data-hub metrics with 365scores technical stats ---- */

type Spec = { name: string; s?: string; f?: string; fmt?: (v: number) => string };
const SECTIONS: { label: string; specs: Spec[]; gk?: boolean }[] = [
  {
    label: "Attack",
    specs: [
      { name: "Goals", s: "Goals", f: "Goals" },
      { name: "xG", s: "Expected Goals" },
      { name: "Shots", s: "Total Shots", f: "AttemptAtGoal" },
      { name: "On target", s: "Shots On Target", f: "AttemptAtGoalOnTarget" },
      { name: "Dribbles won", s: "Successful Dribbles" },
      { name: "Big chances missed", s: "Big Chances Missed" },
    ],
  },
  {
    label: "Creation",
    specs: [
      { name: "Assists", s: "Assists", f: "Assists" },
      { name: "xA", s: "Expected Assists" },
      { name: "Key passes", s: "Key Passes" },
      { name: "Big chances created", s: "Big Chances Created" },
      { name: "Passes completed", s: "Passes Completed", f: "PassesCompleted" },
      { name: "Into final third", s: "Passes Into Final Third" },
    ],
  },
  {
    label: "Defending",
    specs: [
      { name: "Tackles won", s: "Tackles Won" },
      { name: "Interceptions", s: "Interceptions" },
      { name: "Ball recoveries", s: "Ball Recovery" },
      { name: "Clearances", s: "Clearances" },
      { name: "Ground duels won", s: "Ground Duels Won" },
      { name: "Aerial duels won", s: "Aerial Duels Won" },
    ],
  },
  {
    label: "Goalkeeping",
    gk: true,
    specs: [
      { name: "Saves", s: "Goalkeeper Saves", f: "GoalkeeperSaves" },
      { name: "Goals conceded", s: "Goals Conceded" },
      { name: "xG prevented", s: "Expected Goals Prevented" },
      { name: "Save %", f: "GoalkeeperSavePercentage", fmt: (v) => `${Math.round(v * 100)}%` },
    ],
  },
  {
    label: "Physical — FIFA tracking",
    specs: [
      { name: "Distance", f: "TotalDistance", fmt: (v) => `${(v / 1000).toFixed(1)} km` },
      { name: "Top speed", f: "TopSpeed", fmt: (v) => `${v.toFixed(1)} km/h` },
      { name: "Sprint distance", f: "DistanceHighSpeedSprinting", fmt: (v) => `${Math.round(v)} m` },
      { name: "Touches", s: "Touches" },
      { name: "Minutes", s: "Minutes", f: "TimePlayed", fmt: (v) => `${Math.round(v)}'` },
    ],
  },
];

function numeric(p: MatchPlayer, spec: Spec): { num: number; disp: string } | null {
  if (spec.s) {
    const row = p.s365Stats.find((x) => x.name === spec.s);
    if (row) {
      const num = parseFloat(row.value);
      if (!Number.isNaN(num)) return { num, disp: spec.fmt ? spec.fmt(num) : row.value };
    }
  }
  if (spec.f && p.fdh[spec.f] != null) {
    const num = p.fdh[spec.f];
    return { num, disp: spec.fmt ? spec.fmt(num) : `${Math.round(num * 100) / 100}` };
  }
  return null;
}

function buildPanels(all: MatchPlayer[]): Map<string, TPanelSection[]> {
  // per-spec max across the match, so bars are honest relative comparisons
  const maxOf = new Map<string, number>();
  for (const sec of SECTIONS)
    for (const spec of sec.specs) {
      let mx = 0;
      for (const p of all) {
        const v = numeric(p, spec);
        if (v) mx = Math.max(mx, v.num);
      }
      maxOf.set(`${sec.label}:${spec.name}`, mx);
    }
  const out = new Map<string, TPanelSection[]>();
  for (const p of all) {
    const isGk = p.positionName === "Goalkeeper" || (p.fdh.GoalkeeperSaves ?? 0) > 0;
    const sections: TPanelSection[] = [];
    for (const sec of SECTIONS) {
      if (sec.gk && !isGk) continue;
      if (isGk && sec.label === "Defending") continue; // keep GK panels tight
      const rows = sec.specs
        .map((spec) => {
          const v = numeric(p, spec);
          if (!v || (v.num === 0 && sec.label !== "Physical — FIFA tracking")) return null;
          const mx = maxOf.get(`${sec.label}:${spec.name}`) || 1;
          return { name: spec.name, value: v.disp, pct: mx ? Math.min(1, v.num / mx) : 0 };
        })
        .filter(Boolean) as TPanelSection["rows"];
      if (rows.length) sections.push({ label: sec.label, rows });
    }
    out.set(p.fifaId, sections);
  }
  return out;
}

const toTSide = (side: MatchSide, panels: Map<string, TPanelSection[]>): TSide => ({
  name: side.ref.name,
  abbr: side.ref.abbr,
  color: side.color,
  formation: side.formation,
  flag: flagUrl(side.ref.abbr),
  players: side.players.map(
    (p): TPlayer => ({
      id: p.fifaId,
      shortName: p.shortName,
      shirt: p.shirt,
      photo: p.photo,
      rating: p.rating,
      heatmap: p.heatmap,
      positionName: p.positionName,
      slot: p.formationSlot,
      starter: p.starter,
      panel: panels.get(p.fifaId) ?? [],
    })
  ),
});

const parseMin = (m: string) => parseInt(String(m).replace(/[^0-9+]/g, "").split("+")[0] || "0");

/* ---- team duel rows ---- */
const TEAM_SPECS: { label: string; f?: string; s?: string; fmt?: (v: number) => string }[] = [
  { label: "Possession", f: "Possession", fmt: (v) => `${Math.round(v * 100)}%` },
  { label: "Expected goals", f: "XG", s: "Expected Goals", fmt: (v) => v.toFixed(2) },
  { label: "Threat", f: "Threat" },
  { label: "Shots", f: "AttemptAtGoal" },
  { label: "On target", f: "AttemptAtGoalOnTarget" },
  { label: "Big chances", s: "Big Chances Created" },
  { label: "Passes completed", f: "PassesCompleted" },
  { label: "Forced turnovers", f: "ForcedTurnovers" },
  { label: "Ball recovery time", f: "BallRecoveryTime", fmt: (v) => `${v.toFixed(1)}s` },
  { label: "High-press phases", f: "PhaseAggregateHighPress" },
  { label: "Fouls committed", f: "FoulsFor" },
  { label: "Offsides", f: "Offsides" },
  { label: "Distance covered", f: "TotalDistance", fmt: (v) => `${(v / 1000).toFixed(0)} km` },
  { label: "Top speed", f: "TopSpeed", fmt: (v) => `${v.toFixed(1)} km/h` },
];

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = getMatchBundle(id);
  if (!b) notFound();
  const { cal, home, away, shots, timeline, s365TeamStats } = b;

  const column = readColumn(id);
  const panels = buildPanels([...home.players, ...away.players]);
  const tHome = toTSide(home, panels);
  const tAway = toTSide(away, panels);

  // pulse: shots carry xG; goals + cards from the FIFA timeline
  const pulse: TPulse = [
    ...shots.map((s) => ({
      minute: parseMin(s.minute),
      team: s.team,
      xg: s.xg ?? 0.03,
      kind: (s.outcome === "Goal" ? "goal" : "shot") as "goal" | "shot",
      who: s.player,
      note: s.outcome === "Goal" ? null : s.outcome, // the gold row already says goal
      label: s.minute,
    })),
    ...timeline
      .filter((e) => /card/i.test(e.type))
      .map((e) => ({
        minute: parseMin(e.minute),
        team: (e.team ?? "home") as "home" | "away",
        xg: 0,
        kind: (/red/i.test(e.type) ? "red" : "yellow") as "red" | "yellow",
        // FIFA card descs read "Enzo FERNANDEZ (Argentina) is booked …"
        who: e.desc?.match(/^([^(]+?)\s*\(/)?.[1] ?? null,
        note: /red/i.test(e.type) ? "Red card" : "Yellow card",
        label: e.minute,
      })),
  ];
  const maxMinute = Math.max(90, ...timeline.map((e) => parseMin(e.minute)), ...pulse.map((p) => p.minute));

  // ponytail: fdh covers every duel spec today; wire a 365 fallback only if a match misses fdh
  const duelRows: DuelRow[] = TEAM_SPECS.map((spec) => {
    const h = spec.f ? home.fdh[spec.f] : undefined;
    const a = spec.f ? away.fdh[spec.f] : undefined;
    if (h == null || a == null) return null;
    const fmt = spec.fmt ?? ((v: number) => `${Math.round(v * 100) / 100}`);
    return { label: spec.label, h, a, hDisp: fmt(h), aDisp: fmt(a) };
  }).filter(Boolean) as DuelRow[];

  // FIFA type strings are inconsistent ("Goal!", "Yellow card", "Second Caution - Red Card")
  const feed = timeline.filter((e) =>
    /^(goal!|own goal|penalty goal|substitution|penalty awarded)|card/i.test(e.type)
  );

  const note =
    cal.penHome != null && cal.penAway != null
      ? `${cal.penHome}–${cal.penAway} on penalties`
      : cal.resultType === 3
        ? "after extra time"
        : null;

  const kickoff = new Date(cal.date).toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", timeZone: "UTC",
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 sm:px-8">
      {/* hero scoreline */}
      <p className="eyebrow mb-4 text-center">
        {cal.stage}
        {cal.group ? ` · ${cal.group}` : ""} · {kickoff} · {cal.stadium}, {cal.city}
        {cal.attendance ? ` · ${Number(cal.attendance).toLocaleString("en-US")} in the stands` : ""}
      </p>
      {(() => {
        const c = getConditions(cal);
        const bits = [
          `kickoff ${c.kickoffLocal} local`,
          c.weather ? `${Math.round(c.weather.tempC)}°C · ${c.weather.humidityPct}% humidity` : null,
          c.venue && c.venue.altitudeM > 500 ? `altitude ${c.venue.altitudeM.toLocaleString("en-US")} m` : null,
          c.venue?.roof === "roofed" ? "roofed stadium" : null,
        ].filter(Boolean);
        return bits.length ? <p className="eyebrow -mt-3 mb-4 text-center opacity-70">{bits.join(" · ")}</p> : null;
      })()}
      <div className="mb-2 grid grid-cols-[1fr_auto_1fr] items-center gap-3 sm:gap-8">
        {[
          { side: home, right: true },
          null,
          { side: away, right: false },
        ].map((cell, i) =>
          cell === null ? (
            <div key="score" className="text-center">
              <div className="display text-6xl font-bold tracking-tight sm:text-8xl">
                {home.ref.score}
                <span className="text-faint">:</span>
                {away.ref.score}
              </div>
              {note && <p className="eyebrow mt-1 text-gold">{note}</p>}
            </div>
          ) : (
            <div key={i} className={`flex flex-col items-center gap-2 ${cell.right ? "sm:items-end" : "sm:items-start"}`}>
              <img src={flagUrl(cell.side.ref.abbr)} alt="" width={64} height={64} className="rounded" />
              <Link href={`/team/${cell.side.ref.abbr}`} className="hover:opacity-80">
                <h1 className="display text-center text-3xl font-bold sm:text-5xl" style={{ color: cell.side.color }}>
                  {cell.side.ref.name}
                </h1>
              </Link>
              <div className={`space-y-0.5 text-xs text-dim ${cell.right ? "sm:text-right" : ""}`}>
                {cell.side.goals.map((g, gi) => (
                  <p key={gi}>
                    <span className="data text-gold">{g.minute}&#8242;</span> {g.player}
                    {g.penalty ? " (pen)" : g.own ? " (og)" : ""}
                    {g.assist ? <span className="text-faint"> · {g.assist}</span> : ""}
                  </p>
                ))}
              </div>
            </div>
          )
        )}
      </div>

      <div className="mt-8">
        <MatchTheater home={tHome} away={tAway} shots={shots} pulse={pulse} maxMinute={maxMinute} />
        <div className="mt-4">
          <ShotReplay
            shots={b.shots}
            home={{ name: cal.home.name, abbr: cal.home.abbr, color: home.color }}
            away={{ name: cal.away.name, abbr: cal.away.abbr, color: away.color }}
          />
        </div>
        <p className="mt-4 flex flex-wrap justify-center gap-3 text-center">
          <Link
            href={`/match/${cal.id}/3d`}
            className="display inline-block rounded border border-gold bg-surface px-6 py-3 text-lg font-semibold text-gold transition-colors hover:bg-raised"
          >
            ▶ Watch every shot in 3D
          </Link>
          <Link
            href={`/match/${cal.id}/replay`}
            className="display inline-block rounded border border-gold bg-surface px-6 py-3 text-lg font-semibold text-gold transition-colors hover:bg-raised"
          >
            ⟲ Replay the match
          </Link>
        </p>
      </div>

      {/* team duel */}
      {duelRows.length > 0 && (
        <section className="mt-8 rounded-lg border border-pitchline bg-surface p-4 sm:p-6">
          <h2 className="display mb-4 text-2xl font-semibold">
            The duel <span className="text-sm font-normal text-faint">— team data, FIFA tracking included</span>
          </h2>
          <DuelBars rows={duelRows} homeColor={home.color} awayColor={away.color} />
        </section>
      )}

      {/* territory */}
      {(() => {
        const t = matchTerritory(cal.id);
        if (!t || !hasHeat(t.home) || !hasHeat(t.away)) return null;
        return (
          <section className="mt-8 rounded-lg border border-pitchline bg-surface p-4 sm:p-6">
            <h2 className="display mb-1 text-2xl font-semibold">
              Territory <span className="text-sm font-normal text-faint">— where each team lived</span>
            </h2>
            <p className="mb-4 text-sm text-dim">
              Every player&#39;s heatmap, minutes-weighted and stacked per team.{" "}
              <span style={{ color: home.color }}>{home.ref.name} attack →</span>,{" "}
              <span style={{ color: away.color }}>← {away.ref.name} attack</span>. Brighter is more
              presence; where the colors meet is the contested ground.
            </p>
            <Heatmap
              label={`territory map: ${home.ref.name} vs ${away.ref.name}`}
              layers={[
                { grid: t.home, color: home.color },
                { grid: t.away, color: away.color, mirror: true },
              ]}
            />
          </section>
        );
      })()}

      {/* event feed */}
      {feed.length > 0 && (
        <section className="mt-8 rounded-lg border border-pitchline bg-surface p-4 sm:p-6">
          <h2 className="display mb-4 text-2xl font-semibold">How it happened</h2>
          <ol className="max-h-96 space-y-2 overflow-y-auto pr-2">
            {feed.map((e, i) => (
              <li key={i} className="grid grid-cols-[3rem_10px_1fr] items-baseline gap-3 text-sm">
                <span className="data text-right text-dim">{e.minute}&#8242;</span>
                <span
                  className="inline-block h-2.5 w-2.5 self-center rounded-full"
                  style={{
                    background:
                      e.type.includes("Goal") ? "var(--gold)"
                        : e.type === "Red Card" ? "var(--ember)"
                        : e.team === "home" ? home.color
                        : e.team === "away" ? away.color
                        : "var(--faint)",
                  }}
                />
                <span className={e.type.includes("Goal") ? "text-chalk" : "text-dim"}>{e.desc || e.type}</span>
              </li>
            ))}
          </ol>
        </section>
      )}

      {column && <MatchColumn column={column} homeColor={home.color} awayColor={away.color} />}
    </main>
  );
}
