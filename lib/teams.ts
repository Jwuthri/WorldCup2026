import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCalendar } from "@/lib/data";
import { getCards, type Card } from "@/lib/cards";

export type Team = {
  id: string;
  name: string;
  abbr: string;
  group: string;
  finish: string;
  champion: boolean;
  formations: string[];
  identity: { label: string; value: string; pct: number }[];
  results: { matchId: string; opp: string; oppAbbr: string; score: string; stage: string; outcome: "W" | "D" | "L" }[];
  squad: Card[];
};

const seasonTeams = cache((): Record<string, Record<string, number>> => {
  const raw = JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/fifa/season_teams.json"), "utf8"));
  const out: Record<string, Record<string, number>> = {};
  for (const [id, rows] of Object.entries(raw)) {
    out[id] = {};
    for (const [k, v] of rows as [string, number, boolean][]) out[id][k] = v;
  }
  return out;
});

// volume metrics are divided by matches played so 3-game teams compare fairly with 8-game teams
const IDENTITY: { label: string; k: string; perMatch?: boolean; invert?: boolean; fmt?: (v: number) => string }[] = [
  { label: "Possession", k: "Possession", fmt: (v) => `${Math.round(v * 100)}%` },
  { label: "Expected goals / match", k: "XG", perMatch: true, fmt: (v) => v.toFixed(2) },
  { label: "Goals / match", k: "Goals", perMatch: true, fmt: (v) => v.toFixed(1) },
  { label: "Conceded / match", k: "GoalsConceded", perMatch: true, invert: true, fmt: (v) => v.toFixed(1) },
  { label: "Threat / match", k: "Threat", perMatch: true, fmt: (v) => v.toFixed(0) },
  { label: "High-press phases / match", k: "PhaseAggregateHighPress", perMatch: true, fmt: (v) => v.toFixed(1) },
  { label: "Ball recovery time", k: "BallRecoveryTime", invert: true, fmt: (v) => `${v.toFixed(1)}s` },
  { label: "Forced turnovers / match", k: "ForcedTurnovers", perMatch: true, fmt: (v) => v.toFixed(0) },
  { label: "Passes completed / match", k: "PassesCompleted", perMatch: true, fmt: (v) => v.toFixed(0) },
  { label: "Line breaks / match", k: "LinebreaksCompleted", perMatch: true, fmt: (v) => v.toFixed(0) },
  { label: "Distance / match", k: "TotalDistance", perMatch: true, fmt: (v) => `${(v / 1000).toFixed(0)} km` },
  { label: "Top speed", k: "TopSpeed", fmt: (v) => `${v.toFixed(1)} km/h` },
];

export const getTeams = cache((): Map<string, Team> => {
  const cal = getCalendar();
  const st = seasonTeams();
  const cards = [...getCards().values()];

  type Raw = { id: string; name: string; abbr: string; group: string; matches: typeof cal };
  const raws = new Map<string, Raw>();
  for (const m of cal)
    for (const side of ["home", "away"] as const) {
      const t = m[side];
      let r = raws.get(t.abbr);
      if (!r) raws.set(t.abbr, (r = { id: t.id, name: t.name, abbr: t.abbr, group: "", matches: [] as any }));
      if (m.group) r.group = m.group;
      r.matches.push(m);
    }

  // identity percentile pools across all teams
  const val = (teamId: string, spec: (typeof IDENTITY)[number]): number | null => {
    const row = st[teamId];
    if (!row || row[spec.k] == null) return null;
    const mp = row.MatchesPlayed || 1;
    return spec.perMatch ? row[spec.k] / mp : row[spec.k];
  };
  const pools: Record<string, number[]> = {};
  for (const spec of IDENTITY)
    pools[spec.k] = [...raws.values()]
      .map((r) => val(r.id, spec))
      .filter((v): v is number => v != null)
      .sort((a, b) => a - b);

  const teams = new Map<string, Team>();
  for (const r of raws.values()) {
    const results: Team["results"] = r.matches.map((m) => {
      const isHome = m.home.abbr === r.abbr;
      const us = isHome ? m.home : m.away;
      const them = isHome ? m.away : m.home;
      const outcome: "W" | "D" | "L" =
        m.winner === us.id ? "W" : m.winner && m.winner !== us.id ? "L" : (us.score ?? 0) > (them.score ?? 0) ? "W" : (us.score ?? 0) < (them.score ?? 0) ? "L" : "D";
      return {
        matchId: m.id,
        opp: them.name,
        oppAbbr: them.abbr,
        score: `${us.score}:${them.score}${m.penHome != null ? ` (${isHome ? m.penHome : m.penAway}–${isHome ? m.penAway : m.penHome} pens)` : ""}`,
        stage: m.group || m.stage,
        outcome,
      };
    });

    const last = r.matches[r.matches.length - 1];
    const wonLast = last.winner === r.id;
    const lastStage = last.stage;
    let finish: string;
    if (/final/i.test(lastStage) && !/semi|quarter|third|bronze|play/i.test(lastStage))
      finish = wonLast ? "World champions" : "Runners-up";
    else if (/third|bronze|play/i.test(lastStage)) finish = wonLast ? "Third place" : "Fourth place";
    else if (lastStage === "First Stage") finish = "Group stage";
    else finish = `Eliminated in the ${lastStage.toLowerCase()}`;

    const formCounts: Record<string, number> = {};
    for (const m of r.matches) {
      const t = m.home.abbr === r.abbr ? m.home.tactics : m.away.tactics;
      if (t) formCounts[t] = (formCounts[t] ?? 0) + 1;
    }
    const formations = Object.entries(formCounts).sort((a, b) => b[1] - a[1]).map(([f, c]) => `${f} ×${c}`);

    const identity = IDENTITY.map((spec) => {
      const v = val(r.id, spec);
      if (v == null) return null;
      const pool = pools[spec.k];
      let lo = 0, hi = pool.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (pool[mid] <= v) lo = mid + 1; else hi = mid; }
      const p = pool.length ? lo / pool.length : 0.5;
      return { label: spec.label, value: spec.fmt ? spec.fmt(v) : `${v}`, pct: spec.invert ? 1 - p : p };
    }).filter(Boolean) as Team["identity"];

    teams.set(r.abbr, {
      id: r.id,
      name: r.name,
      abbr: r.abbr,
      group: r.group,
      finish,
      champion: finish === "World champions",
      formations,
      identity,
      results,
      squad: cards.filter((c) => c.abbr === r.abbr).sort((a, b) => b.overall - a.overall),
    });
  }
  return teams;
});
