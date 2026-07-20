import { cache } from "react";
import { getMatchBundle } from "@/lib/data";
import type { Card } from "@/lib/cards";

/**
 * Server-side aggregation for the generative poster: the player's shots
 * across every match they played, their typical formation slot, and their
 * team color.
 *
 * Shots in the bundle carry only a 365scores display name, so we join by
 * normalized surname tokens (>= 3 letters, accents stripped) against the
 * player's FIFA names. Teammates sharing a surname could collide — acceptable
 * for art, and rare at 26-player squads.
 */

export type PosterShotDatum = { x: number; y: number; xg: number; goal: boolean };
export type PosterData = {
  color: string;
  slot: { line: number; side: number } | null;
  shots: PosterShotDatum[];
};

const tokens = (s: string): string[] =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z]+/)
    .filter((t) => t.length >= 3);

export const getPosterData = cache((card: Card): PosterData => {
  const shots: PosterShotDatum[] = [];
  let color = "#e3be56";
  let lineSum = 0;
  let sideSum = 0;
  let slotN = 0;
  const seen = new Set<string>();

  for (const pm of card.perMatch) {
    if (seen.has(pm.matchId)) continue;
    seen.add(pm.matchId);
    const b = getMatchBundle(pm.matchId);
    if (!b) continue;
    for (const side of ["home", "away"] as const) {
      const sd = side === "home" ? b.home : b.away;
      const me = sd.players.find((p) => p.fifaId === card.id);
      if (!me) continue;
      if (sd.color) color = sd.color;
      if (me.formationSlot) {
        lineSum += me.formationSlot.line;
        sideSum += me.formationSlot.side;
        slotN += 1;
      }
      const mine = new Set([...tokens(me.name), ...tokens(me.shortName)]);
      for (const s of b.shots) {
        if (s.team !== side) continue;
        if (!tokens(s.player).some((t) => mine.has(t))) continue;
        shots.push({ x: s.x, y: s.y, xg: s.xg ?? 0.06, goal: s.outcome === "Goal" });
      }
    }
  }

  // formationSlot is % of the player's own half; halve the depth to place it
  // on the full pitch (0 = own goal line, 100 = opponent goal line)
  const slot = slotN ? { line: lineSum / slotN / 2, side: sideSum / slotN } : null;
  return { color, slot, shots };
});
