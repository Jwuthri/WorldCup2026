/**
 * Remote MCP server over the frozen WC2026 dataset. Visitors connect it in
 * Claude (Settings → Connectors → Add custom connector → <site>/api/mcp) or any
 * MCP client — their model pays the tokens, we only serve JSON. render_chart is
 * an MCP App: hosts that support it (Claude, VS Code…) render our chart iframe.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { registerAppTool, registerAppResource, RESOURCE_MIME_TYPE } from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";
import fs from "node:fs";
import path from "node:path";
import { TOOL_DEFS, runTool, resolveTeam } from "@/lib/aiTools";

const CHART_URI = "ui://mundial26/chart.html";

// Public base URL for deep links. Prefer an explicit env override (e.g. a custom
// domain); otherwise derive it from the incoming request so it's always correct
// wherever this is deployed — no env var to set on Railway/Vercel/etc.
function baseFromReq(req: Request): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/+$/, "");
  if (env) return env;
  const h = req.headers;
  const host = h.get("x-forwarded-host") ?? h.get("host");
  if (host) return `${h.get("x-forwarded-proto") ?? "https"}://${host}`;
  try {
    return new URL(req.url).origin;
  } catch {
    return "http://localhost:4026";
  }
}

const desc = (name: string) => TOOL_DEFS.find((t) => t.name === name)?.description ?? name;
const teamLink = (input: any, base: string) => {
  const t = resolveTeam(String(input?.team ?? ""));
  return t ? `${base}/team/${t.abbr}` : null;
};

// name -> [zod input shape, deep link (base is the runtime public origin)]
const TEXT_TOOLS: Record<string, [z.ZodRawShape, (input: any, base: string) => string | null]> = {
  list_matches: [
    { team: z.string().optional().describe("Team name or abbreviation, e.g. 'Spain' or 'ESP'"), stage: z.string().optional() },
    (_i, base) => `${base}/matches`,
  ],
  get_match: [{ match_id: z.string().describe("Id from list_matches") }, (i, base) => `${base}/match/${i.match_id}`],
  get_match_conditions: [{ match_id: z.string().describe("Id from list_matches") }, (i, base) => `${base}/match/${i.match_id}`],
  get_team: [{ team: z.string().describe("Team name or abbreviation") }, teamLink],
  get_team_schedule: [{ team: z.string().describe("Team name or abbreviation") }, teamLink],
  get_player: [{ name: z.string() }, (_i, base) => `${base}/players`],
  similar_players: [{ name: z.string().describe("Player name (partial ok)") }, (_i, base) => `${base}/map`],
  get_team_strength: [{ team: z.string().describe("Team name or abbreviation") }, teamLink],
  head_to_head: [
    { team_a: z.string(), team_b: z.string() },
    (i, base) => {
      const a = resolveTeam(String(i?.team_a ?? "")), b = resolveTeam(String(i?.team_b ?? ""));
      return a && b ? `${base}/compare?a=${a.abbr}&b=${b.abbr}` : null;
    },
  ],
  get_referee: [{ match_id: z.string().optional().describe("Optional id from list_matches") }, (_i, base) => `${base}/whistle`],
  simulate_match: [
    { team_a: z.string().describe("Team name or abbreviation"), team_b: z.string().describe("Team name or abbreviation") },
    (i, base) => {
      const a = resolveTeam(String(i?.team_a ?? "")), b = resolveTeam(String(i?.team_b ?? ""));
      return a && b ? `${base}/compare?ta=${a.abbr}&tb=${b.abbr}` : null;
    },
  ],
  leaderboard: [
    {
      metric: z.enum(["goals", "assists", "xg", "avg_rating", "top_speed", "distance", "saves", "passes_completed"]),
      limit: z.number().int().optional().describe("Default 10, max 20"),
    },
    (_i, base) => `${base}/awards`,
  ],
  get_standings: [
    { group: z.string().optional().describe("e.g. 'A', 'Group H' — omit for all groups") },
    (_i, base) => `${base}/tournament`,
  ],
  get_awards: [{}, (_i, base) => `${base}/awards`],
};

// coverage guard: every non-chart tool in TOOL_DEFS must be registered here,
// or it silently won't reach MCP clients (the #1 drift bug of a hand-kept map)
const UNCOVERED = TOOL_DEFS.map((t) => t.name).filter(
  (n) => n !== "render_chart" && !(n in TEXT_TOOLS)
);
if (UNCOVERED.length) console.warn(`[mcp] tools missing from TEXT_TOOLS: ${UNCOVERED.join(", ")}`);

function buildServer(base: string): McpServer {
  const server = new McpServer(
    { name: "mundial26", version: "1.0.0" },
    {
      instructions:
        "Frozen dataset of the 2026 FIFA World Cup (June 11 – July 19, 2026, USA/Canada/México, 48 teams, 104 matches — Spain won the final 1-0 a.e.t. vs Argentina). Per-match FIFA tracking + 365scores data: xG shots, formations, player ratings, heatmap-derived stats, weather, travel. Tool results include a link to the matching MUNDIAL·26 page — share it with the user for the full visual experience. Use render_chart when a comparison lands better visually.",
    }
  );

  for (const [name, [shape, link]] of Object.entries(TEXT_TOOLS)) {
    server.registerTool(name, { description: desc(name), inputSchema: shape }, async (input: any) => {
      const r = runTool(name, input);
      const url = r.isError ? null : link(input, base);
      return {
        content: [{ type: "text" as const, text: url ? `${r.text}\n\nOpen in MUNDIAL·26: ${url}` : r.text }],
        isError: r.isError,
      };
    });
  }

  registerAppTool(
    server,
    "render_chart",
    {
      description: desc("render_chart"),
      inputSchema: {
        type: z.enum(["bar", "scatter"]),
        title: z.string(),
        x_label: z.string().optional(),
        y_label: z.string().optional(),
        items: z
          .array(z.object({ label: z.string(), value: z.number().optional(), x: z.number().optional(), y: z.number().optional() }))
          .max(20),
      },
      _meta: { ui: { resourceUri: CHART_URI } },
    },
    async (input: any) => {
      if (!input.items?.length) return { content: [{ type: "text" as const, text: "Chart needs items." }], isError: true };
      return {
        content: [
          {
            type: "text" as const,
            text: "Chart rendered inline for the user. Continue the answer; no need to repeat the chart's numbers in a table.",
          },
        ],
        structuredContent: input,
      };
    }
  );

  registerAppResource(server, "MUNDIAL·26 chart", CHART_URI, { mimeType: RESOURCE_MIME_TYPE }, async () => ({
    contents: [
      {
        uri: CHART_URI,
        mimeType: RESOURCE_MIME_TYPE,
        text: fs.readFileSync(path.join(process.cwd(), "assets", "mcp-chart-app.html"), "utf8"),
      },
    ],
  }));

  return server;
}

// Stateless: fresh server + transport per request, no session to store.
async function handler(req: Request): Promise<Response> {
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  await buildServer(baseFromReq(req)).connect(transport);
  return transport.handleRequest(req);
}

export { handler as GET, handler as POST, handler as DELETE };
export const maxDuration = 60;
