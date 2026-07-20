import { getCalendar } from "@/lib/data";

/** Stadium-LED results crawl: all 104 finals, CSS marquee, pauses on hover. */
export default function ResultsTicker() {
  const items = getCalendar()
    .filter((m) => m.home.score != null)
    .map((m) => ({
      id: m.id,
      text: `${m.home.abbr} ${m.home.score}:${m.away.score} ${m.away.abbr}${m.penHome != null ? ` p${m.penHome}-${m.penAway}` : ""}`,
    }));
  const loop = [...items, ...items]; // doubled for a seamless -50% loop
  return (
    <div className="mb-10 overflow-hidden border-y border-pitchline bg-surface/60 py-2" aria-hidden>
      <div className="animate-marquee flex w-max gap-7" style={{ "--marquee-t": `${items.length * 1.9}s` } as React.CSSProperties}>
        {loop.map((it, i) => (
          <span key={`${it.id}-${i}`} className="data whitespace-nowrap text-xs text-faint">
            {it.text.split(/(\d+:\d+)/).map((part, j) =>
              /^\d+:\d+$/.test(part) ? (
                <span key={j} className="text-gold">{part}</span>
              ) : (
                <span key={j}>{part}</span>
              )
            )}
            <span className="ml-7 text-pitchline">·</span>
          </span>
        ))}
      </div>
    </div>
  );
}
