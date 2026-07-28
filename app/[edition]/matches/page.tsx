import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEdition, getEditions } from "@/lib/editions";
import { getLeagueIndex, type LeagueMatch } from "@/lib/leagues";

export function generateStaticParams() {
  return getEditions()
    .filter((e) => e.depth === "full" && e.slug !== "world-cup-2026")
    .map((e) => ({ edition: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }) {
  const ed = getEdition((await params).edition);
  return ed ? { title: `Every match — ${ed.name} ${ed.season}` } : {};
}

function Row({ m, slug, accent }: { m: LeagueMatch; slug: string; accent: string }) {
  const hw = (m.home.score ?? 0) > (m.away.score ?? 0);
  const aw = (m.away.score ?? 0) > (m.home.score ?? 0);
  return (
    <Link
      href={`/${slug}/match/${m.id}`}
      className="grid grid-cols-[3.5rem_1fr_auto_1fr] items-center gap-3 border-b border-pitchline/60 py-2.5 transition hover:bg-surface"
    >
      <span className="data text-xs text-faint">
        {m.date ? new Date(m.date).toLocaleDateString("en-GB", { day: "2-digit", month: "short" }) : ""}
      </span>
      <span className={`flex items-center justify-end gap-2 truncate text-right ${hw ? "font-semibold text-chalk" : "text-dim"}`}>
        <span className="truncate">{m.home.name}</span>
        <Image src={m.home.crest} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" unoptimized />
      </span>
      <span className="data px-1 text-sm" style={{ color: accent }}>
        {m.home.score ?? "–"}:{m.away.score ?? "–"}
      </span>
      <span className={`flex items-center gap-2 truncate ${aw ? "font-semibold text-chalk" : "text-dim"}`}>
        <Image src={m.away.crest} alt="" width={20} height={20} className="h-5 w-5 shrink-0 object-contain" unoptimized />
        <span className="truncate">{m.away.name}</span>
      </span>
    </Link>
  );
}

export default async function LeagueMatchesPage({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const slug = (await params).edition;
  const ed = getEdition(slug);
  const idx = getLeagueIndex(slug);
  if (!ed || !idx) notFound();

  // group by matchday, newest first — a league reads backwards from the run-in
  const byRound = new Map<number, LeagueMatch[]>();
  for (const m of idx.matches) {
    const r = m.round ?? 0;
    if (!byRound.has(r)) byRound.set(r, []);
    byRound.get(r)!.push(m);
  }
  const rounds = [...byRound.keys()].sort((a, b) => b - a);

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        <Link href={`/${slug}`} className="hover:underline">
          {ed.name} {ed.season}
        </Link>
      </p>
      <h1 className="display mt-1 text-4xl font-bold text-chalk sm:text-5xl">
        All {idx.matches.length} matches
      </h1>
      <p className="eyebrow mt-2">Every one has formations, an xG shot map, heatmaps and ratings</p>

      {rounds.map((r) => (
        <section key={r} className="mt-10">
          <h2 className="eyebrow border-b border-pitchline pb-2">
            {r ? `Matchday ${r}` : "Other"}
          </h2>
          <div className="mt-1">
            {byRound.get(r)!.map((m) => (
              <Row key={m.id} m={m} slug={slug} accent={ed.accent} />
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
