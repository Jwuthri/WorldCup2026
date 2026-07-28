import Link from "next/link";
import { notFound } from "next/navigation";
import { getEdition, getEditions } from "@/lib/editions";
import { getLeagueTeams } from "@/lib/leagueSeason";
import { hasHeat } from "@/lib/heatmap";
import Heatmap from "@/components/Heatmap";

export function generateStaticParams() {
  return getEditions()
    .filter((e) => e.depth === "full" && e.slug !== "world-cup-2026")
    .map((e) => ({ edition: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }) {
  const ed = getEdition((await params).edition);
  return ed ? { title: `Territory — ${ed.name} ${ed.season}` } : {};
}

export default async function LeagueTerritoryPage({
  params,
}: {
  params: Promise<{ edition: string }>;
}) {
  const slug = (await params).edition;
  const ed = getEdition(slug);
  if (!ed || slug === "world-cup-2026") notFound();
  const teams = getLeagueTeams(slug).filter((t) => hasHeat(t.grid));
  if (!teams.length) notFound();

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        <Link href={`/${slug}`} className="hover:underline">
          {ed.name} {ed.season}
        </Link>
      </p>
      <h1 className="display mt-1 text-4xl font-bold text-chalk sm:text-5xl">Territory</h1>
      <p className="mt-2 max-w-2xl text-sm text-dim">
        Every club&rsquo;s season on one pitch. Each player&rsquo;s heatmap is treated as a spatial
        distribution, weighted by the minutes they played, and summed across all{" "}
        {teams[0]?.played ?? 0} matches — so this is where a side actually stood, not where a
        formation graphic says it should. All attacking right.
      </p>

      <ul className="mt-8 grid gap-x-6 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map((t) => (
          <li key={t.id}>
            <div className="flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={t.crest} alt="" width={20} height={20} className="h-5 w-5 object-contain" />
              <span className="truncate font-semibold text-chalk">{t.name}</span>
              <span className="data ml-auto text-xs text-faint">
                {t.possession != null ? `${t.possession}%` : ""}
              </span>
            </div>
            <div className="mt-2">
              <Heatmap
                label={`${t.name} season territory, attacking right`}
                layers={[{ grid: t.grid, color: t.color }]}
                arrows={false}
              />
            </div>
          </li>
        ))}
      </ul>
    </main>
  );
}
