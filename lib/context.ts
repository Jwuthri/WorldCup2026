import { cache } from "react";
import fs from "node:fs";
import path from "node:path";
import { getCalendar, type CalMatch } from "@/lib/data";
import { VENUES, haversineKm, type Venue } from "@/lib/venues";

export type Weather = {
  tempC: number;
  feelsLikeC: number;
  humidityPct: number;
  windKmh: number;
  precipMm: number;
};

const weatherAll = cache((): Record<string, Weather> => {
  try {
    return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data/enrich/weather.json"), "utf8"));
  } catch {
    return {};
  }
});

export type Conditions = {
  venue: Venue | null;
  kickoffLocal: string; // "13:00"
  weather: Weather | null;
};

export function getConditions(m: CalMatch): Conditions {
  return {
    venue: VENUES[m.city] ?? null,
    kickoffLocal: m.localDate.slice(11, 16),
    weather: weatherAll()[m.id] ?? null,
  };
}

export type ScheduleLeg = {
  matchId: string;
  date: string;
  stage: string;
  opp: string;
  score: string;
  city: string;
  kickoffLocal: string;
  altitudeM: number;
  roof: Venue["roof"];
  tempC: number | null;
  feelsLikeC: number | null;
  restDays: number | null; // since previous match
  travelKm: number | null; // from previous venue
};

export const getTeamSchedule = cache(
  (abbr: string): { legs: ScheduleLeg[]; totalTravelKm: number; avgRestDays: number | null } => {
    const matches = getCalendar().filter((m) => m.home.abbr === abbr || m.away.abbr === abbr);
    const legs: ScheduleLeg[] = [];
    let prev: CalMatch | null = null;
    let totalTravelKm = 0;
    const rests: number[] = [];
    for (const m of matches) {
      const v = VENUES[m.city] ?? null;
      const prevV = prev ? VENUES[prev.city] ?? null : null;
      const w = weatherAll()[m.id] ?? null;
      const isHome = m.home.abbr === abbr;
      const restDays = prev
        ? Math.round((Date.parse(m.date) - Date.parse(prev.date)) / 86_400_000)
        : null;
      const travelKm = v && prevV ? haversineKm(prevV, v) : null;
      if (restDays != null) rests.push(restDays);
      if (travelKm != null) totalTravelKm += travelKm;
      legs.push({
        matchId: m.id,
        date: m.date.slice(0, 10),
        stage: m.group || m.stage,
        opp: isHome ? m.away.name : m.home.name,
        score: `${isHome ? m.home.score : m.away.score}:${isHome ? m.away.score : m.home.score}`,
        city: m.city,
        kickoffLocal: m.localDate.slice(11, 16),
        altitudeM: v?.altitudeM ?? 0,
        roof: v?.roof ?? "open",
        tempC: w?.tempC ?? null,
        feelsLikeC: w?.feelsLikeC ?? null,
        restDays,
        travelKm,
      });
      prev = m;
    }
    return {
      legs,
      totalTravelKm,
      avgRestDays: rests.length ? Math.round((rests.reduce((s, r) => s + r, 0) / rests.length) * 10) / 10 : null,
    };
  }
);
