import PitchLines, { PITCH_W as W, PITCH_H as H } from "./PitchLines";
import { GRID_W, GRID_H } from "@/lib/heatmap";

export type HeatLayer = {
  grid: number[]; // 280 floats, attacking →
  color: string;
  mirror?: boolean; // render attacking ← (for the away/opponent side of a battle map)
};

const CW = W / GRID_W;
const CH = H / GRID_H;

/** blurred-cell occupation map on the shared pitch; layers screen-blend so
 *  overlap glows brighter — two-team maps read as contested territory */
export default function Heatmap({ layers, label, className }: { layers: HeatLayer[]; label: string; className?: string }) {
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className ?? "w-full"} role="img" aria-label={label}>
      <defs>
        {/* ponytail: fixed ids — every instance defines identical defs, doc-wide collisions are harmless */}
        <filter id="heatblur" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation={15} />
        </filter>
        <clipPath id="heatclip">
          <rect x={0} y={0} width={W} height={H} />
        </clipPath>
      </defs>
      <rect width={W} height={H} fill="var(--raised)" opacity={0.5} />
      {layers.map((l, li) => {
        // a team collectively covers the whole pitch, so uniform occupation is
        // the baseline — only above-mean presence is territory worth painting
        const mean = l.grid.reduce((a, v) => a + v, 0) / l.grid.length;
        const max = Math.max(...l.grid);
        const span = max - mean || 1;
        return (
          <g key={li} clipPath="url(#heatclip)" filter="url(#heatblur)" style={{ mixBlendMode: "screen" }}>
            {l.grid.map((v, i) => {
              if (v <= mean) return null;
              const col = i % GRID_W;
              const row = (i / GRID_W) | 0;
              const x = (l.mirror ? GRID_W - 1 - col : col) * CW;
              const o = 0.9 * Math.pow((v - mean) / span, 1.5);
              if (o < 0.04) return null;
              return (
                <rect key={i} x={x} y={row * CH} width={CW} height={CH} fill={l.color} opacity={o} />
              );
            })}
          </g>
        );
      })}
      <PitchLines />
      {/* attack-direction arrows, one per layer */}
      {layers.map((l, li) => {
        const y = 36 + li * 34;
        const [x1, x2] = l.mirror ? [W - 30, W - 86] : [30, 86];
        const tip = l.mirror ? x2 - 14 : x2 + 14;
        return (
          <g key={li} stroke={l.color} strokeWidth={7} opacity={0.9}>
            <line x1={x1} y1={y} x2={x2} y2={y} strokeLinecap="round" />
            <path d={`M ${x2} ${y - 11} L ${tip} ${y} L ${x2} ${y + 11}`} fill="none" strokeLinejoin="round" strokeLinecap="round" />
          </g>
        );
      })}
    </svg>
  );
}
