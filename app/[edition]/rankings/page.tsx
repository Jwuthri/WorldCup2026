import Link from "next/link";
import { notFound } from "next/navigation";
import { getEdition, getEditions } from "@/lib/editions";
import { getLeagueTeams } from "@/lib/leagueSeason";

export function generateStaticParams() {
  return getEditions()
    .filter((e) => e.depth === "full" && e.slug !== "world-cup-2026")
    .map((e) => ({ edition: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }) {
  const ed = getEdition((await params).edition);
  return ed ? { title: `Power rankings — ${ed.name} ${ed.season}` } : {};
}

export default async function LeagueRankingsPage({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const slug = (await params).edition;
  const ed = getEdition(slug);
  if (!ed || slug === "world-cup-2026") notFound();
  const teams = getLeagueTeams(slug);
  if (!teams.length) notFound();

  // expected points: how the table would read if every side scored to its xG
  const byXgDiff = [...teams].sort((a, b) => b.xgFor - b.xgAgainst - (a.xgFor - a.xgAgainst));
  const xgRank = new Map(byXgDiff.map((t, i) => [t.id, i + 1]));
  const maxAbs = Math.max(...teams.map((t) => Math.abs(t.xgFor - t.xgAgainst)), 1);

  const over = [...teams]
    .map((t) => ({ t, delta: xgRank.get(t.id)! - (teams.indexOf(t) + 1) }))
    .sort((a, b) => b.delta - a.delta);
  const luckiest = over.slice(0, 3);
  const unluckiest = over.slice(-3).reverse();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        <Link href={`/${slug}`} className="hover:underline">
          {ed.name} {ed.season}
        </Link>
      </p>
      <h1 className="display mt-1 text-4xl font-bold text-chalk sm:text-5xl">Power rankings</h1>
      <p className="mt-2 max-w-2xl text-sm text-dim">
        The table records what happened. This records how it was earned: expected goals for and
        against, summed from every shot of the season. Where a club sits above its xG rank, the
        finishing — or the goalkeeping — outran the chances.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-pitchline bg-surface p-4">
          <p className="eyebrow">Outperformed their xG most</p>
          <ul className="mt-2 space-y-1.5">
            {luckiest.map(({ t, delta }) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-chalk">{t.name}</span>
                <span className="data text-gold">+{delta} places</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-pitchline bg-surface p-4">
          <p className="eyebrow">Fell furthest short of it</p>
          <ul className="mt-2 space-y-1.5">
            {unluckiest.map(({ t, delta }) => (
              <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="truncate text-chalk">{t.name}</span>
                <span className="data text-ember">{delta} places</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-10 overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-pitchline text-left">
              {["#", "Club", "P", "Pts", "GF", "GA", "xGF", "xGA", "xG diff", "Poss", "xG rank"].map(
                (h, i) => (
                  <th key={h} className={`eyebrow py-2 ${i > 1 ? "text-right" : ""}`}>
                    {h}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {teams.map((t, i) => {
              const diff = t.xgFor - t.xgAgainst;
              const rank = xgRank.get(t.id)!;
              const move = rank - (i + 1);
              return (
                <tr key={t.id} className="border-b border-pitchline/60">
                  <td className="data py-2 text-faint">{i + 1}</td>
                  <td className="py-2">
                    <span className="flex items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={t.crest} alt="" width={18} height={18} className="h-[18px] w-[18px] object-contain" />
                      <span className="truncate font-medium text-chalk">{t.name}</span>
                    </span>
                  </td>
                  <td className="data py-2 text-right text-dim">{t.played}</td>
                  <td className="data py-2 text-right font-semibold text-chalk">{t.pts}</td>
                  <td className="data py-2 text-right text-dim">{t.gf}</td>
                  <td className="data py-2 text-right text-dim">{t.ga}</td>
                  <td className="data py-2 text-right text-dim">{t.xgFor.toFixed(1)}</td>
                  <td className="data py-2 text-right text-dim">{t.xgAgainst.toFixed(1)}</td>
                  <td className="py-2 text-right">
                    <span className="relative inline-flex w-24 items-center justify-end">
                      <span
                        aria-hidden
                        className="absolute inset-y-0.5 right-0 -z-10 rounded-sm"
                        style={{
                          width: `${(Math.abs(diff) / maxAbs) * 100}%`,
                          background: diff >= 0 ? ed.accent : "var(--ember)",
                          opacity: 0.22,
                        }}
                      />
                      <span className="data text-chalk">
                        {diff > 0 ? "+" : ""}
                        {diff.toFixed(1)}
                      </span>
                    </span>
                  </td>
                  <td className="data py-2 text-right text-dim">
                    {t.possession != null ? `${t.possession}%` : "—"}
                  </td>
                  <td className="data py-2 text-right">
                    <span className="text-dim">{rank}</span>{" "}
                    {move !== 0 && (
                      <span style={{ color: move < 0 ? "var(--gold)" : "var(--ember)" }}>
                        {move < 0 ? "▲" : "▼"}
                        {Math.abs(move)}
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-8 text-xs text-faint">
        xG summed from every shot in all {teams[0]?.played ?? 0} rounds. Points, goals and the
        order of the table are computed from the same match files, not taken from a standings
        feed — they agree with it.
      </p>
    </main>
  );
}
