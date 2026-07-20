import { flagUrl } from "@/lib/flags";
import type { Card } from "@/lib/cards";
import HoloCard from "./HoloCard";

const FRAMES = {
  gold: { edge: "linear-gradient(160deg,#8a6d1f,#e9d18a 30%,#caa53d 55%,#f3e3ab 80%,#8a6d1f)", num: "var(--gold)" },
  silver: { edge: "linear-gradient(160deg,#5a6b5c,#dfe6dc 30%,#9fb0a0 55%,#eef2e9 80%,#5a6b5c)", num: "var(--chalk)" },
  bronze: { edge: "linear-gradient(160deg,#5e4326,#c9995f 30%,#8f6a3c 55%,#d8b083 80%,#5e4326)", num: "#d8b083" },
};

/** MUNDIAL·26 data card — every number is a tournament percentile from real data */
export default function PlayerCard({ card, size = "lg", vtName }: { card: Card; size?: "lg" | "sm"; vtName?: string }) {
  const f = FRAMES[card.tier];
  const big = size === "lg";
  return (
    <HoloCard tier={card.tier}>
    <div
      className={`relative rounded-2xl p-[3px] ${big ? "w-[320px]" : "w-[240px]"}`}
      style={{ background: f.edge, boxShadow: "0 20px 60px -20px rgba(0,0,0,.8)" }}
    >
      <div className="relative overflow-hidden rounded-[13px] px-5 pb-4 pt-5"
        style={{ background: "linear-gradient(175deg,#12241a 0%,#0a150e 45%,#050d08 100%)" }}>
        {/* chalk pitch watermark */}
        <svg viewBox="0 0 300 460" className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]" aria-hidden>
          <circle cx={150} cy={230} r={70} fill="none" stroke="var(--chalk)" strokeWidth={2} />
          <line x1={0} y1={230} x2={300} y2={230} stroke="var(--chalk)" strokeWidth={2} />
          <rect x={60} y={-2} width={180} height={70} fill="none" stroke="var(--chalk)" strokeWidth={2} />
          <rect x={60} y={392} width={180} height={70} fill="none" stroke="var(--chalk)" strokeWidth={2} />
        </svg>

        {/* head row: overall/pos/flag vs photo */}
        <div className="relative flex items-start justify-between">
          <div>
            <p className={`ovr display font-bold leading-none ${big ? "text-6xl" : "text-4xl"}`} style={{ color: f.num }}>
              {card.overall}
            </p>
            <p className="eyebrow mt-1">{card.pos}</p>
            <img src={flagUrl(card.abbr)} alt={card.team} width={big ? 34 : 26} height={big ? 34 : 26}
              className="mt-2 rounded-[3px]" loading="lazy" />
          </div>
          <div className={`overflow-hidden rounded-full border-2 ${big ? "h-36 w-36" : "h-24 w-24"}`}
            style={{ borderColor: f.num, background: "var(--raised)", ...(vtName ? { viewTransitionName: vtName } : {}) }}>
            {card.photo ? (
              <img src={card.photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
            ) : (
              <div className="display flex h-full w-full items-center justify-center text-3xl text-faint">
                {card.abbr}
              </div>
            )}
          </div>
        </div>

        {/* name */}
        <div className="relative mt-4 border-y py-1.5 text-center" style={{ borderColor: `color-mix(in oklab, ${f.num} 40%, transparent)` }}>
          <p className={`display font-bold tracking-wide text-chalk ${big ? "text-2xl" : "text-lg"} truncate`}>
            {card.name}
          </p>
          <p className="eyebrow">{card.team} · {card.matches} matches</p>
        </div>

        {/* six stats, each with its percentile micro-bar — the tell that this is data, not vibes */}
        <div className={`relative mt-3 grid grid-cols-2 gap-x-6 ${big ? "gap-y-2.5" : "gap-y-1.5"}`}>
          {card.stats.map((s) => (
            <div key={s.key}>
              <div className="flex items-baseline justify-between">
                <span className={`statnum data ${big ? "text-xl" : "text-base"}`} style={{ color: s.val >= 85 ? f.num : "var(--chalk)" }}>
                  {s.val}
                </span>
                <span className="display text-sm font-semibold text-dim">{s.key}</span>
              </div>
              <div className="mt-0.5 h-[3px] rounded-full bg-raised">
                <div className="statbar h-[3px] origin-left rounded-full" style={{ width: `${((s.val - 40) / 59) * 100}%`, background: f.num, opacity: 0.85 }} />
              </div>
            </div>
          ))}
        </div>

        <p className="eyebrow relative mt-4 text-center opacity-70">Mundial·26 · real-data card</p>
      </div>
    </div>
    </HoloCard>
  );
}
