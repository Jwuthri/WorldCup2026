export type DuelRow = { label: string; h: number; a: number; hDisp: string; aDisp: string };

export default function DuelBars({ rows, homeColor, awayColor }: {
  rows: DuelRow[]; homeColor: string; awayColor: string;
}) {
  return (
    <div className="space-y-2.5">
      {rows.map((r) => {
        const max = Math.max(r.h, r.a, 1e-9);
        return (
          <div key={r.label} className="grid grid-cols-[3.5rem_1fr_minmax(7rem,auto)_1fr_3.5rem] items-center gap-2 text-sm">
            <span className="data text-right text-chalk">{r.hDisp}</span>
            <div className="flex justify-end">
              <div className="h-2 rounded-l-full" style={{ width: `${(r.h / max) * 100}%`, background: homeColor, opacity: r.h >= r.a ? 1 : 0.45 }} />
            </div>
            <span className="text-center text-xs text-dim">{r.label}</span>
            <div className="flex justify-start">
              <div className="h-2 rounded-r-full" style={{ width: `${(r.a / max) * 100}%`, background: awayColor, opacity: r.a >= r.h ? 1 : 0.45 }} />
            </div>
            <span className="data text-chalk">{r.aDisp}</span>
          </div>
        );
      })}
    </div>
  );
}
