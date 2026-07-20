# MUNDIAL·26

An unofficial data theater for the 2026 World Cup. Every number is real — FIFA stadium-tracking
data (xG, sprints, press phases), match ratings, and heatmaps for all 104 matches, 1,000+
players, and 48 teams. Not affiliated with FIFA.

## Run it

```bash
npm install
npm run dev
```

Open **http://localhost:4026** — the port is pinned, so this URL is always the same.
(Port 3000 is avoided on purpose: OrbStack occupies it on this machine.)

| Command | What it does |
|---|---|
| `npm run dev` | Dev server at http://localhost:4026 |
| `npm run build` | Production build (pre-renders ~1,200 static pages). ⚠️ Kills a running dev server's cache — restart `npm run dev` after building. |
| `npm start` | Serve the production build at http://localhost:4026 (run `npm run build` first) |
| `npm run harvest` | Re-download all tournament data into `data/` (only needed if `data/` is missing — it's idempotent and skips existing files) |
| `npm run enrich` | Fetch kickoff weather for all matches from Open-Meteo into `data/enrich/` (free, no key; idempotent) |
| `npm run ml` | Recompute the ML layer (`data/ml/ml.json`): style vectors, similar players, k-means archetypes, t-SNE map coords, team style families. Needs `pip install scikit-learn`. Deterministic (seed 26). |

## The AI feature ("Ask the data")

`/ask` is an agentic analyst chat: Claude gets tools over the local database
(`get_team`, `get_match`, `get_player`, `leaderboard`, `render_chart`) and decides what to
retrieve per question. Answers stream in live, each retrieval shows as a chip in the
transcript, output is markdown, and the model can draw bar/scatter charts inline.
It needs an Anthropic API key:

1. Create a file called `.env.local` in the project root:
   ```
   ANTHROPIC_API_KEY=sk-ant-...
   ```
   (Get a key at console.anthropic.com. The file is gitignored — it never leaves your machine.)
2. Restart `npm run dev`.

Without the key, the rest of the app works fine; `/ask` shows an error message.
Each question costs a few cents (Claude Opus reads a ~15k-token data dossier).

## The MCP server (bring your own model)

`/api/mcp` exposes the same 13 data tools as a remote MCP server, so anyone can chat with the
tournament data from **their own** Claude (or any MCP client) — no API key on our side, their
subscription pays for the tokens. `render_chart` is an [MCP App](https://modelcontextprotocol.io/docs/extensions/apps):
hosts that support the extension (Claude, Claude Desktop, VS Code…) render our bar/scatter
charts interactively inside the chat, in the site's night-turf look. Every tool result links
back to the matching page here.

Connect it:

- **claude.ai / Claude Desktop** (Pro/Max/Team): Settings → Connectors → Add custom connector → `https://<your-domain>/api/mcp`
- **Claude Code**: `claude mcp add --transport http mundial26 https://<your-domain>/api/mcp`
- **ChatGPT** (developer mode connectors): same URL — tools + deep links work; charts fall back to text (ChatGPT's app UI system is separate from MCP Apps).

Pieces: [app/api/mcp/route.ts](app/api/mcp/route.ts) (stateless Streamable HTTP, one server per
request), [lib/aiTools.ts](lib/aiTools.ts) (shared tool layer, also used by `/ask`),
[mcp-app/chart.ts](mcp-app/chart.ts) (the chart iframe; `npm run build:mcp-app` bundles it to
`assets/mcp-chart-app.html` — runs automatically before `next build`).

## Pages

| Route | What's there |
|---|---|
| `/` | Champions hero, tournament numbers, golden boot, knockout bracket |
| `/matches` | All 104 matches by stage and group |
| `/match/[id]` | **The Match Theater**: formations on the pitch with photos + ratings, xG shot map with goal-mouth placement, per-player match files (heatmap + stats), xG pulse strip, team duel, event feed |
| `/players` | Every player's real-data card (searchable, filterable) |
| `/player/[id]` | Full card + "the receipts" (real totals) + match-by-match ratings |
| `/team/[abbr]` | Team identity (percentile profile vs all 48 teams), results, squad — e.g. `/team/ESP` |
| `/map` | **The tribes**: all 523 regular outfielders sorted into 8 k-means style archetypes — face walls, plain-word traits, and a "who plays like X" finder. Team style families below. Fortune index (10k xG Monte Carlo per group match) shows on `/tournament` + team pages. |
| `/compare` | Two cards + stat radar, shareable via URL params |
| `/ask` | Tactical Q&A over the data (needs the API key above) |
| `/connect` | Visitor-facing guide to the MCP server — connect the database to their own Claude/ChatGPT |

## How it works

- `data/` (~40 MB of JSON) is the entire dataset, harvested once from FIFA's public APIs and
  365scores after the final. The tournament is over, so the data is frozen — the app makes **no
  external API calls at runtime** (except `/api/ask`, which calls Claude).
- `scripts/harvest.py` is the downloader. `lib/data.ts` joins FIFA ↔ 365scores per match;
  `lib/cards.ts` computes player cards (every stat is a tournament percentile); `lib/teams.ts`
  does the same for teams.
- Where the data comes from, what was verified, and the licensing notes for publishing:
  see [DATA_SOURCES.md](DATA_SOURCES.md).

## Troubleshooting

- **"The server is down"** — usually one of: (a) `npm run build` was run while the dev server
  was up (their caches conflict — just restart `npm run dev`), or (b) the terminal running
  `npm run dev` was closed. The URL is always http://localhost:4026.
- **Pages error about missing files** — `data/` is incomplete; run `npm run harvest`.
- **`/ask` says no credentials** — set up `.env.local` as above and restart.
