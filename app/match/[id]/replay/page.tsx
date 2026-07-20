import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCalendar, getMatchBundle } from "@/lib/data";
import { decodeHeatmap } from "@/lib/heatmap";
import ReplayTheater, { type Replay, type RPlayer } from "@/components/ReplayTheater";

export function generateStaticParams() {
  return getCalendar().map((m) => ({ id: m.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const m = getCalendar().find((x) => x.id === id);
  if (!m) return {};
  return {
    title: `${m.home.name} v ${m.away.name} — the replay — MUNDIAL·26`,
    description: "A data-driven reconstruction: real heatmaps, real shots, real minutes.",
  };
}

/** "90 + 3'" -> 93 */
const parseMin = (m: string) => {
  const parts = String(m).replace(/[^0-9+]/g, "").split("+").filter(Boolean);
  return parts.reduce((s, p) => s + (parseInt(p) || 0), 0);
};

export default async function ReplayPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = getMatchBundle(id);
  if (!b) notFound();
  const { cal, home, away, shots, timeline } = b;

  const maxMinute = Math.max(
    90,
    ...timeline.map((e) => parseMin(e.minute)),
    ...shots.map((s) => parseMin(s.minute))
  );

  const buildPlayers = (side: typeof home): RPlayer[] =>
    side.players
      .map((p) => {
        const minsStat = p.s365Stats.find((s) => s.name === "Minutes");
        const minutes = minsStat ? parseInt(minsStat.value) || 0 : Math.round(p.fdh.TimePlayed ?? 0);
        if (!minutes) return null;
        // ponytail: subs enter at (match length - minutes played) — close enough without sub-event minutes
        const enter = p.starter ? 0 : Math.max(0, maxMinute - minutes);
        const exit = p.starter ? Math.min(minutes, maxMinute) : maxMinute;
        return {
          id: p.fifaId,
          name: p.shortName,
          shirt: p.shirt,
          grid: p.heatmap ? decodeHeatmap(p.heatmap) : null,
          slot: p.formationSlot,
          enter,
          exit,
        };
      })
      .filter(Boolean) as RPlayer[];

  const goals = [...home.goals.map((g) => ({ minute: parseMin(g.minute), team: "home" as const })),
    ...away.goals.map((g) => ({ minute: parseMin(g.minute), team: "away" as const }))].sort((a, b2) => a.minute - b2.minute);

  const replay: Replay = {
    home: { name: cal.home.name, abbr: cal.home.abbr, color: home.color, players: buildPlayers(home) },
    away: { name: cal.away.name, abbr: cal.away.abbr, color: away.color, players: buildPlayers(away) },
    shots: shots
      .map((s) => ({
        minute: parseMin(s.minute),
        team: s.team,
        x: s.x, y: s.y,
        gateY: s.gateY,
        outcome: s.outcome,
        goal: s.outcome === "Goal",
        player: s.player,
        xg: s.xg,
      }))
      .sort((a, b2) => a.minute - b2.minute),
    goals,
    ticker: timeline
      .filter((e) => /^(goal!|own goal|penalty goal|substitution|penalty awarded)|card/i.test(e.type))
      .map((e) => ({ minute: parseMin(e.minute), desc: e.desc || e.type }))
      .sort((a, b2) => a.minute - b2.minute),
    maxMinute,
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-8">
      <p className="eyebrow mb-1">
        <Link href={`/match/${cal.id}`} className="hover:text-chalk">
          ← {cal.home.name} {cal.home.score}–{cal.away.score} {cal.away.name}
        </Link>{" "}
        · {cal.stage}
      </p>
      <h1 className="display mb-1 text-4xl font-bold">The replay</h1>
      <p className="mb-6 max-w-2xl text-xs text-faint">
        A reconstruction, not a recording: players drift through their real match heatmaps; shots,
        goals and cards land at their real minutes with real goal-mouth placement. True tracking
        data is never public — this is what the data we do have looks like in motion.
      </p>
      <ReplayTheater replay={replay} />
    </main>
  );
}
