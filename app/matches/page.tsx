import Link from "next/link";
import { getCalendar, flagUrl, type CalMatch } from "@/lib/data";

export const metadata = { title: "All 104 matches — MUNDIAL·26" };

function Row({ m }: { m: CalMatch }) {
  const date = new Date(m.date).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const win = (id: string) => m.winner === id;
  return (
    <Link
      href={`/match/${m.id}`}
      className="grid grid-cols-[3rem_1fr_auto_1fr_minmax(0,10rem)] items-center gap-2 rounded border border-transparent px-2 py-2 text-sm transition-colors hover:border-pitchline hover:bg-surface sm:gap-4"
    >
      <span className="data text-xs text-faint">{date}</span>
      <span className={`flex items-center justify-end gap-2 text-right ${win(m.home.id) ? "font-semibold text-chalk" : "text-dim"}`}>
        {m.home.name}
        <img src={flagUrl(m.home.abbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
      </span>
      <span className="data text-chalk">
        {m.home.score}:{m.away.score}
        {m.penHome != null && <span className="text-[10px] text-faint"> p{m.penHome}-{m.penAway}</span>}
      </span>
      <span className={`flex items-center gap-2 ${win(m.away.id) ? "font-semibold text-chalk" : "text-dim"}`}>
        <img src={flagUrl(m.away.abbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
        {m.away.name}
      </span>
      <span className="hidden truncate text-xs text-faint sm:block">{m.stadium}</span>
    </Link>
  );
}

export default function MatchesPage() {
  const all = getCalendar();
  const ko = all.filter((m) => m.stage !== "First Stage");
  const koStages = [...new Set(ko.map((m) => m.stage))].reverse(); // final first
  const groups = [...new Set(all.filter((m) => m.group).map((m) => m.group))].sort();

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <h1 className="display mb-8 text-4xl font-bold">All 104 matches</h1>
      {koStages.map((s) => (
        <section key={s} className="mb-8">
          <h2 className="eyebrow mb-2 border-b border-pitchline pb-1">{s}</h2>
          {ko.filter((m) => m.stage === s).map((m) => <Row key={m.id} m={m} />)}
        </section>
      ))}
      <h2 className="display mb-4 mt-12 text-2xl font-semibold">Group stage</h2>
      {groups.map((g) => (
        <section key={g} className="mb-8">
          <h2 className="eyebrow mb-2 border-b border-pitchline pb-1">{g}</h2>
          {all.filter((m) => m.group === g).map((m) => <Row key={m.id} m={m} />)}
        </section>
      ))}
    </main>
  );
}
