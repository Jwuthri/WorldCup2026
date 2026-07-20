import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getTeams } from "@/lib/teams";
import { getStrength } from "@/lib/strength";
import { teamStyleOf } from "@/lib/ml";
import { luckOf } from "@/lib/luck";
import { flagUrl } from "@/lib/flags";
import MiniCard from "@/components/MiniCard";
import Heatmap from "@/components/Heatmap";
import TeamJourney, { type JourneyStop } from "@/components/TeamJourney";
import { teamTerritory } from "@/lib/heatmap";
import { getCalendar } from "@/lib/data";
import { VENUES, haversineKm } from "@/lib/venues";

export function generateStaticParams() {
  return [...getTeams().keys()].map((abbr) => ({ abbr }));
}

export async function generateMetadata({ params }: { params: Promise<{ abbr: string }> }): Promise<Metadata> {
  const { abbr } = await params;
  const t = getTeams().get(abbr);
  if (!t) return {};
  return {
    title: `${t.name} — MUNDIAL·26`,
    description: `${t.finish}. Tactical identity, results and the full squad's real-data cards.`,
  };
}

const outcomeColor = { W: "var(--gold)", D: "var(--dim)", L: "var(--ember)" } as const;

export default async function TeamPage({
  params,
  searchParams,
}: {
  params: Promise<{ abbr: string }>;
  searchParams: Promise<{ vs?: string }>;
}) {
  const { abbr } = await params;
  const t = getTeams().get(abbr);
  if (!t) notFound();
  const st = getStrength()[abbr];
  const style = teamStyleOf(abbr);
  const luck = luckOf(abbr);
  const { vs: vsRaw } = await searchParams;
  const vsTeam = vsRaw && vsRaw !== abbr ? getTeams().get(vsRaw) : undefined;

  const territory = teamTerritory(abbr);
  const vsTerritory = vsTeam ? teamTerritory(vsTeam.abbr) : null;
  const resultByMatch = new Map(t.results.map((r) => [r.matchId, r]));

  // journey: the team's matches in date order, joined to venues for the travel map
  const stops = getCalendar()
    .filter((m) => m.home.abbr === abbr || m.away.abbr === abbr)
    .sort((a, b) => +new Date(a.date) - +new Date(b.date))
    .map((m): JourneyStop | null => {
      const v = VENUES[m.city];
      const r = resultByMatch.get(m.id);
      if (!v || !r) return null;
      return {
        matchId: m.id,
        city: m.city,
        stadium: m.stadium,
        date: new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
        opp: r.opp,
        oppAbbr: r.oppAbbr,
        score: r.score,
        outcome: r.outcome,
        lat: v.lat,
        lon: v.lon,
        km: 0,
      };
    })
    .filter(Boolean) as JourneyStop[];
  for (let i = 1; i < stops.length; i++)
    stops[i].km = haversineKm(VENUES[stops[i - 1].city], VENUES[stops[i].city]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      {/* hero */}
      <div className="mb-10 flex items-center gap-5">
        <img src={flagUrl(t.abbr)} alt="" width={72} height={72} className="rounded"
          style={t.champion ? { boxShadow: "0 0 60px -10px var(--gold)" } : undefined} />
        <div>
          <h1 className="display text-5xl font-bold leading-none sm:text-6xl">{t.name}</h1>
          <p className="mt-1.5 text-sm">
            <span className={t.champion ? "text-gold" : "text-dim"}>{t.finish}</span>
            {t.group && <span className="text-faint"> · {t.group}</span>}
            {t.formations.length > 0 && (
              <span className="data text-faint"> · {t.formations.slice(0, 3).join(" · ")}</span>
            )}
            {st && (
              <span className="data text-faint"> · Elo {st.elo} <span className="text-dim">(world #{st.worldRank})</span></span>
            )}
            {style && (
              <>
                {" · "}
                <Link href="/map" className="text-gold hover:underline" title={style.blurb}>{style.label}</Link>
              </>
            )}
            {luck && (
              <span
                className="data text-faint"
                title={`Group stage: ${luck.pts} pts vs ${luck.xpts} expected from 10,000 xG replays`}
              >
                {" · fortune "}
                <span className={luck.delta > 0.5 ? "text-gold" : luck.delta < -0.5 ? "text-ember" : "text-dim"}>
                  {luck.delta > 0 ? `+${luck.delta}` : luck.delta}
                </span>
              </span>
            )}
          </p>
        </div>
      </div>

      <div className="grid gap-10 lg:grid-cols-[1fr_1.2fr]">
        {/* identity */}
        <section>
          <h2 className="display mb-1 text-2xl font-semibold">How they played</h2>
          <p className="mb-4 text-sm text-dim">
            Tournament percentiles among all 48 teams — bar length is the rank, number is the real value.
          </p>
          <div className="space-y-2.5 rounded-lg border border-pitchline bg-surface p-4">
            {t.identity.map((row) => (
              <div key={row.label} className="grid grid-cols-[minmax(9rem,auto)_1fr_4.5rem] items-center gap-3 text-sm">
                <span className="text-dim">{row.label}</span>
                <div className="h-2 rounded-full bg-raised">
                  <div className="h-2 rounded-full bg-gold" style={{ width: `${Math.round(row.pct * 100)}%`, opacity: 0.45 + row.pct * 0.55 }} />
                </div>
                <span className="data text-right text-chalk">{row.value}</span>
              </div>
            ))}
          </div>
        </section>

        {/* results */}
        <section>
          <h2 className="display mb-1 text-2xl font-semibold">The run</h2>
          <p className="mb-4 text-sm text-dim">{t.results.length} matches — open any of them in the theater.</p>
          <div className="space-y-1.5">
            {t.results.map((r) => (
              <Link
                key={r.matchId}
                href={`/match/${r.matchId}`}
                className="grid grid-cols-[10px_auto_1fr_auto_auto] items-center gap-3 rounded border border-transparent px-2 py-1.5 text-sm transition-colors hover:border-pitchline hover:bg-surface"
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: outcomeColor[r.outcome] }} />
                <img src={flagUrl(r.oppAbbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
                <span className="text-dim">vs {r.opp}</span>
                <span className="eyebrow hidden sm:block">{r.stage}</span>
                <span className="data text-chalk">{r.score}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      {/* journey */}
      {stops.length >= 2 && (
        <TeamJourney
          stops={stops}
          venues={Object.values(VENUES).map((v) => ({ city: v.city, lat: v.lat, lon: v.lon }))}
          color="var(--gold)"
          teamName={t.name}
        />
      )}

      {/* territory */}
      {territory.avg && (
        <section className="mt-12">
          <h2 className="display mb-1 text-2xl font-semibold">Territory</h2>
          <p className="mb-5 text-sm text-dim">
            Field occupation — every player&#39;s heatmap, minutes-weighted and stacked. Attacking left
            to right; brighter is more presence.
          </p>
          <div className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
            <div className="self-start rounded-lg border border-pitchline bg-surface p-4">
              <p className="eyebrow mb-2">Tournament average · {territory.games.length} matches</p>
              <Heatmap label={`${t.name} average field occupation`} layers={[{ grid: territory.avg, color: "var(--gold)" }]} />
            </div>
            <div className="rounded-lg border border-pitchline bg-surface p-4">
              <p className="eyebrow mb-2">Game by game</p>
              <div className="grid grid-cols-2 gap-3">
                {territory.games.map((g) => {
                  const r = resultByMatch.get(g.matchId);
                  return (
                    <Link key={g.matchId} href={`/match/${g.matchId}`} className="group">
                      <Heatmap label={`occupation vs ${g.opp}`} layers={[{ grid: g.grid, color: "var(--gold)" }]}
                        className="w-full rounded transition-opacity group-hover:opacity-80" />
                      <p className="mt-1 flex items-center gap-1.5 text-xs text-dim">
                        {r && <span className="h-2 w-2 rounded-full" style={{ background: outcomeColor[r.outcome] }} />}
                        vs {g.oppAbbr}
                        {r && <span className="data text-faint">{r.score}</span>}
                      </p>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>

          {/* scouting: us vs them */}
          <div className="mt-6 rounded-lg border border-pitchline bg-surface p-4">
            <form action={`/team/${t.abbr}`} className="mb-3 flex flex-wrap items-center gap-3">
              <label htmlFor="vs" className="eyebrow">Scout an opponent</label>
              <select
                id="vs"
                name="vs"
                defaultValue={vsTeam?.abbr ?? ""}
                className="rounded border border-pitchline bg-raised px-2 py-1.5 text-sm text-chalk"
              >
                <option value="" disabled>Pick a team…</option>
                {[...getTeams().values()]
                  .filter((x) => x.abbr !== t.abbr)
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((x) => (
                    <option key={x.abbr} value={x.abbr}>{x.name}</option>
                  ))}
              </select>
              <button type="submit" className="eyebrow rounded border border-pitchline px-3 py-1.5 text-gold hover:bg-raised">
                Compare
              </button>
            </form>
            {vsTeam && vsTerritory?.avg ? (
              <>
                <p className="mb-3 text-sm text-dim">
                  <span className="text-gold">{t.name} attack →</span>,{" "}
                  <span className="text-chalk">← {vsTeam.name} attack</span> — both tournament
                  averages on one pitch. Where {vsTeam.name}&#39;s chalk burns bright inside your half
                  is where they will come at you; overlap is the ground nobody owned.
                </p>
                <Heatmap
                  label={`average territory: ${t.name} vs ${vsTeam.name}`}
                  layers={[
                    { grid: territory.avg, color: "var(--gold)" },
                    { grid: vsTerritory.avg, color: "var(--chalk)", mirror: true },
                  ]}
                />
              </>
            ) : (
              <p className="text-sm text-faint">
                Overlays their average occupation, mirrored onto this pitch — a pre-match read on
                where the danger comes from.
              </p>
            )}
          </div>
        </section>
      )}

      {/* squad */}
      <section className="mt-12">
        <h2 className="display mb-1 text-2xl font-semibold">The squad</h2>
        <p className="mb-5 text-sm text-dim">Everyone who played, ranked by their card.</p>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {t.squad.map((c) => (
            <MiniCard key={c.id} c={c} showFlag={false} />
          ))}
        </div>
      </section>
    </main>
  );
}
