/**
 * MCP Apps iframe for simulate_match: the full rematch machine inside the chat.
 * Interactive — changing a team calls simulate_match back on the server.
 */
import { App } from "@modelcontextprotocol/ext-apps";

type Score = { a: number; b: number; p: number };
type Sim = { pA: number; pDraw: number; pB: number; koA: number; koB: number; lambdaA: number; lambdaB: number; topScores: Score[]; matrix: number[][] };
type Data = {
  kind: string;
  a: { abbr: string; name: string };
  b: { abbr: string; name: string };
  teams: { abbr: string; name: string }[];
  sim: Sim;
  link?: string;
};

const C = { bg: "#050d08", surface: "#0a150e", raised: "#102016", line: "#1c3325", chalk: "#edf2e8", dim: "#94a796", faint: "#5a6b5c", gold: "#e3be56" };

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, style?: Partial<CSSStyleDeclaration>, text?: string) => {
  const e = document.createElement(tag);
  if (style) Object.assign(e.style, style);
  if (text != null) e.textContent = text;
  return e;
};

const pct = (p: number) => `${Math.round(p * 100)}%`;
let current: Data | null = null;
let busy = false;

function render(d: Data) {
  current = d;
  const root = document.getElementById("app")!;
  root.textContent = "";

  root.append(el("p", { fontSize: "11px", letterSpacing: "0.14em", textTransform: "uppercase", color: C.gold, margin: "0 0 10px" }, "The rematch machine · 10,000 simulations"));

  // pickers
  const row = el("div", { display: "flex", alignItems: "center", gap: "10px", marginBottom: "14px", flexWrap: "wrap" });
  const mkSelect = (value: string, slot: "a" | "b") => {
    const s = document.createElement("select");
    Object.assign(s.style, { background: C.surface, color: C.chalk, border: `1px solid ${C.line}`, borderRadius: "6px", padding: "6px 8px", fontSize: "13px" });
    for (const t of d.teams) {
      const o = document.createElement("option");
      o.value = t.abbr;
      o.textContent = t.name;
      if (t.abbr === value) o.selected = true;
      s.append(o);
    }
    s.disabled = busy;
    s.onchange = () => resim(slot === "a" ? s.value : d.a.abbr, slot === "b" ? s.value : d.b.abbr);
    return s;
  };
  row.append(mkSelect(d.a.abbr, "a"), el("span", { color: C.faint, fontSize: "12px", fontFamily: "ui-monospace,monospace" }, "vs"), mkSelect(d.b.abbr, "b"));
  root.append(row);

  // probability bar
  const labels = el("div", { display: "flex", justifyContent: "space-between", fontSize: "13px", marginBottom: "5px" });
  labels.append(
    el("span", { color: C.gold }, `${d.a.name} ${pct(d.sim.pA)}`),
    el("span", { color: C.faint }, `draw ${pct(d.sim.pDraw)}`),
    el("span", { color: C.chalk }, `${d.b.name} ${pct(d.sim.pB)}`)
  );
  const bar = el("div", { display: "flex", height: "10px", borderRadius: "999px", overflow: "hidden", marginBottom: "12px" });
  bar.append(
    el("div", { width: `${d.sim.pA * 100}%`, background: C.gold }),
    el("div", { width: `${d.sim.pDraw * 100}%`, background: C.raised }),
    el("div", { width: `${d.sim.pB * 100}%`, background: C.chalk })
  );
  root.append(labels, bar);

  const koWinner = d.sim.koA >= 0.5 ? d.a.name : d.b.name;
  root.append(
    el("p", { fontSize: "13px", color: C.dim, margin: "0 0 14px" },
      `In a knockout tie, ${koWinner} goes through ${pct(Math.max(d.sim.koA, d.sim.koB))} of the time.`)
  );

  // two columns: scorelines + matrix
  const cols = el("div", { display: "flex", gap: "22px", flexWrap: "wrap" });

  const left = el("div", { minWidth: "180px" });
  left.append(el("p", { fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, margin: "0 0 6px" }, "Most likely scorelines"));
  for (const s of d.sim.topScores) {
    const r = el("div", { display: "flex", alignItems: "baseline", gap: "8px", background: C.surface, border: `1px solid ${C.line}`, borderRadius: "6px", padding: "5px 10px", marginBottom: "5px", fontSize: "12px" });
    r.append(
      el("span", { color: C.chalk, fontFamily: "ui-monospace,monospace", fontSize: "15px" }, `${s.a}:${s.b}`),
      el("span", { color: C.faint, fontSize: "11px" }, `${d.a.abbr} ${s.a} — ${d.b.abbr} ${s.b}`),
      el("span", { color: C.gold, marginLeft: "auto", fontFamily: "ui-monospace,monospace", fontSize: "11px" }, `${(s.p * 100).toFixed(1)}%`)
    );
    left.append(r);
  }
  left.append(el("p", { fontSize: "11px", color: C.faint, marginTop: "8px" }, `Expected goals: ${d.a.abbr} ${d.sim.lambdaA.toFixed(2)} · ${d.b.abbr} ${d.sim.lambdaB.toFixed(2)}`));

  const right = el("div");
  right.append(el("p", { fontSize: "10px", letterSpacing: "0.12em", textTransform: "uppercase", color: C.faint, margin: "0 0 6px" }, "Every scoreline"));
  const grid = el("div", { display: "grid", gridTemplateColumns: "auto repeat(6, 26px)", gap: "2px", textAlign: "center", fontFamily: "ui-monospace,monospace", fontSize: "10px" });
  grid.append(el("span"));
  for (const g of ["0", "1", "2", "3", "4", "5+"]) grid.append(el("span", { color: C.faint, lineHeight: "22px" }, g));
  d.sim.matrix.forEach((rowVals, i) => {
    grid.append(el("span", { color: C.faint, lineHeight: "26px", paddingRight: "5px", textAlign: "right" }, i === 5 ? "5+" : String(i)));
    rowVals.forEach((p, j) => {
      const cell = el("span", { height: "26px", lineHeight: "26px", borderRadius: "3px", background: `color-mix(in oklab, ${C.gold} ${Math.min(p * 420, 100)}%, ${C.surface})`, color: p > 0.12 ? C.bg : C.dim }, p >= 0.02 ? String(Math.round(p * 100)) : "");
      cell.title = `${d.a.abbr} ${i} — ${d.b.abbr} ${j}: ${(p * 100).toFixed(1)}%`;
      grid.append(cell);
    });
  });
  right.append(grid, el("p", { fontSize: "10px", color: C.faint, marginTop: "4px" }, `${d.a.abbr} down the side, ${d.b.abbr} across — cells in %`));

  cols.append(left, right);
  root.append(cols);

  if (d.link) {
    const a = document.createElement("a");
    a.textContent = "Open in MUNDIAL·26 →";
    a.href = d.link;
    Object.assign(a.style, { color: C.gold, fontSize: "12px", display: "inline-block", marginTop: "12px", textDecoration: "none" });
    a.onclick = (e) => {
      e.preventDefault();
      app.openLink({ url: d.link! }).catch(() => window.open(d.link, "_blank"));
    };
    root.append(a);
  }

  if (busy) root.style.opacity = "0.55";
  else root.style.opacity = "1";
}

async function resim(a: string, b: string) {
  if (busy || !current) return;
  busy = true;
  render({ ...current, a: current.teams.find((t) => t.abbr === a) ?? current.a, b: current.teams.find((t) => t.abbr === b) ?? current.b });
  try {
    const res = await app.callServerTool({ name: "simulate_match", arguments: { team_a: a, team_b: b } });
    const d = res.structuredContent as Data | undefined;
    busy = false;
    if (d?.sim) render(d);
    else if (current) render(current);
  } catch {
    busy = false;
    if (current) render(current);
  }
}

const app = new App({ name: "MUNDIAL·26 rematch", version: "1.0.0" });
app.ontoolresult = (result) => {
  const d = (result as any).structuredContent as Data | undefined;
  if (d?.sim) render(d);
};
app.connect();
