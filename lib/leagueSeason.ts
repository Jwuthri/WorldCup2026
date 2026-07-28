import { buildCards, type Card } from "@/lib/cards";
import { sumSide, type TeamGrid, GRID_N } from "@/lib/heatmap";
import { getLeagueBundle, getLeagueIndex, crestUrl, type LeagueBundle } from "@/lib/leagues";

/**
 * Season aggregates for one league: player cards, team totals and territory grids.
 *
 * Deliberately a MODULE-level memo rather than React `cache()` — loading a league
 * means parsing ~380 match files, and React's cache is per-request. This way the
 * cost is paid once per process (at build time for the static pages) instead of on
 * every render. lib/luck.ts uses the same pattern for the same reason.
 */

export type LeagueTeamSeason = {
  id: string;
  name: string;
  slug: string;
  crest: string;
  color: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  gf: number;
  ga: number;
  pts: number;
  xgFor: number;
  xgAgainst: number;
  shots: number;
  shotsAgainst: number;
  possession: number | null;
  grid: TeamGrid;
};

export type LeagueSeason = {
  slug: string;
  cards: Map<string, Card>;
  teams: LeagueTeamSeason[];
  matchCount: number;
};

const memo = new Map<string, LeagueSeason | null>();

const numOf = (v: string | null | undefined): number => {
  if (v == null) return 0;
  const n = parseFloat(String(v).replace("%", ""));
  return Number.isFinite(n) ? n : 0;
};

function compute(slug: string): LeagueSeason | null {
  const idx = getLeagueIndex(slug);
  if (!idx || !idx.matches.length) return null;

  const bundles: { m: (typeof idx.matches)[number]; b: LeagueBundle }[] = [];
  for (const m of idx.matches) {
    const b = getLeagueBundle(slug, m.id);
    if (b) bundles.push({ m, b });
  }

  // ---- player cards, scored against this league's own pool ----
  const cards = buildCards(
    bundles.map(({ m, b }) => ({
      id: m.id,
      score: `${m.home.score}:${m.away.score}`,
      sides: [
        {
          players: b.home.players,
          teamName: m.home.name,
          teamAbbr: m.home.slug,
          oppName: m.away.name,
          oppAbbr: m.away.slug,
          oppScore: m.away.score,
        },
        {
          players: b.away.players,
          teamName: m.away.name,
          teamAbbr: m.away.slug,
          oppName: m.home.name,
          oppAbbr: m.home.slug,
          oppScore: m.home.score,
        },
      ],
    })),
    "league"
  );

  // ---- team season totals ----
  const teams = new Map<string, LeagueTeamSeason & { possSum: number; possN: number }>();
  const blank = (ref: { id: string; name: string; slug: string; crest: string }, color: string) => ({
    ...ref,
    color,
    played: 0, won: 0, drawn: 0, lost: 0, gf: 0, ga: 0, pts: 0,
    xgFor: 0, xgAgainst: 0, shots: 0, shotsAgainst: 0,
    possession: null as number | null,
    grid: new Array(GRID_N).fill(0) as TeamGrid,
    possSum: 0, possN: 0,
  });

  for (const { m, b } of bundles) {
    for (const [self, other, side] of [
      [m.home, m.away, "home"],
      [m.away, m.home, "away"],
    ] as const) {
      if (!teams.has(self.id)) {
        teams.set(self.id, blank(
          { id: self.id, name: self.name, slug: self.slug, crest: crestUrl(self.id) },
          side === "home" ? b.home.color : b.away.color
        ));
      }
      const t = teams.get(self.id)!;
      const gf = self.score ?? 0;
      const ga = other.score ?? 0;
      t.played += 1;
      t.gf += gf;
      t.ga += ga;
      if (gf > ga) { t.won += 1; t.pts += 3; }
      else if (gf === ga) { t.drawn += 1; t.pts += 1; }
      else t.lost += 1;

      for (const s of b.shots) {
        const mine = s.team === side;
        if (mine) { t.xgFor += s.xg ?? 0; t.shots += 1; }
        else { t.xgAgainst += s.xg ?? 0; t.shotsAgainst += 1; }
      }

      const poss = b.teamStats.find(
        (r) => r.name === "Possession" && String(r.competitorId) === self.id
      );
      if (poss) { t.possSum += numOf(poss.value); t.possN += 1; }

      // territory: minutes-weighted player grids, summed across the season
      const grid = sumSide((side === "home" ? b.home : b.away).players);
      for (let i = 0; i < GRID_N; i++) t.grid[i] += grid[i];
    }
  }

  const out: LeagueTeamSeason[] = [...teams.values()]
    .map(({ possSum, possN, ...t }) => ({
      ...t,
      possession: possN ? Math.round((possSum / possN) * 10) / 10 : null,
    }))
    .sort((a, b) => b.pts - a.pts || b.gf - b.ga - (a.gf - a.ga) || b.gf - a.gf);

  return { slug, cards, teams: out, matchCount: bundles.length };
}

export function getLeagueSeason(slug: string): LeagueSeason | null {
  if (!memo.has(slug)) memo.set(slug, compute(slug));
  return memo.get(slug) ?? null;
}

export const getLeagueCardsFor = (slug: string): Card[] => {
  const s = getLeagueSeason(slug);
  return s ? [...s.cards.values()] : [];
};

export const getLeagueCard = (slug: string, id: string): Card | null =>
  getLeagueSeason(slug)?.cards.get(id) ?? null;

export const getLeagueTeams = (slug: string): LeagueTeamSeason[] =>
  getLeagueSeason(slug)?.teams ?? [];
