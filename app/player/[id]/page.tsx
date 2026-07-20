import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getCards } from "@/lib/cards";
import { flagUrl } from "@/lib/data";
import { archetypeOf, similarTo } from "@/lib/ml";
import PlayerCard from "@/components/PlayerCard";
import PackReveal from "@/components/PackReveal";
import PlayerPoster from "@/components/PlayerPoster";
import { getPosterData } from "./poster-data";

export function generateStaticParams() {
  return [...getCards().keys()].map((id) => ({ id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const c = getCards().get(id);
  if (!c) return {};
  return {
    title: `${c.name} ${c.overall} — MUNDIAL·26 card`,
    description: `${c.team} ${c.pos} · ${c.matches} matches · every stat a real tournament percentile.`,
  };
}

const ratingTone = (r: number | null) =>
  r == null ? "var(--faint)" : r >= 8 ? "var(--gold)" : r >= 6.5 ? "var(--chalk)" : "var(--ember)";

export default async function PlayerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCards().get(id);
  if (!c) notFound();
  const poster = getPosterData(c);
  const tribe = archetypeOf(id);
  const similar = similarTo(id, 5);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <p className="eyebrow mb-6">
        <Link href="/players" className="hover:text-chalk">Player cards</Link> / {c.team}
      </p>
      <div className="grid gap-10 lg:grid-cols-[340px_1fr]">
        <div className="justify-self-center lg:justify-self-start">
          {/* no vtName here: the pack reveal IS the entrance — a shared-element morph would fight it */}
          <PackReveal tier={c.tier}>
            <PlayerCard card={c} />
          </PackReveal>
          <p className="mt-3 max-w-[320px] text-center text-xs text-faint">
            Stats are percentiles among all {c.pos === "GK" ? "goalkeepers" : "outfielders"} with 90+
            minutes; overall blends them with match ratings.
          </p>
          <div className="mt-10">
            <h2 className="eyebrow mb-2">The tournament as generative art</h2>
            <PlayerPoster
              name={c.name}
              team={c.team}
              color={poster.color}
              overall={c.overall}
              tier={c.tier}
              pos={c.pos}
              shots={poster.shots}
              slot={poster.slot}
              seed={c.id}
            />
          </div>
        </div>

        <div>
          <h1 className="display text-4xl font-bold">{c.name}</h1>
          <p className="mb-6 flex items-center gap-2 text-sm text-dim">
            <img src={flagUrl(c.abbr)} alt="" width={18} height={18} className="rounded-[2px]" />
            <Link href={`/team/${c.abbr}`} className="hover:text-chalk">{c.team}</Link> · {c.pos} ·{" "}
            {c.minutes.toLocaleString("en-US")} minutes
            {tribe && (
              <>
                {" · "}
                <Link href="/map" className="text-gold hover:underline" title={tribe.blurb}>
                  {tribe.label}
                </Link>
              </>
            )}
          </p>

          <h2 className="eyebrow mb-2">The receipts — real tournament totals</h2>
          <div className="mb-8 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {c.receipts.map((r) => (
              <div key={r.label} className="rounded border border-pitchline bg-surface p-3">
                <p className="data text-lg text-chalk">{r.value}</p>
                <p className="mt-0.5 text-xs text-dim">{r.label}</p>
              </div>
            ))}
          </div>

          {similar.length > 0 && (
            <>
              <h2 className="eyebrow mb-2">Statistical twins — who plays like {c.name.split(" ").pop()}</h2>
              <div className="mb-8 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {similar.map(({ card: s, sim }) => (
                  <Link
                    key={s.id}
                    href={`/player/${s.id}`}
                    className="flex items-center gap-2.5 rounded border border-pitchline bg-surface px-3 py-2 transition-colors hover:border-gold/60"
                  >
                    <img src={flagUrl(s.abbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-chalk">{s.name}</span>
                      <span className="block text-xs text-faint">{s.team} · {s.pos}</span>
                    </span>
                    <span className="data ml-auto text-xs text-dim" title="cosine similarity of per-90 style vectors">
                      {(sim * 100).toFixed(0)}%
                    </span>
                  </Link>
                ))}
              </div>
            </>
          )}

          <h2 className="eyebrow mb-2">Match by match</h2>
          <div className="space-y-1.5">
            {c.perMatch.map((m) => (
              <Link
                key={m.matchId}
                href={`/match/${m.matchId}`}
                className="grid grid-cols-[auto_1fr_auto_auto] items-center gap-3 rounded border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-pitchline hover:bg-surface"
              >
                <img src={flagUrl(m.oppAbbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
                <span className="text-dim">vs {m.opp}</span>
                <span className="data text-chalk">{m.score}</span>
                <span
                  className="data rounded border px-1.5 py-0.5 text-xs"
                  style={{ color: ratingTone(m.rating), borderColor: ratingTone(m.rating) }}
                >
                  {m.rating?.toFixed(1) ?? "—"}
                </span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
