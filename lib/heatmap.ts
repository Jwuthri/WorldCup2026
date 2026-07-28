import { cache } from "react";
import { getCalendar, getMatchBundle, type MatchPlayer } from "@/lib/data";

/**
 * 365scores player heatmaps ship their raw data inside the image URL:
 * `heatmap.365scores.com/?compressed_data=<rle>&dir=...` is an RLE-encoded
 * 20×14 grid (280 cells, row-major, own goal at LEFT — attacking → for both
 * home and away; `dir` is only a display hint). Tokens: a bare digit is one
 * cell of intensity 0-9; a letter c is a run of (charCode(c) − 65) cells of
 * the digit that follows (D=3 … z=57; runs <3 are written as literal digits).
 * Format reverse-engineered 2026-07-19 — verified exact on all 3,174 player
 * heatmaps (constant total 280) and pixel-matched against rendered PNGs.
 */
export const GRID_W = 20;
export const GRID_H = 14;
export const GRID_N = GRID_W * GRID_H;

export function decodeHeatmap(url: string): number[] | null {
  let u = url;
  try {
    u = decodeURIComponent(decodeURIComponent(url)); // stored URLs are double-encoded
  } catch {
    /* keep raw */
  }
  const m = u.match(/compressed_data=([^&]+)/);
  if (!m) return null;
  const s = m[1];
  const g: number[] = [];
  for (let i = 0; i < s.length; ) {
    const c = s.charCodeAt(i);
    if (c >= 48 && c <= 57) {
      g.push(c - 48);
      i += 1;
    } else {
      const d = s.charCodeAt(i + 1) - 48;
      if (d < 0 || d > 9) return null;
      for (let k = c - 65; k > 0; k--) g.push(d);
      i += 2;
    }
  }
  return g.length === GRID_N ? g : null;
}

export type TeamGrid = number[]; // 280 floats, attacking →

const minutesOf = (p: MatchPlayer): number => {
  const row = p.s365Stats.find((s) => s.name === "Minutes");
  const v = row ? parseInt(row.value) : NaN;
  return Number.isFinite(v) && v > 0 ? v : p.starter ? 90 : 20;
};

/** each player's grid is self-normalized 0-9, so treat it as a spatial
 *  distribution (mass 1) and weight by minutes played before summing */
export const sumSide = (players: MatchPlayer[]): TeamGrid => {
  const acc = new Array(GRID_N).fill(0);
  for (const p of players) {
    const g = p.heatmap ? decodeHeatmap(p.heatmap) : null;
    if (!g) continue;
    const mass = g.reduce((a, x) => a + x, 0);
    if (!mass) continue;
    const w = minutesOf(p) / mass;
    for (let i = 0; i < GRID_N; i++) acc[i] += g[i] * w;
  }
  return acc;
};

/** per-match team occupation grids; either side may be all-zero if data is missing */
export const matchTerritory = cache((fifaId: string): { home: TeamGrid; away: TeamGrid } | null => {
  const b = getMatchBundle(fifaId);
  if (!b) return null;
  return { home: sumSide(b.home.players), away: sumSide(b.away.players) };
});

export const hasHeat = (g: TeamGrid | null | undefined): g is TeamGrid => !!g?.some(Boolean);

/** one player's tournament occupation: each match's grid normalized to mass 1, then summed */
export const playerTerritory = cache((playerId: string): TeamGrid | null => {
  const acc = new Array(GRID_N).fill(0);
  let n = 0;
  for (const m of getCalendar()) {
    const b = getMatchBundle(m.id);
    if (!b) continue;
    const p = [...b.home.players, ...b.away.players].find((x) => x.fifaId === playerId);
    const g = p?.heatmap ? decodeHeatmap(p.heatmap) : null;
    if (!g) continue;
    const mass = g.reduce((a, x) => a + x, 0);
    if (!mass) continue;
    for (let i = 0; i < GRID_N; i++) acc[i] += g[i] / mass;
    n++;
  }
  return n ? acc : null;
});

export type TerritoryGame = { matchId: string; opp: string; oppAbbr: string; grid: TeamGrid };

/** all of a team's per-match grids plus the tournament average (each match normalized to mass 1) */
export const teamTerritory = cache((abbr: string): { avg: TeamGrid | null; games: TerritoryGame[] } => {
  const games: TerritoryGame[] = [];
  for (const m of getCalendar()) {
    const isHome = m.home.abbr === abbr;
    if (!isHome && m.away.abbr !== abbr) continue;
    const t = matchTerritory(m.id);
    const grid = isHome ? t?.home : t?.away;
    if (!hasHeat(grid)) continue;
    const opp = isHome ? m.away : m.home;
    games.push({ matchId: m.id, opp: opp.name, oppAbbr: opp.abbr, grid });
  }
  if (!games.length) return { avg: null, games };
  const avg = new Array(GRID_N).fill(0);
  for (const g of games) {
    const mass = g.grid.reduce((a, x) => a + x, 0);
    for (let i = 0; i < GRID_N; i++) avg[i] += g.grid[i] / mass / games.length;
  }
  return { avg, games };
});
