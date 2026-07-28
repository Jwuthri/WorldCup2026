import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getEdition } from "@/lib/editions";
import {
  getLeagueBundle,
  getLeagueCards,
  getLeagueIndex,
  getLeagueMatchMeta,
  leagueMatchTerritory,
} from "@/lib/leagues";
import { buildPanels, toTSide, LEAGUE_SECTIONS } from "@/lib/matchPanels";
import MatchTheater, { type TPulse } from "@/components/MatchTheater";
import DuelBars, { type DuelRow } from "@/components/DuelBars";
import ShotReplay from "@/components/ShotReplay";
import XgRace from "@/components/XgRace";
import Heatmap from "@/components/Heatmap";
import { hasHeat } from "@/lib/heatmap";

const parseMin = (m: string) =>
  parseInt(String(m).replace(/[^0-9+]/g, "").split("+")[0] || "0");

/** Prerendering ~1,750 match pages would dominate the build; they render on demand
 *  and are cached from then on. The tournament's 104 stay fully static. */
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string; id: string }>;
}): Promise<Metadata> {
  const { edition, id } = await params;
  const ed = getEdition(edition);
  const b = getLeagueBundle(edition, id);
  if (!ed || !b) return {};
  return {
    title: `${b.match.home.name} ${b.match.home.score ?? ""}–${b.match.away.score ?? ""} ${b.match.away.name} — ${ed.name} ${ed.season}`,
    description: `Formations, xG shot map, player heatmaps and ratings. ${ed.name} ${ed.season}${b.match.round ? `, matchday ${b.match.round}` : ""}.`,
  };
}

export default async function LeagueMatchPage({
  params,
}: {
  params: Promise<{ edition: string; id: string }>;
}) {
  const { edition, id } = await params;
  const ed = getEdition(edition);
  const idx = getLeagueIndex(edition);
  const b = getLeagueBundle(edition, id);
  if (!ed || !idx || !b) notFound();

  const { match, home, away, shots, teamStats } = b;
  const meta = getLeagueMatchMeta(edition, id);

  const panels = buildPanels(LEAGUE_SECTIONS, [...home.players, ...away.players]);
  const tHome = toTSide(home, panels, match.home.crest);
  const tAway = toTSide(away, panels, match.away.crest);

  const pulse: TPulse = shots.map((s) => ({
    minute: parseMin(s.minute),
    team: s.team,
    xg: s.xg ?? 0,
    kind: s.outcome === "Goal" ? ("goal" as const) : ("shot" as const),
    who: s.player,
    note: `${s.outcome}${s.xg != null ? ` · ${s.xg.toFixed(2)} xG` : ""}`,
    label: s.minute,
  }));
  // cards come off the event feed, not the shot chart
  for (const e of getLeagueCards(edition, id)) pulse.push(e);
  pulse.sort((a, b) => a.minute - b.minute);

  const maxMinute = Math.max(90, ...pulse.map((p) => p.minute));
  const hSide = { name: match.home.name, abbr: match.home.shortName, color: home.color };
  const aSide = { name: match.away.name, abbr: match.away.shortName, color: away.color };

  const stat = (name: string, cid: string) =>
    teamStats.find((r) => r.name === name && String(r.competitorId) === cid)?.value ?? null;
  const num = (v: string | null) => (v == null ? 0 : parseFloat(String(v).replace("%", "")) || 0);

  const DUEL: { label: string; key: string; pct?: boolean }[] = [
    { label: "Possession", key: "Possession", pct: true },
    { label: "Expected goals", key: "Expected Goals" },
    { label: "Shots", key: "Total Shots" },
    { label: "Shots on target", key: "Shots On Target" },
    { label: "Big chances created", key: "Big Chances Created" },
    { label: "Passes completed", key: "Passes Completed" },
    { label: "Into final third", key: "Passes Into Final Third" },
    { label: "Duels won", key: "Duels Won" },
    { label: "Tackles won", key: "Tackles Won" },
    { label: "Corners", key: "Corners" },
    { label: "Fouls", key: "Fouls" },
  ];
  const duel: DuelRow[] = DUEL.map((d) => {
    const h = stat(d.key, match.home.id);
    const a = stat(d.key, match.away.id);
    return h == null && a == null
      ? null
      : { label: d.label, h: num(h), a: num(a), hDisp: h ?? "—", aDisp: a ?? "—" };
  }).filter(Boolean) as DuelRow[];

  const terr = leagueMatchTerritory(edition, id);
  const kickoff = match.date ? new Date(match.date) : null;

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        <Link href={`/${edition}/matches`} className="hover:underline">
          {ed.name} {ed.season}
        </Link>
        {match.round ? ` · Matchday ${match.round}` : ""}
        {meta?.venue ? ` · ${meta.venue}` : ""}
      </p>

      <h1 className="display mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-4xl font-bold text-chalk sm:text-5xl">
        <span>{match.home.name}</span>
        <span className="data" style={{ color: ed.accent }}>
          {match.home.score ?? "–"}:{match.away.score ?? "–"}
        </span>
        <span>{match.away.name}</span>
      </h1>
      <p className="eyebrow mt-2">
        {kickoff
          ? kickoff.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })
          : ""}
        {meta?.attendance ? ` · ${Number(meta.attendance).toLocaleString("en-US")} in the ground` : ""}
        {meta?.referee ? ` · ${meta.referee}` : ""}
      </p>

      <div className="mt-8">
        <MatchTheater home={tHome} away={tAway} shots={shots} pulse={pulse} maxMinute={maxMinute} />
      </div>

      <section className="mt-14">
        <h2 className="display text-2xl font-semibold text-chalk">The shots, as they came</h2>
        <p className="eyebrow mt-1">Every attempt, sized by expected goals</p>
        <div className="mt-4">
          <ShotReplay shots={shots} home={hSide} away={aSide} />
        </div>
      </section>

      <section className="mt-14">
        <h2 className="display text-2xl font-semibold text-chalk">The xG race</h2>
        <p className="eyebrow mt-1">Expected goals accumulating minute by minute</p>
        <div className="mt-4">
          <XgRace shots={shots} home={hSide} away={aSide} maxMinute={maxMinute} />
        </div>
      </section>

      {terr && (hasHeat(terr.home) || hasHeat(terr.away)) && (
        <section className="mt-14">
          <h2 className="display text-2xl font-semibold text-chalk">Territory</h2>
          <p className="eyebrow mt-1">
            Where each side actually occupied the pitch, summed from every player&rsquo;s heatmap
          </p>
          <div className="mt-4">
            <Heatmap
              label={`territory map: ${match.home.name} vs ${match.away.name}`}
              layers={[
                { grid: terr.home, color: home.color },
                { grid: terr.away, color: away.color, mirror: true },
              ]}
            />
            <p className="eyebrow mt-3">
              <span style={{ color: home.color }}>{match.home.name} attacking right</span>
              {"  ·  "}
              <span style={{ color: away.color }}>{match.away.name} attacking left</span>
              {"  ·  where both glow, the pitch was contested"}
            </p>
          </div>
        </section>
      )}

      {duel.length > 0 && (
        <section className="mt-14">
          <h2 className="display text-2xl font-semibold text-chalk">The duel</h2>
          <p className="eyebrow mt-1">{match.home.name} vs {match.away.name}</p>
          <div className="mt-4">
            <DuelBars rows={duel} homeColor={home.color} awayColor={away.color} />
          </div>
        </section>
      )}

      <p className="mt-14 text-xs text-faint">
        No physical or tracking data for league matches — that tier is FIFA-only. Everything
        above is from the public match feed.
      </p>
    </main>
  );
}
