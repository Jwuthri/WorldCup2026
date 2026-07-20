/**
 * MCP Apps iframe for get_match: score header + xG shot map on a pitch.
 * Home attacks the right goal; away is mirrored to attack the left.
 */
import { App } from "@modelcontextprotocol/ext-apps";

type Shot = { team: "home" | "away"; minute: string; player: string; xg: number | null; outcome: string; x: number; y: number };
type Side = { name: string; abbr: string; score: number | null; color: string };
type Data = { kind: string; home: Side; away: Side; stage: string; venue?: string; shots: Shot[]; link?: string };

const C = { bg: "#050d08", surface: "#0a150e", line: "#1c3325", chalk: "#edf2e8", dim: "#94a796", faint: "#5a6b5c", gold: "#e3be56" };
const NS = "http://www.w3.org/2000/svg";

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, style?: Partial<CSSStyleDeclaration>, text?: string) => {
  const e = document.createElement(tag);
  if (style) Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  return e;
};

function S(parent: Element, tag: string, attrs: Record<string, string | number>, text?: string) {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
  if (text != null) n.textContent = text;
  parent.append(n);
  return n;
}

function render(d: Data) {
  const root = document.getElementById("app")!;
  root.textContent = "";

  // header
  const head = el("div", { display: "flex", alignItems: "baseline", gap: "10px", marginBottom: "4px", flexWrap: "wrap" });
  head.append(
    el("span", { color: d.home.color, fontWeight: "600", fontSize: "16px" }, d.home.name),
    el("span", { color: C.chalk, fontFamily: "ui-monospace,monospace", fontSize: "18px" }, `${d.home.score ?? "-"}:${d.away.score ?? "-"}`),
    el("span", { color: d.away.color, fontWeight: "600", fontSize: "16px" }, d.away.name),
    el("span", { color: C.faint, fontSize: "11px" }, d.stage + (d.venue ? ` · ${d.venue}` : ""))
  );
  root.append(head);
  const xgH = d.shots.filter((s) => s.team === "home").reduce((t, s) => t + (s.xg ?? 0), 0);
  const xgA = d.shots.filter((s) => s.team === "away").reduce((t, s) => t + (s.xg ?? 0), 0);
  root.append(
    el("p", { color: C.dim, fontSize: "12px", margin: "0 0 10px" },
      `xG ${xgH.toFixed(2)} — ${xgA.toFixed(2)} · ${d.shots.length} shots · dot size = chance quality, ring = goal`)
  );

  // pitch: 105x68 with small margin
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", "-2 -2 109 72");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", "Shot map");
  Object.assign(svg.style, { width: "100%", display: "block", background: C.surface, borderRadius: "8px", border: `1px solid ${C.line}` });

  const L = (attrs: Record<string, string | number>) => S(svg, "rect", { fill: "none", stroke: C.line, "stroke-width": 0.5, ...attrs });
  L({ x: 0, y: 0, width: 105, height: 68 });
  L({ x: 0, y: 13.85, width: 16.5, height: 40.3 }); // left box
  L({ x: 88.5, y: 13.85, width: 16.5, height: 40.3 }); // right box
  L({ x: 0, y: 24.85, width: 5.5, height: 18.3 });
  L({ x: 99.5, y: 24.85, width: 5.5, height: 18.3 });
  S(svg, "line", { x1: 52.5, y1: 0, x2: 52.5, y2: 68, stroke: C.line, "stroke-width": 0.5 });
  S(svg, "circle", { cx: 52.5, cy: 34, r: 9.15, fill: "none", stroke: C.line, "stroke-width": 0.5 });

  // shots — x is 0-100 toward the opponent goal; home → right, away mirrored → left
  for (const s of d.shots) {
    const px = s.team === "home" ? (s.x / 100) * 105 : 105 - (s.x / 100) * 105;
    const py = s.team === "home" ? (s.y / 100) * 68 : 68 - (s.y / 100) * 68;
    const goal = s.outcome === "Goal";
    const r = 0.9 + (s.xg ?? 0) * 3.2;
    const dot = S(svg, "circle", {
      cx: px, cy: py, r,
      fill: s.team === "home" ? d.home.color : d.away.color,
      "fill-opacity": goal ? 0.95 : s.outcome === "Saved" ? 0.6 : 0.35,
      stroke: goal ? C.chalk : "none",
      "stroke-width": goal ? 0.7 : 0,
    });
    S(dot, "title", {}, `${s.minute} ${s.player} — xG ${(s.xg ?? 0).toFixed(2)} · ${s.outcome}`);
  }

  root.append(svg);

  // legend + link
  const foot = el("div", { display: "flex", alignItems: "center", gap: "14px", marginTop: "8px", fontSize: "11px", flexWrap: "wrap" });
  for (const side of [d.home, d.away] as const) {
    const item = el("span", { display: "inline-flex", alignItems: "center", gap: "5px", color: C.dim });
    item.append(el("span", { width: "9px", height: "9px", borderRadius: "999px", background: side.color, display: "inline-block" }), document.createTextNode(`${side.name} attacks ${side === d.home ? "→" : "←"}`));
    foot.append(item);
  }
  if (d.link) {
    const a = document.createElement("a");
    a.textContent = "Open the full Match Theater →";
    a.href = d.link;
    Object.assign(a.style, { color: C.gold, marginLeft: "auto", textDecoration: "none" });
    a.onclick = (e) => {
      e.preventDefault();
      app.openLink({ url: d.link! }).catch(() => window.open(d.link, "_blank"));
    };
    foot.append(a);
  }
  root.append(foot);
}

const app = new App({ name: "MUNDIAL·26 shot map", version: "1.0.0" });
app.ontoolresult = (result) => {
  const d = (result as any).structuredContent as Data | undefined;
  if (d?.shots) render(d);
};
app.connect();
