import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { sideColors, type MatchPlayer, type MatchSide, type Shot } from "@/lib/data";
import { sumSide, type TeamGrid } from "@/lib/heatmap";

/**
 * League adapter — turns a harvested 365scores match (scripts/harvest_leagues.py)
 * into the exact shapes lib/data.ts produces for the 2026 tournament, so the Match
 * Theater, shot maps, xG race, heatmaps and stat duel render unchanged.
 *
 * The tournament path is FIFA-primary with 365scores joined in as enrichment; here
 * 365scores IS the source, which makes this the simpler of the two: one feed, no
 * name/kickoff join, and shot `playerId` points straight at a lineup member instead
 * of needing a jersey-number hop.
 *
 * What a league match cannot have: FIFA's physical/tracking tier (distance, top
 * speed, sprints, press phases). Every `fdh` map here is deliberately empty and the
 * pages that read it fall back to the 365 stat lines.
 */

const DIR = path.join(process.cwd(), "data", "leagues");

function readJson(rel: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DIR, rel), "utf8"));
  } catch {
    return null;
  }
}

export type LeagueTeamRef = {
  id: string;
  name: string;
  shortName: string;
  slug: string;
  score: number | null;
  crest: string;
};

export type LeagueMatch = {
  id: string;
  round: number | null;
  date: string;
  venue: string | null;
  status: string | null;
  home: LeagueTeamRef;
  away: LeagueTeamRef;
};

export type LeagueBundle = {
  match: LeagueMatch;
  home: MatchSide;
  away: MatchSide;
  shots: Shot[];
  teamStats: { name: string; value: string; competitorId: number }[];
};

/** 365scores club crest — same CDN as the player faces already in use */
export const crestUrl = (id: number | string, v?: number) =>
  `https://imagecache.365scores.com/image/upload/f_png,w_64,h_64,c_limit,q_auto:eco,dpr_2,d_Competitors:default1.png/v${v ?? 1}/Competitors/${id}`;

const faceUrl = (athleteId?: number, v?: number) =>
  athleteId
    ? `https://imagecache.365scores.com/image/upload/f_png,w_160,d_Athletes:default.png,r_max,c_thumb,g_face,z_0.65/v${v ?? 1}/Athletes/${athleteId}`
    : null;

const teamRef = (c: any): LeagueTeamRef => ({
  id: String(c?.id ?? ""),
  name: c?.name ?? "",
  shortName: c?.shortName || c?.name || "",
  slug: c?.nameForURL ?? String(c?.id ?? ""),
  score: c?.score ?? null,
  crest: crestUrl(c?.id, c?.imageVersion),
});

/* ---------------- the season ---------------- */

export const getLeagueIndex = cache(
  (slug: string): { name: string; country: string; season: string; matches: LeagueMatch[] } | null => {
    const raw = readJson(`${slug}/index.json`);
    if (!raw) return null;
    const matches: LeagueMatch[] = (raw.matches ?? []).map((m: any) => ({
      id: String(m.id),
      round: m.roundNum ?? null,
      date: m.startTime ?? "",
      venue: m.venue ?? null,
      status: m.statusText ?? null,
      home: teamRef(m.home),
      away: teamRef(m.away),
    }));
    return { name: raw.name, country: raw.country, season: raw.season, matches };
  }
);

/** true once the per-match harvest has produced files for this league */
export const hasLeagueData = cache((slug: string): boolean => {
  const idx = getLeagueIndex(slug);
  return !!idx && idx.matches.length > 0;
});

/* ---------------- one match ---------------- */

export const getLeagueBundle = cache((slug: string, id: string): LeagueBundle | null => {
  const raw = readJson(`${slug}/games/${id}.json`);
  const g = raw?.game;
  if (!g) return null;

  const statNames: string[] = g.statNames ?? [];
  const bios = new Map<number, any>();
  for (const m of g.members ?? []) bios.set(m.id, m);

  const buildSide = (side: "home" | "away"): MatchSide => {
    const c = side === "home" ? g.homeCompetitor : g.awayCompetitor;
    const ref = teamRef(c);
    const players: MatchPlayer[] = ((c?.lineups?.members ?? []) as any[]).map((e) => {
      const bio = bios.get(e.id) ?? {};
      const yf = e.yardFormation;
      return {
        fifaId: String(e.id), // the id every surface keys on; here it's the 365 lineup id
        name: bio.name ?? "",
        shortName: bio.shortName || bio.name || "",
        shirt: bio.jerseyNumber ?? 0,
        starter: e.status === 1,
        captain: false, // 365's lineup entry carries no captain flag
        photo: faceUrl(bio.athleteId, bio.imageVersion),
        // the feed writes -1 for "played too little to be rated"; the UI expects null
        rating: typeof e.ranking === "number" && e.ranking > 0 ? e.ranking : null,
        heatmap: e.heatMap ?? null,
        positionName: e.position?.name ?? null,
        formationSlot: yf ? { line: yf.fieldLine, side: yf.fieldSide } : null,
        s365Stats: (e.stats ?? []).map(([i, value]: [number, string]) => ({
          name: statNames[i] ?? "",
          value,
          category: 0,
        })),
        fdh: {},
      };
    });

    const goals = ((g.events ?? []) as any[])
      .filter((e) => e.eventType?.id === 1 && String(e.competitorId) === ref.id)
      .map((e) => {
        const sub = String(e.eventType?.subTypeName ?? "");
        return {
          minute: `${e.gameTime ?? ""}`.replace(/\.0$/, ""),
          player: bios.get(e.playerId)?.shortName ?? bios.get(e.playerId)?.name ?? "",
          assist: null, // the feed does not attribute assists on the event
          penalty: /penalt/i.test(sub),
          own: /own/i.test(sub),
        };
      });

    return {
      ref: { id: ref.id, name: ref.name, abbr: ref.slug, score: ref.score, tactics: null },
      color: "",
      formation: c?.lineups?.formation ?? null,
      players,
      goals,
      fdh: {},
    };
  };

  const home = buildSide("home");
  const away = buildSide("away");
  const [hc, ac] = sideColors(g.homeCompetitor?.color, g.awayCompetitor?.color);
  home.color = hc;
  away.color = ac;

  const shots: Shot[] = ((g.chartEvents?.events ?? []) as any[]).map((e) => {
    const team: "home" | "away" = e.competitorNum === 1 ? "home" : "away";
    const bio = bios.get(e.playerId);
    return {
      team,
      minute: e.time ?? "",
      player: bio?.shortName ?? bio?.name ?? "",
      playerFifaId: bio ? String(bio.id) : null,
      xg: e.xg != null ? parseFloat(e.xg) : null,
      xgot: e.xgot != null ? parseFloat(e.xgot) : null,
      bodyPart: e.bodyPart ?? null,
      // same reading as the tournament path: subType 7 is an on-target attempt
      outcome:
        e.subType === 7 && e.type === 0
          ? e.outcome?.name ?? "Attempt"
          : e.outcome?.name ?? (e.type === 1 ? "Goal" : "Attempt"),
      x: e.side ?? 0,
      y: e.line ?? 0,
      gateY: e.outcome?.y ?? null,
      gateZ: e.outcome?.z ?? null,
    };
  });

  const match: LeagueMatch = {
    id: String(g.id),
    round: g.roundNum ?? null,
    date: g.startTime ?? "",
    venue: g.venue?.name ?? null,
    status: g.statusText ?? null,
    home: teamRef(g.homeCompetitor),
    away: teamRef(g.awayCompetitor),
  };

  return { match, home, away, shots, teamStats: raw.stats ?? [] };
});

/** team occupation grids for a league match — the same sum the tournament uses */
export const leagueMatchTerritory = cache(
  (slug: string, id: string): { home: TeamGrid; away: TeamGrid } | null => {
    const b = getLeagueBundle(slug, id);
    if (!b) return null;
    return { home: sumSide(b.home.players), away: sumSide(b.away.players) };
  }
);

/** bookings for the pulse strip — they live on the event feed, not the shot chart */
export const getLeagueCards = cache(
  (
    slug: string,
    id: string
  ): { minute: number; team: "home" | "away"; xg: number; kind: "yellow" | "red"; who: string | null; note: string; label: string }[] => {
    const g = readJson(`${slug}/games/${id}.json`)?.game;
    if (!g) return [];
    const homeId = String(g.homeCompetitor?.id ?? "");
    const bios = new Map<number, any>();
    for (const m of g.members ?? []) bios.set(m.id, m);
    const out: any[] = [];
    for (const e of g.events ?? []) {
      const name = String(e.eventType?.name ?? "");
      const sub = String(e.eventType?.subTypeName ?? "");
      const red = /red/i.test(name) || /red/i.test(sub);
      const yellow = /yellow|caution|booking/i.test(name) || /yellow/i.test(sub);
      if (!red && !yellow) continue;
      out.push({
        minute: Math.round(Number(e.gameTime) || 0),
        team: String(e.competitorId) === homeId ? "home" : "away",
        xg: 0,
        kind: red ? "red" : "yellow",
        who: bios.get(e.playerId)?.shortName ?? null,
        note: sub || name,
        label: e.gameTimeDisplay ?? "",
      });
    }
    return out;
  }
);

/** attendance / referee / capacity, when the feed carried them */
export const getLeagueMatchMeta = cache((slug: string, id: string) => {
  const g = readJson(`${slug}/games/${id}.json`)?.game;
  if (!g) return null;
  return {
    venue: g.venue?.name ?? null,
    attendance: g.venue?.attendance ?? null,
    capacity: g.venue?.capacity ?? null,
    referee: (g.officials ?? [])[0]?.name ?? null,
    round: g.roundNum ?? null,
    kickoff: g.startTime ?? null,
  };
});
