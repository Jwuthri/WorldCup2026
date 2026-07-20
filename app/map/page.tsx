import Link from "next/link";
import { getMl, tribeMembers, archetypes, styleFamilies } from "@/lib/ml";
import { flagUrl } from "@/lib/flags";
import Tribes from "./Tribes";

export const metadata = {
  title: "The tribes — MUNDIAL·26",
  description:
    "Every regular player at the World Cup sorted into eight species by what they actually do on the pitch — pure behavior, no positions, no reputations.",
};

export default function TribesPage() {
  const ml = getMl();
  const members = tribeMembers();
  const arch = archetypes();
  if (!ml || !members.length || !arch.length)
    return (
      <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
        <h1 className="display text-4xl font-bold">The tribes</h1>
        <p className="mt-2 text-sm text-dim">No ML data yet — run <code className="data">npm run ml</code> and reload.</p>
      </main>
    );

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <p className="eyebrow mb-3">machine learning · behavior only — no positions, no reputations</p>
      <h1 className="display mb-3 text-5xl font-bold leading-none">The eight species of footballer</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        We measured what all {members.length} regular outfielders actually did per 90 minutes —
        pressing, passing, sprinting, dribbling, shooting — and let a clustering algorithm sort
        them into species. It rediscovered football&apos;s roles on its own, and it doesn&apos;t care who&apos;s
        famous. Find your player:
      </p>

      <Tribes members={members} tribes={arch} />

      {/* team style families */}
      <section className="mt-14">
        <h2 className="display mb-1 text-3xl font-semibold">Four ways to play a World Cup</h2>
        <p className="mb-5 text-sm text-dim">The same idea applied to the 48 teams&apos; per-match identity.</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {styleFamilies().map((s) => (
            <div key={s.label} className="rounded-lg border border-pitchline bg-surface p-4">
              <p className="display text-lg font-semibold text-gold">{s.label}</p>
              <p className="mt-1 min-h-10 text-xs text-dim">{s.blurb}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {s.teams.map((t) => (
                  <Link key={t.abbr} href={`/team/${t.abbr}`} title={t.name}>
                    <img src={flagUrl(t.abbr)} alt={t.name} width={22} height={16} className="rounded-[2px] opacity-80 transition-opacity hover:opacity-100" loading="lazy" />
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="mt-10 text-xs text-faint">
        Method: per-90 stat vectors (22 tracking dimensions), z-scored, k-means k=8, players with
        180+ minutes. Goalkeepers are excluded — their numbers don&apos;t share axes with outfielders
        (their twins still show on player pages). The fortune index on{" "}
        <Link href="/tournament" className="text-gold underline-offset-4 hover:underline">the tournament page</Link>{" "}
        comes from the same pipeline.
      </p>
    </main>
  );
}
