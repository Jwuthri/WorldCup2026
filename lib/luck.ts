import { getCalendar, getMatchBundle } from "./data";

/**
 * Fortune index: replay every group-stage match 10,000x, resampling each shot
 * as a Bernoulli trial of its xG. Expected points vs actual points = luck.
 * ponytail: group stage only — knockout fortune needs bracket propagation + shootout modeling.
 */
export type TeamLuck = {
  abbr: string;
  name: string;
  pts: number;
  xpts: number;
  delta: number; // pts - xpts; positive = fortunate
};

const SIMS = 10_000;

// module-level memo, not react cache(): this loads 72 match bundles once per server boot
let _luck: TeamLuck[] | null = null;

export function getLuck(): TeamLuck[] {
  if (_luck) return _luck;

  // seeded LCG so the numbers are identical on every boot
  let seed = 26;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

  const acc: Record<string, { name: string; pts: number; xpts: number }> = {};
  const team = (abbr: string, name: string) => (acc[abbr] ??= { name, pts: 0, xpts: 0 });

  for (const m of getCalendar()) {
    if (m.stage !== "First Stage") continue;
    const b = getMatchBundle(m.id);
    if (!b) continue;
    const xgs = {
      home: b.shots.filter((s) => s.team === "home").map((s) => s.xg ?? 0),
      away: b.shots.filter((s) => s.team === "away").map((s) => s.xg ?? 0),
    };
    let hw = 0, aw = 0;
    for (let i = 0; i < SIMS; i++) {
      let hg = 0, ag = 0;
      for (const x of xgs.home) if (rnd() < x) hg++;
      for (const x of xgs.away) if (rnd() < x) ag++;
      if (hg > ag) hw++;
      else if (ag > hg) aw++;
    }
    const draws = SIMS - hw - aw;
    const home = team(m.home.abbr, m.home.name);
    const away = team(m.away.abbr, m.away.name);
    home.xpts += (3 * hw + draws) / SIMS;
    away.xpts += (3 * aw + draws) / SIMS;
    const hs = m.home.score ?? 0, as = m.away.score ?? 0;
    home.pts += hs > as ? 3 : hs === as ? 1 : 0;
    away.pts += as > hs ? 3 : hs === as ? 1 : 0;
  }

  _luck = Object.entries(acc)
    .map(([abbr, t]) => ({
      abbr,
      name: t.name,
      pts: t.pts,
      xpts: Math.round(t.xpts * 10) / 10,
      delta: Math.round((t.pts - t.xpts) * 10) / 10,
    }))
    .sort((a, b) => b.delta - a.delta);
  return _luck;
}

export const luckOf = (abbr: string): TeamLuck | null => getLuck().find((t) => t.abbr === abbr) ?? null;
