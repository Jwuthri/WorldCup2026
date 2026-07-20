"use client";

export type ChartSpec = {
  type: "bar" | "scatter";
  title: string;
  x_label?: string;
  y_label?: string;
  items: { label: string; value?: number; x?: number; y?: number }[];
};

export default function ChatChart({ spec }: { spec: ChartSpec }) {
  const items = (spec.items ?? []).slice(0, 20);
  if (!items.length) return null;
  return (
    <figure className="my-3 rounded-lg border border-pitchline bg-raised/60 p-4">
      <figcaption className="eyebrow mb-3">{spec.title}</figcaption>
      {spec.type === "bar" ? <Bars items={items} xLabel={spec.x_label} /> : <Scatter spec={spec} items={items} />}
    </figure>
  );
}

function Bars({ items, xLabel }: { items: ChartSpec["items"]; xLabel?: string }) {
  const vals = items.map((i) => i.value ?? 0);
  const max = Math.max(...vals, 1e-9);
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="grid grid-cols-[minmax(7rem,auto)_1fr_3.5rem] items-center gap-2 text-xs">
          <span className="truncate text-dim">{it.label}</span>
          <div className="h-2.5 rounded-full bg-surface">
            <div className="h-2.5 rounded-full bg-gold" style={{ width: `${Math.max(((it.value ?? 0) / max) * 100, 1)}%`, opacity: 0.55 + 0.45 * ((it.value ?? 0) / max) }} />
          </div>
          <span className="data text-right text-chalk">{fmt(it.value)}</span>
        </div>
      ))}
      {xLabel && <p className="pt-1 text-center text-[10px] text-faint">{xLabel}</p>}
    </div>
  );
}

function Scatter({ spec, items }: { spec: ChartSpec; items: ChartSpec["items"] }) {
  const W = 480, H = 300, P = 44;
  const xs = items.map((i) => i.x ?? 0), ys = items.map((i) => i.y ?? 0);
  const pad = (lo: number, hi: number) => { const d = (hi - lo) || 1; return [lo - d * 0.08, hi + d * 0.08]; };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const sx = (v: number) => P + ((v - x0) / (x1 - x0)) * (W - P - 16);
  const sy = (v: number) => H - P + ((v - y0) / (y1 - y0)) * (P + 16 - H);
  return (
    <div className="overflow-x-auto">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[320px]" role="img" aria-label={spec.title}>
        <line x1={P} y1={H - P} x2={W - 12} y2={H - P} stroke="var(--line)" strokeWidth={1.5} />
        <line x1={P} y1={12} x2={P} y2={H - P} stroke="var(--line)" strokeWidth={1.5} />
        {[x0, (x0 + x1) / 2, x1].map((v, i) => (
          <text key={`x${i}`} x={sx(v)} y={H - P + 16} textAnchor="middle" fontSize={10} fill="var(--faint)" fontFamily="var(--font-plex-mono)">{fmt(v)}</text>
        ))}
        {[y0, (y0 + y1) / 2, y1].map((v, i) => (
          <text key={`y${i}`} x={P - 6} y={sy(v) + 3} textAnchor="end" fontSize={10} fill="var(--faint)" fontFamily="var(--font-plex-mono)">{fmt(v)}</text>
        ))}
        {spec.x_label && <text x={(W + P) / 2} y={H - 6} textAnchor="middle" fontSize={11} fill="var(--dim)">{spec.x_label}</text>}
        {spec.y_label && <text x={12} y={(H - P) / 2} textAnchor="middle" fontSize={11} fill="var(--dim)" transform={`rotate(-90 12 ${(H - P) / 2})`}>{spec.y_label}</text>}
        {items.map((it, i) => (
          <g key={i}>
            <circle cx={sx(it.x ?? 0)} cy={sy(it.y ?? 0)} r={5} fill="var(--gold)" fillOpacity={0.85} stroke="var(--bg)" strokeWidth={1} />
            <text x={sx(it.x ?? 0)} y={sy(it.y ?? 0) - 9} textAnchor="middle" fontSize={9.5} fill="var(--chalk)" opacity={0.85}>{it.label}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}

const fmt = (v?: number) =>
  v == null ? "" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : Math.round(v * 100) / 100;
