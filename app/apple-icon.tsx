import { ImageResponse } from "next/og";
import { ogFonts } from "@/lib/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(160deg, #102016 0%, #0a150e 55%, #050d08 100%)",
          fontFamily: "Barlow",
        }}
      >
        <div style={{ display: "flex", alignItems: "baseline" }}>
          <span style={{ fontSize: 120, fontWeight: 700, color: "#edf2e8", lineHeight: 1 }}>M</span>
          <span style={{ fontSize: 120, fontWeight: 700, color: "#e3be56", lineHeight: 1 }}>·</span>
          <span style={{ fontSize: 72, fontWeight: 700, color: "#e3be56", lineHeight: 1 }}>26</span>
        </div>
      </div>
    ),
    { ...size, fonts: (await ogFonts()).filter((f) => f.name === "Barlow") }
  );
}
