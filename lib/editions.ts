import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCalendar } from "@/lib/data";

/**
 * One entry per competition-season the site can show. `data/editions.json` holds
 * the harvested spine (see scripts/harvest_editions.py); DISPLAY holds the things
 * a feed can't tell us — accent colour, where the tile goes, what the trophy row
 * is actually called.
 */

export type Edition = {
  slug: string;
  name: string;
  country: string;
  season: string;
  accent: string;
  href: string;
  /** full = per-match data harvested, the whole app works. summary = table + leaders only. */
  depth: "full" | "summary";
  crownLabel: string;
  crown: string | null;
  teams: number;
  matches: number;
  goals: number;
  goalsPerGame: number | null;
  topScorer: { player: string; value: string } | null;
  /** real per-team numbers, tallest first — the competitive shape of the season */
  skyline: number[];
  skylineLabel: string;
};

type Display = { accent: string; href?: string; crownLabel?: string; country?: string };

const DISPLAY: Record<string, Display> = {
  "world-cup-2026": { accent: "#e3be56", href: "/story", crownLabel: "Winners" },
  "premier-league-2025-26": { accent: "#a855f7" },
  "laliga-2025-26": { accent: "#ff5252" },
  "serie-a-2025-26": { accent: "#38bdf8" },
  "bundesliga-2025-26": { accent: "#f0454f" },
  "ligue-1-2025-26": { accent: "#dbe64b" },
};

/** ring order — the tournament first, then the big five */
const ORDER = [
  "world-cup-2026",
  "premier-league-2025-26",
  "laliga-2025-26",
  "serie-a-2025-26",
  "bundesliga-2025-26",
  "ligue-1-2025-26",
];

const harvested = cache((): any[] => {
  try {
    return JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "editions.json"), "utf8")
    );
  } catch {
    return [];
  }
});

/** how many per-match files the deep harvest produced — 0 until it has run */
const harvestedMatches = cache((slug: string): number => {
  try {
    const idx = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "leagues", slug, "index.json"), "utf8")
    );
    return (idx.matches ?? []).length;
  } catch {
    return 0;
  }
});

/** the 2026 tournament, built from the data already on disk */
const worldCup = cache((): Edition | null => {
  const matches = getCalendar();
  if (!matches.length) return null;

  const goalsFor = new Map<string, number>();
  const names = new Map<string, string>();
  let goals = 0;
  for (const m of matches) {
    const h = m.home.score ?? 0;
    const a = m.away.score ?? 0;
    goals += h + a;
    names.set(m.home.id, m.home.name);
    names.set(m.away.id, m.away.name);
    goalsFor.set(m.home.id, (goalsFor.get(m.home.id) ?? 0) + h);
    goalsFor.set(m.away.id, (goalsFor.get(m.away.id) ?? 0) + a);
  }
  const final = matches[matches.length - 1];
  const d = DISPLAY["world-cup-2026"];

  const scorer = (() => {
    try {
      const raw = JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "data/fifa/topscorers.json"), "utf8")
      );
      const top = (raw?.PlayerStatsList ?? [])[0];
      if (!top) return null;
      const nm = top.PlayerInfo?.PlayerName?.[0]?.Description ?? "";
      return { player: titleCase(nm), value: String(top.GoalsScored ?? "") };
    } catch {
      return null;
    }
  })();

  return {
    slug: "world-cup-2026",
    name: "World Cup",
    country: "USA · Canada · México",
    season: "2026",
    accent: d.accent,
    href: d.href!,
    depth: "full",
    crownLabel: d.crownLabel!,
    crown: final.winner ? names.get(final.winner) ?? null : null,
    teams: names.size,
    matches: matches.length,
    goals,
    goalsPerGame: Math.round((goals / matches.length) * 100) / 100,
    topScorer: scorer,
    skyline: [...goalsFor.values()].sort((a, b) => b - a),
    skylineLabel: `Goals scored · ${names.size} teams`,
  };
});

/** MBAPPE -> Mbappe; FIFA shouts surnames */
const titleCase = (s: string) =>
  s.replace(/\b([A-ZÀ-Þ])([A-ZÀ-Þ']+)\b/g, (_, a, b) => a + b.toLowerCase());

export const getEditions = cache((): Edition[] => {
  const out: Edition[] = [];
  const wc = worldCup();
  if (wc) out.push(wc);

  for (const e of harvested()) {
    const d = DISPLAY[e.slug];
    if (!d) continue; // harvested but not yet given a place in the ring
    const goalsLeader = e.leaders?.Goals;
    // "full" the moment the per-match harvest has landed — that is what unlocks the
    // theater, so the tiles and copy follow the files on disk rather than a flag
    const deep = harvestedMatches(e.slug);
    out.push({
      slug: e.slug,
      name: e.name,
      country: d.country ?? e.country,
      season: e.season,
      accent: d.accent,
      href: d.href ?? `/${e.slug}`,
      depth: deep > 0 ? "full" : "summary",
      crownLabel: d.crownLabel ?? "Champion",
      crown: e.champion ?? null,
      teams: e.teams ?? 0,
      matches: e.matches ?? 0,
      goals: e.goals ?? 0,
      goalsPerGame: e.goalsPerGame ?? null,
      topScorer:
        goalsLeader?.player && goalsLeader?.value
          ? { player: goalsLeader.player, value: String(goalsLeader.value) }
          : null,
      skyline: (e.table ?? []).map((r: any) => Number(r.points) || 0).sort((a: number, b: number) => b - a),
      skylineLabel: `Points · ${e.teams} clubs`,
    });
  }

  out.sort((a, b) => ORDER.indexOf(a.slug) - ORDER.indexOf(b.slug));
  return out;
});

export const getEdition = cache((slug: string): Edition | null =>
  getEditions().find((e) => e.slug === slug) ?? null
);

/** the harvested table, for the summary pages */
export const getEditionTable = cache((slug: string): any[] =>
  harvested().find((e) => e.slug === slug)?.table ?? []
);

export const getEditionLeaders = cache((slug: string): Record<string, any> =>
  harvested().find((e) => e.slug === slug)?.leaders ?? {}
);
