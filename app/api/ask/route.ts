import Anthropic from "@anthropic-ai/sdk";
import { TOOL_DEFS, runTool } from "@/lib/aiTools";

export const runtime = "nodejs";

const SYSTEM = `You are the resident analyst of MUNDIAL·26, a data theater for the 2026 World Cup (June 11 – July 19, 2026, USA/Canada/México; Spain beat Argentina 1–0 after extra time in the final).

You have tools over the complete tournament database — real FIFA stadium-tracking data (xG, press phases, ball-recovery time, distances, top speeds), every match, every player — plus real context: World Football Elo ratings and pre-tournament form (get_team_strength) for judging strength and quantifying upsets, all-time head-to-head history (head_to_head), referee card tendencies (get_referee), kickoff weather, stadium altitude/roof/fill, local kickoff times, and each team's travel and rest between matches (get_match_conditions, get_team_schedule). Work like an analyst: retrieve what the question touches before answering (typically 2–6 tool calls). For "was it an upset" use Elo + form; for tactical questions use team profiles + get_match; for fatigue/heat/altitude use conditions/schedule (but respect the roofed flag — no heat narratives for climate-controlled stadiums). Prefer looking a number up over recalling it; never invent a number that didn't come back from a tool. If the data can't answer something, say exactly what's missing.

Output:
- Well-structured markdown: short paragraphs, **bold** the decisive numbers, a compact table when comparing rows of figures, headings only when the answer is long.
- Call render_chart when a comparison lands better visually than prose (bar for rankings/comparisons, scatter for two-metric relationships). At most 1–2 charts, and don't repeat a chart's numbers in a table.
- Be direct and opinionated, like a sharp pundit who has read the data. Tight over exhaustive.`;

type ChatMsg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  // ponytail: /ask off by default on public deploy (don't burn the API key). Set ASK_ENABLED=true to turn on.
  if (process.env.ASK_ENABLED !== "true") return new Response("Not found", { status: 404 });

  let body: { messages?: ChatMsg[] };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const history = (body.messages ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim())
    .slice(-12)
    .map((m) => ({ role: m.role, content: m.content.slice(0, 8000) }));
  if (!history.length || history[history.length - 1].role !== "user")
    return Response.json({ error: "Send at least one user message." }, { status: 400 });

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      const client = new Anthropic();
      const messages: Anthropic.MessageParam[] = history.map((m) => ({ role: m.role, content: m.content }));
      try {
        for (let turn = 0; turn < 8; turn++) {
          const s = client.messages.stream({
            model: "claude-sonnet-5",
            max_tokens: 16000,
            thinking: { type: "adaptive" },
            system: [{ type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } }],
            tools: TOOL_DEFS,
            messages,
          });
          s.on("text", (delta) => send({ type: "text", delta }));
          const msg = await s.finalMessage();

          if (msg.stop_reason === "pause_turn") {
            messages.push({ role: "assistant", content: msg.content });
            continue;
          }
          if (msg.stop_reason !== "tool_use") break;

          messages.push({ role: "assistant", content: msg.content });
          const results: Anthropic.ToolResultBlockParam[] = [];
          for (const block of msg.content) {
            if (block.type !== "tool_use") continue;
            send({ type: "tool", name: block.name, input: block.input });
            if (block.name === "render_chart") send({ type: "chart", spec: block.input });
            const out = runTool(block.name, block.input);
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: out.text,
              is_error: out.isError,
            });
          }
          messages.push({ role: "user", content: results });
        }
        send({ type: "done" });
      } catch (error) {
        let message = "Something went wrong.";
        if (error instanceof Anthropic.AuthenticationError) message = "Invalid Anthropic API key — check .env.local.";
        else if (error instanceof Anthropic.RateLimitError) message = "Rate limited — try again in a moment.";
        else if (error instanceof Anthropic.APIError) message = `Claude API error: ${error.message}`;
        else if (error instanceof Error && /authentication method/i.test(error.message))
          message = "No Anthropic credentials found. Add ANTHROPIC_API_KEY to .env.local and restart the dev server.";
        send({ type: "error", message });
      }
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
