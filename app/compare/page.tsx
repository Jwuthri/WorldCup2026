import { Suspense } from "react";
import Link from "next/link";
import { getCards } from "@/lib/cards";
import { getCalendar, getMatchBundle } from "@/lib/data";
import { getRates, simulate, getBacktest } from "@/lib/sim";
import { playerTerritory, hasHeat } from "@/lib/heatmap";
import Heatmap from "@/components/Heatmap";
import PlayerShotDuel, { type DuelShot } from "@/components/PlayerShotDuel";
import CompareClient, { type CmpCard } from "./CompareClient";
import TeamPicker from "./TeamPicker";
import ProbBar from "./ProbBar";

/* ---- one player's every tournament shot, joined by FIFA id ---- */
function shotsOf(c: CmpCard | undefined): DuelShot[] {
  if (!c) return [];
  const out: DuelShot[] = [];
  for (const m of getCalendar()) {
    const side = m.home.abbr === c.abbr ? "home" : m.away.abbr === c.abbr ? "away" : null;
    if (!side) continue;
    const b = getMatchBundle(m.id);
    if (!b) continue;
    const opp = side === "home" ? m.away.name : m.home.name;
    for (const s of b.shots)
      if (s.team === side && s.playerFifaId === c.id)
        out.push({ x: s.x, y: s.y, xg: s.xg ?? 0, outcome: s.outcome, minute: s.minute, opp });
  }
  return out;
}

export const metadata = {
  title: "Compare players — MUNDIAL·26",
  description: "Two real-data World Cup cards side by side — and the rematch machine: who would win any hypothetical matchup.",
};

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ ta?: string; tb?: string; a?: string; b?: string }>;
}) {
  const cards: CmpCard[] = [...getCards().values()]
    .sort((x, y) => y.overall - x.overall)
    .map((c) => ({
      id: c.id, name: c.name, team: c.team, abbr: c.abbr, pos: c.pos,
      overall: c.overall, tier: c.tier, photo: c.photo,
      stats: c.stats.map((s) => ({ key: s.key, val: s.val })),
    }));

  // ---- the rematch machine ----
  const rates = getRates();
  const { ta: taRaw, tb: tbRaw, a: aId, b: bId } = await searchParams;
  const cA = cards.find((c) => c.id === aId);
  const cB = cards.find((c) => c.id === bId);
  const ta = rates.has(taRaw?.toUpperCase() ?? "") ? taRaw!.toUpperCase() : "FRA";
  const tb = rates.has(tbRaw?.toUpperCase() ?? "") ? tbRaw!.toUpperCase() : "ARG";
  const A = rates.get(ta)!, B = rates.get(tb)!;
  const sim = ta === tb ? null : simulate(A, B);
  const backtest = getBacktest();
  const teams = [...rates.values()].map((t) => ({ abbr: t.abbr, name: t.name })).sort((a, b) => a.name.localeCompare(b.name));
  const met = getCalendar().find(
    (m) => (m.home.abbr === ta && m.away.abbr === tb) || (m.home.abbr === tb && m.away.abbr === ta)
  );
  const pct = (p: number) => `${Math.round(p * 100)}%`;

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <h1 className="display mb-1 text-4xl font-bold">Compare</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        Two cards, one radar, zero opinions. Gold is player one, chalk is player two.
      </p>
      <Suspense>
        <CompareClient cards={cards} />
      </Suspense>

      {/* same pitch: both players' territory and shots, overlaid */}
      {cA && cB && cA.id !== cB.id && (() => {
        const gA = playerTerritory(cA.id);
        const gB = playerTerritory(cB.id);
        const sA = shotsOf(cA);
        const sB = shotsOf(cB);
        if (!(hasHeat(gA) && hasHeat(gB)) && !sA.length && !sB.length) return null;
        return (
          <section className="mt-12">
            <h2 className="display mb-1 text-2xl font-semibold">Same pitch, no excuses</h2>
            <p className="mb-4 max-w-2xl text-sm text-dim">
              <span className="text-gold">{cA.name}</span> and{" "}
              <span className="text-chalk">{cB.name}</span>, tournament totals on one pitch —
              both attacking left to right. Where the colors overlap, they wanted the same ground.
            </p>
            <div className="grid items-start gap-6 lg:grid-cols-2">
              {hasHeat(gA) && hasHeat(gB) && (
                <div className="rounded-lg border border-pitchline bg-surface p-4">
                  <p className="eyebrow mb-2">where they lived — field presence, all matches</p>
                  <Heatmap
                    label={`territory overlay: ${cA.name} vs ${cB.name}`}
                    layers={[
                      { grid: gA, color: "var(--gold)" },
                      { grid: gB, color: "var(--chalk)" },
                    ]}
                  />
                </div>
              )}
              {(sA.length > 0 || sB.length > 0) && (
                <div className="rounded-lg border border-pitchline bg-surface p-4">
                  <p className="eyebrow mb-2">every shot of their tournament</p>
                  <PlayerShotDuel
                    a={{ name: cA.name, color: "var(--gold)", shots: sA }}
                    b={{ name: cB.name, color: "var(--chalk)", shots: sB }}
                  />
                </div>
              )}
            </div>
          </section>
        );
      })()}

      {/* the rematch machine */}
      <section className="mt-16 border-t border-pitchline pt-10">
        <p className="eyebrow mb-2">the rematch machine · 10,000 simulations</p>
        <h2 className="display mb-1 text-3xl font-semibold">Who would have won?</h2>
        <p className="mb-5 max-w-2xl text-sm text-dim">
          Any two teams, simulated from what they actually did this tournament — xG created and
          conceded per match, sharpened by Elo. Not destiny, just the odds.
        </p>

        <Suspense>
          <TeamPicker teams={teams} ta={ta} tb={tb} />
        </Suspense>

        {sim ? (
          <div className="mt-6 max-w-2xl">
            {/* probability bar — springs to the odds when the matchup changes */}
            <ProbBar key={`${ta}-${tb}`} aName={A.name} bName={B.name} pA={sim.pA} pDraw={sim.pDraw} pB={sim.pB} />

            <p className="mt-4 text-sm text-dim">
              In a knockout tie, <span className="text-chalk">{sim.koA >= 0.5 ? A.name : B.name}</span> goes
              through <span className="data text-gold">{pct(Math.max(sim.koA, sim.koB))}</span> of the time
              (extra time at a third of the rate, penalties a coin flip).
            </p>

            <div className="mt-5 grid gap-6 sm:grid-cols-2">
              <div>
                <h3 className="eyebrow mb-2">Most likely scorelines</h3>
                <div className="space-y-1.5">
                  {sim.topScores.map((s, i) => (
                    <div key={i} className="flex items-baseline gap-3 rounded border border-pitchline bg-surface px-3 py-1.5 text-sm">
                      <span className="data text-lg text-chalk">{s.a}:{s.b}</span>
                      <span className="text-xs text-dim">{A.abbr} {s.a} — {B.abbr} {s.b}</span>
                      <span className="data ml-auto text-xs text-gold">{(s.p * 100).toFixed(1)}%</span>
                    </div>
                  ))}
                </div>
                <p className="mt-3 text-xs text-faint">
                  Expected goals: {A.abbr} {sim.lambdaA.toFixed(2)} · {B.abbr} {sim.lambdaB.toFixed(2)}
                </p>
              </div>

              <div>
                <h3 className="eyebrow mb-2">Every scoreline</h3>
                <div className="inline-grid grid-cols-[auto_repeat(6,1.9rem)] gap-0.5 text-center">
                  <span />
                  {[0, 1, 2, 3, 4, "5+"].map((g) => (
                    <span key={`c${g}`} className="data text-[10px] leading-6 text-faint">{g}</span>
                  ))}
                  {sim.matrix.flatMap((row, i) => [
                    <span key={`r${i}`} className="data pr-1.5 text-right text-[10px] leading-7 text-faint">
                      {i === 5 ? "5+" : i}
                    </span>,
                    ...row.map((p, j) => (
                      <span
                        key={`${i}-${j}`}
                        title={`${A.abbr} ${i} — ${B.abbr} ${j}: ${(p * 100).toFixed(1)}%`}
                        className="data h-7 rounded-[3px] leading-7 text-[10px]"
                        style={{
                          background: `color-mix(in oklab, var(--gold) ${Math.min(p * 420, 100)}%, var(--surface))`,
                          color: p > 0.12 ? "var(--bg)" : "var(--dim)",
                        }}
                      >
                        {p >= 0.02 ? Math.round(p * 100) : ""}
                      </span>
                    )),
                  ])}
                </div>
                <p className="mt-1.5 text-xs text-faint">{A.abbr} down the side, {B.abbr} across the top, cells in %.</p>
              </div>
            </div>

            {met && (
              <p className="mt-5 rounded border border-gold/30 bg-surface px-3 py-2 text-sm text-dim">
                They actually met:{" "}
                <Link href={`/match/${met.id}`} className="text-gold underline-offset-4 hover:underline">
                  {met.home.name} {met.home.score}:{met.away.score} {met.away.name}
                  {met.penHome != null ? ` (${met.penHome}-${met.penAway} pens)` : met.resultType === 3 ? " a.e.t." : ""} · {met.stage} →
                </Link>
              </p>
            )}

            <p className="mt-5 text-xs text-faint">
              Method: Poisson goals from tournament xG for/against per match vs the field average,
              Elo-adjusted. Backtested on all {backtest.n} real matches, the model&apos;s favourite
              90&apos;-outcome happened {backtest.hit}% of the time (in-sample; draws are hard).
              Form only — no lineups, no injuries, no narratives.
            </p>
          </div>
        ) : (
          <p className="mt-6 text-sm text-faint">Pick two different teams.</p>
        )}
      </section>
    </main>
  );
}
