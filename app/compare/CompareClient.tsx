"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { flagUrl } from "@/lib/flags";

export type CmpCard = {
  id: string;
  name: string;
  team: string;
  abbr: string;
  pos: string;
  overall: number;
  tier: string;
  photo: string | null;
  stats: { key: string; val: number }[];
};

const tone = (t: string) => (t === "gold" ? "var(--gold)" : t === "silver" ? "var(--chalk)" : "#d8b083");

function Picker({ cards, value, onPick, label }: {
  cards: CmpCard[]; value: CmpCard | null; onPick: (c: CmpCard) => void; label: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const hits = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return cards.filter((c) => c.name.toLowerCase().includes(needle) || c.team.toLowerCase().includes(needle)).slice(0, 8);
  }, [cards, q]);
  return (
    <div className="relative">
      <label className="eyebrow mb-1 block">{label}</label>
      <input
        type="search"
        value={open ? q : value ? `${value.name} (${value.team})` : q}
        onFocus={() => { setOpen(true); setQ(""); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search a player…"
        className="w-full rounded border border-pitchline bg-surface px-3 py-2 text-sm text-chalk placeholder:text-faint focus:border-gold focus:outline-none"
      />
      {open && hits.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded border border-pitchline bg-raised shadow-xl">
          {hits.map((c) => (
            <li key={c.id}>
              <button
                onMouseDown={() => { onPick(c); setOpen(false); }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-dim hover:bg-surface hover:text-chalk"
              >
                <img src={flagUrl(c.abbr)} alt="" width={14} height={14} className="rounded-[2px]" />
                <span className="text-chalk">{c.name}</span>
                <span className="text-faint">{c.team} · {c.pos}</span>
                <span className="data ml-auto" style={{ color: tone(c.tier) }}>{c.overall}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Radar({ a, b }: { a: CmpCard; b: CmpCard }) {
  // same six axes only when positions share a stat set; GK vs outfield falls back to A's keys
  const keys = a.stats.map((s) => s.key);
  const C = 140, R = 105;
  const pt = (i: number, v: number) => {
    const ang = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
    const r = ((v - 40) / 59) * R;
    return `${C + Math.cos(ang) * r},${C + Math.sin(ang) * r}`;
  };
  const poly = (c: CmpCard) =>
    keys.map((k, i) => pt(i, c.stats.find((s) => s.key === k)?.val ?? 40)).join(" ");
  return (
    <svg viewBox="0 0 280 280" className="mx-auto w-full max-w-[340px]" aria-label="stat radar">
      {[0.33, 0.66, 1].map((f) => (
        <polygon key={f}
          points={keys.map((_, i) => { const ang = (Math.PI * 2 * i) / keys.length - Math.PI / 2; return `${C + Math.cos(ang) * R * f},${C + Math.sin(ang) * R * f}`; }).join(" ")}
          fill="none" stroke="var(--line)" strokeWidth={1} />
      ))}
      <polygon points={poly(a)} fill="var(--gold)" fillOpacity={0.18} stroke="var(--gold)" strokeWidth={2} />
      <polygon points={poly(b)} fill="var(--chalk)" fillOpacity={0.12} stroke="var(--chalk)" strokeWidth={2} strokeDasharray="5 3" />
      {keys.map((k, i) => {
        const ang = (Math.PI * 2 * i) / keys.length - Math.PI / 2;
        return (
          <text key={k} x={C + Math.cos(ang) * (R + 18)} y={C + Math.sin(ang) * (R + 18) + 4}
            textAnchor="middle" fontSize={12} fill="var(--dim)" className="display">
            {k}
          </text>
        );
      })}
    </svg>
  );
}

function Side({ c, accent }: { c: CmpCard; accent: string }) {
  return (
    <div className="rounded-lg border border-pitchline bg-surface p-4 text-center">
      <div className="mx-auto h-24 w-24 overflow-hidden rounded-full border-2" style={{ borderColor: accent }}>
        {c.photo ? <img src={c.photo} alt="" className="h-full w-full object-cover object-top" /> :
          <div className="display flex h-full w-full items-center justify-center bg-raised text-faint">{c.abbr}</div>}
      </div>
      <p className="display mt-2 text-xl font-bold text-chalk">{c.name}</p>
      <p className="eyebrow">{c.team} · {c.pos}</p>
      <p className="data mt-1 text-3xl" style={{ color: tone(c.tier) }}>{c.overall}</p>
    </div>
  );
}

export default function CompareClient({ cards }: { cards: CmpCard[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const [a, setA] = useState<CmpCard | null>(null);
  const [b, setB] = useState<CmpCard | null>(null);

  useEffect(() => {
    setA(byId.get(params.get("a") ?? "") ?? null);
    setB(byId.get(params.get("b") ?? "") ?? null);
  }, [params, byId]);

  const pick = (slot: "a" | "b") => (c: CmpCard) => {
    const next = new URLSearchParams(params.toString());
    next.set(slot, c.id);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  return (
    <div>
      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <Picker cards={cards} value={a} onPick={pick("a")} label="Player one — solid gold" />
        <Picker cards={cards} value={b} onPick={pick("b")} label="Player two — dashed chalk" />
      </div>

      {a && b ? (
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_auto_1fr]">
          <Side c={a} accent="var(--gold)" />
          <div className="rounded-lg border border-pitchline bg-surface p-4">
            <Radar a={a} b={b} />
            <div className="mt-2 space-y-1.5">
              {a.stats.map((s) => {
                const bv = b.stats.find((x) => x.key === s.key)?.val ?? 0;
                return (
                  <div key={s.key} className="grid grid-cols-[3rem_1fr_3rem] items-center gap-2 text-sm">
                    <span className="data text-right" style={{ color: s.val >= bv ? "var(--gold)" : "var(--dim)" }}>{s.val}</span>
                    <span className="display text-center text-xs text-faint">{s.key}</span>
                    <span className="data" style={{ color: bv >= s.val ? "var(--chalk)" : "var(--dim)" }}>{bv}</span>
                  </div>
                );
              })}
            </div>
          </div>
          <Side c={b} accent="var(--chalk)" />
        </div>
      ) : (
        <p className="rounded-lg border border-pitchline bg-surface p-10 text-center text-sm text-faint">
          Pick two players to settle the argument. Tip: the URL updates, so you can share the comparison.
        </p>
      )}
    </div>
  );
}
