"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import type { TribeMember } from "@/lib/ml";

// palette carried over from the retired scatter (tuned for the dark surface)
export const TRIBE_COLORS = [
  "#ef7050", // 0 ball hunters
  "#6aa8f7", // 1 ball-playing anchors
  "#e8c15c", // 2 box predators
  "#4fd6a0", // 3 touchline burners
  "#b195f5", // 4 midfield metronomes
  "#f584bd", // 5 dead-ball architects
  "#b3cf58", // 6 quiet engines
  "#52c5dd", // 7 chaos dribblers
];

type Tribe = { id: number; label: string; blurb: string; traits?: string[] };

function Face({ p, size, color }: { p: TribeMember; size: number; color: string }) {
  return p.photo ? (
    <span
      className="block shrink-0 overflow-hidden rounded-full bg-raised"
      style={{ width: size, height: size, boxShadow: `0 0 0 1.5px color-mix(in oklab, ${color} 55%, transparent)` }}
    >
      {/* FIFA photos are full-body cutouts — anchor top + zoom so the circle reads as a face */}
      <img
        src={p.photo}
        alt={p.name}
        width={size}
        height={size}
        loading="lazy"
        className="h-full w-full object-cover"
        style={{ objectPosition: "50% 0%", transform: "scale(1.65)", transformOrigin: "50% 8%" }}
      />
    </span>
  ) : (
    <span
      className="display flex items-center justify-center rounded-full font-semibold text-chalk"
      style={{
        width: size,
        height: size,
        fontSize: size * 0.38,
        background: `color-mix(in oklab, ${color} 22%, var(--raised))`,
        boxShadow: `0 0 0 1.5px color-mix(in oklab, ${color} 45%, transparent)`,
      }}
    >
      {p.name.split(" ").pop()?.[0] ?? "?"}
    </span>
  );
}

export default function Tribes({ members, tribes }: { members: TribeMember[]; tribes: Tribe[] }) {
  const [q, setQ] = useState("");
  const nq = q.trim().toLowerCase();

  const found = useMemo(() => {
    if (!nq) return null;
    const hits = members.filter((m) => m.name.toLowerCase().includes(nq));
    hits.sort((a, b) => Number(b.name.toLowerCase().startsWith(nq)) - Number(a.name.toLowerCase().startsWith(nq)) || b.overall - a.overall);
    return hits;
  }, [nq, members]);

  const best = found?.[0];
  const bestTribe = best ? tribes.find((t) => t.id === best.cluster) : null;

  return (
    <div>
      {/* the finder — this is the front door */}
      <div className="mb-4 max-w-xl">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Type a player — see his species and his statistical twins…"
          aria-label="Find a player"
          className="w-full rounded-lg border border-pitchline bg-surface px-4 py-3 text-sm text-chalk placeholder:text-faint focus:border-gold focus:outline-none"
        />
        {best && bestTribe && (
          <div
            className="mt-2 rounded-lg border bg-surface p-4"
            style={{ borderColor: `color-mix(in oklab, ${TRIBE_COLORS[best.cluster]} 45%, transparent)` }}
          >
            <div className="flex items-center gap-3">
              <Face p={best} size={52} color={TRIBE_COLORS[best.cluster]} />
              <div className="min-w-0">
                <Link href={`/player/${best.id}`} className="display text-xl font-semibold text-chalk hover:underline">
                  {best.name} <span className="data text-gold">{best.overall}</span>
                </Link>
                <p className="text-xs text-dim">
                  {best.team} · {best.pos} ·{" "}
                  <span style={{ color: TRIBE_COLORS[best.cluster] }}>{bestTribe.label}</span>
                </p>
              </div>
            </div>
            {best.twins.length > 0 && (
              <p className="mt-3 text-sm text-dim">
                Plays like{" "}
                {best.twins.map((t, i) => (
                  <span key={t.id}>
                    {i > 0 && (i === best.twins.length - 1 ? " and " : ", ")}
                    <Link href={`/player/${t.id}`} className="text-chalk hover:text-gold">
                      {t.name}
                    </Link>{" "}
                    <span className="data text-xs text-faint">{t.pct}%</span>
                  </span>
                ))}
                .
              </p>
            )}
            {found && found.length > 1 && (
              <p className="mt-1.5 text-xs text-faint">
                also matching: {found.slice(1, 5).map((m) => m.name).join(" · ")}
              </p>
            )}
          </div>
        )}
        {nq && !best && <p className="mt-2 text-sm text-faint">No outfielder with 180+ minutes matches that.</p>}
      </div>

      {/* the eight species */}
      <div className="grid gap-3 lg:grid-cols-2">
        {tribes.map((t) => {
          const color = TRIBE_COLORS[t.id];
          const all = members.filter((m) => m.cluster === t.id && (!found || found.some((f) => f.id === m.id)));
          if (found && all.length === 0) return null;
          const stars = all.slice(0, 3);
          const rest = all.slice(3);
          return (
            <section
              key={t.id}
              className="rounded-lg border border-pitchline bg-surface p-5"
              style={{ borderLeft: `3px solid ${color}` }}
            >
              <h3 className="display text-2xl font-semibold" style={{ color }}>
                {t.label} <span className="data text-xs text-faint">×{all.length}</span>
              </h3>
              <p className="mt-0.5 text-xs text-dim">{t.blurb}</p>
              {t.traits && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {t.traits.map((tr) => (
                    <span
                      key={tr}
                      className="rounded-full px-2 py-0.5 text-[11px] text-dim"
                      style={{ background: `color-mix(in oklab, ${color} 12%, transparent)` }}
                    >
                      {tr}
                    </span>
                  ))}
                </div>
              )}

              <div className="mt-4 space-y-2">
                {stars.map((p) => (
                  <Link key={p.id} href={`/player/${p.id}`} className="group flex items-center gap-3">
                    <Face p={p} size={44} color={color} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-chalk group-hover:text-gold">{p.name}</span>
                      <span className="block text-xs text-faint">{p.team}</span>
                    </span>
                    <span className="data ml-auto text-gold">{p.overall}</span>
                  </Link>
                ))}
              </div>

              {rest.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {rest.map((p) => (
                    <Link key={p.id} href={`/player/${p.id}`} title={`${p.name} — ${p.team} (${p.overall})`} className="transition-transform hover:scale-110">
                      <Face p={p} size={30} color={color} />
                    </Link>
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
