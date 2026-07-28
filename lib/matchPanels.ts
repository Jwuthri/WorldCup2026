import type { MatchPlayer, MatchSide } from "@/lib/data";
import type { TPanelSection, TPlayer, TSide } from "@/components/MatchTheater";

/**
 * The Match Theater player panel, shared by the tournament and the leagues.
 *
 * `s` reads a 365scores stat line, `f` a FIFA data-hub metric — 365 wins when both
 * exist. League matches have no FIFA tier at all, so they simply pass a section list
 * without `f` specs and the physical block disappears.
 */

export type Spec = { name: string; s?: string; f?: string; fmt?: (v: number) => string };
export type Section = { label: string; specs: Spec[]; gk?: boolean; keepZeros?: boolean };

export function numeric(p: MatchPlayer, spec: Spec): { num: number; disp: string } | null {
  if (spec.s) {
    const row = p.s365Stats.find((x) => x.name === spec.s);
    if (row) {
      const num = parseFloat(row.value);
      if (!Number.isNaN(num)) return { num, disp: spec.fmt ? spec.fmt(num) : row.value };
    }
  }
  if (spec.f && p.fdh[spec.f] != null) {
    const num = p.fdh[spec.f];
    return { num, disp: spec.fmt ? spec.fmt(num) : `${Math.round(num * 100) / 100}` };
  }
  return null;
}

export function buildPanels(
  sections: Section[],
  all: MatchPlayer[]
): Map<string, TPanelSection[]> {
  // per-spec max across the match, so the bars are honest relative comparisons
  const maxOf = new Map<string, number>();
  for (const sec of sections)
    for (const spec of sec.specs) {
      let mx = 0;
      for (const p of all) {
        const v = numeric(p, spec);
        if (v) mx = Math.max(mx, v.num);
      }
      maxOf.set(`${sec.label}:${spec.name}`, mx);
    }

  const out = new Map<string, TPanelSection[]>();
  for (const p of all) {
    const isGk = p.positionName === "Goalkeeper" || (p.fdh.GoalkeeperSaves ?? 0) > 0;
    const built: TPanelSection[] = [];
    for (const sec of sections) {
      if (sec.gk && !isGk) continue;
      if (isGk && sec.label === "Defending") continue; // keep GK panels tight
      const rows = sec.specs
        .map((spec) => {
          const v = numeric(p, spec);
          if (!v || (v.num === 0 && !sec.keepZeros)) return null;
          const mx = maxOf.get(`${sec.label}:${spec.name}`) || 1;
          return { name: spec.name, value: v.disp, pct: mx ? Math.min(1, v.num / mx) : 0 };
        })
        .filter(Boolean) as TPanelSection["rows"];
      if (rows.length) built.push({ label: sec.label, rows });
    }
    out.set(p.fifaId, built);
  }
  return out;
}

export const toTSide = (
  side: MatchSide,
  panels: Map<string, TPanelSection[]>,
  badge: string
): TSide => ({
  name: side.ref.name,
  abbr: side.ref.abbr,
  color: side.color,
  formation: side.formation,
  flag: badge, // a nation's flag at the tournament, a club crest in a league
  players: side.players.map(
    (p): TPlayer => ({
      id: p.fifaId,
      shortName: p.shortName,
      shirt: p.shirt,
      photo: p.photo,
      rating: p.rating,
      heatmap: p.heatmap,
      positionName: p.positionName,
      slot: p.formationSlot,
      starter: p.starter,
      panel: panels.get(p.fifaId) ?? [],
    })
  ),
});

/** the four blocks a league feed can fill — no FIFA physical tier */
export const LEAGUE_SECTIONS: Section[] = [
  {
    label: "Attack",
    specs: [
      { name: "Goals", s: "Goals" },
      { name: "xG", s: "Expected Goals" },
      { name: "xG on target", s: "Expected Goals On Target" },
      { name: "Shots", s: "Total Shots" },
      { name: "On target", s: "Shots On Target" },
      { name: "Dribbles won", s: "Successful Dribbles" },
      { name: "Big chances missed", s: "Big Chances Missed" },
    ],
  },
  {
    label: "Creation",
    specs: [
      { name: "Assists", s: "Assists" },
      { name: "xA", s: "Expected Assists" },
      { name: "Key passes", s: "Key Passes" },
      { name: "Big chances created", s: "Big Chances Created" },
      { name: "Passes completed", s: "Passes Completed" },
      { name: "Into final third", s: "Passes Into Final Third" },
      { name: "Crosses completed", s: "Crosses Completed" },
    ],
  },
  {
    label: "Defending",
    specs: [
      { name: "Tackles won", s: "Tackles Won" },
      { name: "Interceptions", s: "Interceptions" },
      { name: "Ball recoveries", s: "Ball Recovery" },
      { name: "Clearances", s: "Clearances" },
      { name: "Ground duels won", s: "Ground Duels Won" },
      { name: "Aerial duels won", s: "Aerial Duels Won" },
      { name: "Blocks", s: "Blocks" },
    ],
  },
  {
    label: "Goalkeeping",
    gk: true,
    specs: [
      { name: "Saves", s: "Goalkeeper Saves" },
      { name: "Goals conceded", s: "Goals Conceded" },
      { name: "xG prevented", s: "Expected Goals Prevented" },
      { name: "xGOT conceded", s: "Expected Goals On Target Conceded" },
      { name: "Punches", s: "Punches" },
    ],
  },
  {
    label: "On the ball",
    keepZeros: true,
    specs: [
      { name: "Minutes", s: "Minutes" },
      { name: "Touches", s: "Touches" },
      { name: "Possession lost", s: "Possession Lost" },
      { name: "Was fouled", s: "Was Fouled" },
      { name: "Fouls made", s: "Fouls Made" },
    ],
  },
];
