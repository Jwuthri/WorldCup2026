import fs from "node:fs";
import path from "node:path";

export type Column = {
  headline: string;
  story: string[];
  keyMoment?: { minute?: string; text?: string };
  advice?: {
    home?: { team?: string; verdict?: string; points?: string[] };
    away?: { team?: string; verdict?: string; points?: string[] };
  };
  statLine?: string;
};

export function readColumn(matchId: string): Column | null {
  try {
    const c = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), "data", "stories", `${matchId}.json`), "utf8")
    );
    return c?.headline && Array.isArray(c.story) ? (c as Column) : null;
  } catch {
    return null;
  }
}

function AdviceCard({ side, color }: { side: NonNullable<Column["advice"]>["home"]; color: string }) {
  if (!side?.team) return null;
  return (
    <div className="rounded-lg border border-pitchline bg-raised/40 p-4" style={{ borderTop: `3px solid ${color}` }}>
      <p className="eyebrow mb-1">What {side.team} needed</p>
      {side.verdict && <p className="mb-2 text-sm font-semibold text-chalk">{side.verdict}</p>}
      <ul className="space-y-1.5">
        {(side.points ?? []).map((pt, i) => (
          <li key={i} className="flex gap-2 text-sm text-dim">
            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />
            {pt}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function MatchColumn({ column, homeColor, awayColor }: {
  column: Column; homeColor: string; awayColor: string;
}) {
  return (
    <section className="mt-8 rounded-lg border border-pitchline bg-surface p-5 sm:p-8" aria-label="match column">
      <p className="eyebrow mb-3">The morning-after column · AI-written from the match data</p>
      <h2 className="display mb-5 max-w-3xl text-3xl font-bold leading-tight sm:text-4xl">
        {column.headline}
      </h2>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="max-w-prose space-y-4 text-[15px] leading-relaxed text-dim">
          {column.story.map((p, i) => (
            <p key={i} className={i === 0 ? "first-letter:float-left first-letter:mr-2 first-letter:font-(family-name:--font-barlow) first-letter:text-5xl first-letter:font-bold first-letter:leading-[0.85] first-letter:text-gold" : ""}>
              {p}
            </p>
          ))}
          {column.statLine && (
            <p className="data border-t border-pitchline pt-4 text-sm text-gold">{column.statLine}</p>
          )}
        </div>

        <div className="space-y-4">
          {column.keyMoment?.text && (
            <blockquote className="rounded-r-lg border-l-4 border-gold bg-raised/40 py-3 pl-4 pr-3">
              {column.keyMoment.minute && (
                <p className="data text-2xl text-gold">{String(column.keyMoment.minute).replace(/[′']/g, "")}&#8242;</p>
              )}
              <p className="mt-1 text-sm text-chalk">{column.keyMoment.text}</p>
            </blockquote>
          )}
          <AdviceCard side={column.advice?.home} color={homeColor} />
          <AdviceCard side={column.advice?.away} color={awayColor} />
        </div>
      </div>
    </section>
  );
}
