import Link from "next/link";
import { getHonours, OFFICIAL_EXTRAS, type Honour } from "@/lib/honours";
import { flagUrl } from "@/lib/flags";
import { tierColor } from "@/components/MiniCard";
import type { Card } from "@/lib/cards";

export const metadata = {
  title: "The honours — MUNDIAL·26",
  description: "Golden Boot, Golden Glove, Best XI and more — computed from the tournament's real data, not voted.",
};

function AwardPanel({ a }: { a: Honour }) {
  const [winner, ...runners] = a.rows;
  if (!winner) return null;
  const c = winner.card;
  return (
    <section className="rounded-lg border border-pitchline bg-surface p-5">
      <h2 className="display text-2xl font-semibold text-gold">{a.title}</h2>
      <p className="mb-4 mt-0.5 text-xs text-faint">{a.rule}</p>
      <Link href={`/player/${c.id}`} className="group flex items-center gap-4">
        <div className="h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-gold bg-raised">
          {c.photo && <img src={c.photo} alt="" className="h-full w-full object-cover object-top" />}
        </div>
        <div className="min-w-0">
          <p className="display truncate text-2xl font-bold text-chalk group-hover:text-gold">{c.name}</p>
          <p className="eyebrow mb-1 flex items-center gap-1.5">
            <img src={flagUrl(c.abbr)} alt="" width={14} height={14} className="rounded-[2px]" /> {c.team}
          </p>
          <p className="text-xs text-dim">{winner.line}</p>
        </div>
        <span className="data ml-auto rounded border border-gold px-2 py-1 text-2xl text-gold">{c.overall}</span>
      </Link>
      {a.official && (
        <p className="mt-3 rounded border border-gold/30 bg-raised px-3 py-2 text-xs">
          {a.official.matches ? (
            <span className="text-gold">✓ FIFA&apos;s official award went to the same player.</span>
          ) : (
            <span className="text-dim">
              FIFA&apos;s official (voted) winner:{" "}
              {a.official.card ? (
                <Link href={`/player/${a.official.card.id}`} className="text-gold hover:underline">
                  {a.official.card.name} ({a.official.card.overall})
                </Link>
              ) : (
                <span className="text-gold">{a.official.name}</span>
              )}{" "}
              — the data saw it differently.
            </span>
          )}
        </p>
      )}
      <ol className="mt-4 space-y-1.5 border-t border-pitchline pt-3">
        {runners.map((r, i) => (
          <li key={r.card.id}>
            <Link href={`/player/${r.card.id}`} className="grid grid-cols-[1.25rem_auto_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-sm hover:bg-raised">
              <span className="data text-faint">{i + 2}</span>
              <img src={flagUrl(r.card.abbr)} alt="" width={14} height={14} className="rounded-[2px]" />
              <span className="truncate text-dim">{r.card.name}</span>
              <span className="data text-xs text-faint">{r.line.split("·")[0]}</span>
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function BestXI({ xi }: { xi: Card[] }) {
  // 4-3-3 slots as percentages of a vertical pitch
  const slots = [
    { x: 50, y: 88 },
    { x: 14, y: 66 }, { x: 38, y: 70 }, { x: 62, y: 70 }, { x: 86, y: 66 },
    { x: 25, y: 44 }, { x: 50, y: 48 }, { x: 75, y: 44 },
    { x: 18, y: 18 }, { x: 50, y: 14 }, { x: 82, y: 18 },
  ];
  return (
    <div className="relative mx-auto aspect-[3/4] w-full max-w-2xl overflow-hidden rounded-lg border border-pitchline bg-surface">
      <svg viewBox="0 0 300 400" className="absolute inset-0 h-full w-full" aria-hidden>
        {Array.from({ length: 8 }, (_, i) => (
          <rect key={i} x={0} y={(i * 400) / 8} width={300} height={400 / 8}
            fill={i % 2 ? "var(--chalk)" : "none"} opacity={0.02} />
        ))}
        <g stroke="var(--chalk)" strokeOpacity={0.15} strokeWidth={1.5} fill="none">
          <rect x={1} y={1} width={298} height={398} />
          <line x1={0} y1={200} x2={300} y2={200} />
          <circle cx={150} cy={200} r={40} />
          <rect x={75} y={0} width={150} height={44} />
          <rect x={75} y={356} width={150} height={44} />
        </g>
      </svg>
      {xi.map((c, i) => {
        const s = slots[i];
        if (!s) return null;
        return (
          <Link
            key={c.id}
            href={`/player/${c.id}`}
            className="group absolute -translate-x-1/2 -translate-y-1/2 text-center"
            style={{ left: `${s.x}%`, top: `${s.y}%` }}
          >
            <div className="relative mx-auto h-16 w-16 sm:h-20 sm:w-20">
              <div className="h-full w-full overflow-hidden rounded-full border-2 bg-raised" style={{ borderColor: tierColor(c.tier) }}>
                {c.photo && <img src={c.photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" />}
              </div>
              <span className="data absolute -right-1.5 -top-1.5 rounded border bg-bg px-1 py-0.5 text-xs"
                style={{ color: tierColor(c.tier), borderColor: tierColor(c.tier) }}>
                {c.overall}
              </span>
            </div>
            <p className="display mt-1 max-w-24 truncate text-xs font-semibold text-chalk group-hover:text-gold sm:text-sm">
              {c.name}
            </p>
          </Link>
        );
      })}
    </div>
  );
}

export default function AwardsPage() {
  const { awards, xi, xiShape } = getHonours();
  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <h1 className="display mb-1 text-4xl font-bold">The honours</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        Our winners are computed straight from the tournament data — and checked against FIFA&apos;s
        official (voted) awards. The data and the jury agree on the Boot and the Glove; they argue
        about the rest. Open any winner for the receipts.
      </p>
      <div className="mb-4 grid gap-4 md:grid-cols-2">
        {awards.map((a) => <AwardPanel key={a.key} a={a} />)}
      </div>
      <p className="eyebrow mb-12">Also official: {OFFICIAL_EXTRAS}</p>
      <h2 className="display mb-1 text-3xl font-semibold">Team of the tournament</h2>
      <p className="mb-5 text-sm text-dim">
        The best XI by card overall in a {xiShape} — minimum 300 minutes played.
      </p>
      <BestXI xi={xi} />
    </main>
  );
}
