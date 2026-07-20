import Link from "next/link";
import CopyUrl from "./CopyUrl";

export const metadata = {
  title: "Connect your AI — MUNDIAL·26",
  description:
    "Plug the tournament database into your own Claude or ChatGPT via MCP — every stat, every match, charts included.",
};

const TOOLS: [string, string][] = [
  ["list_matches", "every match with ids, filterable by team or stage"],
  ["get_match", "the full match file — xG shots, duel stats, formations, top ratings"],
  ["get_team", "identity profile vs all 48 teams, results, squad"],
  ["get_player", "card ratings, season totals, match-by-match"],
  ["leaderboard", "top players by goals, xG, speed, distance…"],
  ["get_match_conditions", "weather, altitude, roof, kickoff time"],
  ["get_team_schedule", "travel km, rest days, fatigue math"],
  ["render_chart", "draws bar/scatter charts inside the chat"],
];

const PROMPTS = [
  "Who overperformed their xG the most this tournament?",
  "Compare Spain and France's pressing numbers.",
  "Chart the golden boot race against expected goals.",
  "Did altitude at the Azteca actually change anything?",
  "Which team had the most brutal travel schedule?",
  "Build the case that Rodri deserved the Golden Ball.",
];

export default function ConnectPage() {
  return (
    <main className="mx-auto max-w-4xl px-4 py-10 sm:px-8">
      <p className="eyebrow mb-3">MCP · Model Context Protocol</p>
      <h1 className="display mb-3 text-5xl font-bold leading-none">Chat with the tournament from your own AI</h1>
      <p className="mb-8 max-w-2xl text-sm text-dim">
        This site is also an MCP server. Add one URL to Claude and it can query every number in
        this database mid-conversation — and draw our charts right inside the chat. Free and
        read-only; your AI subscription does the thinking. No account, no key, nothing to install
        on our side.
      </p>

      <div className="mb-12 max-w-2xl">
        <CopyUrl />
      </div>

      <section className="mb-12 grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border border-pitchline bg-surface p-4">
          <h2 className="display text-xl font-semibold">Claude</h2>
          <p className="text-xs text-gold">interactive charts in-chat</p>
          <p className="mb-2 text-xs text-faint">claude.ai or Claude Desktop — Pro, Max, or Team</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-dim">
            <li>Settings → <span className="text-chalk">Connectors</span></li>
            <li><span className="text-chalk">Add custom connector</span> → paste the URL above</li>
            <li>In a new chat, enable it under the search &amp; tools menu</li>
          </ol>
        </div>
        <div className="rounded-lg border border-pitchline bg-surface p-4">
          <h2 className="display text-xl font-semibold">Claude Code</h2>
          <p className="mb-2 text-xs text-faint">one command in your terminal</p>
          <div className="text-xs">
            <CopyUrl template="claude mcp add --transport http mundial26 {url}" wrap />
          </div>
        </div>
        <div className="rounded-lg border border-pitchline bg-surface p-4">
          <h2 className="display text-xl font-semibold">ChatGPT</h2>
          <p className="mb-2 text-xs text-faint">Plus/Pro, developer mode</p>
          <ol className="list-decimal space-y-1.5 pl-4 text-sm text-dim">
            <li>Settings → <span className="text-chalk">Apps &amp; Connectors</span> → enable developer mode</li>
            <li>Create a connector with the URL above</li>
          </ol>
          <p className="mt-2 text-xs text-faint">Answers and links work; charts arrive as text — the pretty ones are a Claude thing.</p>
        </div>
      </section>

      <section className="mb-12">
        <h2 className="display mb-1 text-3xl font-semibold">What your AI gets</h2>
        <p className="mb-5 text-sm text-dim">
          Eight tools over the frozen tournament database — FIFA stadium tracking, xG shot data,
          ratings, weather, travel. Every answer links back to the matching page here.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {TOOLS.map(([name, blurb]) => (
            <div key={name} className="flex items-baseline gap-3 rounded border border-pitchline bg-surface px-3 py-2">
              <code className="data shrink-0 text-sm text-gold">{name}</code>
              <span className="text-xs text-dim">{blurb}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="mb-12">
        <h2 className="display mb-1 text-3xl font-semibold">Things worth asking</h2>
        <div className="mt-4 flex flex-wrap gap-2">
          {PROMPTS.map((p) => (
            <span key={p} className="rounded-full border border-pitchline bg-surface px-3.5 py-1.5 text-sm text-dim">
              {p}
            </span>
          ))}
        </div>
      </section>

      <p className="text-sm text-dim">
        No paid AI plan? The built-in analyst at{" "}
        <Link href="/ask" className="text-gold underline-offset-4 hover:underline">
          Ask the data
        </Link>{" "}
        answers the same questions right here.
      </p>
    </main>
  );
}
