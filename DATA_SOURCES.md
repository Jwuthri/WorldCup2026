# WC2026 Data Sources — verified 2026-07-19 (final day)

Every endpoint below was hit live and returned real WC2026 data. Tournament: 104 matches, 2026-06-11 → 2026-07-19. Final: Spain vs Argentina (FIFA IdMatch `400021543`, IdIFES `151710`, 365scores gameId `4773219`).

## Tier 1 — primary (no auth, CORS `*`, verified)

### FIFA official APIs — the backbone
Key IDs: competition `17`, season `285023`, group stage `289273`, semis `289290`, bronze `289291`, final stage `289292`.

| Endpoint | Gives us |
|---|---|
| `api.fifa.com/api/v3/calendar/matches?idCompetition=17&idSeason=285023&language=en&count=500` | All 104 matches: scores, stages/groups, stadiums, attendance, refs, formation string (`Tactics`), `Properties.IdIFES` (join key to stats) |
| `api.fifa.com/api/v3/live/football/17/285023/{idStage}/{idMatch}?language=en` | 26-man lineups (starter/bench, shirt, position, captain), goals w/ assists, subs, bookings, coaches, weather, **player headshot URLs**. `LineupX/Y` exists but is null — don't rely on it |
| `api.fifa.com/api/v3/timelines/17/285023/{idStage}/{idMatch}?language=en` | 80–123 timestamped events/match with **pitch coords (`PositionX/Y`) + goal-mouth coords (`GoalGatePositionX/Y`)** on shots/saves — shot & save maps |
| `fdh-api.fifa.com/v1/stats/match/{IdIFES}/players.json` | **116 metrics × every player × every match**: XG, passes, pressures, line-breaks, GK suite, and physical tracking (TotalDistance, TopSpeed, sprint bands) |
| `fdh-api.fifa.com/v1/stats/match/{IdIFES}/teams.json` | 142 team metrics: possession, XG, `Threat`, high/mid/low/counter-press phases, `BallRecoveryTime`, forced turnovers |
| `fdh-api.fifa.com/v1/stats/season/285023/players.json` (5.2MB) | Tournament aggregates, all 1259 players (~115 metrics) |
| `fdh-api.fifa.com/v1/stats/season/285023/teams.json` | Tournament aggregates per team (141 metrics) |
| `api.fifa.com/api/v3/calendar/17/285023/289273/standing` + `api.fifa.com/api/v3/groupstanding/third/285023` | 12 group tables + the ranked third-place table (48-team format) |
| `digitalhub.fifa.com/transform/{uuid}/{Name}_{id}` (from `PlayerPicture.PictureUrl`) | High-res headshots, resizable via `?io=transform:fill,width:256`, hotlinkable (6-month CDN cache) |
| `api.fifa.com/api/v3/picture/flags-sq-4/{ABBR}` | Team flag PNGs |

Caveats: no match ratings, no heatmap point arrays; undocumented API (could change without notice); cache max-age=10s on fdh = near-real-time.

### 365scores unofficial API — ratings, heatmaps, xG shot charts
No auth, plain curl OK with browser UA. Competition `5930`.
- `webws.365scores.com/web/game/?appTypeId=5&langId=1&timezoneName=America/New_York&userCountryId=1&gameId={id}` — per-player **match rating**, categorized stat lines, **pre-rendered heatmap image per player**, formation + per-player field coordinates (`yardFormation`), `chartEvents` shots with `xg`, `xgot`, body part, pitch + goal-mouth coords
- `.../web/game/stats/?...&games={id}` — ~86 team stat rows (possession, xG, big chances)
- `.../web/standings/?...&competitions=5930&live=true`
- Photos: `imagecache.365scores.com/image/upload/f_png,w_200,d_Athletes:default.png,r_max,c_thumb,g_face,z_0.65/v{imageVersion}/Athletes/{athleteId}`

## Tier 2 — valuable, more friction
- **Sofascore** (`www.sofascore.com/api/v1`, ut `16`, season `58210`): the richest single source — ~35 per-player match metrics, heatmap **point arrays**, average positions, momentum graph, top players in 32 categories incl. km covered/top speed, team of the week. **But** Cloudflare TLS-fingerprint blocking: works from real browser context only (or curl_cffi impersonation). Use as enrichment, not backbone.
- **FIFA Training Centre PMSR PDFs** (`fifatrainingcentre.com/.../PMSR-M{01..103}...pdf`) — official 52-page post-match reports: per-player in/out-of-possession + physical data, phases of play. Great for deep-dive features; PDF parsing required.
- **TheSportsDB** (free key `3`, league `4429`, season `2026`) — lineups w/ transparent player cutouts, timelines, badges, YouTube highlight links.
- **Kaggle `swaptr/fifa-wc-2026-*`** (CC0, updated daily, anonymous download) — FBref-schema CSVs; handy for offline ML later.
- **Wikimedia Commons** — CC-licensed real photos from the 2026 tournament (players in action, stadiums) with machine-readable license/attribution metadata.

## Not worth it
- **FBref**: WC2026 is basic-tier — no xG, empty advanced tables; Cloudflare + 10 req/min. FIFA's own data beats it here.
- **football-data.org / API-Football**: fixtures/results only on free tiers; nothing the FIFA API doesn't already give free.
- **StatsBomb open data**: nothing for 2026 yet — historically drops weeks after the final (2022 has full events + 360 freeze-frames). Watch `github.com/statsbomb/open-data` — unlocks per-second possession playback.
- **True tracking data** (ball + 22 players continuous): collected by FIFA/Hawk-Eye, never public. Closest public proxies: FIFA physical aggregates (have), StatsBomb 360 (later).

## Strategy
Harvest everything once into `data/` as static JSON (tournament is over — the dataset is now frozen); the app reads local files, zero runtime API dependency. Join keys: FIFA `IdMatch` ↔ `IdIFES` ↔ 365scores gameId (by date + teams); FIFA `Properties.IdStatsPerform` if Opta cross-ref ever needed.

## Licensing for a public fan site
- Raw stats/facts: not copyrightable (US). Present them in our own design, no provider branding.
- FIFA marks: don't use "FIFA", the official emblem, trophy imagery, or "FIFA World Cup 26" in branding/domain; naming like "the 2026 tournament" + disclaimer ("unofficial fan project, not affiliated with FIFA") is the safe lane.
- Headshots: digitalhub is technically hotlinkable (CORS `*`, long cache) but unlicensed — acceptable risk for a free fan project; Wikimedia CC photos are the clean alternative (attribution required).
- Flags: flagcdn / circle-flags are safe. Federation crests are trademarks — prefer flags.
