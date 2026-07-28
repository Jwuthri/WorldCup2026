import { notFound } from "next/navigation";
import { getEdition, getEditions } from "@/lib/editions";
import { getLeagueCardsFor, getLeagueTeams } from "@/lib/leagueSeason";
import PlayersExplorer, { type SlimCard } from "@/app/players/PlayersExplorer";

export function generateStaticParams() {
  return getEditions()
    .filter((e) => e.depth === "full" && e.slug !== "world-cup-2026")
    .map((e) => ({ edition: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }) {
  const ed = getEdition((await params).edition);
  return ed
    ? {
        title: `Player cards — ${ed.name} ${ed.season}`,
        description: `A real-data card for every player who appeared in the ${ed.name} ${ed.season}: every stat a percentile against the rest of the league.`,
      }
    : {};
}

export default async function LeaguePlayersPage({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const slug = (await params).edition;
  const ed = getEdition(slug);
  if (!ed || slug === "world-cup-2026") notFound();

  const crestBySlug = new Map(getLeagueTeams(slug).map((t) => [t.slug, t.crest]));
  const cards = getLeagueCardsFor(slug);
  if (!cards.length) notFound();

  const slim: SlimCard[] = cards
    .sort((a, b) => b.overall - a.overall || b.minutes - a.minutes)
    .map((c) => ({
      id: c.id,
      name: c.name,
      team: c.team,
      abbr: c.abbr,
      pos: c.pos,
      overall: c.overall,
      tier: c.tier,
      photo: c.photo,
      flag: crestBySlug.get(c.abbr) ?? "",
    }));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        {ed.name} {ed.season}
      </p>
      <h1 className="display mb-1 mt-1 text-4xl font-bold">Player cards</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        {slim.length} players, one card each. No opinions: every stat is that player&rsquo;s
        percentile <em>against the rest of this league</em>, and the overall is blended with
        their match ratings. Club football has no tracking feed, so the faces are shooting,
        creation, passing, carrying, defending and duels rather than pace and distance.
      </p>
      <PlayersExplorer cards={slim} base={`/${slug}`} />
    </main>
  );
}
