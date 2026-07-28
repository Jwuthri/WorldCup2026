import EditionRing from "@/components/EditionRing";
import { getEditions } from "@/lib/editions";

export const metadata = {
  title: "Football Analytic — pick a season, read every number",
  description:
    "Data theaters built on public football feeds: the 2026 World Cup, and the 2025/26 Premier League, LaLiga, Serie A, Bundesliga, Ligue 1 and Europa League.",
};

export default function ChooserPage() {
  return <EditionRing editions={getEditions()} />;
}
