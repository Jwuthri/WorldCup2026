import { Suspense } from "react";
import { getCards } from "@/lib/cards";
import CompareClient, { type CmpCard } from "./CompareClient";

export const metadata = {
  title: "Compare players — MUNDIAL·26",
  description: "Two real-data World Cup cards side by side, with a stat radar.",
};

export default function ComparePage() {
  const cards: CmpCard[] = [...getCards().values()]
    .sort((x, y) => y.overall - x.overall)
    .map((c) => ({
      id: c.id, name: c.name, team: c.team, abbr: c.abbr, pos: c.pos,
      overall: c.overall, tier: c.tier, photo: c.photo,
      stats: c.stats.map((s) => ({ key: s.key, val: s.val })),
    }));
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 sm:px-8">
      <h1 className="display mb-1 text-4xl font-bold">Compare</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        Two cards, one radar, zero opinions. Gold is player one, chalk is player two.
      </p>
      <Suspense>
        <CompareClient cards={cards} />
      </Suspense>
    </main>
  );
}
