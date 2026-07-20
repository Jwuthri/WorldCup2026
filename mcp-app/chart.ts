/**
 * MCP Apps iframe: renders the render_chart tool result (bar | scatter)
 * inside Claude / any MCP Apps host. Bundled to a single HTML file by
 * scripts/build-mcp-app.mjs — vanilla DOM port of components/ChatChart.tsx.
 */
import { App } from "@modelcontextprotocol/ext-apps";

type Item = { label: string; value?: number; x?: number; y?: number };
type Spec = {
  type: "bar" | "scatter";
  title: string;
  x_label?: string;
  y_label?: string;
  items: Item[];
};

const C = {
  bg: "#050d08",
  surface: "#0a150e",
  line: "#1c3325",
  chalk: "#edf2e8",
  dim: "#94a796",
  faint: "#5a6b5c",
  gold: "#e3be56",
};

const fmt = (v?: number): string =>
  v == null ? "" : Math.abs(v) >= 100 ? Math.round(v).toLocaleString("en-US") : String(Math.round(v * 100) / 100);

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, style?: Partial<CSSStyleDeclaration>, text?: string) => {
  const e = document.createElement(tag);
  if (style) Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  return e;
};

function renderBars(root: HTMLElement, items: Item[], xLabel?: string) {
  const max = Math.max(...items.map((i) => i.value ?? 0), 1e-9);
  for (const it of items) {
    const frac = (it.value ?? 0) / max;
    const row = el("div", {
      display: "grid",
      gridTemplateColumns: "minmax(7rem,auto) 1fr 3.5rem",
      alignItems: "center",
      gap: "8px",
      fontSize: "12px",
      marginBottom: "6px",
    });
    row.append(
      el("span", { color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, it.label),
      (() => {
        const track = el("div", { height: "10px", borderRadius: "999px", background: C.bg });
        track.append(
          el("div", {
            height: "10px",
            borderRadius: "999px",
            background: C.gold,
            width: `${Math.max(frac * 100, 1)}%`,
            opacity: String(0.55 + 0.45 * frac),
          })
        );
        return track;
      })(),
      el("span", { color: C.chalk, textAlign: "right", fontFamily: "ui-monospace,monospace" }, fmt(it.value))
    );
    root.append(row);
  }
  if (xLabel) root.append(el("p", { textAlign: "center", fontSize: "10px", color: C.faint, marginTop: "6px" }, xLabel));
}

function renderScatter(root: HTMLElement, spec: Spec, items: Item[]) {
  const W = 480, H = 300, P = 44;
  const xs = items.map((i) => i.x ?? 0), ys = items.map((i) => i.y ?? 0);
  const pad = (lo: number, hi: number): [number, number] => {
    const d = hi - lo || 1;
    return [lo - d * 0.08, hi + d * 0.08];
  };
  const [x0, x1] = pad(Math.min(...xs), Math.max(...xs));
  const [y0, y1] = pad(Math.min(...ys), Math.max(...ys));
  const sx = (v: number) => P + ((v - x0) / (x1 - x0)) * (W - P - 16);
  const sy = (v: number) => H - P + ((v - y0) / (y1 - y0)) * (P + 16 - H);

  const NS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(NS, "svg");
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", spec.title);
  svg.style.width = "100%";
  svg.style.minWidth = "320px";

  const S = (tag: string, attrs: Record<string, string | number>, text?: string) => {
    const n = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
    if (text != null) n.textContent = text;
    svg.append(n);
    return n;
  };

  S("line", { x1: P, y1: H - P, x2: W - 12, y2: H - P, stroke: C.line, "stroke-width": 1.5 });
  S("line", { x1: P, y1: 12, x2: P, y2: H - P, stroke: C.line, "stroke-width": 1.5 });
  for (const v of [x0, (x0 + x1) / 2, x1])
    S("text", { x: sx(v), y: H - P + 16, "text-anchor": "middle", "font-size": 10, fill: C.faint, "font-family": "ui-monospace,monospace" }, fmt(v));
  for (const v of [y0, (y0 + y1) / 2, y1])
    S("text", { x: P - 6, y: sy(v) + 3, "text-anchor": "end", "font-size": 10, fill: C.faint, "font-family": "ui-monospace,monospace" }, fmt(v));
  if (spec.x_label) S("text", { x: (W + P) / 2, y: H - 6, "text-anchor": "middle", "font-size": 11, fill: C.dim }, spec.x_label);
  if (spec.y_label)
    S("text", { x: 12, y: (H - P) / 2, "text-anchor": "middle", "font-size": 11, fill: C.dim, transform: `rotate(-90 12 ${(H - P) / 2})` }, spec.y_label);
  for (const it of items) {
    S("circle", { cx: sx(it.x ?? 0), cy: sy(it.y ?? 0), r: 5, fill: C.gold, "fill-opacity": 0.85, stroke: C.bg, "stroke-width": 1 });
    S("text", { x: sx(it.x ?? 0), y: sy(it.y ?? 0) - 9, "text-anchor": "middle", "font-size": 9.5, fill: C.chalk, opacity: 0.85 }, it.label);
  }
  root.append(svg);
}

function render(spec: Spec) {
  const root = document.getElementById("chart")!;
  root.textContent = "";
  const items = (spec.items ?? []).slice(0, 20);
  if (!items.length) return;
  root.append(
    el(
      "figcaption",
      { fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, marginBottom: "12px" },
      spec.title
    )
  );
  if (spec.type === "bar") renderBars(root, items, spec.x_label);
  else renderScatter(root, spec, items);
}

function specFrom(result: { content?: { type: string; text?: string }[]; structuredContent?: unknown }): Spec | null {
  const sc = result.structuredContent as Spec | undefined;
  if (sc?.type && Array.isArray(sc.items)) return sc;
  for (const c of result.content ?? []) {
    if (c.type !== "text" || !c.text) continue;
    try {
      const p = JSON.parse(c.text);
      if (p?.type && Array.isArray(p?.items)) return p as Spec;
    } catch {}
  }
  return null;
}

const app = new App({ name: "MUNDIAL·26 chart", version: "1.0.0" });
// handlers must be registered before connect()
app.ontoolresult = (result) => {
  const spec = specFrom(result as any);
  if (spec) render(spec);
};
app.connect();
