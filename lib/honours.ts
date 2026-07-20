import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCards, type Card } from "@/lib/cards";

const FINAL_DAY = Date.parse("2026-07-19");

export type HonourRow = { card: Card; line: string };
export type Honour = {
  key: string;
  title: string;
  rule: string;
  rows: HonourRow[];
  official?: { name: string; card: Card | null; matches: boolean };
};

// Official winners — fifa.com award-winners article for canadamexicousa2026, read 2026-07-20
const OFFICIAL: Record<string, string> = {
  boot: "Kylian Mbappe",
  glove: "Unai Simon",
  ball: "Rodri",
  young: "Pau Cubarsi",
};
export const OFFICIAL_EXTRAS =
  "Silver Ball: Messi · Bronze Ball: Mbappé · Silver Boot: Messi (8) · Bronze Boot: Bellingham (7) · Fair Play Trophy: Netherlands";

/** IdPlayer -> birth date, from the 48 harvested squad files */
const getBirthdates = cache((): Map<string, string> => {
  const dir = path.join(process.cwd(), "data", "fifa", "squads");
  const out = new Map<string, string>();
  for (const f of fs.readdirSync(dir)) {
    try {
      const squad = JSON.parse(fs.readFileSync(path.join(dir, f), "utf8"));
      for (const p of squad?.Players ?? [])
        if (p.IdPlayer && p.BirthDate) out.set(p.IdPlayer, p.BirthDate);
    } catch { /* skip unreadable squad file */ }
  }
  return out;
});

export const ageOn = (birth: string, when = FINAL_DAY) =>
  Math.floor((when - Date.parse(birth)) / (365.25 * 24 * 3600 * 1000));

const ga = (c: Card) => `${c.raw.goals} goals · ${c.raw.assists} assists · ${c.raw.xg.toFixed(1)} xG`;

export const getHonours = cache((): { awards: Honour[]; xi: Card[]; xiShape: string } => {
  const cards = [...getCards().values()];
  const bios = getBirthdates();

  // Golden Boot — FIFA's actual tiebreak: goals, then assists, then fewest minutes
  const boot = [...cards]
    .sort((a, b) => b.raw.goals - a.raw.goals || b.raw.assists - a.raw.assists || a.minutes - b.minutes)
    .slice(0, 5)
    .map((c) => ({ card: c, line: ga(c) }));

  // Golden Glove — most clean sheets; xG prevented, then save % break ties (270+ min)
  const glove = cards
    .filter((c) => c.pos === "GK" && c.minutes >= 270)
    .sort((a, b) =>
      b.raw.cleanSheets - a.raw.cleanSheets || b.raw.xgp - a.raw.xgp || (b.raw.savePct ?? 0) - (a.raw.savePct ?? 0))
    .slice(0, 4)
    .map((c) => ({
      card: c,
      line: `${c.raw.cleanSheets} clean sheets · ${c.raw.saves} saves · ${c.raw.savePct != null ? Math.round(c.raw.savePct * 100) : "—"}% saved · ${c.raw.xgp.toFixed(1)} xG prevented`,
    }));

  // Best Player — computed: 360+ min, highest overall, avg rating breaking ties
  const ball = cards
    .filter((c) => c.minutes >= 360)
    .sort((a, b) => b.overall - a.overall || (b.avgRating ?? 0) - (a.avgRating ?? 0))
    .slice(0, 5)
    .map((c) => ({ card: c, line: `${c.avgRating?.toFixed(2) ?? "—"} avg rating · ${ga(c)}` }));

  // Best Young Player — born 2005 or later (FIFA's U21 window for 2026), 180+ min
  const young = cards
    .filter((c) => {
      const b = bios.get(c.id);
      return b != null && Date.parse(b) >= Date.parse("2005-01-01") && c.minutes >= 180;
    })
    .sort((a, b) => b.overall - a.overall || (b.avgRating ?? 0) - (a.avgRating ?? 0))
    .slice(0, 5)
    .map((c) => ({ card: c, line: `${ageOn(bios.get(c.id)!)} years old · ${ga(c)}` }));

  // Team of the tournament — best XI by overall in a 4-3-3, 300+ minutes
  const pool = cards.filter((c) => c.minutes >= 300).sort((a, b) => b.overall - a.overall);
  const take = (pos: Card["pos"], n: number) => pool.filter((c) => c.pos === pos).slice(0, n);
  const xi = [...take("GK", 1), ...take("DEF", 4), ...take("MID", 3), ...take("ATT", 3)];

  // resolve official winners to cards: exact normalized match first, else shortest containing name
  const norm = (s: string) =>
    s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z]/g, "");
  const findCard = (name: string): Card | null => {
    const n = norm(name);
    const exact = cards.find((c) => norm(c.name) === n);
    if (exact) return exact;
    return (
      cards
        .filter((c) => norm(c.name).includes(n) || n.includes(norm(c.name)))
        .sort((a, b) => a.name.length - b.name.length)[0] ?? null
    );
  };
  const officialFor = (key: string, rows: HonourRow[]) => {
    const name = OFFICIAL[key];
    if (!name) return undefined;
    const card = findCard(name);
    return { name, card, matches: card != null && card.id === rows[0]?.card.id };
  };

  const awards: Honour[] = [
    { key: "boot", title: "Golden Boot", rule: "Most goals; ties broken by assists, then fewest minutes — FIFA's official rule.", rows: boot },
    { key: "glove", title: "Golden Glove", rule: "Most clean sheets (270+ min); xG prevented, then save % break ties. Computed, not voted.", rows: glove },
    { key: "ball", title: "Best Player", rule: "Highest card overall with 360+ minutes; average match rating breaks ties. Computed, not voted.", rows: ball },
    { key: "young", title: "Best Young Player", rule: "Born 2005 or later, 180+ minutes, highest overall. Computed, not voted.", rows: young },
  ];
  for (const a of awards) a.official = officialFor(a.key, a.rows);

  return { awards, xi, xiShape: "4-3-3" };
});
