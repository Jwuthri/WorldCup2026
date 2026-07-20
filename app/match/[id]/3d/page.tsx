import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCalendar, getMatchBundle } from "@/lib/data";
import ShotScene3D, { type Shot3D } from "@/components/ShotScene3D";

export function generateStaticParams() {
  return getCalendar().map((m) => ({ id: m.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const m = getCalendar().find((x) => x.id === id);
  if (!m) return {};
  return {
    title: `${m.home.name} vs ${m.away.name} in 3D — MUNDIAL·26`,
    description: `Every shot of ${m.home.name} vs ${m.away.name} as a 3D trajectory into the goal — xG, goal-mouth placement, misses and blocks.`,
  };
}

export default async function Match3DPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const b = getMatchBundle(id);
  if (!b) notFound();
  const { cal, home, away, shots } = b;

  // Shot.x/y are 0-100 in the shooting team's OWN attacking frame (opponent goal
  // at x=100), so scaling them raw to 105x68 already sends both teams' shots
  // toward the same goal — this IS the away-team mirror relative to the
  // two-goal pitch view used on the match page.
  const shots3d: Shot3D[] = shots.map((s) => ({
    x: (s.x / 100) * 105,
    y: (s.y / 100) * 68,
    gateY: s.gateY,
    gateZ: s.gateZ,
    goal: s.outcome === "Goal",
    onTarget: s.outcome === "Goal" || s.outcome === "Saved",
    color: s.team === "home" ? home.color : away.color,
    xg: s.xg,
    player: s.player,
    minute: s.minute,
  }));

  const score =
    cal.home.score != null && cal.away.score != null
      ? `${cal.home.score}–${cal.away.score}`
      : "vs";

  return (
    <main className="min-h-screen">
      <div className="px-4 py-6 sm:px-8">
        <p className="eyebrow">
          <Link href={`/match/${cal.id}`} className="hover:text-chalk">
            &larr; {cal.home.name} {score} {cal.away.name}
          </Link>
          {" · "}
          {cal.stage}
          {cal.group ? ` · ${cal.group}` : ""} · {cal.stadium}, {cal.city}
        </p>
        <h1 className="display mt-2 text-3xl font-bold sm:text-4xl">
          Shot theater{" "}
          <span className="text-base font-normal text-faint sm:text-lg">
            — every attempt, in three dimensions
          </span>
        </h1>
      </div>

      {shots3d.length > 0 ? (
        <div className="h-[65svh] w-full border-y border-pitchline sm:h-[80vh]">
          <ShotScene3D
            shots={shots3d}
            homeName={cal.home.name}
            awayName={cal.away.name}
            title={`${cal.home.abbr} ${score} ${cal.away.abbr}`}
          />
        </div>
      ) : (
        <div className="mx-4 rounded-lg border border-pitchline bg-surface p-10 text-center sm:mx-8">
          <p className="display text-2xl font-semibold text-dim">
            No shot-level data for this match
          </p>
          <p className="mt-2 text-sm text-faint">
            The 3D scene needs per-shot coordinates, which this match is missing.
          </p>
          <Link
            href={`/match/${cal.id}`}
            className="eyebrow mt-4 inline-block text-gold hover:opacity-80"
          >
            &larr; back to the match
          </Link>
        </div>
      )}
    </main>
  );
}
