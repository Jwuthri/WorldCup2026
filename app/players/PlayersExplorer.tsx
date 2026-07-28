"use client";

import { useMemo, useState } from "react";
import MiniCard from "@/components/MiniCard";

export type SlimCard = {
  id: string;
  name: string;
  team: string;
  abbr: string;
  pos: string;
  overall: number;
  tier: string;
  photo: string | null;
  flag: string;
};

const POSITIONS = ["GK", "DEF", "MID", "ATT"] as const;

export default function PlayersExplorer({ cards, base = "" }: { cards: SlimCard[]; base?: string }) {
  const [q, setQ] = useState("");
  const [pos, setPos] = useState<string | null>(null);
  const [shown, setShown] = useState(60);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return cards.filter(
      (c) =>
        (!pos || c.pos === pos) &&
        (!needle || c.name.toLowerCase().includes(needle) || c.team.toLowerCase().includes(needle))
    );
  }, [cards, q, pos]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setShown(60); }}
          placeholder="Search a player or nation…"
          aria-label="Search players"
          className="w-72 rounded border border-pitchline bg-surface px-3 py-2 text-sm text-chalk placeholder:text-faint focus:border-gold focus:outline-none"
        />
        <div className="flex gap-1 rounded-md border border-pitchline bg-surface p-1">
          {POSITIONS.map((p) => (
            <button
              key={p}
              onClick={() => { setPos(pos === p ? null : p); setShown(60); }}
              aria-pressed={pos === p}
              className={`display rounded px-3 py-1 text-sm font-semibold ${pos === p ? "bg-raised text-gold" : "text-dim hover:text-chalk"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <p className="eyebrow ml-auto">{filtered.length} players · ranked by overall</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {filtered.slice(0, shown).map((c) => (
          <MiniCard key={c.id} c={c} base={base} badge={c.flag} />
        ))}
      </div>

      {filtered.length > shown && (
        <div className="mt-8 text-center">
          <button
            onClick={() => setShown(shown + 120)}
            className="display rounded border border-pitchline bg-surface px-6 py-2 font-semibold text-dim hover:border-gold/60 hover:text-chalk"
          >
            Show more ({filtered.length - shown} left)
          </button>
        </div>
      )}
    </div>
  );
}
