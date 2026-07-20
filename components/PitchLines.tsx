/* pitch geometry (105m x 68m, x10) — shared by MatchTheater and Heatmap */
export const PITCH_W = 1050;
export const PITCH_H = 680;

export default function PitchLines() {
  const W = PITCH_W, H = PITCH_H;
  const s = { stroke: "var(--chalk)", strokeOpacity: 0.22, strokeWidth: 2, fill: "none" as const };
  return (
    <g>
      {/* mow stripes */}
      {Array.from({ length: 12 }, (_, i) => (
        <rect key={i} x={(i * W) / 12} y={0} width={W / 12} height={H}
          fill={i % 2 ? "var(--chalk)" : "none"} opacity={0.025} />
      ))}
      <rect x={1} y={1} width={W - 2} height={H - 2} {...s} />
      <line x1={W / 2} y1={0} x2={W / 2} y2={H} {...s} />
      <circle cx={W / 2} cy={H / 2} r={91.5} {...s} />
      {/* boxes: penalty 16.5m deep x 40.32m; six-yard 5.5m x 18.32m */}
      {[0, 1].map((side) => {
        const mx = (x: number) => (side ? W - x : x);
        return (
          <g key={side}>
            <rect x={Math.min(mx(0), mx(165))} y={H / 2 - 201.6} width={165} height={403.2} {...s} />
            <rect x={Math.min(mx(0), mx(55))} y={H / 2 - 91.6} width={55} height={183.2} {...s} />
            <circle cx={mx(110)} cy={H / 2} r={3} fill="var(--chalk)" opacity={0.4} />
            <path
              d={`M ${mx(165)} ${H / 2 - 73} A 91.5 91.5 0 0 ${side ? 0 : 1} ${mx(165)} ${H / 2 + 73}`}
              {...s}
            />
          </g>
        );
      })}
    </g>
  );
}
