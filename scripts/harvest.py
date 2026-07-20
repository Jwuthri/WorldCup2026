#!/usr/bin/env python3
"""One-shot harvest of the full WC2026 dataset into data/ as static JSON.
Sources: FIFA v3 + fdh stats (no auth) and 365scores (browser UA).
Idempotent: skips files that already exist, so it can be re-run after failures.
"""
import json, time, urllib.request, urllib.parse, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
COMP, SEASON = 17, 285023
S365 = "https://webws.365scores.com/web"
S365Q = "appTypeId=5&langId=1&timezoneName=America/New_York&userCountryId=1"
DELAY = 0.25
stats = {"fetched": 0, "skipped": 0, "failed": []}

def get(url, dest, binary=False):
    dest = ROOT / dest
    if dest.exists() and dest.stat().st_size > 2:
        stats["skipped"] += 1
        return json.loads(dest.read_text()) if not binary else None
    dest.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            body = r.read()
        data = json.loads(body)
        dest.write_text(json.dumps(data, ensure_ascii=False))
        stats["fetched"] += 1
        time.sleep(DELAY)
        return data
    except Exception as e:
        stats["failed"].append((url, str(e)))
        time.sleep(DELAY)
        return None

# ---- FIFA spine ----
cal = get(f"https://api.fifa.com/api/v3/calendar/matches?idCompetition={COMP}&idSeason={SEASON}&language=en&count=500", "fifa/calendar.json")
if not cal:
    sys.exit("calendar fetch failed — aborting")
matches = cal.get("Results", [])
print(f"calendar: {len(matches)} matches", flush=True)

get(f"https://api.fifa.com/api/v3/calendar/{COMP}/{SEASON}/289273/standing?language=en", "fifa/standings.json")
get(f"https://api.fifa.com/api/v3/groupstanding/third/{SEASON}?language=en", "fifa/third_place.json")
get(f"https://fdh-api.fifa.com/v1/stats/season/{SEASON}/players.json", "fifa/season_players.json")
get(f"https://fdh-api.fifa.com/v1/stats/season/{SEASON}/teams.json", "fifa/season_teams.json")
get(f"https://api.fifa.com/api/v3/topseasonplayerstatistics/season/{SEASON}/topscorers?language=en", "fifa/topscorers.json")

for i, m in enumerate(matches):
    mid, stage = m["IdMatch"], m["IdStage"]
    ifes = (m.get("Properties") or {}).get("IdIFES")
    get(f"https://api.fifa.com/api/v3/live/football/{COMP}/{SEASON}/{stage}/{mid}?language=en", f"fifa/matches/{mid}.live.json")
    get(f"https://api.fifa.com/api/v3/timelines/{COMP}/{SEASON}/{stage}/{mid}?language=en", f"fifa/matches/{mid}.timeline.json")
    if ifes:
        get(f"https://fdh-api.fifa.com/v1/stats/match/{ifes}/players.json", f"fifa/matches/{mid}.players.json")
        get(f"https://fdh-api.fifa.com/v1/stats/match/{ifes}/teams.json", f"fifa/matches/{mid}.teams.json")
    if i % 10 == 0:
        print(f"fifa match {i+1}/{len(matches)}", flush=True)

# ---- squads (birthdates, heights, caps) for all 48 teams ----
team_ids = sorted({m[s]["IdTeam"] for m in matches for s in ("Home", "Away") if m.get(s)})
for tid in team_ids:
    get(f"https://api.fifa.com/api/v3/teams/{tid}/squad?idCompetition={COMP}&idSeason={SEASON}&language=en",
        f"fifa/squads/{tid}.json")
print(f"squads: {len(team_ids)} teams", flush=True)

# ---- 365scores: enumerate all games for competition 5930 via date windows ----
games, seen = [], set()
WINDOWS = [("11/06/2026", "20/06/2026"), ("21/06/2026", "30/06/2026"),
           ("01/07/2026", "10/07/2026"), ("11/07/2026", "19/07/2026")]
for wi, (d1, d2) in enumerate(WINDOWS):
    d = get(f"{S365}/games/?{S365Q}&competitions=5930&startDate={d1}&endDate={d2}&showOdds=false",
            f"s365/window_{wi}.json")
    for g in (d or {}).get("games", []):
        if g["id"] not in seen:
            seen.add(g["id"])
            games.append(g)
print(f"365scores: {len(games)} games enumerated", flush=True)
(ROOT / "s365").mkdir(parents=True, exist_ok=True)
(ROOT / "s365/games_index.json").write_text(json.dumps(
    [{"id": g["id"], "startTime": g.get("startTime"),
      "home": (g.get("homeCompetitor") or {}).get("name"),
      "away": (g.get("awayCompetitor") or {}).get("name"),
      "homeScore": (g.get("homeCompetitor") or {}).get("score"),
      "awayScore": (g.get("awayCompetitor") or {}).get("score")} for g in games],
    ensure_ascii=False))

for i, g in enumerate(games):
    gid = g["id"]
    get(f"{S365}/game/?{S365Q}&gameId={gid}", f"s365/games/{gid}.json")
    get(f"{S365}/game/stats/?{S365Q}&games={gid}", f"s365/games/{gid}.stats.json")
    if i % 10 == 0:
        print(f"s365 game {i+1}/{len(games)}", flush=True)

print(f"\nDONE fetched={stats['fetched']} skipped={stats['skipped']} failed={len(stats['failed'])}")
for u, e in stats["failed"][:20]:
    print("FAIL", u, e)
