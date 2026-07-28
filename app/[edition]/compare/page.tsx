import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEdition, getEditions } from "@/lib/editions";
import { getLeagueCardsFor } from "@/lib/leagueSeason";
import CompareClient, { type CmpCard } from "@/app/compare/CompareClient";

export function generateStaticParams() {
  return getEditions()
    .filter((e) => e.depth === "full" && e.slug !== "world-cup-2026")
    .map((e) => ({ edition: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }) {
  const ed = getEdition((await params).edition);
  return ed
    ? {
        title: `Compare players — ${ed.name} ${ed.season}`,
        description: `Two real-data ${ed.name} cards side by side, every axis a percentile against the same league.`,
      }
    : {};
}

export default async function LeagueComparePage({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const slug = (await params).edition;
  const ed = getEdition(slug);
  if (!ed || slug === "world-cup-2026") notFound();

  const cards: CmpCard[] = getLeagueCardsFor(slug)
    .sort((x, y) => y.overall - x.overall)
    .map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      abbr: c.abbr,
      pos: c.pos,
      overall: c.overall,
      tier: c.tier,
      photo: c.photo,
      minutes: c.minutes,
      stats: c.stats.map((s) => ({ key: s.key, val: s.val })),
    }));
  if (!cards.length) notFound();

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        <Link href={`/${slug}`} className="hover:underline">
          {ed.name} {ed.season}
        </Link>
      </p>
      <h1 className="display mt-1 text-4xl font-bold text-chalk sm:text-5xl">Compare players</h1>
      <p className="mt-2 max-w-2xl text-sm text-dim">
        Any two of the {cards.length} players who appeared this season, side by side. Both cards
        are scored against the same pool — this league — so the axes are directly comparable.
      </p>
      {/* CompareClient reads the picked players from the query string; a prerendered
          page needs the boundary or the build bails out of static export */}
      <div className="mt-8">
        <Suspense fallback={<p className="eyebrow">Loading players…</p>}>
          <CompareClient cards={cards} />
        </Suspense>
      </div>
    </main>
  );
}
