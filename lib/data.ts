import { cache } from "react";
import fs from "node:fs";
import path from "node:path";

const DATA = path.join(process.cwd(), "data");

function readJson(rel: string): any | null {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA, rel), "utf8"));
  } catch {
    return null;
  }
}

/** FIFA localized string arrays -> plain string */
export const loc = (v: any): string => v?.[0]?.Description ?? "";

export { flagUrl } from "./flags";

/* ---------------- calendar / matches ---------------- */

export type CalMatch = {
  id: string;
  stageId: string;
  stage: string;
  group: string;
  date: string;
  localDate: string;
  matchNumber: number;
  attendance: string | null;
  stadium: string;
  city: string;
  home: TeamRef;
  away: TeamRef;
  winner: string | null;
  penHome: number | null;
  penAway: number | null;
  resultType: number;
};

export type TeamRef = {
  id: string;
  name: string;
  abbr: string;
  score: number | null;
  tactics: string | null;
};

const teamRef = (t: any, score: number | null): TeamRef => ({
  id: t?.IdTeam ?? "",
  name: loc(t?.TeamName),
  abbr: t?.Abbreviation ?? "",
  score,
  tactics: t?.Tactics ?? null,
});

export const getCalendar = cache((): CalMatch[] => {
  const cal = readJson("fifa/calendar.json");
  const out: CalMatch[] = (cal?.Results ?? [])
    .filter((m: any) => m.Home && m.Away)
    .map((m: any) => ({
      id: m.IdMatch,
      stageId: m.IdStage,
      stage: loc(m.StageName),
      group: loc(m.GroupName),
      date: m.Date,
      localDate: m.LocalDate ?? m.Date,
      matchNumber: m.MatchNumber,
      attendance: m.Attendance ?? null,
      stadium: loc(m.Stadium?.Name),
      city: loc(m.Stadium?.CityName),
      home: teamRef(m.Home, m.HomeTeamScore ?? m.Home?.Score ?? null),
      away: teamRef(m.Away, m.AwayTeamScore ?? m.Away?.Score ?? null),
      winner: m.Winner ?? null,
      penHome: m.HomeTeamPenaltyScore ?? null,
      penAway: m.AwayTeamPenaltyScore ?? null,
      resultType: m.ResultType,
    }));
  out.sort((a, b) => a.date.localeCompare(b.date));
  return out;
});

/* ---------------- 365scores join ---------------- */

// FIFA name -> canonical; 365 name -> canonical. Extend if a match fails to join.
const strip = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
const ALIAS: Record<string, string> = {
  unitedstates: "usa",
  korearepublic: "southkorea",
  cotedivoire: "ivorycoast",
  iriran: "iran",
  chinapr: "china",
  congodr: "drcongo",
  bosniaandherzegovina: "bosnia",
  bosniaherzegovina: "bosnia",
  caboverde: "capeverde",
};
const canon = (s: string) => {
  const k = strip(s);
  return ALIAS[k] ?? k;
};

const s365Index = cache((): any[] => readJson("s365/games_index.json") ?? []);

/** find the 365scores game for a FIFA calendar match: same kickoff instant (±3h) + same team pair */
export const find365 = cache((fifaId: string): any | null => {
  const m = getCalendar().find((x) => x.id === fifaId);
  if (!m) return null;
  const t = Date.parse(m.date); // FIFA dates are UTC; 365 startTime carries its own offset
  const pair = [canon(m.home.name), canon(m.away.name)].sort().join("|");
  return (
    s365Index().find((g) => {
      const gt = Date.parse(g.startTime ?? "");
      const gpair = [canon(g.home ?? ""), canon(g.away ?? "")].sort().join("|");
      return Math.abs(gt - t) < 3 * 3600_000 && gpair === pair;
    }) ?? null
  );
});

/* ---------------- full match bundle ---------------- */

export type MatchPlayer = {
  fifaId: string;
  name: string;
  shortName: string;
  shirt: number;
  starter: boolean;
  captain: boolean;
  photo: string | null;
  // 365scores enrichment
  rating: number | null;
  heatmap: string | null;
  positionName: string | null;
  formationSlot: { line: number; side: number } | null; // percent coords on own half layout
  s365Stats: { name: string; value: string; category: number }[];
  // FIFA data hub: [metric, value] pairs
  fdh: Record<string, number>;
};

export type MatchSide = {
  ref: TeamRef;
  color: string;
  formation: string | null;
  players: MatchPlayer[];
  goals: { minute: string; player: string; assist: string | null; penalty: boolean; own: boolean }[];
  fdh: Record<string, number>;
};

export type Shot = {
  team: "home" | "away";
  minute: string;
  player: string;
  xg: number | null;
  xgot: number | null;
  bodyPart: string | null;
  outcome: string; // Goal | Saved | Missed | Blocked | Post
  x: number; // 0-100 toward opponent goal at x=100
  y: number; // 0-100 across pitch
  gateY: number | null; // goal-mouth horizontal 0-100
  gateZ: number | null; // goal-mouth height 0-100
};

export type TimelineEvent = {
  minute: string;
  period: number;
  type: string;
  team: "home" | "away" | null;
  desc: string;
  x: number | null;
  y: number | null;
  homeGoals: number;
  awayGoals: number;
};

const fdhMap = (rows: [string, number, boolean][] | undefined): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const [k, v] of rows ?? []) out[k] = v;
  return out;
};

// two team colors too close -> away falls back to chalk
// ponytail: naive RGB distance; perceptual OKLab if a real clash slips through
export function sideColors(homeHex?: string, awayHex?: string): [string, string] {
  const h = homeHex ? `#${homeHex.replace("#", "")}` : "#e3be56";
  const a = awayHex ? `#${awayHex.replace("#", "")}` : "#edf2e8";
  const rgb = (x: string) => [1, 3, 5].map((i) => parseInt(x.slice(i, i + 2), 16));
  const [r1, g1, b1] = rgb(h);
  const [r2, g2, b2] = rgb(a);
  const dist = Math.hypot(r1 - r2, g1 - g2, b1 - b2);
  const darkDist = Math.hypot(r2 - 10, g2 - 21, b2 - 14);
  return [h, dist < 90 || darkDist < 70 ? "#edf2e8" : a];
}

export const getMatchBundle = cache((fifaId: string) => {
  const cal = getCalendar().find((m) => m.id === fifaId);
  if (!cal) return null;
  const live = readJson(`fifa/matches/${fifaId}.live.json`);
  const timelineRaw = readJson(`fifa/matches/${fifaId}.timeline.json`);
  const fdhPlayers = readJson(`fifa/matches/${fifaId}.players.json`) ?? {};
  const fdhTeams = readJson(`fifa/matches/${fifaId}.teams.json`) ?? {};
  const g365meta = find365(fifaId);
  const g365 = g365meta ? readJson(`s365/games/${g365meta.id}.json`)?.game ?? null : null;
  const s365stats = g365meta ? readJson(`s365/games/${g365meta.id}.stats.json`) : null;

  // --- 365 member lookup: lineup member id -> bio (name, jersey, athleteId) ---
  const memberById: Record<number, any> = {};
  for (const mm of g365?.members ?? []) memberById[mm.id] = mm;
  // 365 side that corresponds to FIFA home
  const s365HomeIsFifaHome = g365
    ? canon(g365.homeCompetitor?.name ?? "") === canon(cal.home.name)
    : true;

  const s365SideFor = (side: "home" | "away") => {
    if (!g365) return null;
    const wantHome = side === "home" ? s365HomeIsFifaHome : !s365HomeIsFifaHome;
    return wantHome ? g365.homeCompetitor : g365.awayCompetitor;
  };

  const buildSide = (side: "home" | "away"): MatchSide => {
    const team = side === "home" ? live?.HomeTeam : live?.AwayTeam;
    const ref = side === "home" ? cal.home : cal.away;
    const s365side = s365SideFor(side);
    // jersey -> 365 lineup entry (joined through members for bio)
    const byJersey: Record<number, { entry: any; bio: any }> = {};
    for (const entry of s365side?.lineups?.members ?? []) {
      const bio = memberById[entry.id];
      if (bio?.jerseyNumber != null) byJersey[bio.jerseyNumber] = { entry, bio };
    }
    const players: MatchPlayer[] = (team?.Players ?? []).map((p: any) => {
      const shirt = p.ShirtNumber;
      const j = byJersey[shirt];
      const yf = j?.entry?.yardFormation;
      return {
        fifaId: p.IdPlayer,
        name: loc(p.PlayerName),
        shortName: loc(p.ShortName) || loc(p.PlayerName),
        shirt,
        starter: p.Status === 1,
        captain: !!p.Captain,
        photo: p.PlayerPicture?.PictureUrl
          ? `${p.PlayerPicture.PictureUrl}?io=transform:fill,width:160`
          : null,
        rating: j?.entry?.ranking ?? null,
        heatmap: j?.entry?.heatMap ?? null,
        positionName: j?.entry?.position?.name ?? null,
        formationSlot: yf ? { line: yf.fieldLine, side: yf.fieldSide } : null,
        s365Stats: (j?.entry?.stats ?? []).map((s: any) => ({
          name: s.name,
          value: s.value,
          category: s.categoryId ?? 0,
        })),
        fdh: fdhMap(fdhPlayers[p.IdPlayer]),
      };
    });
    const goals = (team?.Goals ?? []).map((g: any) => {
      const scorer = players.find((p) => p.fifaId === g.IdPlayer);
      const assist = players.find((p) => p.fifaId === g.IdAssistPlayer);
      return {
        minute: `${g.Minute ?? ""}`.replace(/[^0-9+]/g, "") || "?",
        player: scorer?.shortName ?? "",
        assist: assist?.shortName ?? null,
        penalty: g.Type === 2,
        own: g.Type === 3,
      };
    });
    return {
      ref,
      color: "",
      // 365's formation string matches the plotted yardFormation shape; FIFA's Tactics can disagree
      formation: s365side?.lineups?.formation ?? team?.Tactics ?? ref.tactics,
      players,
      goals,
      fdh: fdhMap(fdhTeams[ref.id]),
    };
  };

  const home = buildSide("home");
  const away = buildSide("away");
  const [hc, ac] = sideColors(
    s365SideFor("home")?.color,
    s365SideFor("away")?.color
  );
  home.color = hc;
  away.color = ac;

  // --- shots: prefer 365 chartEvents (xg/xgot/goal mouth), fallback FIFA timeline ---
  const shots: Shot[] = [];
  const s365PlayerName = (pid: number) => {
    for (const mm of g365?.members ?? []) if (mm.athleteId === pid || mm.id === pid) return mm.shortName ?? mm.name;
    return "";
  };
  for (const e of g365?.chartEvents?.events ?? []) {
    const isHome365 = e.competitorNum === 1;
    const team: "home" | "away" =
      isHome365 === s365HomeIsFifaHome ? "home" : "away";
    shots.push({
      team,
      minute: e.time ?? "",
      player: s365PlayerName(e.playerId),
      xg: e.xg != null ? parseFloat(e.xg) : null,
      xgot: e.xgot != null ? parseFloat(e.xgot) : null,
      bodyPart: e.bodyPart ?? null,
      outcome: e.subType === 7 && e.type === 0 ? e.outcome?.name ?? "Attempt" : e.outcome?.name ?? (e.type === 1 ? "Goal" : "Attempt"),
      x: e.side ?? 0,
      y: e.line ?? 0,
      gateY: e.outcome?.y ?? null,
      gateZ: e.outcome?.z ?? null,
    });
  }

  const timeline: TimelineEvent[] = (timelineRaw?.Event ?? []).map((e: any) => ({
    minute: `${e.MatchMinute ?? ""}`.replace(/'/g, ""),
    period: e.Period,
    type: e.TypeLocalized?.[0]?.Description ?? "",
    team:
      e.IdTeam === cal.home.id ? "home" : e.IdTeam === cal.away.id ? "away" : null,
    desc: loc(e.EventDescription),
    x: e.PositionX ?? null,
    y: e.PositionY ?? null,
    homeGoals: e.HomeGoals ?? 0,
    awayGoals: e.AwayGoals ?? 0,
  }));

  return { cal, home, away, shots, timeline, s365TeamStats: s365stats?.statistics ?? [] };
});

/* ---------------- tournament-level ---------------- */

export type StandingRow = {
  pos: number;
  name: string;
  abbr: string;
  w: number;
  d: number;
  l: number;
  gf: number;
  ga: number;
  gd: number;
  pts: number;
  through: boolean;
  confed: string;
};

export const getStandings = cache((): Record<string, StandingRow[]> => {
  const st = readJson("fifa/standings.json");
  const groups: Record<string, StandingRow[]> = {};
  for (const r of st?.Results ?? []) {
    const g = (loc(r.Group) || "?").replace("Group ", "");
    (groups[g] ??= []).push({
      pos: r.Position,
      name: loc(r.Team?.Name),
      abbr: r.Team?.Abbreviation ?? "",
      w: r.Won,
      d: r.Drawn,
      l: r.Lost,
      gf: r.For,
      ga: r.Against,
      gd: r.GoalsDiference,
      pts: r.Points,
      through: r.QualificationStatus === "ConfirmedQualified",
      confed: r.Team?.IdConfederation ?? "",
    });
  }
  for (const g of Object.values(groups)) g.sort((a, b) => a.pos - b.pos);
  return groups;
});

export const getSeasonPlayers = cache((): Record<string, Record<string, number>> => {
  const raw = readJson("fifa/season_players.json") ?? {};
  const out: Record<string, Record<string, number>> = {};
  for (const [id, rows] of Object.entries(raw)) out[id] = fdhMap(rows as any);
  return out;
});

/** name/photo lookup for season aggregates, built from all harvested lineups */
export const getPlayerDirectory = cache((): Record<string, { name: string; team: string; teamAbbr: string; photo: string | null }> => {
  const dir: Record<string, any> = {};
  for (const m of getCalendar()) {
    const live = readJson(`fifa/matches/${m.id}.live.json`);
    for (const [team, ref] of [
      [live?.HomeTeam, m.home],
      [live?.AwayTeam, m.away],
    ] as const) {
      for (const p of team?.Players ?? []) {
        const photo = p.PlayerPicture?.PictureUrl
          ? `${p.PlayerPicture.PictureUrl}?io=transform:fill,width:160`
          : null;
        if (!dir[p.IdPlayer])
          dir[p.IdPlayer] = {
            name: loc(p.ShortName) || loc(p.PlayerName),
            team: ref.name,
            teamAbbr: ref.abbr,
            photo,
          };
        else if (!dir[p.IdPlayer].photo && photo) dir[p.IdPlayer].photo = photo; // backfill: not every lineup carries the picture URL
      }
    }
  }
  return dir;
});
