import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCalendar } from "@/lib/data";

const DATA = path.join(process.cwd(), "data");
const readJson = (rel: string): any => {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
  } catch {
    return null;
  }
};

/* ---------------- Elo ---------------- */

export type Strength = { elo: number; worldRank: number; wcSeed: number };

export const getStrength = cache((): Record<string, Strength> => readJson("enrich/strength.json") ?? {});

/** abbr -> display name, from the calendar */
const abbrName = cache((): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const m of getCalendar()) {
    out[m.home.abbr] = m.home.name;
    out[m.away.abbr] = m.away.name;
  }
  return out;
});

const nameOf = (token: string) => abbrName()[token] ?? token;

/* ---------------- international history (martj42) ---------------- */
// rows: [date, homeAbbr|extName, awayAbbr|extName, homeScore, awayScore, tournament, neutral]
type IntlRow = [string, string, string, number, number, string, boolean];

const intl = cache((): IntlRow[] => readJson("enrich/intl_results.json") ?? []);

const TOURNAMENT_START = "2026-06-11";

export type Form = {
  played: number;
  record: string; // "W6 D1 L3"
  goalsFor: number;
  goalsAgainst: number;
  last: { date: string; opp: string; result: "W" | "D" | "L"; score: string; tournament: string }[];
};

/** last-N results for a team before a cutoff date (default: tournament start = pre-tournament form) */
export const getForm = cache((abbr: string, before = TOURNAMENT_START, n = 10): Form | null => {
  const rows = intl()
    .filter((r) => (r[1] === abbr || r[2] === abbr) && r[0] < before)
    .slice(-n);
  if (!rows.length) return null;
  let w = 0, d = 0, l = 0, gf = 0, ga = 0;
  const last = rows.map((r) => {
    const home = r[1] === abbr;
    const us = home ? r[3] : r[4];
    const them = home ? r[4] : r[3];
    gf += us; ga += them;
    const result: "W" | "D" | "L" = us > them ? "W" : us < them ? "L" : "D";
    if (result === "W") w++; else if (result === "D") d++; else l++;
    return {
      date: r[0],
      opp: nameOf(home ? r[2] : r[1]),
      result,
      score: `${us}-${them}`,
      tournament: r[5],
    };
  });
  return { played: rows.length, record: `W${w} D${d} L${l}`, goalsFor: gf, goalsAgainst: ga, last };
});

export type H2H = {
  meetings: number;
  record: string; // from A's perspective
  goals: string; // "24-18"
  recent: { date: string; score: string; tournament: string; winner: string }[];
};

/** all-time head-to-head between two of our teams (both must be WC teams / abbrs) */
export const getHeadToHead = cache((abbrA: string, abbrB: string): H2H | null => {
  const rows = intl().filter(
    (r) => (r[1] === abbrA && r[2] === abbrB) || (r[1] === abbrB && r[2] === abbrA)
  );
  if (!rows.length) return null;
  let w = 0, d = 0, l = 0, gfA = 0, gaA = 0;
  for (const r of rows) {
    const aHome = r[1] === abbrA;
    const aG = aHome ? r[3] : r[4];
    const bG = aHome ? r[4] : r[3];
    gfA += aG; gaA += bG;
    if (aG > bG) w++; else if (aG < bG) l++; else d++;
  }
  return {
    meetings: rows.length,
    record: `${nameOf(abbrA)} W${w} D${d} L${l}`,
    goals: `${gfA}-${gaA}`,
    recent: rows.slice(-5).map((r) => ({
      date: r[0],
      score: `${nameOf(r[1])} ${r[3]}-${r[4]} ${nameOf(r[2])}`,
      tournament: r[5],
      winner: r[3] === r[4] ? "draw" : nameOf(r[3] > r[4] ? r[1] : r[2]),
    })),
  };
});

/* ---------------- referee tendencies (from our own data) ---------------- */

export type Referee = {
  name: string;
  matches: number;
  yellows: number;
  reds: number;
  fouls: number;
  yellowsPerMatch: number;
  foulsPerMatch: number;
  matchIds: string[];
};

const loc = (v: any): string => v?.[0]?.Description ?? "";

export const getReferees = cache((): Record<string, Referee> => {
  const cal = readJson("fifa/calendar.json")?.Results ?? [];
  const refByMatch: Record<string, string> = {};
  for (const m of cal) {
    // the referee is OfficialType 1; NameShort/Name are localized arrays -> loc()
    const off = (m.Officials ?? []).find((o: any) => o.OfficialType === 1) ?? (m.Officials ?? [])[0];
    const name = loc(off?.NameShort) || loc(off?.Name);
    if (name) refByMatch[m.IdMatch] = name;
  }
  const refs: Record<string, Referee> = {};
  for (const m of getCalendar()) {
    const name = refByMatch[m.id];
    if (!name) continue;
    const r = (refs[name] ??= {
      name, matches: 0, yellows: 0, reds: 0, fouls: 0,
      yellowsPerMatch: 0, foulsPerMatch: 0, matchIds: [],
    });
    r.matches++;
    r.matchIds.push(m.id);
    const events = readJson(`fifa/matches/${m.id}.timeline.json`)?.Event ?? [];
    for (const e of events) {
      const type = (e.TypeLocalized ?? [])[0]?.Description ?? "";
      if (/red card/i.test(type)) r.reds++;
      else if (/yellow card/i.test(type)) r.yellows++;
      else if (/^foul$/i.test(type)) r.fouls++;
    }
  }
  for (const r of Object.values(refs)) {
    r.yellowsPerMatch = Math.round((r.yellows / r.matches) * 10) / 10;
    r.foulsPerMatch = Math.round((r.fouls / r.matches) * 10) / 10;
  }
  return refs;
});

export const getRefereeForMatch = cache((matchId: string): Referee | null => {
  const refs = getReferees();
  return Object.values(refs).find((r) => r.matchIds.includes(matchId)) ?? null;
});
