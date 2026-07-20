"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { MapPoint } from "@/lib/ml";

export const CLUSTER_COLORS = [
  "#e8643f", // 0 ball hunters
  "#5ea8ef", // 1 ball-playing anchors
  "#e3be56", // 2 box predators
  "#45d6a3", // 3 touchline burners
  "#a78bfa", // 4 midfield metronomes
  "#ef7fb5", // 5 dead-ball architects
  "#8fa3ad", // 6 quiet engines
  "#3fc9df", // 7 chaos dribblers
];

type Props = {
  points: MapPoint[];
  archetypes: { id: number; label: string }[];
};

export default function MapClient({ points, archetypes }: Props) {
  const router = useRouter();
  const [active, setActive] = useState<Set<number>>(new Set(archetypes.map((a) => a.id)));
  const [q, setQ] = useState("");
  const [hover, setHover] = useState<MapPoint | null>(null);
  const [mouse, setMouse] = useState<[number, number]>([0, 0]);

  const nq = q.trim().toLowerCase();
  const hits = useMemo(
    () => (nq ? new Set(points.filter((p) => p.name.toLowerCase().includes(nq)).map((p) => p.id)) : null),
    [nq, points]
  );

  const toggle = (id: number) =>
    setActive((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next.size ? next : new Set(archetypes.map((a) => a.id)); // never all-off
    });

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        {archetypes.map((a) => (
          <button
            key={a.id}
            onClick={() => toggle(a.id)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              active.has(a.id) ? "border-transparent text-bg" : "border-pitchline text-faint"
            }`}
            style={active.has(a.id) ? { background: CLUSTER_COLORS[a.id] } : undefined}
          >
            {a.label}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="find a player…"
          className="ml-auto w-40 rounded border border-pitchline bg-surface px-2.5 py-1 text-xs text-chalk placeholder:text-faint focus:border-gold/60 focus:outline-none"
        />
      </div>

      <div
        className="relative rounded-lg border border-pitchline bg-surface"
        onMouseMove={(e) => setMouse([e.clientX, e.clientY])}
      >
        <svg viewBox="-3 -3 106 106" className="block w-full" role="img" aria-label="Style map of every player">
          {points.map((p) => {
            const on = active.has(p.cluster) && (!hits || hits.has(p.id));
            const hit = hits?.has(p.id) ?? false;
            return (
              <circle
                key={p.id}
                cx={p.x}
                cy={p.y}
                r={hit ? 1.5 : hover?.id === p.id ? 1.4 : 0.75}
                fill={CLUSTER_COLORS[p.cluster]}
                opacity={on ? (hit ? 1 : 0.85) : 0.08}
                stroke={hit || hover?.id === p.id ? "var(--chalk)" : "none"}
                strokeWidth={0.25}
                className="cursor-pointer"
                onMouseEnter={() => setHover(p)}
                onMouseLeave={() => setHover(null)}
                onClick={() => router.push(`/player/${p.id}`)}
              />
            );
          })}
        </svg>
        {hover && (
          <div
            className="pointer-events-none fixed z-50 rounded border border-pitchline bg-raised px-3 py-2 text-xs shadow-lg"
            style={{ left: mouse[0] + 14, top: mouse[1] + 10 }}
          >
            <p className="display text-sm font-semibold text-chalk">
              {hover.name} <span className="data text-gold">{hover.overall}</span>
            </p>
            <p className="text-dim">{hover.team} · {hover.pos}</p>
            <p style={{ color: CLUSTER_COLORS[hover.cluster] }}>
              {archetypes.find((a) => a.id === hover.cluster)?.label}
            </p>
          </div>
        )}
      </div>
      <p className="mt-2 text-xs text-faint">
        Every dot is a player with 180+ minutes; distance = statistical similarity (t-SNE over 22
        per-90 style dimensions). Click a dot to open the player. Goalkeepers live off-map — their
        stats don&apos;t share axes with outfielders.
      </p>
    </div>
  );
}
