import { ImageResponse } from "next/og";
import { getMatchBundle } from "@/lib/data";
import { flagUrl } from "@/lib/flags";
import { C, OG_SIZE, ogFonts, rootStyle, Wordmark, Eyebrow } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = "image/png";
export const alt = "MUNDIAL·26 match";

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const b = getMatchBundle(id);
  const fonts = await ogFonts();
  if (!b) {
    return new ImageResponse(
      (
        <div style={{ ...rootStyle, alignItems: "center", justifyContent: "center" }}>
          <Wordmark />
        </div>
      ),
      { ...size, fonts }
    );
  }
  const xgH = b.home.fdh.XG, xgA = b.away.fdh.XG;
  const note = b.cal.penHome != null ? `${b.cal.penHome}–${b.cal.penAway} pens` : b.cal.resultType === 3 ? "a.e.t." : "";
  const Side = ({ team, color }: { team: typeof b.home; color: string }) => (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14, width: 360 }}>
      <img src={flagUrl(team.ref.abbr)} width={130} height={130} style={{ borderRadius: 14 }} />
      <div style={{ display: "flex", fontSize: 58, lineHeight: 1, textAlign: "center", textTransform: "uppercase", color }}>
        {team.ref.name}
      </div>
      {team.formation && (
        <div style={{ display: "flex", fontFamily: "Mono", fontSize: 24, color: C.faint }}>{team.formation}</div>
      )}
    </div>
  );
  return new ImageResponse(
    (
      <div style={{ ...rootStyle, flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 22 }}>
        <Eyebrow>{`${b.cal.stage}${b.cal.group ? ` · ${b.cal.group}` : ""} · ${b.cal.stadium}, ${b.cal.city}`}</Eyebrow>
        <div style={{ display: "flex", alignItems: "center", gap: 40 }}>
          <Side team={b.home} color={b.home.color} />
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <div style={{ display: "flex", fontFamily: "Mono", fontSize: 150, lineHeight: 1 }}>
              {`${b.cal.home.score}:${b.cal.away.score}`}
            </div>
            {note && <div style={{ display: "flex", fontFamily: "Mono", fontSize: 26, color: C.gold }}>{note}</div>}
            {xgH != null && xgA != null && (
              <div style={{ display: "flex", fontFamily: "Mono", fontSize: 24, color: C.dim }}>
                {`xG ${xgH.toFixed(2)} — ${xgA.toFixed(2)}`}
              </div>
            )}
          </div>
          <Side team={b.away} color={b.away.color} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <Wordmark />
          <div style={{ display: "flex", fontFamily: "Mono", fontSize: 20, color: C.faint }}>
            formations · xG shot map · heatmaps · player files
          </div>
        </div>
      </div>
    ),
    { ...size, fonts }
  );
}
