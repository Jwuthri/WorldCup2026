import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCalendar } from "@/lib/data";

/** refereeing ledger: fouls, cards, offsides, penalties, VAR — from FIFA
 *  timelines (per-event, team-attributed) + season team aggregates.
 *  VAR rows carry no IdTeam, so direction is inferred by joining the decision
 *  to the card/penalty/goal event at the same minute (±2'); unmatched stay null. */

const rj = (p: string): any => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", p), "utf8"));
  } catch {
    return null;
  }
};
const loc = (v: any): string => v?.[0]?.Description ?? "";
const pmin = (s: any) => parseInt(String(s ?? "").replace(/[^0-9+]/g, "").split("+")[0] || "0");

export type VarCall = {
  minute: string;
  decision: string;
  benefitId: string | null; // team the call went FOR (null when not inferable)
  againstId: string | null;
};

export type SideCount = { fouls: number; yellows: number; reds: number; offsides: number; pens: number };

export type WhistleMatch = {
  id: string;
  stage: string;
  ref: string | null;
  home: { id: string; name: string; abbr: string; score: number | null };
  away: { id: string; name: string; abbr: string; score: number | null };
  counts: { home: SideCount; away: SideCount };
  var: VarCall[];
};

const blank = (): SideCount => ({ fouls: 0, yellows: 0, reds: 0, offsides: 0, pens: 0 });

export const getWhistle = cache(() => {
  const matches: WhistleMatch[] = [];

  for (const m of getCalendar()) {
    const tl = rj(`fifa/matches/${m.id}.timeline.json`)?.Event as any[] | undefined;
    if (!tl) continue;
    const live = rj(`fifa/matches/${m.id}.live.json`);
    const ref =
      loc((live?.Officials ?? []).find((o: any) => o.OfficialType === 1)?.NameShort) ||
      loc((live?.Officials ?? []).find((o: any) => o.OfficialType === 1)?.Name) ||
      null;

    const counts = { home: blank(), away: blank() };
    const sideOf = (teamId: any): SideCount | null =>
      teamId === m.home.id ? counts.home : teamId === m.away.id ? counts.away : null;

    // added-time-aware minute (90+15 ≠ 90+2) so stoppage joins don't collide
    const amin = (s: any) =>
      pmin(s) + (+(String(s ?? "").match(/\+\s*'?(\d+)/)?.[1] ?? 0)) / 30;
    type Ev = { type: string; teamId: any; minute: string; min: number };
    const evs: Ev[] = tl.map((e) => ({
      type: loc(e.TypeLocalized),
      teamId: e.IdTeam,
      minute: String(e.MatchMinute ?? ""),
      min: amin(e.MatchMinute),
    }));

    for (const e of evs) {
      const s = sideOf(e.teamId);
      if (!s) continue;
      if (e.type === "Foul") s.fouls++;
      else if (e.type === "Yellow card") s.yellows++;
      else if (/red card/i.test(e.type)) s.reds++;
      else if (e.type === "Offside") s.offsides++;
      else if (e.type === "Penalty Awarded") s.pens++;
    }

    // VAR direction: join to the closest affected event (review delays push
    // the resulting award a few minutes past the VAR row)
    const near = (min: number, types: RegExp, tol = 2) =>
      evs
        .filter((e) => types.test(e.type) && Math.abs(e.min - min) <= tol && sideOf(e.teamId))
        .sort((a, b) => Math.abs(a.min - min) - Math.abs(b.min - min))[0];
    const other = (teamId: any) => (teamId === m.home.id ? m.away.id : m.home.id);

    const varCalls: VarCall[] = [];
    for (const e of tl) {
      if (loc(e.TypeLocalized) !== "VAR") continue;
      const decision = loc(e.EventDescription) || "VAR review";
      const min = pmin(e.MatchMinute);
      let benefitId: string | null = null;
      let againstId: string | null = null;
      if (/card given|card reassigned/i.test(decision)) {
        const hit = near(min, /card/i);
        if (hit && !/reassigned/i.test(decision)) {
          againstId = hit.teamId;
          benefitId = other(hit.teamId);
        }
      } else if (/penalty given/i.test(decision)) {
        const hit = near(min, /^(Penalty Awarded|Penalty Goal|Penalty missed)$/, 3);
        if (hit) {
          benefitId = hit.teamId;
          againstId = other(hit.teamId);
        }
      } else if (/goal awarded/i.test(decision)) {
        const hit = near(min, /^(Goal!|Penalty Goal|Own goal)$/);
        if (hit) {
          benefitId = hit.teamId;
          againstId = other(hit.teamId);
        }
      } else if (/goal disallowed/i.test(decision)) {
        // the chalked-off attempt is often missing from the feed; the offside
        // or foul that killed it is the more reliable anchor
        const hit = near(min, /^(Offside|Foul)$/, 1) ?? near(min, /^Attempt at Goal$/);
        if (hit) {
          againstId = hit.teamId;
          benefitId = other(hit.teamId);
        }
      } // "Penalty cancelled" / "No penalty": no anchoring event survives — stays null
      varCalls.push({ minute: String(e.MatchMinute ?? ""), decision, benefitId, againstId });
    }

    matches.push({
      id: m.id,
      stage: m.group || m.stage,
      ref,
      home: { id: m.home.id, name: m.home.name, abbr: m.home.abbr, score: m.home.score ?? null },
      away: { id: m.away.id, name: m.away.name, abbr: m.away.abbr, score: m.away.score ?? null },
      counts,
      var: varCalls,
    });
  }
  return matches;
});

export type TeamWhistle = {
  id: string;
  name: string;
  abbr: string;
  m: number;
  foulsFor: number; // committed
  foulsAgainst: number; // suffered
  yellows: number;
  reds: number;
  offsides: number;
  pensFor: number;
  pensAgainst: number;
  varFor: number;
  varAgainst: number;
  bookingsPer10: number; // (Y+R) per 10 fouls committed
};

export const getTeamWhistle = cache((): TeamWhistle[] => {
  const season = rj("fifa/season_teams.json") ?? {};
  const sv = (id: string, k: string): number => {
    const row = (season[id] ?? []).find((r: [string, number]) => r[0] === k);
    return row?.[1] ?? 0;
  };

  const byId = new Map<string, TeamWhistle>();
  for (const wm of getWhistle()) {
    for (const side of ["home", "away"] as const) {
      const t = wm[side];
      let r = byId.get(t.id);
      if (!r) {
        byId.set(
          t.id,
          (r = {
            id: t.id, name: t.name, abbr: t.abbr,
            m: sv(t.id, "MatchesPlayed") || 0,
            foulsFor: sv(t.id, "FoulsFor"),
            foulsAgainst: sv(t.id, "FoulsAgainst"),
            yellows: sv(t.id, "YellowCards"),
            reds: sv(t.id, "RedCards"),
            offsides: sv(t.id, "Offsides"),
            pensFor: 0, pensAgainst: 0, varFor: 0, varAgainst: 0, bookingsPer10: 0,
          })
        );
      }
      const opp = side === "home" ? "away" : "home";
      r.pensFor += wm.counts[side].pens;
      r.pensAgainst += wm.counts[opp].pens;
      for (const v of wm.var) {
        if (v.benefitId === t.id) r.varFor++;
        if (v.againstId === t.id) r.varAgainst++;
      }
    }
  }
  const out = [...byId.values()];
  for (const r of out) {
    if (!r.m) r.m = Math.max(1, getWhistle().filter((w) => w.home.id === r.id || w.away.id === r.id).length);
    r.bookingsPer10 = r.foulsFor ? ((r.yellows + r.reds) / r.foulsFor) * 10 : 0;
  }
  return out;
});

export type RefRow = { name: string; m: number; fouls: number; yellows: number; reds: number; pens: number; varCalls: number };

export const getRefs = cache((): RefRow[] => {
  const by = new Map<string, RefRow>();
  for (const wm of getWhistle()) {
    if (!wm.ref) continue;
    let r = by.get(wm.ref);
    if (!r) by.set(wm.ref, (r = { name: wm.ref, m: 0, fouls: 0, yellows: 0, reds: 0, pens: 0, varCalls: 0 }));
    r.m++;
    for (const side of ["home", "away"] as const) {
      r.fouls += wm.counts[side].fouls;
      r.yellows += wm.counts[side].yellows;
      r.reds += wm.counts[side].reds;
      r.pens += wm.counts[side].pens;
    }
    r.varCalls += wm.var.length;
  }
  return [...by.values()].sort((a, b) => (b.yellows + b.reds) / b.m - (a.yellows + a.reds) / a.m);
});
