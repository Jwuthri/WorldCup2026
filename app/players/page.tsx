import { getCards } from "@/lib/cards";
import { flagUrl } from "@/lib/data";
import PlayersExplorer, { type SlimCard } from "./PlayersExplorer";

export const metadata = {
  title: "Player cards — MUNDIAL·26",
  description: "A real-data World Cup card for every player who played: every stat a tournament percentile.",
};

export default function PlayersPage() {
  const slim: SlimCard[] = [...getCards().values()]
    .sort((a, b) => b.overall - a.overall || b.minutes - a.minutes)
    .map((c) => ({
      id: c.id, name: c.name, team: c.team, abbr: c.abbr, pos: c.pos,
      overall: c.overall, tier: c.tier, photo: c.photo, flag: flagUrl(c.abbr),
    }));
  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <h1 className="display mb-1 text-4xl font-bold">Player cards</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        Every player who set foot on a 2026 pitch gets a card. No opinions: each stat is their
        percentile across the tournament — speed from stadium tracking, shooting from goals and xG,
        the overall blended with their match ratings. Open a card for the receipts.
      </p>
      <PlayersExplorer cards={slim} />
    </main>
  );
}
