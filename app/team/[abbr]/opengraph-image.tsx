import { ImageResponse } from "next/og";
import { getTeams } from "@/lib/teams";
import { flagUrl } from "@/lib/flags";
import { C, OG_SIZE, ogFonts, rootStyle, Wordmark, Eyebrow } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "MUNDIAL·26 team profile";

export default async function Image({ params }: { params: Promise<{ abbr: string }> }) {
  const { abbr } = await params;
  const t = getTeams().get(abbr);
  const fonts = await ogFonts();
  if (!t) {
    return new ImageResponse(
      (
        <div style={{ ...rootStyle, alignItems: "center", justifyContent: "center" }}>
          <Wordmark />
        </div>
      ),
      { ...size, fonts }
    );
  }
  const headline = t.identity.slice(0, 4);
  return new ImageResponse(
    (
      <div style={{ ...rootStyle, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 20 }}>
        <img src={flagUrl(t.abbr)} width={120} height={120} style={{ borderRadius: 12 }} />
        <div style={{ display: "flex", fontSize: 110, lineHeight: 1, textTransform: "uppercase" }}>{t.name}</div>
        <div style={{ display: "flex", fontSize: 40, color: t.champion ? C.gold : C.dim, textTransform: "uppercase" }}>
          {t.finish}
        </div>
        <div style={{ display: "flex", gap: 40, marginTop: 10 }}>
          {headline.map((r) => (
            <div key={r.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
              <div style={{ display: "flex", fontFamily: "Mono", fontSize: 44, color: C.chalk }}>{r.value}</div>
              <div style={{ display: "flex", fontSize: 22, color: C.dim }}>{r.label}</div>
            </div>
          ))}
        </div>
        <div style={{ display: "flex", marginTop: 12 }}>
          <Wordmark />
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
