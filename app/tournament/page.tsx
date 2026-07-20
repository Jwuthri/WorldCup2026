import Link from "next/link";
import {
  getCalendar,
  getSeasonPlayers,
  getPlayerDirectory,
  getStandings,
  flagUrl,
} from "@/lib/data";
import Bracket from "@/components/Bracket";
import { getLuck } from "@/lib/luck";

export const metadata = { title: "Tournament — MUNDIAL·26" };

export default function Home() {
  const matches = getCalendar();
  const season = getSeasonPlayers();
  const dir = getPlayerDirectory();
  const standings = getStandings();

  const final = matches.find((m) => m.stage === "Final");
  const champion = final
    ? final.winner === final.home.id
      ? final.home
      : final.away
    : null;

  // tournament numbers
  const goals = matches.reduce((s, m) => s + (m.home.score ?? 0) + (m.away.score ?? 0), 0);
  const attendance = matches.reduce((s, m) => s + (Number(m.attendance) || 0), 0);
  let topSpeed = { v: 0, id: "" };
  let distance = 0;
  for (const [id, st] of Object.entries(season)) {
    if ((st.TopSpeed ?? 0) > topSpeed.v) topSpeed = { v: st.TopSpeed, id };
    distance += st.TotalDistance ?? 0;
  }

  // golden boot
  const boot = Object.entries(season)
    .map(([id, st]) => ({ id, goals: st.Goals ?? 0, assists: st.Assists ?? 0, xg: st.XG ?? 0, matches: st.MatchesPlayed ?? 0 }))
    .filter((p) => p.goals > 0)
    .sort((a, b) => b.goals - a.goals || b.assists - a.assists || b.xg - a.xg)
    .slice(0, 6);
  const maxGoals = boot[0]?.goals ?? 1;

  const tiles = [
    { label: "matches", value: "104" },
    { label: "goals", value: goals.toLocaleString("en-US") },
    { label: "in the stands", value: `${(attendance / 1e6).toFixed(1)}M` },
    { label: "fastest sprint", value: `${topSpeed.v.toFixed(1)} km/h`, sub: dir[topSpeed.id]?.name },
    { label: "distance run", value: `${Math.round(distance / 1000).toLocaleString("en-US")} km` },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      {/* thesis: the champion */}
      {champion && final && (
        <section className="mb-14 text-center">
          <p className="eyebrow mb-4">
            June 11 — July 19, 2026 · USA · Canada · México · 48 nations
          </p>
          <img
            src={flagUrl(champion.abbr)}
            alt=""
            width={84}
            height={84}
            className="mx-auto mb-4 rounded shadow-[0_0_60px_-10px_var(--gold)]"
          />
          <h1 className="display text-6xl font-bold leading-none tracking-tight sm:text-8xl">
            {champion.name}
            <span className="block text-2xl font-semibold text-gold sm:text-4xl">
              champions of the world
            </span>
          </h1>
          <Link
            href={`/match/${final.id}`}
            className="mt-6 inline-block rounded border border-pitchline bg-surface px-6 py-3 transition-colors hover:border-gold/60"
          >
            <span className="text-sm text-dim">The final · </span>
            <span className="display text-lg font-semibold">
              {final.home.name} <span className="data text-gold">{final.home.score}:{final.away.score}</span> {final.away.name}
            </span>
            <span className="text-sm text-dim">
              {final.resultType === 3 ? " · a.e.t." : ""} — open the match theater →
            </span>
          </Link>
        </section>
      )}

      {/* tournament numbers */}
      <section className="mb-14 grid grid-cols-2 gap-3 sm:grid-cols-5">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-lg border border-pitchline bg-surface p-4 text-center">
            <p className="data text-2xl text-chalk sm:text-3xl">{t.value}</p>
            <p className="eyebrow mt-1">{t.label}</p>
            {t.sub && <p className="mt-0.5 text-xs text-dim">{t.sub}</p>}
          </div>
        ))}
      </section>

      <Link
        href="/awards"
        className="mb-14 block rounded-lg border border-gold/40 bg-surface px-5 py-4 text-center transition-colors hover:border-gold"
      >
        <span className="display text-lg font-semibold text-gold">The honours</span>
        <span className="text-sm text-dim"> — Golden Boot · Golden Glove · Best Young Player · Team of the Tournament →</span>
      </Link>

      {/* golden boot */}
      <section className="mb-14">
        <h2 className="display mb-1 text-3xl font-semibold">The golden boot race</h2>
        <p className="mb-5 text-sm text-dim">
          Goals across the tournament, with expected goals for honesty — overperformers scored what the chances didn&apos;t promise.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {boot.map((p, i) => {
            const d = dir[p.id];
            return (
              <Link href={`/player/${p.id}`} key={p.id} className="flex items-center gap-3 rounded-lg border border-pitchline bg-surface p-3 transition-colors hover:border-gold/60">
                <span className="data w-5 text-right text-faint">{i + 1}</span>
                {d?.photo ? (
                  <img src={d.photo} alt="" width={48} height={48} className="rounded-full border border-pitchline object-cover" loading="lazy" />
                ) : (
                  <span className="h-12 w-12 rounded-full bg-raised" />
                )}
                <div className="min-w-0 grow">
                  <p className="display truncate text-lg font-semibold leading-tight">{d?.name ?? p.id}</p>
                  <p className="text-xs text-dim">{d?.team}</p>
                  <div className="mt-1.5 h-1.5 rounded-full bg-raised">
                    <div className="h-1.5 rounded-full bg-gold" style={{ width: `${(p.goals / maxGoals) * 100}%` }} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="data text-2xl text-gold">{p.goals}</p>
                  <p className="data text-[10px] text-faint">xG {p.xg.toFixed(1)}</p>
                </div>
              </Link>
            );
          })}
        </div>
      </section>

      {/* group stage */}
      <section className="mb-14">
        <h2 className="display mb-1 text-3xl font-semibold">The pools</h2>
        <p className="mb-5 text-sm text-dim">
          Twelve groups of four — the top two went through, joined by the eight best third-placed sides.
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Object.keys(standings)
            .sort()
            .map((g) => (
              <div key={g} className="rounded-lg border border-pitchline bg-surface p-3">
                <div className="mb-2 flex items-baseline justify-between">
                  <span className="display text-xl font-semibold text-gold">Group {g}</span>
                  <span className="data text-[10px] text-faint">W·D·L&nbsp;&nbsp;GD&nbsp;&nbsp;PTS</span>
                </div>
                <ul>
                  {standings[g].map((t) => (
                    <li key={t.abbr}>
                      <Link
                        href={`/team/${t.abbr}`}
                        className={`flex items-center gap-2 rounded px-1 py-1 transition-colors hover:bg-raised ${t.through ? "" : "opacity-50"}`}
                      >
                        <span className={`data w-3 text-xs ${t.through ? "text-gold" : "text-faint"}`}>{t.pos}</span>
                        <img src={flagUrl(t.abbr)} alt="" width={20} height={14} className="rounded-[2px]" loading="lazy" />
                        <span className="min-w-0 grow truncate text-sm">{t.name}</span>
                        <span className="data whitespace-nowrap text-xs text-dim">
                          {t.w}·{t.d}·{t.l}
                        </span>
                        <span className="data w-7 text-right text-xs text-dim">
                          {t.gd > 0 ? `+${t.gd}` : t.gd}
                        </span>
                        <span className="data w-5 text-right text-sm text-chalk">{t.pts}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      </section>

      {/* fortune */}
      <section className="mb-14">
        <h2 className="display mb-1 text-3xl font-semibold">The fortune table</h2>
        <p className="mb-5 text-sm text-dim">
          Every group-stage match replayed 10,000 times from its shots&apos; xG. Points above expectation
          is luck (or a keeper) — points below is a tournament that owes you an apology.
        </p>
        <div className="grid gap-x-8 gap-y-1.5 sm:grid-cols-2">
          {(() => {
            const luck = getLuck();
            const shown = [...luck.slice(0, 5), ...luck.slice(-5)];
            const max = Math.max(...shown.map((t) => Math.abs(t.delta)), 0.1);
            return shown.map((t) => (
              <Link
                key={t.abbr}
                href={`/team/${t.abbr}`}
                className="grid grid-cols-[auto_7.5rem_1fr_3rem] items-center gap-2 rounded px-1 py-0.5 text-sm transition-colors hover:bg-raised"
              >
                <img src={flagUrl(t.abbr)} alt="" width={20} height={14} className="rounded-[2px]" loading="lazy" />
                <span className="truncate text-dim">{t.name}</span>
                <span className="relative h-2 rounded-full bg-raised">
                  <span
                    className="absolute top-0 h-2 rounded-full"
                    style={{
                      left: t.delta >= 0 ? "50%" : `${50 - (Math.abs(t.delta) / max) * 50}%`,
                      width: `${(Math.abs(t.delta) / max) * 50}%`,
                      background: t.delta >= 0 ? "var(--gold)" : "var(--ember)",
                    }}
                  />
                </span>
                <span className={`data text-right text-xs ${t.delta >= 0 ? "text-gold" : "text-ember"}`}>
                  {t.delta > 0 ? `+${t.delta.toFixed(1)}` : t.delta.toFixed(1)}
                </span>
              </Link>
            ));
          })()}
        </div>
        <p className="mt-3 text-xs text-faint">
          Group stage only · actual points minus expected points · full methodology on{" "}
          <Link href="/map" className="text-gold underline-offset-4 hover:underline">the map</Link>.
        </p>
      </section>

      {/* bracket */}
      <section>
        <h2 className="display mb-1 text-3xl font-semibold">The road to the trophy</h2>
        <p className="mb-5 text-sm text-dim">
          Every knockout tie — open any match for formations, the xG shot map, heatmaps and player files.
        </p>
        <Bracket matches={matches} />
        <p className="mt-6 text-sm text-dim">
          Every fixture, group stage included —{" "}
          <Link href="/matches" className="text-gold underline-offset-4 hover:underline">
            All 104 matches →
          </Link>
        </p>
      </section>
    </main>
  );
}
