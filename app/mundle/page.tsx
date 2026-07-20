import { tribeMembers, archetypes } from "@/lib/ml";
import { getStandings } from "@/lib/data";
import MundleClient, { type MundlePlayer } from "./MundleClient";

export const metadata = {
  title: "Mundle — MUNDIAL·26",
  description: "The daily World Cup guessing game: one mystery player from the tournament, six guesses, real data clues.",
};

// tournament kickoff — Mundle #1
const EPOCH = Date.UTC(2026, 5, 11);

export default function MundlePage() {
  const tribes = new Map(archetypes().map((a) => [a.id, a.label]));
  const confed = new Map<string, string>();
  for (const rows of Object.values(getStandings())) for (const r of rows) confed.set(r.abbr, r.confed);

  // pool: the 200 best-known outfielders (tribeMembers is sorted best-first)
  const pool: MundlePlayer[] = tribeMembers().slice(0, 200).map((p) => ({
    id: p.id,
    name: p.name,
    team: p.team,
    abbr: p.abbr,
    pos: p.pos,
    tribe: tribes.get(p.cluster) ?? "?",
    overall: p.overall,
    confed: confed.get(p.abbr) ?? "",
    photo: p.photo,
  }));

  // deterministic daily pick (UTC)
  const now = new Date();
  const dayNum = Math.floor((Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - EPOCH) / 86_400_000) + 1;
  let h = 2026;
  const dateKey = now.toISOString().slice(0, 10);
  for (const ch of dateKey) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const answerId = pool[h % pool.length].id;

  return (
    <main className="mx-auto max-w-2xl px-4 py-10 sm:px-8">
      <p className="eyebrow mb-2">the daily game · #{dayNum}</p>
      <h1 className="display mb-1 text-5xl font-bold leading-none">Mundle</h1>
      <p className="mb-6 text-sm text-dim">
        One mystery player from the World Cup&apos;s 200 biggest names. Six guesses; every wrong one
        leaks real data. Outfielders only — keepers keep their mystery.
      </p>
      <MundleClient pool={pool} answerId={answerId} dayNum={dayNum} dateKey={dateKey} />
    </main>
  );
}
