import { cache } from "react";
import { getTeams } from "@/lib/teams";
import { getStrength } from "@/lib/strength";
import { getCalendar } from "@/lib/data";

// how far a team got, as a tier (7 = won it, 1 = out in the group)
const TIER: Record<string, number> = {
  "World champions": 7,
  "Runners-up": 6,
  "Third place": 5,
  "Fourth place": 5,
  "Eliminated in the quarter-final": 4,
  "Eliminated in the round of 16": 3,
  "Eliminated in the round of 32": 2,
  "Group stage": 1,
};
export const TIER_LABEL: Record<number, string> = {
  7: "Champions",
  6: "Runners-up",
  5: "Semi-final",
  4: "Quarter-final",
  3: "Round of 16",
  2: "Round of 32",
  1: "Group stage",
};

export type RankRow = {
  abbr: string;
  name: string;
  elo: number;
  worldRank: number;
  seed: number; // 1..48 by Elo
  finish: string;
  tier: number;
  expected: number; // tier the seed says they should reach
  delta: number; // tier - expected, in ROUNDS: +1 = one round further than expected
  champion: boolean;
};

// what a seed "should" do: 1-2 reach the final, 3-4 the semis, 5-8 the quarters…
const expectedTier = (seed: number): number =>
  seed <= 2 ? 6 : seed <= 4 ? 5 : seed <= 8 ? 4 : seed <= 16 ? 3 : seed <= 32 ? 2 : 1;

export const getPowerRankings = cache((): RankRow[] => {
  const teams = [...getTeams().values()];
  const strength = getStrength();

  const withElo = teams
    .map((t) => ({ t, s: strength[t.abbr] }))
    .filter((x): x is { t: (typeof teams)[number]; s: NonNullable<typeof x.s> } => !!x.s);

  const bySeed = [...withElo].sort((a, b) => b.s.elo - a.s.elo);

  return bySeed.map(({ t, s }, i) => {
    const seed = i + 1;
    const tier = TIER[t.finish] ?? 1;
    const expected = expectedTier(seed);
    return {
      abbr: t.abbr,
      name: t.name,
      elo: s.elo,
      worldRank: s.worldRank,
      seed,
      finish: t.finish,
      tier,
      expected,
      delta: tier - expected,
      champion: t.champion,
    };
  });
});

/* ---------------- upsets ---------------- */

export type Upset = {
  matchId: string;
  stage: string;
  winner: string;
  winnerAbbr: string;
  loser: string;
  loserAbbr: string;
  score: string; // winner-first
  onPens: boolean;
  winnerElo: number;
  loserElo: number;
  gap: number; // loserElo - winnerElo; positive = the lower-rated side won
};

export const getUpsets = cache((): Upset[] => {
  const strength = getStrength();
  const out: Upset[] = [];
  for (const m of getCalendar()) {
    if (m.stage === "First Stage" || !m.winner) continue; // decisive knockouts only
    const homeWin = m.winner === m.home.id;
    const win = homeWin ? m.home : m.away;
    const lose = homeWin ? m.away : m.home;
    const we = strength[win.abbr]?.elo, le = strength[lose.abbr]?.elo;
    if (we == null || le == null) continue;
    const wg = homeWin ? m.home.score : m.away.score;
    const lg = homeWin ? m.away.score : m.home.score;
    const onPens = m.penHome != null;
    const penStr = onPens ? ` (${homeWin ? m.penHome : m.penAway}–${homeWin ? m.penAway : m.penHome} pens)` : "";
    out.push({
      matchId: m.id,
      stage: m.stage,
      winner: win.name,
      winnerAbbr: win.abbr,
      loser: lose.name,
      loserAbbr: lose.abbr,
      score: `${wg}–${lg}${penStr}`,
      onPens,
      winnerElo: we,
      loserElo: le,
      gap: le - we,
    });
  }
  return out.sort((a, b) => b.gap - a.gap).filter((u) => u.gap > 0);
});
