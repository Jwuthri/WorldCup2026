import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCalendar } from "./data";
import { getStrength } from "./strength";

/**
 * The rematch machine: hypothetical matchups from tournament data.
 * Poisson goals model — each team's xG for/against per match vs the tournament
 * average sets attack/defense multipliers; Elo nudges the rates (small samples).
 * 10k Monte Carlo → outcome probabilities, scorelines, knockout advance.
 */

export type TeamRates = {
  abbr: string;
  name: string;
  matches: number;
  xgFor: number;
  xgAgainst: number;
  elo: number;
};

export type SimResult = {
  pA: number; // win in 90'
  pDraw: number;
  pB: number;
  koA: number; // advance a knockout tie (ET + pens)
  koB: number;
  lambdaA: number;
  lambdaB: number;
  topScores: { a: number; b: number; p: number }[];
  matrix: number[][]; // [goalsA 0..5+][goalsB 0..5+] probabilities
};

const readJson = (rel: string) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", rel), "utf8"));
  } catch {
    return null;
  }
};

export const getRates = cache((): Map<string, TeamRates> => {
  const st = readJson("fifa/season_teams.json") ?? {};
  const strength = getStrength();
  const byId: Record<string, { abbr: string; name: string; matches: number }> = {};
  for (const m of getCalendar()) {
    for (const side of [m.home, m.away]) {
      (byId[side.id] ??= { abbr: side.abbr, name: side.name, matches: 0 }).matches++;
    }
  }
  const out = new Map<string, TeamRates>();
  for (const [tid, rows] of Object.entries(st)) {
    const ref = byId[tid];
    if (!ref?.matches) continue;
    const tm: Record<string, number> = {};
    for (const r of rows as [string, number][]) tm[r[0]] = r[1];
    out.set(ref.abbr, {
      abbr: ref.abbr,
      name: ref.name,
      matches: ref.matches,
      xgFor: tm.XG ?? 0,
      xgAgainst: tm.XGAgainst ?? 0,
      elo: strength[ref.abbr]?.elo ?? 1700,
    });
  }
  return out;
});

const avgXgPerMatch = cache((): number => {
  let xg = 0, n = 0;
  for (const t of getRates().values()) {
    xg += t.xgFor;
    n += t.matches;
  }
  return n ? xg / n : 1.3;
});

// ponytail: γ tuned by eyeballing the backtest; refit if rates or Elo source change
const ELO_GAMMA = 0.18;

export function lambdas(a: TeamRates, b: TeamRates): [number, number] {
  const base = avgXgPerMatch();
  const att = (t: TeamRates) => Math.max(t.xgFor / t.matches, 0.15) / base;
  const def = (t: TeamRates) => Math.max(t.xgAgainst / t.matches, 0.15) / base;
  const m = Math.pow(10, (a.elo - b.elo) / 400);
  const lA = base * att(a) * def(b) * Math.pow(m, ELO_GAMMA);
  const lB = base * att(b) * def(a) * Math.pow(m, -ELO_GAMMA);
  return [lA, lB];
}

function makeRng(seedStr: string) {
  let seed = 26;
  for (const ch of seedStr) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  return () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
}

const poisson = (lambda: number, rnd: () => number): number => {
  const L = Math.exp(-lambda);
  let k = 0, p = 1;
  do {
    k++;
    p *= rnd();
  } while (p > L);
  return k - 1;
};

export function simulate(a: TeamRates, b: TeamRates, sims = 10_000): SimResult {
  const [lA, lB] = lambdas(a, b);
  const rnd = makeRng(a.abbr + "|" + b.abbr);
  let wA = 0, wB = 0, dr = 0, koA = 0;
  const matrix = Array.from({ length: 6 }, () => Array(6).fill(0));
  for (let i = 0; i < sims; i++) {
    const gA = poisson(lA, rnd), gB = poisson(lB, rnd);
    matrix[Math.min(gA, 5)][Math.min(gB, 5)]++;
    if (gA > gB) { wA++; koA++; }
    else if (gB > gA) wB++;
    else {
      dr++;
      // knockout resolution: 30' of extra time at λ/3, then pens as a coin flip
      const eA = gA + poisson(lA / 3, rnd), eB = gB + poisson(lB / 3, rnd);
      if (eA > eB || (eA === eB && rnd() < 0.5)) koA++;
    }
  }
  const scores: { a: number; b: number; p: number }[] = [];
  for (let i = 0; i < 6; i++)
    for (let j = 0; j < 6; j++) {
      matrix[i][j] /= sims;
      scores.push({ a: i, b: j, p: matrix[i][j] });
    }
  scores.sort((x, y) => y.p - x.p);
  return {
    pA: wA / sims,
    pDraw: dr / sims,
    pB: wB / sims,
    koA: koA / sims,
    koB: 1 - koA / sims,
    lambdaA: lA,
    lambdaB: lB,
    topScores: scores.slice(0, 3),
    matrix,
  };
}

/** % of the 104 real matches where the model's most likely 90' outcome happened.
 *  ponytail: rates include the match being predicted (in-sample) — say so in copy. */
export const getBacktest = cache((): { hit: number; n: number } => {
  const rates = getRates();
  let hit = 0, n = 0;
  for (const m of getCalendar()) {
    const a = rates.get(m.home.abbr), b = rates.get(m.away.abbr);
    if (!a || !b || m.home.score == null || m.away.score == null) continue;
    const s = simulate(a, b, 2000);
    const pred = s.pA >= s.pDraw && s.pA >= s.pB ? 1 : s.pB >= s.pDraw ? -1 : 0;
    // 90-minute result: matches decided in ET or pens were draws at 90'
    const hs = m.home.score, as = m.away.score;
    const actual = m.penHome != null || m.resultType === 3 ? 0 : hs > as ? 1 : hs < as ? -1 : 0;
    if (pred === actual) hit++;
    n++;
  }
  return { hit: n ? Math.round((hit / n) * 100) : 0, n };
});
