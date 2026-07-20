import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCards, type Card } from "./cards";
import { getTeams } from "./teams";
import { getPlayerDirectory } from "./data";

/** Output of scripts/ml.py (npm run ml). Ids join to cards/teams at render. */
type MlJson = {
  players: Record<string, { cluster: number }>;
  similar: Record<string, [string, number][]>;
  teamStyles: Record<string, number>;
  labels: {
    archetypes: { id: number; label: string; blurb: string; traits?: string[] }[];
    teamStyles: { id: number; label: string; blurb: string }[];
  } | null;
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

export type TribeMember = {
  id: string;
  cluster: number;
  name: string;
  team: string;
  abbr: string;
  pos: Card["pos"];
  overall: number;
  photo: string | null;
  twins: { id: string; name: string; pct: number }[]; // top 3, for the finder
};

/** every clustered player, joined to card + photo, sorted best-first */
export const tribeMembers = cache((): TribeMember[] => {
  const ml = getMl();
  if (!ml) return [];
  const cards = getCards();
  const dir = getPlayerDirectory();
  const out: TribeMember[] = [];
  for (const [id, p] of Object.entries(ml.players)) {
    const c = cards.get(id);
    if (!c) continue;
    out.push({
      id,
      cluster: p.cluster,
      name: c.name,
      team: c.team,
      abbr: c.abbr,
      pos: c.pos,
      overall: c.overall,
      photo: dir[id]?.photo ?? null,
      twins: (ml.similar[id] ?? []).slice(0, 3).map(([tid, sim]) => ({
        id: tid,
        name: cards.get(tid)?.name ?? "",
        pct: Math.round(sim * 100),
      })).filter((t) => t.name),
    });
  }
  return out.sort((a, b) => b.overall - a.overall);
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
