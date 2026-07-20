import { ImageResponse } from "next/og";
import { getCalendar, flagUrl } from "@/lib/data";
import { C, OG_SIZE, ogFonts, rootStyle, Wordmark, Eyebrow } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "MUNDIAL·26 — the 2026 tournament, every number that mattered";

export default async function Image() {
  const final = getCalendar().find((m) => m.stage === "Final")!;
  const champ = final.winner === final.home.id ? final.home : final.away;
  return new ImageResponse(
    (
      <div style={{ ...rootStyle, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18 }}>
        <Eyebrow>June 11 — July 19 2026 · USA · Canada · México</Eyebrow>
        <img src={flagUrl(champ.abbr)} width={110} height={110} style={{ borderRadius: 12 }} />
        <div style={{ display: "flex", fontSize: 130, lineHeight: 1, textTransform: "uppercase" }}>{champ.name}</div>
        <div style={{ display: "flex", fontSize: 46, color: C.gold, textTransform: "uppercase" }}>
          champions of the world
        </div>
        <div style={{ display: "flex", fontFamily: "Mono", fontSize: 26, color: C.dim }}>
          {`${final.home.name} ${final.home.score}:${final.away.score} ${final.away.name} a.e.t. · 104 matches · every number that mattered`}
        </div>
        <div style={{ display: "flex", marginTop: 10 }}>
          <Wordmark />
        </div>
      </div>
    ),
    { ...size, fonts: await ogFonts() }
  );
}
