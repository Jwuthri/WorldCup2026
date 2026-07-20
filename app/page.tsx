import { getCalendar, getMatchBundle, getSeasonPlayers, getPlayerDirectory } from "@/lib/data";
import { getCards } from "@/lib/cards";
import StoryFilm, { type Film } from "./story/StoryFilm";

const parseMin = (m: string) => parseInt(String(m).replace(/[^0-9+]/g, "").split("+")[0] || "0");

export default function StoryPage() {
  const b = getMatchBundle("400021543");
  if (!b) return null;
  const { cal, home, away, shots } = b;

  // formation nodes in pitch space (1050x680), same mapping as the Match Theater
  const nodes: Film["nodes"] = [];
  for (const [side, team] of [["home", home], ["away", away]] as const) {
    const starters = team.players.filter((p) => p.starter && p.formationSlot);
    const maxLine = Math.max(1, ...starters.map((p) => p.formationSlot!.line));
    for (const p of starters) {
      const depth = p.formationSlot!.line / maxLine;
      let x = 55 + depth * 380;
      let y = 60 + (p.formationSlot!.side / 100) * 560;
      if (side === "away") { x = 1050 - x; y = 680 - y; }
      nodes.push({ x, y, name: p.shortName, rating: p.rating, color: team.color, side });
    }
  }

  const filmShots: Film["shots"] = shots
    .map((s) => ({
      x: s.team === "home" ? (s.x / 100) * 1050 : 1050 - (s.x / 100) * 1050,
      y: s.team === "home" ? (s.y / 100) * 680 : 680 - (s.y / 100) * 680,
      r: 5 + (s.xg ?? 0.03) * 26,
      goal: s.outcome === "Goal",
      color: s.team === "home" ? home.color : away.color,
      minute: parseMin(s.minute),
      xg: s.xg,
    }))
    .sort((a, bb) => a.minute - bb.minute);

  // tournament numbers
  const matches = getCalendar();
  const season = getSeasonPlayers();
  const dir = getPlayerDirectory();
  const goals = matches.reduce((s, m) => s + (m.home.score ?? 0) + (m.away.score ?? 0), 0);
  const attendance = matches.reduce((s, m) => s + (Number(m.attendance) || 0), 0);
  let topSpeed = { v: 0, id: "" };
  let distance = 0;
  for (const [id, st] of Object.entries(season)) {
    if ((st.TopSpeed ?? 0) > topSpeed.v) topSpeed = { v: st.TopSpeed, id };
    distance += st.TotalDistance ?? 0;
  }

  const cards = [...getCards().values()]
    .sort((a, bb) => bb.overall - a.overall || bb.minutes - a.minutes)
    .slice(0, 5);

  const film: Film = {
    home: { name: home.ref.name, color: home.color, formation: home.formation ?? "" },
    away: { name: away.ref.name, color: away.color, formation: away.formation ?? "" },
    score: `${cal.home.score}–${cal.away.score}`,
    nodes,
    shots: filmShots,
    xg: { home: home.fdh.XG ?? 0, away: away.fdh.XG ?? 0 },
    tiles: {
      goals,
      attendanceM: attendance / 1e6,
      topSpeed: topSpeed.v,
      topSpeedName: dir[topSpeed.id]?.name ?? "",
      distanceKm: Math.round(distance / 1000),
    },
    cards,
  };

  return <StoryFilm film={film} />;
}
