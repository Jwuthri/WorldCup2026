import Link from "next/link";
import { notFound } from "next/navigation";
import { getEdition } from "@/lib/editions";
import { getLeagueCard, getLeagueCardsFor, getLeagueTeams } from "@/lib/leagueSeason";
import PlayerCard from "@/components/PlayerCard";
import MiniCard from "@/components/MiniCard";

/** ~500 players per league; render on demand rather than prerendering thousands */
export const dynamicParams = true;
export function generateStaticParams() {
  return [];
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ edition: string; id: string }>;
}) {
  const { edition, id } = await params;
  const ed = getEdition(edition);
  const c = getLeagueCard(edition, id);
  if (!ed || !c) return {};
  return {
    title: `${c.name} ${c.overall} — ${ed.name} ${ed.season} card`,
    description: `${c.name}, ${c.team}. ${c.matches} matches, ${c.minutes} minutes. Every stat a percentile across the ${ed.name}.`,
  };
}

export default async function LeaguePlayerPage({
  params,
}: {
  params: Promise<{ edition: string; id: string }>;
}) {
  const { edition, id } = await params;
  const ed = getEdition(edition);
  const card = getLeagueCard(edition, id);
  if (!ed || !card) notFound();

  const teams = getLeagueTeams(edition);
  const club = teams.find((t) => t.slug === card.abbr);

  // team-mates ranked around them, for a sense of place in the squad
  const mates = getLeagueCardsFor(edition)
    .filter((c) => c.abbr === card.abbr && c.id !== card.id)
    .sort((a, b) => b.overall - a.overall)
    .slice(0, 6);

  const rated = card.perMatch.filter((m) => m.rating != null);
  const best = [...rated].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0];

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        <Link href={`/${edition}/players`} className="hover:underline">
          {ed.name} {ed.season} · player cards
        </Link>
      </p>

      <div className="mt-4 grid gap-10 lg:grid-cols-[22rem_1fr]">
        <div className="mx-auto w-full max-w-sm">
          <PlayerCard card={card} />
        </div>

        <div className="min-w-0">
          <h1 className="display text-4xl font-bold text-chalk sm:text-5xl">{card.name}</h1>
          <p className="mt-1 flex items-center gap-2 text-dim">
            {club && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={club.crest} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
            )}
            {card.team} · {card.pos}
          </p>

          <h2 className="eyebrow mt-8">The receipts</h2>
          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            {card.receipts.map((r) => (
              <div key={r.label}>
                <dt className="eyebrow truncate">{r.label}</dt>
                <dd className="data mt-0.5 text-lg text-chalk">{r.value}</dd>
              </div>
            ))}
          </dl>

          {best?.rating != null && (
            <p className="mt-6 text-sm text-dim">
              Best night: <span className="text-chalk">{best.rating.toFixed(1)}</span> against{" "}
              <span className="text-chalk">{best.opp}</span> ({best.score}).
            </p>
          )}

          <h2 className="eyebrow mt-10">Match by match</h2>
          <div className="mt-3 max-h-96 overflow-y-auto pr-1">
            {card.perMatch.map((m) => (
              <Link
                key={m.matchId}
                href={`/${edition}/match/${m.matchId}`}
                className="grid grid-cols-[1fr_auto_3rem] items-center gap-3 border-b border-pitchline/60 py-2 text-sm transition hover:bg-surface"
              >
                <span className="truncate text-dim">{m.opp}</span>
                <span className="data text-xs text-faint">{m.score}</span>
                <span
                  className="data text-right"
                  style={{
                    color:
                      m.rating == null
                        ? "var(--faint)"
                        : m.rating >= 8
                          ? "var(--gold)"
                          : m.rating >= 6.5
                            ? "var(--chalk)"
                            : "var(--ember)",
                  }}
                >
                  {m.rating?.toFixed(1) ?? "—"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {mates.length > 0 && (
        <section className="mt-16">
          <h2 className="display text-2xl font-semibold text-chalk">Around them at {card.team}</h2>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {mates.map((c) => (
              <MiniCard key={c.id} c={c} base={`/${edition}`} badge={club?.crest} />
            ))}
          </div>
        </section>
      )}

      <p className="mt-14 text-xs text-faint">
        Percentiles are against every player in this league who passed 90 minutes. No physical
        or tracking data — that tier is FIFA-only.
      </p>
    </main>
  );
}
