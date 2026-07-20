import Link from "next/link";
import { flagUrl, type CalMatch } from "@/lib/data";

function Mini({ m }: { m: CalMatch }) {
  const win = (side: "home" | "away") =>
    m.winner === (side === "home" ? m.home.id : m.away.id);
  const pens = m.penHome != null;
  return (
    <Link
      href={`/match/${m.id}`}
      className="block rounded border border-pitchline bg-surface px-3 py-2 transition-colors hover:border-gold/60"
    >
      {(["home", "away"] as const).map((s) => {
        const t = m[s];
        const w = win(s);
        return (
          <div key={s} className="flex items-center gap-2 py-0.5 text-sm">
            <img src={flagUrl(t.abbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
            <span className={w ? "font-semibold text-chalk" : "text-dim"}>{t.name}</span>
            <span className={`data ml-auto ${w ? "text-gold" : "text-dim"}`}>
              {t.score}
              {pens && <span className="text-[10px]"> ({s === "home" ? m.penHome : m.penAway})</span>}
            </span>
          </div>
        );
      })}
    </Link>
  );
}

export default function Bracket({ matches }: { matches: CalMatch[] }) {
  const ko = matches.filter((m) => m.stage !== "First Stage");
  const stageOrder = [...new Set(ko.map((m) => m.stage))]; // calendar is date-sorted
  const bronze = ko.filter((m) => /third|bronze|play-off/i.test(m.stage));
  const cols = stageOrder
    .filter((s) => !/third|bronze|play-off/i.test(s))
    .map((s) => ({ stage: s, list: ko.filter((m) => m.stage === s) }));
  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex min-w-max gap-4">
        {cols.map((c) => (
          <div key={c.stage} className="flex w-56 flex-col">
            <p className="eyebrow mb-2">{c.stage} <span className="text-faint">({c.list.length})</span></p>
            <div className="flex grow flex-col justify-around gap-2">
              {c.list.map((m) => <Mini key={m.id} m={m} />)}
            </div>
            {/third|bronze|play-off/i.test(c.stage) ? null : c.stage === "Final" && bronze.length > 0 && (
              <div className="mt-4">
                <p className="eyebrow mb-2">Third place</p>
                {bronze.map((m) => <Mini key={m.id} m={m} />)}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
