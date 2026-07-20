import Link from "next/link";
import { getTeams } from "@/lib/teams";
import { flagUrl } from "@/lib/flags";
import Heatmap from "@/components/Heatmap";
import { teamTerritory } from "@/lib/heatmap";

export const metadata = {
  title: "Territory — MUNDIAL·26",
  description: "Average field occupation for all 48 nations, decoded from every player heatmap of the tournament.",
};

export default function TerritoryPage() {
  const teams = [...getTeams().values()]
    .map((t) => ({ t, terr: teamTerritory(t.abbr) }))
    .filter((x) => x.terr.avg)
    .sort((a, b) => b.terr.games.length - a.terr.games.length || a.t.name.localeCompare(b.t.name));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <h1 className="display mb-1 text-4xl font-bold">Territory</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        How each nation occupied the pitch, averaged over their tournament — every player&#39;s
        heatmap, minutes-weighted and stacked. All attacking left to right; brighter is more
        presence. Open a team for the game-by-game maps and the opponent scout.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
        {teams.map(({ t, terr }) => (
          <Link
            key={t.abbr}
            href={`/team/${t.abbr}`}
            className="group rounded-lg border border-pitchline bg-surface p-3 transition-colors hover:border-gold/40"
          >
            <p className="mb-2 flex items-center gap-2 text-sm">
              <img src={flagUrl(t.abbr)} alt="" width={20} height={20} className="rounded-[2px]" loading="lazy" />
              <span className={t.champion ? "text-gold" : "text-chalk"}>{t.name}</span>
              <span className="data ml-auto text-xs text-faint">{terr.games.length} games</span>
            </p>
            <Heatmap
              label={`${t.name} average field occupation`}
              layers={[{ grid: terr.avg!, color: t.champion ? "var(--gold)" : "var(--chalk)" }]}
              className="w-full rounded transition-opacity group-hover:opacity-85"
            />
            <p className="eyebrow mt-2 opacity-70">{t.finish}</p>
          </Link>
        ))}
      </div>
    </main>
  );
}
