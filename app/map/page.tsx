import Link from "next/link";
import { getMl, mapPoints, archetypes, styleFamilies } from "@/lib/ml";
import { flagUrl } from "@/lib/flags";
import MapClient, { CLUSTER_COLORS } from "./MapClient";

export const metadata = {
  title: "The map — MUNDIAL·26",
  description:
    "Every player in the World Cup clustered by playing style — k-means archetypes on real tracking data, plus our own xG model vs FIFA's.",
};

export default function MapPage() {
  const ml = getMl();
  const points = mapPoints();
  const arch = archetypes();
  if (!ml || !points.length || !arch.length)
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <h1 className="display text-4xl font-bold">The map</h1>
        <p className="mt-2 text-sm text-dim">No ML data yet — run <code className="data">npm run ml</code> and reload.</p>
      </main>
    );

  const counts = new Map<number, number>();
  const exemplars = new Map<number, typeof points>();
  for (const p of points) counts.set(p.cluster, (counts.get(p.cluster) ?? 0) + 1);
  for (const a of arch)
    exemplars.set(
      a.id,
      points.filter((p) => p.cluster === a.id).sort((x, y) => y.overall - x.overall).slice(0, 3)
    );
  const xg = ml.xgModel;
  const maxBar = Math.max(...xg.calib.map((c) => Math.max(c.fifa, c.ours, c.scored)));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <p className="eyebrow mb-3">machine learning · k-means + t-SNE, seed 26</p>
      <h1 className="display mb-3 text-5xl font-bold leading-none">The map of the tournament</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        All {points.length} outfielders who played real minutes, reduced to a map: players who do
        the same things on the pitch sit close together, whatever their shirt says. Eight style
        tribes fall out of the clustering — no human drew these borders.
      </p>

      <MapClient points={points} archetypes={arch} />

      {/* archetype cards */}
      <section className="mt-12">
        <h2 className="display mb-1 text-3xl font-semibold">The eight tribes</h2>
        <p className="mb-5 text-sm text-dim">Labels are ours; the groupings are the algorithm&apos;s. Top cards per tribe:</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {arch.map((a) => (
            <div key={a.id} className="rounded-lg border border-pitchline bg-surface p-4">
              <p className="display text-lg font-semibold" style={{ color: CLUSTER_COLORS[a.id] }}>
                {a.label} <span className="data text-xs text-faint">×{counts.get(a.id) ?? 0}</span>
              </p>
              <p className="mt-1 min-h-10 text-xs text-dim">{a.blurb}</p>
              <div className="mt-2 space-y-1">
                {(exemplars.get(a.id) ?? []).map((p) => (
                  <Link key={p.id} href={`/player/${p.id}`} className="flex items-center gap-2 text-sm text-dim hover:text-chalk">
                    <img src={flagUrl(p.abbr)} alt="" width={16} height={16} className="rounded-[2px]" loading="lazy" />
                    <span className="truncate">{p.name}</span>
                    <span className="data ml-auto text-gold">{p.overall}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* team style families */}
      <section className="mt-12">
        <h2 className="display mb-1 text-3xl font-semibold">Four ways to play a World Cup</h2>
        <p className="mb-5 text-sm text-dim">The same clustering on the 48 teams&apos; per-match identity.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {styleFamilies().map((s) => (
            <div key={s.label} className="rounded-lg border border-pitchline bg-surface p-4">
              <p className="display text-lg font-semibold text-gold">{s.label}</p>
              <p className="mt-1 min-h-10 text-xs text-dim">{s.blurb}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.teams.map((t) => (
                  <Link key={t.abbr} href={`/team/${t.abbr}`} title={t.name}>
                    <img src={flagUrl(t.abbr)} alt={t.name} width={22} height={16} className="rounded-[2px] opacity-80 transition-opacity hover:opacity-100" loading="lazy" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* xG model */}
      <section className="mt-12 max-w-3xl">
        <h2 className="display mb-1 text-3xl font-semibold">We trained our own xG — and lost</h2>
        <p className="mb-5 text-sm text-dim">
          A logistic regression on shot geometry alone (distance, angle, header, penalty —{" "}
          {xg.n.toLocaleString("en-US")} shots). It tracks FIFA&apos;s Hawk-Eye xG closely on ordinary
          chances, then falls apart on big ones: geometry can&apos;t see an open net or a one-on-one.
          The gap in the last rows is what player-tracking data is worth.
        </p>
        <div className="space-y-2">
          <div className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2 text-[10px] text-faint">
            <span>FIFA xG range</span>
            <span>
              <span className="text-gold">■ FIFA</span> · <span style={{ color: "#5ea8ef" }}>■ ours</span> ·{" "}
              <span className="text-chalk">■ actually scored</span>
            </span>
            <span className="text-right">shots</span>
          </div>
          {xg.calib.map((c) => (
            <div key={c.range} className="grid grid-cols-[5.5rem_1fr_3rem] items-center gap-2">
              <span className="data text-xs text-dim">{c.range}</span>
              <div className="space-y-0.5">
                {[
                  ["var(--gold)", c.fifa],
                  ["#5ea8ef", c.ours],
                  ["var(--chalk)", c.scored],
                ].map(([color, v], i) => (
                  <div key={i} className="h-1.5 rounded-full bg-raised">
                    <div className="h-1.5 rounded-full" style={{ width: `${(Number(v) / maxBar) * 100}%`, background: String(color) }} />
                  </div>
                ))}
              </div>
              <span className="data text-right text-xs text-faint">{c.n}</span>
            </div>
          ))}
        </div>
        <h3 className="eyebrow mb-2 mt-8">Where the models argue loudest</h3>
        <div className="space-y-1 text-sm">
          {xg.disagreements.map((d, i) => (
            <div key={i} className="flex items-baseline gap-2 rounded border border-pitchline bg-surface px-3 py-1.5">
              <span className="text-dim">{d.player}</span>
              <span className="data text-xs text-faint">{d.minute}&apos;</span>
              <span className="data ml-auto text-xs">
                <span className="text-gold">FIFA {d.fifa.toFixed(2)}</span>{" "}
                <span style={{ color: "#5ea8ef" }}>ours {d.ours.toFixed(2)}</span>
              </span>
              <span className={`data text-xs ${d.goal ? "text-gold" : "text-faint"}`}>{d.goal ? "⚽ scored" : "missed"}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
