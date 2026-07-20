import { cache } from "react";
import { getCalendar, getMatchBundle, type MatchPlayer } from "@/lib/data";

export type CardStat = { key: string; label: string; val: number };
export type Card = {
  id: string;
  name: string;
  team: string;
  abbr: string;
  pos: "GK" | "DEF" | "MID" | "ATT";
  photo: string | null;
  minutes: number;
  matches: number;
  avgRating: number | null;
  overall: number;
  tier: "gold" | "silver" | "bronze";
  raw: {
    goals: number; assists: number; xg: number;
    saves: number; savePct: number | null; conceded: number; xgp: number;
    cleanSheets: number; topSpeed: number;
  };
  stats: CardStat[];
  receipts: { label: string; value: string }[];
  perMatch: { matchId: string; opp: string; oppAbbr: string; score: string; rating: number | null }[];
};

type Acc = {
  id: string;
  name: string;
  team: string;
  abbr: string;
  photo: string | null;
  min: number;
  matches: number;
  goals: number; xg: number; att: number; attOn: number;
  passesC: number; passes: number; crossesC: number; assists: number;
  xa: number; keyPasses: number;
  dribbles: number; touches: number;
  tackles: number; inter: number; recov: number; duels: number;
  forced: number;
  topSpeed: number; sprintDist: number; distance: number;
  saves: number; savePctSum: number; savePctN: number; conceded: number; xgp: number;
  cleanSheets: number;
  ratings: number[];
  posCounts: Record<string, number>;
  perMatch: Card["perMatch"];
};

const n365 = (p: MatchPlayer, name: string): number => {
  const r = p.s365Stats.find((x) => x.name === name);
  if (!r) return 0;
  const v = parseFloat(r.value); // "26/32 (81%)" -> 26
  return Number.isNaN(v) ? 0 : v;
};

const posOf = (counts: Record<string, number>): Card["pos"] => {
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";
  if (/goal/i.test(top)) return "GK";
  if (/defen/i.test(top)) return "DEF";
  if (/mid/i.test(top)) return "MID";
  if (/attack|forward|wing|strik/i.test(top)) return "ATT";
  return "MID";
};

/** percentile of v within sorted asc array -> 0..1 */
const pct = (v: number, sorted: number[]): number => {
  if (!sorted.length) return 0.5;
  let lo = 0, hi = sorted.length;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (sorted[mid] <= v) lo = mid + 1; else hi = mid; }
  return lo / sorted.length;
};
const score = (p: number) => Math.round(40 + p * 59); // 40..99

export const getCards = cache((): Map<string, Card> => {
  const accs = new Map<string, Acc>();

  for (const m of getCalendar()) {
    const b = getMatchBundle(m.id);
    if (!b) continue;
    const score2 = `${m.home.score}:${m.away.score}`;
    for (const [side, opp] of [[b.home, m.away], [b.away, m.home]] as const) {
      for (const p of side.players) {
        const min = p.fdh.TimePlayed ?? n365(p, "Minutes");
        if (!min) continue;
        let a = accs.get(p.fifaId);
        if (!a) {
          a = {
            id: p.fifaId, name: p.shortName, team: side.ref.name, abbr: side.ref.abbr,
            photo: p.photo, min: 0, matches: 0,
            goals: 0, xg: 0, att: 0, attOn: 0, passesC: 0, passes: 0, crossesC: 0,
            assists: 0, xa: 0, keyPasses: 0, dribbles: 0, touches: 0,
            tackles: 0, inter: 0, recov: 0, duels: 0, forced: 0,
            topSpeed: 0, sprintDist: 0, distance: 0,
            saves: 0, savePctSum: 0, savePctN: 0, conceded: 0, xgp: 0,
            cleanSheets: 0,
            ratings: [], posCounts: {}, perMatch: [],
          };
          accs.set(p.fifaId, a);
        }
        if (!a.photo && p.photo) a.photo = p.photo;
        a.min += min;
        a.matches += 1;
        if (min >= 45 && (opp.score ?? 1) === 0) a.cleanSheets += 1;
        const f = p.fdh;
        a.goals += f.Goals ?? n365(p, "Goals");
        a.xg += f.XG ?? n365(p, "Expected Goals");
        a.att += f.AttemptAtGoal ?? n365(p, "Total Shots");
        a.attOn += f.AttemptAtGoalOnTarget ?? n365(p, "Shots On Target");
        a.passesC += f.PassesCompleted ?? n365(p, "Passes Completed");
        a.passes += f.Passes ?? 0;
        a.crossesC += f.CrossesCompleted ?? 0;
        a.assists += f.Assists ?? n365(p, "Assists");
        a.xa += n365(p, "Expected Assists");
        a.keyPasses += n365(p, "Key Passes");
        a.dribbles += n365(p, "Successful Dribbles");
        a.touches += n365(p, "Touches");
        a.tackles += n365(p, "Tackles Won");
        a.inter += n365(p, "Interceptions");
        a.recov += n365(p, "Ball Recovery");
        a.duels += n365(p, "Ground Duels Won") + n365(p, "Aerial Duels Won");
        a.forced += f.ForcedTurnovers ?? 0;
        a.topSpeed = Math.max(a.topSpeed, f.TopSpeed ?? 0);
        a.sprintDist += (f.DistanceHighSpeedSprinting ?? 0) + (f.DistanceHighSpeedRunning ?? 0);
        a.distance += f.TotalDistance ?? 0;
        a.saves += f.GoalkeeperSaves ?? n365(p, "Goalkeeper Saves");
        if (f.GoalkeeperSavePercentage != null) { a.savePctSum += f.GoalkeeperSavePercentage; a.savePctN += 1; }
        a.conceded += n365(p, "Goals Conceded");
        a.xgp += n365(p, "Expected Goals Prevented");
        if (p.rating != null) a.ratings.push(p.rating);
        if (p.positionName) a.posCounts[p.positionName] = (a.posCounts[p.positionName] ?? 0) + 1;
        a.perMatch.push({ matchId: m.id, opp: opp.name, oppAbbr: opp.abbr, score: score2, rating: p.rating });
      }
    }
  }

  // ---- derived metrics + percentile pools ----
  // ponytail: effective minutes floor of 45 stops 10-minute cameos gaming per-90s
  const eff = (a: Acc) => Math.max(a.min, 45);
  const per90 = (v: number, a: Acc) => (v / eff(a)) * 90;
  const all = [...accs.values()];
  const pool = all.filter((a) => a.min >= 90);
  const isGk = (a: Acc) => posOf(a.posCounts) === "GK";

  const METRICS: Record<string, (a: Acc) => number> = {
    topSpeed: (a) => a.topSpeed,
    sprint90: (a) => per90(a.sprintDist, a),
    goals90: (a) => per90(a.goals, a),
    xg90: (a) => per90(a.xg, a),
    attOn90: (a) => per90(a.attOn, a),
    passC90: (a) => per90(a.passesC, a),
    passPct: (a) => (a.passes > 0 ? a.passesC / a.passes : 0),
    creation90: (a) => per90(a.assists + a.xa + a.keyPasses * 0.5 + a.crossesC * 0.3, a),
    dribbles90: (a) => per90(a.dribbles, a),
    touches90: (a) => per90(a.touches, a),
    defend90: (a) => per90(a.tackles + a.inter + a.recov + a.forced * 0.5, a),
    duels90: (a) => per90(a.duels, a),
    dist90: (a) => per90(a.distance, a),
    rating: (a) => (a.ratings.length ? a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length : 0),
    saves90: (a) => per90(a.saves, a),
    savePct: (a) => (a.savePctN ? a.savePctSum / a.savePctN : 0),
    xgp90: (a) => per90(a.xgp, a),
    concInv: (a) => -per90(a.conceded, a),
  };
  const GK_POOL_KEYS = new Set(["saves90", "savePct", "xgp90", "concInv", "passPct", "topSpeed", "dist90", "rating"]);
  const sortedPools: Record<string, { out: number[]; gk: number[] }> = {};
  for (const [k, fn] of Object.entries(METRICS)) {
    sortedPools[k] = {
      out: pool.filter((a) => !isGk(a)).map(fn).sort((x, y) => x - y),
      gk: pool.filter(isGk).map(fn).sort((x, y) => x - y),
    };
  }
  const P = (a: Acc, k: string) =>
    pct(METRICS[k](a), GK_POOL_KEYS.has(k) && isGk(a) ? sortedPools[k].gk : sortedPools[k].out);

  const WEIGHTS: Record<string, number[]> = {
    // PAC SHO PAS DRI DEF PHY
    DEF: [0.15, 0.05, 0.2, 0.1, 0.3, 0.2],
    MID: [0.1, 0.1, 0.3, 0.2, 0.15, 0.15],
    ATT: [0.2, 0.35, 0.1, 0.2, 0.05, 0.1],
  };

  const cards = new Map<string, Card>();
  for (const a of all) {
    const pos = posOf(a.posCounts);
    const avgRating = a.ratings.length
      ? Math.round((a.ratings.reduce((s, r) => s + r, 0) / a.ratings.length) * 100) / 100
      : null;
    let stats: CardStat[];
    let weighted: number;
    if (pos === "GK") {
      const s = {
        SAV: score(P(a, "saves90")),
        STP: score(P(a, "savePct")),
        XGP: score(P(a, "xgp90")),
        DIS: score(P(a, "passPct")),
        SPD: score(P(a, "topSpeed")),
        PHY: score(P(a, "dist90")),
      };
      stats = [
        { key: "SAV", label: "saves", val: s.SAV },
        { key: "STP", label: "save %", val: s.STP },
        { key: "XGP", label: "xG prevented", val: s.XGP },
        { key: "DIS", label: "distribution", val: s.DIS },
        { key: "SPD", label: "speed", val: s.SPD },
        { key: "PHY", label: "workrate", val: s.PHY },
      ];
      weighted = (s.SAV + s.STP + s.XGP) / 3 * 0.75 + (s.DIS + s.SPD + s.PHY) / 3 * 0.25;
    } else {
      const s = {
        PAC: score(P(a, "topSpeed") * 0.7 + P(a, "sprint90") * 0.3),
        SHO: score(P(a, "goals90") * 0.45 + P(a, "xg90") * 0.3 + P(a, "attOn90") * 0.25),
        PAS: score(P(a, "passC90") * 0.35 + P(a, "passPct") * 0.25 + P(a, "creation90") * 0.4),
        DRI: score(P(a, "dribbles90") * 0.6 + P(a, "touches90") * 0.4),
        DEF: score(P(a, "defend90")),
        PHY: score(P(a, "dist90") * 0.5 + P(a, "duels90") * 0.5),
      };
      stats = [
        { key: "PAC", label: "top speed", val: s.PAC },
        { key: "SHO", label: "goals + xG", val: s.SHO },
        { key: "PAS", label: "passing", val: s.PAS },
        { key: "DRI", label: "dribbling", val: s.DRI },
        { key: "DEF", label: "defending", val: s.DEF },
        { key: "PHY", label: "engine", val: s.PHY },
      ];
      const w = WEIGHTS[pos];
      weighted = stats.reduce((sum, st, i) => sum + st.val * w[i], 0);
    }
    const ratingScore = a.ratings.length ? score(P(a, "rating")) : weighted;
    const overall = Math.round(weighted * 0.65 + ratingScore * 0.35);
    const fmt = (v: number, d = 0) => v.toLocaleString("en-US", { maximumFractionDigits: d });
    const receipts = [
      { label: "Matches", value: fmt(a.matches) },
      { label: "Minutes", value: fmt(Math.round(a.min)) },
      ...(pos === "GK"
        ? [
            { label: "Saves", value: fmt(a.saves) },
            { label: "Save %", value: a.savePctN ? `${Math.round((a.savePctSum / a.savePctN) * 100)}%` : "—" },
            { label: "Goals conceded", value: fmt(a.conceded) },
            { label: "xG prevented", value: a.xgp.toFixed(2) },
          ]
        : [
            { label: "Goals", value: fmt(a.goals) },
            { label: "Assists", value: fmt(a.assists) },
            { label: "xG", value: a.xg.toFixed(2) },
            { label: "Shots on target", value: fmt(a.attOn) },
            { label: "Dribbles won", value: fmt(a.dribbles) },
            { label: "Tackles + interceptions", value: fmt(a.tackles + a.inter) },
            { label: "Duels won", value: fmt(a.duels) },
          ]),
      { label: "Pass completion", value: a.passes > 0 ? `${Math.round((a.passesC / a.passes) * 100)}%` : "—" },
      { label: "Distance", value: `${(a.distance / 1000).toFixed(1)} km` },
      { label: "Top speed", value: a.topSpeed ? `${a.topSpeed.toFixed(1)} km/h` : "—" },
      { label: "Avg rating", value: avgRating != null ? avgRating.toFixed(2) : "—" },
    ];
    cards.set(a.id, {
      id: a.id, name: a.name, team: a.team, abbr: a.abbr, pos,
      photo: a.photo, minutes: Math.round(a.min), matches: a.matches, avgRating,
      overall, tier: overall >= 85 ? "gold" : overall >= 75 ? "silver" : "bronze",
      raw: {
        goals: a.goals, assists: a.assists, xg: a.xg,
        saves: a.saves, savePct: a.savePctN ? a.savePctSum / a.savePctN : null,
        conceded: a.conceded, xgp: a.xgp,
        cleanSheets: a.cleanSheets, topSpeed: a.topSpeed,
      },
      stats, receipts,
      perMatch: a.perMatch,
    });
  }
  return cards;
});
