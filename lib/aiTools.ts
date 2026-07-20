import type Anthropic from "@anthropic-ai/sdk";
import { getCalendar, getMatchBundle, getSeasonPlayers, getPlayerDirectory, getStandings } from "@/lib/data";
import { getCards } from "@/lib/cards";
import { getTeams, type Team } from "@/lib/teams";
import { getConditions, getTeamSchedule } from "@/lib/context";
import { getStrength, getForm, getHeadToHead, getRefereeForMatch, getReferees } from "@/lib/strength";
import { getHonours } from "@/lib/honours";
import { VENUES } from "@/lib/venues";
import { archetypeOf, similarTo, teamStyleOf } from "@/lib/ml";
import { luckOf } from "@/lib/luck";
import { getRates, simulate, getBacktest } from "@/lib/sim";

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function resolveTeam(q: string): Team | null {
  const teams = getTeams();
  const nq = norm(q);
  for (const t of teams.values()) if (norm(t.abbr) === nq || norm(t.name) === nq) return t;
  for (const t of teams.values()) if (norm(t.name).includes(nq)) return t;
  return null;
}

/* ---------------- tool definitions (sent to Claude) ---------------- */

export const TOOL_DEFS: Anthropic.Tool[] = [
  {
    name: "list_matches",
    description:
      "List tournament matches with their ids, optionally filtered. Use this to find match ids for get_match. stage accepts 'group', 'knockout', or a stage name like 'Final', 'Semi-final', 'Round of 16'.",
    input_schema: {
      type: "object",
      properties: {
        team: { type: "string", description: "Team name or abbreviation, e.g. 'Spain' or 'ESP'" },
        stage: { type: "string" },
      },
    },
  },
  {
    name: "get_match",
    description:
      "Full data for one match: team stats duel (possession, xG, threat, press phases, ball-recovery time, distance, top speed), every shot with xG, goals, formations, and the top-rated players with their key numbers.",
    input_schema: {
      type: "object",
      properties: { match_id: { type: "string", description: "Id from list_matches" } },
      required: ["match_id"],
    },
  },
  {
    name: "get_team",
    description:
      "A team's tournament profile: how they played (12 identity metrics with percentile rank among all 48 teams — possession, press phases, recovery time, xG for/against, line breaks, distance), formations used, every result, and their top squad players with season totals.",
    input_schema: {
      type: "object",
      properties: { team: { type: "string", description: "Team name or abbreviation" } },
      required: ["team"],
    },
  },
  {
    name: "get_player",
    description:
      "A player's full file by (partial) name: card ratings, season totals (goals, xG, passes, distance, top speed…), and match-by-match ratings.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string" } },
      required: ["name"],
    },
  },
  {
    name: "leaderboard",
    description: "Tournament top players by one metric.",
    input_schema: {
      type: "object",
      properties: {
        metric: {
          type: "string",
          enum: ["goals", "assists", "xg", "avg_rating", "top_speed", "distance", "saves", "passes_completed"],
        },
        limit: { type: "integer", description: "Default 10, max 20" },
      },
      required: ["metric"],
    },
  },
  {
    name: "get_team_strength",
    description:
      "A team's strength prior: World Football Elo rating and global rank (of ~240 nations), their seed among the 48 WC teams, and pre-tournament form (last 10 internationals before June 11, W-D-L + goals). Use to judge how strong a side really was, quantify upsets, or set expectations before results.",
    input_schema: {
      type: "object",
      properties: { team: { type: "string", description: "Team name or abbreviation" } },
      required: ["team"],
    },
  },
  {
    name: "head_to_head",
    description:
      "All-time head-to-head record between two nations (every international ever played between them) plus their 5 most recent meetings. Use for rivalry history and 'do these teams have a pattern' questions.",
    input_schema: {
      type: "object",
      properties: {
        team_a: { type: "string" },
        team_b: { type: "string" },
      },
      required: ["team_a", "team_b"],
    },
  },
  {
    name: "get_referee",
    description:
      "Referee tendencies. Pass match_id for that match's referee and their card/foul averages across the tournament; pass nothing for the tournament's card-happiest referees. Use for discipline and refereeing-narrative questions.",
    input_schema: {
      type: "object",
      properties: { match_id: { type: "string", description: "Optional id from list_matches" } },
    },
  },
  {
    name: "get_match_conditions",
    description:
      "Context for one match: stadium, city, altitude, roof (roofed = climate-controlled, outdoor weather barely applies), local kickoff time, and kickoff weather (temperature, feels-like, humidity, wind, rain). Use when heat, altitude, rain, or kickoff time might matter.",
    input_schema: {
      type: "object",
      properties: { match_id: { type: "string", description: "Id from list_matches" } },
      required: ["match_id"],
    },
  },
  {
    name: "get_team_schedule",
    description:
      "A team's tournament logistics: for every match, the city, altitude, local kickoff, kickoff temperature, rest days since the previous match, and travel distance from the previous venue — plus total km traveled and average rest. Use for fatigue, travel-burden, acclimatization, and schedule-fairness questions.",
    input_schema: {
      type: "object",
      properties: { team: { type: "string", description: "Team name or abbreviation" } },
      required: ["team"],
    },
  },
  {
    name: "similar_players",
    description:
      "Statistical twins: the players most similar to a given player by per-90 style vector (cosine similarity over 22 tracking-derived dimensions), plus their k-means style archetype. Use for 'who plays like X' and scouting-replacement questions.",
    input_schema: {
      type: "object",
      properties: { name: { type: "string", description: "Player name (partial ok)" } },
      required: ["name"],
    },
  },
  {
    name: "simulate_match",
    description:
      "The rematch machine: simulate a hypothetical matchup between any two teams (e.g. 'who would have won France vs Argentina?'). Poisson goals from tournament xG for/against blended with Elo, 10,000 runs — win/draw/loss %, most likely scorelines, knockout advance odds. Also fine for replaying real matches ('was the final an upset?').",
    input_schema: {
      type: "object",
      properties: {
        team_a: { type: "string", description: "Team name or abbreviation" },
        team_b: { type: "string", description: "Team name or abbreviation" },
      },
      required: ["team_a", "team_b"],
    },
  },
  {
    name: "get_standings",
    description:
      "Group-stage tables. Pass a group letter (A–L) for one table, or nothing for all 12. Each row: position, played/W/D/L, goals for/against, goal difference, points, and whether the team qualified for the knockouts. Use for 'how did group X finish', qualification, and who-went-through questions.",
    input_schema: {
      type: "object",
      properties: { group: { type: "string", description: "e.g. 'A', 'Group H' — omit for all groups" } },
    },
  },
  {
    name: "get_awards",
    description:
      "The tournament honours: Golden Boot, Golden Glove, Best Player, Best Young Player and the Team of the Tournament — each as our data-driven pick with the reasoning, alongside the official jury winner and whether they agree. Use for 'who won X award', 'best player/keeper/young player', and jury-vs-data debates.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "render_chart",
    description:
      "Draw a chart inline for the user. Use when a comparison lands better visually than a table — at most 1-2 per answer. 'bar' needs items with label+value; 'scatter' needs items with label+x+y. Put units in the axis labels or title.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["bar", "scatter"] },
        title: { type: "string" },
        x_label: { type: "string" },
        y_label: { type: "string" },
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              label: { type: "string" },
              value: { type: "number" },
              x: { type: "number" },
              y: { type: "number" },
            },
            required: ["label"],
          },
        },
      },
      required: ["type", "title", "items"],
    },
  },
];

/* ---------------- executors ---------------- */

export function runTool(name: string, input: any): { text: string; isError?: boolean } {
  try {
    switch (name) {
      case "list_matches": {
        let matches = getCalendar();
        if (input?.team) {
          const t = resolveTeam(String(input.team));
          if (!t) return { text: `Unknown team "${input.team}". Use a name like "Spain" or abbr like "ESP".`, isError: true };
          matches = matches.filter((m) => m.home.abbr === t.abbr || m.away.abbr === t.abbr);
        }
        if (input?.stage) {
          const s = norm(String(input.stage));
          matches = matches.filter((m) =>
            s === "group" ? m.stage === "First Stage"
            : s === "knockout" ? m.stage !== "First Stage"
            : norm(m.stage).includes(s)
          );
        }
        const lines = matches.map(
          (m) => `${m.id} | ${m.date.slice(0, 10)} | ${m.stage}${m.group ? ` ${m.group}` : ""} | ${m.home.name} ${m.home.score}:${m.away.score} ${m.away.name}${m.penHome != null ? ` (${m.penHome}-${m.penAway} pens)` : ""}`
        );
        return { text: lines.join("\n") || "No matches for that filter." };
      }

      case "get_match": {
        const b = getMatchBundle(String(input?.match_id ?? ""));
        if (!b) return { text: `No match with id "${input?.match_id}". Find ids with list_matches.`, isError: true };
        const F = (side: typeof b.home) => side.fdh;
        const stat = (k: string, fmt?: (v: number) => string | number) => {
          const h = F(b.home)[k], a = F(b.away)[k];
          if (h == null || a == null) return undefined;
          return `${fmt ? fmt(h) : Math.round(h * 100) / 100} vs ${fmt ? fmt(a) : Math.round(a * 100) / 100}`;
        };
        const topRated = [...b.home.players, ...b.away.players]
          .filter((p) => p.rating != null)
          .sort((x, y) => y.rating! - x.rating!)
          .slice(0, 8)
          .map((p) => ({
            name: p.shortName,
            team: b.home.players.includes(p) ? b.home.ref.name : b.away.ref.name,
            rating: p.rating,
            goals: p.fdh.Goals || undefined,
            assists: p.fdh.Assists || undefined,
          }));
        return {
          text: JSON.stringify({
            match: `${b.cal.home.name} ${b.cal.home.score}:${b.cal.away.score} ${b.cal.away.name}`,
            stage: `${b.cal.stage}${b.cal.group ? ` ${b.cal.group}` : ""}`,
            note: b.cal.penHome != null ? `${b.cal.penHome}-${b.cal.penAway} on penalties` : b.cal.resultType === 3 ? "after extra time" : undefined,
            venue: `${b.cal.stadium}, ${b.cal.city}`,
            conditions: (() => {
              const c = getConditions(b.cal);
              return [
                `kickoff ${c.kickoffLocal} local`,
                c.weather ? `${c.weather.tempC}°C (feels ${c.weather.feelsLikeC}°C), ${c.weather.humidityPct}% humidity` : null,
                c.venue && c.venue.altitudeM > 500 ? `altitude ${c.venue.altitudeM}m` : null,
                c.venue?.roof === "roofed" ? "roofed/climate-controlled stadium" : null,
              ].filter(Boolean).join(" · ");
            })(),
            formations: `${b.home.formation} vs ${b.away.formation}`,
            goals: [...b.home.goals.map((g) => `${g.minute}' ${g.player} (${b.home.ref.name})${g.penalty ? " pen" : ""}`),
                    ...b.away.goals.map((g) => `${g.minute}' ${g.player} (${b.away.ref.name})${g.penalty ? " pen" : ""}`)],
            team_stats_home_vs_away: {
              possession: stat("Possession", (v) => `${Math.round(v * 100)}%`),
              xg: stat("XG"),
              threat: stat("Threat"),
              shots: stat("AttemptAtGoal"),
              on_target: stat("AttemptAtGoalOnTarget"),
              passes_completed: stat("PassesCompleted"),
              forced_turnovers: stat("ForcedTurnovers"),
              ball_recovery_seconds: stat("BallRecoveryTime"),
              high_press_phases: stat("PhaseAggregateHighPress"),
              distance_km: stat("TotalDistance", (v) => (v / 1000).toFixed(0)),
              top_speed_kmh: stat("TopSpeed"),
            },
            shots: b.shots
              .slice(0, 22)
              .map((s) => `${s.minute} ${s.player} (${s.team === "home" ? b.home.ref.abbr : b.away.ref.abbr}) xG ${s.xg?.toFixed(2) ?? "?"} → ${s.outcome}`),
            top_rated_players: topRated,
          }),
        };
      }

      case "get_team_strength": {
        const t = resolveTeam(String(input?.team ?? ""));
        if (!t) return { text: `Unknown team "${input?.team}".`, isError: true };
        const s = getStrength()[t.abbr];
        const form = getForm(t.abbr);
        return {
          text: JSON.stringify({
            team: t.name,
            elo_rating: s?.elo,
            world_rank: s ? `${s.worldRank} of ~240 nations` : "unavailable",
            wc_seed: s ? `${s.wcSeed} of 48 (by Elo)` : undefined,
            pre_tournament_form: form
              ? {
                  last_10_before_June_11: form.record,
                  goals: `${form.goalsFor} for, ${form.goalsAgainst} against`,
                  matches: form.last.map((m) => `${m.date}: ${m.result} ${m.score} vs ${m.opp} (${m.tournament})`),
                }
              : "unavailable",
          }),
        };
      }

      case "head_to_head": {
        const a = resolveTeam(String(input?.team_a ?? ""));
        const b = resolveTeam(String(input?.team_b ?? ""));
        if (!a || !b) return { text: `Unknown team(s): ${!a ? input?.team_a : ""} ${!b ? input?.team_b : ""}`.trim(), isError: true };
        const h = getHeadToHead(a.abbr, b.abbr);
        if (!h) return { text: `${a.name} and ${b.name} have no recorded meetings in the dataset.` };
        return {
          text: JSON.stringify({
            fixture: `${a.name} vs ${b.name}`,
            all_time_meetings: h.meetings,
            record: h.record,
            goals: `${a.name} ${h.goals}`,
            recent: h.recent.map((r) => `${r.date}: ${r.score} (${r.tournament})`),
          }),
        };
      }

      case "get_referee": {
        if (input?.match_id) {
          const ref = getRefereeForMatch(String(input.match_id));
          if (!ref) return { text: `No referee on record for match "${input.match_id}".`, isError: true };
          return {
            text: JSON.stringify({
              referee: ref.name,
              tournament_matches: ref.matches,
              yellows_per_match: ref.yellowsPerMatch,
              fouls_per_match: ref.foulsPerMatch,
              total: `${ref.yellows} yellows, ${ref.reds} reds, ${ref.fouls} fouls across ${ref.matches} matches`,
            }),
          };
        }
        const top = Object.values(getReferees())
          .sort((x, y) => y.yellowsPerMatch - x.yellowsPerMatch)
          .slice(0, 10)
          .map((r) => `${r.name}: ${r.yellowsPerMatch} yellows/match, ${r.foulsPerMatch} fouls/match (${r.matches} matches)`);
        return { text: `Card-happiest referees:\n${top.join("\n")}` };
      }

      case "get_match_conditions": {
        const m = getCalendar().find((x) => x.id === String(input?.match_id ?? ""));
        if (!m) return { text: `No match with id "${input?.match_id}". Find ids with list_matches.`, isError: true };
        const c = getConditions(m);
        const cap = VENUES[m.city]?.capacity;
        const att = Number(m.attendance) || null;
        const ref = getRefereeForMatch(m.id);
        return {
          text: JSON.stringify({
            match: `${m.home.name} ${m.home.score}:${m.away.score} ${m.away.name} (${m.stage})`,
            date: m.date.slice(0, 10),
            stadium: c.venue?.stadium ?? m.stadium,
            city: m.city,
            altitude_m: c.venue?.altitudeM,
            roof: c.venue?.roof,
            roof_note: c.venue?.roof === "roofed" ? "climate-controlled stadium — outdoor weather largely irrelevant" : undefined,
            kickoff_local: c.kickoffLocal,
            attendance: m.attendance,
            capacity: cap,
            fill_pct: cap && att ? Math.round((att / cap) * 100) : undefined,
            referee: ref ? `${ref.name} (${ref.yellowsPerMatch} yellows/match this tournament)` : undefined,
            weather_at_kickoff: c.weather
              ? {
                  temp_c: c.weather.tempC,
                  feels_like_c: c.weather.feelsLikeC,
                  humidity_pct: c.weather.humidityPct,
                  wind_kmh: c.weather.windKmh,
                  rain_mm: c.weather.precipMm,
                }
              : "unavailable",
          }),
        };
      }

      case "get_team_schedule": {
        const t = resolveTeam(String(input?.team ?? ""));
        if (!t) return { text: `Unknown team "${input?.team}".`, isError: true };
        const s = getTeamSchedule(t.abbr);
        return {
          text: JSON.stringify({
            team: t.name,
            total_travel_km: s.totalTravelKm,
            avg_rest_days: s.avgRestDays,
            matches: s.legs.map((l) => ({
              date: l.date,
              stage: l.stage,
              vs: l.opp,
              score: l.score,
              city: l.city,
              kickoff_local: l.kickoffLocal,
              altitude_m: l.altitudeM || undefined,
              roofed: l.roof === "roofed" || undefined,
              temp_c: l.tempC ?? undefined,
              feels_like_c: l.feelsLikeC ?? undefined,
              rest_days: l.restDays ?? undefined,
              travel_km_from_prev: l.travelKm ?? undefined,
            })),
          }),
        };
      }

      case "get_standings": {
        const groups = getStandings();
        const want = input?.group ? norm(String(input.group)).replace(/^group/, "") : null;
        const entries = Object.entries(groups).filter(
          ([g]) => !want || norm(g).replace(/^group/, "") === want
        );
        if (!entries.length)
          return { text: want ? `No group "${input.group}". Groups are A–L.` : "No standings available.", isError: true };
        const fmt = (rows: any[]) =>
          rows
            .map(
              (r) =>
                `${r.pos}. ${r.name} — ${r.pts} pts (${r.w}W ${r.d}D ${r.l}L, GF ${r.gf} GA ${r.ga}, GD ${r.gd > 0 ? "+" : ""}${r.gd})${r.through ? " ✓ through" : ""}`
            )
            .join("\n");
        return { text: entries.map(([g, rows]) => `${g}\n${fmt(rows)}`).join("\n\n") };
      }

      case "get_awards": {
        const h = getHonours();
        const out = h.awards.map((a) => ({
          award: a.title,
          rule: a.rule,
          our_pick: a.rows.slice(0, 3).map((r) => `${r.card.name} (${r.card.team}) — ${r.line}`),
          official_winner: a.official
            ? `${a.official.name}${a.official.matches ? " ✓ agrees with our data" : " (jury differs from our data pick)"}`
            : undefined,
        }));
        return {
          text: JSON.stringify({
            awards: out,
            team_of_the_tournament: `${h.xiShape}: ${h.xi.map((c) => `${c.name} (${c.team}, ${c.overall})`).join(", ")}`,
          }),
        };
      }

      case "get_team": {
        const t = resolveTeam(String(input?.team ?? ""));
        if (!t) return { text: `Unknown team "${input?.team}".`, isError: true };
        const st = getStrength()[t.abbr];
        return {
          text: JSON.stringify({
            name: t.name,
            finish: t.finish,
            group: t.group,
            elo: st ? `${st.elo} (world #${st.worldRank}, WC seed ${st.wcSeed}/48)` : undefined,
            style_family: (() => {
              const s = teamStyleOf(t.abbr);
              return s ? `${s.label} — ${s.blurb} (k-means on per-match identity, 4 families)` : undefined;
            })(),
            fortune: (() => {
              const l = luckOf(t.abbr);
              return l
                ? `${l.pts} group-stage pts vs ${l.xpts} expected (10k xG Monte Carlo) — ${l.delta > 0 ? "over" : "under"}performed by ${Math.abs(l.delta)}`
                : undefined;
            })(),
            formations: t.formations,
            profile_vs_48_teams: Object.fromEntries(
              t.identity.map((r) => [r.label, `${r.value} (p${Math.round(r.pct * 100)})`])
            ),
            results: t.results.map((r) => `${r.outcome} ${r.score} vs ${r.opp} (${r.stage})`),
            top_players: t.squad.slice(0, 12).map((c) => ({
              name: c.name, pos: c.pos, card: c.overall, avg_rating: c.avgRating,
              ...Object.fromEntries(c.receipts.map((r) => [r.label, r.value])),
            })),
          }),
        };
      }

      case "get_player": {
        const q = norm(String(input?.name ?? ""));
        if (!q) return { text: "Give a player name.", isError: true };
        const all = [...getCards().values()];
        const hits = all.filter((c) => norm(c.name).includes(q));
        if (hits.length === 0) return { text: `No player matching "${input.name}".`, isError: true };
        if (hits.length > 6)
          return { text: `Ambiguous — matches: ${hits.slice(0, 12).map((c) => `${c.name} (${c.team})`).join(", ")}` };
        const c = hits.sort((x, y) => y.minutes - x.minutes)[0];
        return {
          text: JSON.stringify({
            name: c.name, team: c.team, pos: c.pos, card_overall: c.overall,
            style_archetype: archetypeOf(c.id)?.label,
            statistical_twins: similarTo(c.id, 4).map((s) => `${s.card.name} (${s.card.team}, ${(s.sim * 100).toFixed(0)}% style match)`),
            card_stats: Object.fromEntries(c.stats.map((s) => [s.key, s.val])),
            season: Object.fromEntries(c.receipts.map((r) => [r.label, r.value])),
            match_by_match: c.perMatch.map((m) => `vs ${m.opp} ${m.score} — rating ${m.rating ?? "n/a"}`),
            others: hits.length > 1 ? hits.slice(1).map((h) => h.name) : undefined,
          }),
        };
      }

      case "similar_players": {
        const q = norm(String(input?.name ?? ""));
        if (!q) return { text: "Give a player name.", isError: true };
        const hit = [...getCards().values()]
          .filter((c) => norm(c.name).includes(q))
          .sort((x, y) => y.minutes - x.minutes)[0];
        if (!hit) return { text: `No player matching "${input.name}".`, isError: true };
        const twins = similarTo(hit.id, 6);
        if (!twins.length) return { text: `${hit.name} played under 90 minutes — no stable style vector.` };
        return {
          text: JSON.stringify({
            player: `${hit.name} (${hit.team}, ${hit.pos})`,
            archetype: archetypeOf(hit.id)?.label,
            twins: twins.map((s) => ({
              name: s.card.name, team: s.card.team, pos: s.card.pos, card: s.card.overall,
              style_match: `${(s.sim * 100).toFixed(0)}%`,
              archetype: archetypeOf(s.card.id)?.label,
            })),
            method: "cosine similarity of z-scored per-90 vectors (22 dims: shooting, progression, receiving, pressing, physical); GK pool separate",
          }),
        };
      }

      case "simulate_match": {
        const a = resolveTeam(String(input?.team_a ?? ""));
        const b = resolveTeam(String(input?.team_b ?? ""));
        if (!a || !b) return { text: `Unknown team "${!a ? input?.team_a : input?.team_b}".`, isError: true };
        if (a.abbr === b.abbr) return { text: "Pick two different teams.", isError: true };
        const rates = getRates();
        const ra = rates.get(a.abbr), rb = rates.get(b.abbr);
        if (!ra || !rb) return { text: "No rate data for that matchup.", isError: true };
        const s = simulate(ra, rb);
        const bt = getBacktest();
        const met = getCalendar().find(
          (m) => (m.home.abbr === a.abbr && m.away.abbr === b.abbr) || (m.home.abbr === b.abbr && m.away.abbr === a.abbr)
        );
        return {
          text: JSON.stringify({
            matchup: `${a.name} vs ${b.name} (10,000 simulations)`,
            ninety_minutes: { [a.name]: `${Math.round(s.pA * 100)}%`, draw: `${Math.round(s.pDraw * 100)}%`, [b.name]: `${Math.round(s.pB * 100)}%` },
            knockout_advance: { [a.name]: `${Math.round(s.koA * 100)}%`, [b.name]: `${Math.round(s.koB * 100)}%` },
            expected_goals: { [a.abbr]: Math.round(s.lambdaA * 100) / 100, [b.abbr]: Math.round(s.lambdaB * 100) / 100 },
            most_likely_scores: s.topScores.map((t) => `${a.abbr} ${t.a}:${t.b} ${b.abbr} (${(t.p * 100).toFixed(1)}%)`),
            they_actually_met: met
              ? `${met.home.name} ${met.home.score}:${met.away.score} ${met.away.name}${met.penHome != null ? ` (${met.penHome}-${met.penAway} pens)` : met.resultType === 3 ? " a.e.t." : ""} — ${met.stage}, match_id ${met.id}`
              : "never met this tournament",
            method: `Poisson goals from tournament xG for/against per match vs field average, Elo-adjusted; ET at λ/3, pens 50/50. Backtest: model's favourite 90' outcome hit ${bt.hit}% of ${bt.n} real matches (in-sample). Form only — no lineups or injuries.`,
          }),
        };
      }

      case "leaderboard": {
        const limit = Math.min(Math.max(Number(input?.limit) || 10, 3), 20);
        const metric = String(input?.metric ?? "");
        const dir = getPlayerDirectory();
        if (metric === "avg_rating") {
          const rows = [...getCards().values()]
            .filter((c) => c.minutes >= 180 && c.avgRating != null)
            .sort((x, y) => y.avgRating! - x.avgRating!)
            .slice(0, limit)
            .map((c, i) => `${i + 1}. ${c.name} (${c.team}) — ${c.avgRating!.toFixed(2)} over ${c.matches} matches`);
          return { text: rows.join("\n") };
        }
        const KEY: Record<string, [string, (v: number) => string]> = {
          goals: ["Goals", (v) => `${v}`],
          assists: ["Assists", (v) => `${v}`],
          xg: ["XG", (v) => v.toFixed(2)],
          top_speed: ["TopSpeed", (v) => `${v.toFixed(1)} km/h`],
          distance: ["TotalDistance", (v) => `${(v / 1000).toFixed(1)} km`],
          saves: ["GoalkeeperSaves", (v) => `${v}`],
          passes_completed: ["PassesCompleted", (v) => `${v}`],
        };
        if (!KEY[metric]) return { text: `Unknown metric "${metric}".`, isError: true };
        const [k, fmt] = KEY[metric];
        const rows = Object.entries(getSeasonPlayers())
          .map(([id, st]) => ({ id, v: st[k] ?? 0 }))
          .sort((a, b) => b.v - a.v)
          .slice(0, limit)
          .map((r, i) => `${i + 1}. ${dir[r.id]?.name ?? r.id} (${dir[r.id]?.team ?? "?"}) — ${fmt(r.v)}`);
        return { text: rows.join("\n") };
      }

      case "render_chart": {
        const items = Array.isArray(input?.items) ? input.items : [];
        if (!items.length) return { text: "Chart needs items.", isError: true };
        return { text: "Chart rendered inline for the user. Continue the answer; no need to repeat the chart's numbers in a table." };
      }

      default:
        return { text: `Unknown tool ${name}.`, isError: true };
    }
  } catch (e) {
    return { text: `Tool error: ${e instanceof Error ? e.message : String(e)}`, isError: true };
  }
}
