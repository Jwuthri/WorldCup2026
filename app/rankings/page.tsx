import Link from "next/link";
import { getPowerRankings, getUpsets, TIER_LABEL, type RankRow } from "@/lib/rankings";
import { flagUrl } from "@/lib/flags";

export const metadata = {
  title: "Power Rankings — MUNDIAL·26",
  description:
    "All 48 teams by World Football Elo, against how far they actually got — the overachievers, the flops, and every Elo upset of the tournament.",
};

// tier -> text colour + weight
const tierStyle = (tier: number): { color: string; strong?: boolean } => {
  if (tier >= 7) return { color: "var(--gold)", strong: true };
  if (tier >= 6) return { color: "var(--gold)" };
  if (tier >= 4) return { color: "var(--chalk)" };
  if (tier >= 2) return { color: "var(--dim)" };
  return { color: "var(--ember)" };
};

function Delta({ d }: { d: number }) {
  if (d > 0) return <span className="data text-gold">▲ +{d}</span>;
  if (d < 0) return <span className="data text-ember">▼ {d}</span>;
  return <span className="data text-faint">— 0</span>;
}

function MoverCard({ row, kind }: { row: RankRow; kind: "over" | "under" }) {
  return (
    <Link
      href={`/team/${row.abbr}`}
      className="flex items-center gap-3 rounded-lg border border-pitchline bg-surface p-3 transition-colors hover:border-gold/60"
    >
      <img src={flagUrl(row.abbr)} alt="" width={28} height={28} className="rounded-[3px]" loading="lazy" />
      <div className="min-w-0 grow">
        <p className="display truncate text-base font-semibold leading-tight">{row.name}</p>
        <p className="text-xs text-dim">
          seeded <span className="data">#{row.seed}</span> · reached{" "}
          <span className="data" style={{ color: tierStyle(row.tier).color }}>{TIER_LABEL[row.tier]}</span>
        </p>
      </div>
      <span className={`data text-xl ${kind === "over" ? "text-gold" : "text-ember"}`}>
        {row.delta > 0 ? `+${row.delta}` : row.delta}
      </span>
    </Link>
  );
}

export default function RankingsPage() {
  const rows = getPowerRankings();
  const upsets = getUpsets();
  const eloMin = Math.min(...rows.map((r) => r.elo));
  const eloMax = Math.max(...rows.map((r) => r.elo));
  const barW = (elo: number) => 8 + ((elo - eloMin) / (eloMax - eloMin)) * 92;

  // rounds-delta ties are common: break them toward the bigger story
  // seeds 1-2 can only "overachieve" by winning the final they were expected to reach — not that story
  const overs = rows.filter((r) => r.seed > 2)
    .sort((a, b) => b.delta - a.delta || b.tier - a.tier || b.seed - a.seed).slice(0, 5); // deeper run, then deeper underdog
  const unders = [...rows].sort((a, b) => a.delta - b.delta || a.seed - b.seed).slice(0, 5); // bigger name first

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      {/* hero */}
      <p className="eyebrow mb-3">World Football Elo · post-final ratings</p>
      <h1 className="display text-4xl font-bold sm:text-5xl">Power Rankings</h1>
      <p className="mt-2 max-w-2xl text-sm text-dim">
        The 48 teams by their world Elo rating, set against how far they actually got. The gap
        between where a side was <span className="text-chalk">seeded</span> and where it{" "}
        <span className="text-chalk">finished</span> is the story — who punched above their rating,
        and who went home early with a great one.
      </p>

      {/* movers */}
      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div>
          <h2 className="display mb-1 text-2xl font-semibold text-gold">Overachievers</h2>
          <p className="mb-3 text-sm text-dim">Finished far above their seed.</p>
          <div className="space-y-2">
            {overs.map((r) => <MoverCard key={r.abbr} row={r} kind="over" />)}
          </div>
        </div>
        <div>
          <h2 className="display mb-1 text-2xl font-semibold text-ember">Fell short</h2>
          <p className="mb-3 text-sm text-dim">Strong on paper, home too soon.</p>
          <div className="space-y-2">
            {unders.map((r) => <MoverCard key={r.abbr} row={r} kind="under" />)}
          </div>
        </div>
      </section>

      {/* the full board */}
      <section className="mt-14">
        <h2 className="display mb-1 text-3xl font-semibold">The board</h2>
        <p className="mb-5 text-sm text-dim">
          All 48, ranked by Elo. Bar is the rating; the badge is measured in <span className="text-chalk">rounds</span> vs
          what the seed expected (seeds 1–2 should make the final, 3–4 the semis, 5–8 the quarters…) —{" "}
          <span className="text-gold">▲ went further</span>,{" "}
          <span className="text-ember">▼ fell short</span>.
        </p>
        <div className="overflow-x-auto rounded-lg border border-pitchline bg-surface">
          <div className="min-w-[640px]">
            <div className="grid grid-cols-[2.5rem_1.6rem_1fr_5rem_1.6fr_7rem_4rem] items-center gap-3 border-b border-pitchline px-4 py-2">
              {["Seed", "", "Team", "Elo", "Rating", "Finish", "±"].map((h, i) => (
                <span key={i} className="eyebrow">{h}</span>
              ))}
            </div>
            {rows.map((r) => {
              const ts = tierStyle(r.tier);
              return (
                <Link
                  key={r.abbr}
                  href={`/team/${r.abbr}`}
                  className="grid grid-cols-[2.5rem_1.6rem_1fr_5rem_1.6fr_7rem_4rem] items-center gap-3 border-b border-pitchline/50 px-4 py-2 text-sm transition-colors last:border-0 hover:bg-raised"
                >
                  <span className="data text-faint">{r.seed}</span>
                  <img src={flagUrl(r.abbr)} alt="" width={20} height={20} className="rounded-[2px]" loading="lazy" />
                  <span className={`truncate ${r.champion ? "font-semibold text-gold" : "text-chalk"}`}>
                    {r.name}
                    {r.champion && <span className="ml-1.5 text-xs">★</span>}
                  </span>
                  <span className="data text-dim">{r.elo}</span>
                  <span className="h-1.5 rounded-full bg-raised">
                    <span className="block h-1.5 rounded-full bg-gold" style={{ width: `${barW(r.elo)}%`, opacity: 0.4 + (r.elo - eloMin) / (eloMax - eloMin) * 0.6 }} />
                  </span>
                  <span className="data text-xs" style={{ color: ts.color, fontWeight: ts.strong ? 600 : 400 }}>
                    {TIER_LABEL[r.tier]}
                  </span>
                  <Delta d={r.delta} />
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* upsets */}
      <section className="mt-14">
        <h2 className="display mb-1 text-3xl font-semibold">Biggest upsets</h2>
        <p className="mb-5 text-sm text-dim">
          Every knockout result where the lower-rated side won, ranked by the Elo gap they overturned.
        </p>
        <div className="space-y-2">
          {upsets.slice(0, 10).map((u, i) => (
            <Link
              key={u.matchId}
              href={`/match/${u.matchId}`}
              className="grid grid-cols-[2rem_auto_1fr_auto] items-center gap-3 rounded-lg border border-pitchline bg-surface px-4 py-2.5 text-sm transition-colors hover:border-gold/60"
            >
              <span className="data text-lg text-gold">{u.gap}</span>
              <img src={flagUrl(u.winnerAbbr)} alt="" width={22} height={22} className="rounded-[2px]" loading="lazy" />
              <span className="min-w-0 truncate">
                <span className="font-semibold text-chalk">{u.winner}</span>
                <span className="text-dim"> beat </span>
                <span className="text-dim">{u.loser}</span>
                <span className="data ml-1.5 text-chalk">{u.score}</span>
              </span>
              <span className="eyebrow hidden text-right sm:block">{u.stage}</span>
            </Link>
          ))}
        </div>
        <p className="mt-3 text-xs text-faint">
          Elo gap = the losing side&apos;s rating minus the winner&apos;s. Higher = bigger shock.
          Penalty-shootout wins count — the side that advanced is the winner.
        </p>
      </section>
    </main>
  );
}
