import { getCalendar, getMatchBundle } from "./data";
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

// module memo, not react cache(): sums shot xG across all 104 bundles once per boot
// (season_teams.json has no XGAgainst — per-shot xG from the 365 join is the honest source)
let _rates: Map<string, TeamRates> | null = null;

export function getRates(): Map<string, TeamRates> {
  if (_rates) return _rates;
  const strength = getStrength();
  const out = new Map<string, TeamRates>();
  const ensure = (abbr: string, name: string) => {
    let t = out.get(abbr);
    if (!t) out.set(abbr, (t = { abbr, name, matches: 0, xgFor: 0, xgAgainst: 0, elo: strength[abbr]?.elo ?? 1700 }));
    return t;
  };
  for (const m of getCalendar()) {
    const b = getMatchBundle(m.id);
    if (!b) continue;
    let hx = 0, ax = 0;
    for (const s of b.shots) {
      const xg = Number.isFinite(s.xg as number) ? (s.xg as number) : 0; // parseFloat junk → NaN, not null
      if (s.team === "home") hx += xg;
      else ax += xg;
    }
    const home = ensure(m.home.abbr, m.home.name);
    const away = ensure(m.away.abbr, m.away.name);
    home.matches++; home.xgFor += hx; home.xgAgainst += ax;
    away.matches++; away.xgFor += ax; away.xgAgainst += hx;
  }
  return (_rates = out);
}

function avgXgPerMatch(): number {
  let xg = 0, n = 0;
  for (const t of getRates().values()) {
    xg += t.xgFor;
    n += t.matches;
  }
  return n ? xg / n : 1.3;
}

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
let _backtest: { hit: number; n: number } | null = null;
export function getBacktest(): { hit: number; n: number } {
  if (_backtest) return _backtest;
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
  return (_backtest = { hit: n ? Math.round((hit / n) * 100) : 0, n });
}
