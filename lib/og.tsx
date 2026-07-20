import fs from "node:fs/promises";
import path from "node:path";

/* Shared bits for opengraph-image routes (rendered by Satori — flexbox only, literal colors) */

export const OG_SIZE = { width: 1200, height: 630 };

export const C = {
  bg: "#050d08",
  panel: "#0a150e",
  raised: "#12241a",
  line: "#1c3325",
  chalk: "#edf2e8",
  dim: "#94a796",
  faint: "#5a6b5c",
  gold: "#e3be56",
  ember: "#e8643f",
};

export async function ogFonts() {
  const dir = path.join(process.cwd(), "assets/fonts");
  return [
    { name: "Barlow", data: await fs.readFile(path.join(dir, "BarlowCondensed-Bold.ttf")), weight: 700 as const },
    { name: "Mono", data: await fs.readFile(path.join(dir, "IBMPlexMono-Medium.ttf")), weight: 500 as const },
  ];
}

export const rootStyle: React.CSSProperties = {
  width: "100%",
  height: "100%",
  display: "flex",
  background: `linear-gradient(160deg, ${C.raised} 0%, ${C.panel} 45%, ${C.bg} 100%)`,
  fontFamily: "Barlow",
  color: C.chalk,
};

export function Wordmark() {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: 2, fontSize: 34 }}>
      <span style={{ color: C.chalk }}>MUNDIAL</span>
      <span style={{ color: C.gold }}>·26</span>
    </div>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return (
    <div style={{ display: "flex", fontFamily: "Mono", fontSize: 20, letterSpacing: 3, color: C.dim, textTransform: "uppercase" }}>
      {children}
    </div>
  );
}
