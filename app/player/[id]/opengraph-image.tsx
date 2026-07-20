import { ImageResponse } from "next/og";
import { getCards } from "@/lib/cards";
import { flagUrl } from "@/lib/flags";
import { C, OG_SIZE, ogFonts, rootStyle, Wordmark, Eyebrow } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "MUNDIAL·26 real-data World Cup card";

const tierColor = (t: string) => (t === "gold" ? C.gold : t === "silver" ? C.chalk : "#d8b083");

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCards().get(id);
  const fonts = await ogFonts();
  if (!c) {
    return new ImageResponse(
      (
        <div style={{ ...rootStyle, alignItems: "center", justifyContent: "center" }}>
          <Wordmark />
        </div>
      ),
      { ...size, fonts }
    );
  }
  const tone = tierColor(c.tier);
  return new ImageResponse(
    (
      <div style={{ ...rootStyle, padding: 56, alignItems: "center", gap: 56 }}>
        {/* left: the card essence */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 10,
            padding: "36px 44px",
            borderRadius: 24,
            border: `4px solid ${tone}`,
            background: `linear-gradient(175deg, ${C.raised}, ${C.bg})`,
          }}
        >
          <div style={{ display: "flex", fontSize: 110, lineHeight: 1, color: tone }}>{c.overall}</div>
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 24, letterSpacing: 4, color: C.dim }}>{c.pos}</div>
          {c.photo && (
            <img
              src={c.photo.replace("width:160", "width:400")}
              width={210}
              height={210}
              style={{ borderRadius: 999, border: `5px solid ${tone}`, objectFit: "cover", objectPosition: "50% 0%" }}
            />
          )}
          <img src={flagUrl(c.abbr)} width={44} height={44} style={{ borderRadius: 6 }} />
        </div>

        {/* right: name + stats */}
        <div style={{ display: "flex", flexDirection: "column", gap: 20, flexGrow: 1 }}>
          <div style={{ display: "flex", fontSize: 76, lineHeight: 1, textTransform: "uppercase" }}>{c.name}</div>
          <Eyebrow>{`${c.team} · ${c.matches} matches · ${c.minutes} minutes`}</Eyebrow>
          <div style={{ display: "flex", gap: 16, marginTop: 8 }}>
            {c.stats.map((s) => (
              <div key={s.key} style={{ display: "flex", flexDirection: "column", alignItems: "center", width: 102 }}>
                <div style={{ display: "flex", fontFamily: "Mono", fontSize: 48, color: s.val >= 85 ? tone : C.chalk }}>
                  {s.val}
                </div>
                <div style={{ display: "flex", fontSize: 24, color: C.dim }}>{s.key}</div>
                <div style={{ display: "flex", width: 92, height: 6, background: C.raised, borderRadius: 3, marginTop: 6 }}>
                  <div
                    style={{
                      display: "flex",
                      width: Math.round(((s.val - 40) / 59) * 92),
                      height: 6,
                      background: tone,
                      borderRadius: 3,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 10 }}>
            <Wordmark />
            <div style={{ display: "flex", fontFamily: "Mono", fontSize: 20, color: C.faint }}>
              every stat a real tournament percentile
            </div>
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
