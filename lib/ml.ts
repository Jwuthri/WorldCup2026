import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCards, type Card } from "./cards";
import { getTeams } from "./teams";

/** Output of scripts/ml.py (npm run ml). Ids join to cards/teams at render. */
type MlJson = {
  players: Record<string, { x: number; y: number; cluster: number }>;
  similar: Record<string, [string, number][]>;
  teamStyles: Record<string, number>;
  labels: {
    archetypes: { id: number; label: string; blurb: string }[];
    teamStyles: { id: number; label: string; blurb: string }[];
  } | null;
  xgModel: {
    n: number;
    coefs: Record<string, number>;
    intercept: number;
    calib: { range: string; n: number; fifa: number; ours: number; scored: number }[];
    disagreements: { player: string; minute: string; fifa: number; ours: number; goal: number }[];
  };
};

export const getMl = cache((): MlJson | null => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "ml", "ml.json"), "utf8"));
  } catch {
    return null;
  }
});

export const archetypes = () => getMl()?.labels?.archetypes ?? [];

export function archetypeOf(playerId: string): { id: number; label: string; blurb: string } | null {
  const cluster = getMl()?.players[playerId]?.cluster;
  return cluster == null ? null : archetypes().find((a) => a.id === cluster) ?? null;
}

export function similarTo(playerId: string, k = 5): { card: Card; sim: number }[] {
  const rows = getMl()?.similar[playerId] ?? [];
  const cards = getCards();
  return rows
    .map(([id, sim]) => ({ card: cards.get(id)!, sim }))
    .filter((r) => r.card)
    .slice(0, k);
}

export function teamStyleOf(abbr: string): { label: string; blurb: string } | null {
  const ml = getMl();
  const t = getTeams().get(abbr);
  if (!ml || !t) return null;
  const cluster = ml.teamStyles[t.id];
  return cluster == null ? null : ml.labels?.teamStyles.find((s) => s.id === cluster) ?? null;
}

export type MapPoint = {
  id: string;
  x: number;
  y: number;
  cluster: number;
  name: string;
  team: string;
  abbr: string;
  pos: Card["pos"];
  overall: number;
};

export const mapPoints = cache((): MapPoint[] => {
  const ml = getMl();
  if (!ml) return [];
  const cards = getCards();
  const out: MapPoint[] = [];
  for (const [id, p] of Object.entries(ml.players)) {
    const c = cards.get(id);
    if (c) out.push({ id, x: p.x, y: p.y, cluster: p.cluster, name: c.name, team: c.team, abbr: c.abbr, pos: c.pos, overall: c.overall });
  }
  return out;
});

/** teams of each style family, for the map page */
export function styleFamilies(): { label: string; blurb: string; teams: { abbr: string; name: string }[] }[] {
  const ml = getMl();
  if (!ml?.labels) return [];
  const byCluster: Record<number, { abbr: string; name: string }[]> = {};
  for (const t of getTeams().values()) {
    const c = ml.teamStyles[t.id];
    if (c != null) (byCluster[c] ??= []).push({ abbr: t.abbr, name: t.name });
  }
  return ml.labels.teamStyles.map((s) => ({ ...s, teams: (byCluster[s.id] ?? []).sort((a, b) => a.name.localeCompare(b.name)) }));
}
