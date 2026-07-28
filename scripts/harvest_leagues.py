#!/usr/bin/env python3
"""Harvest every finished match of the big-five 2025/26 seasons from 365scores.

~1,750 matches. Two calls each (game + team stats), pruned to the fields the app
actually renders and written as one file per match:

    data/leagues/<slug>/index.json        the season's match list (the "calendar")
    data/leagues/<slug>/games/<id>.json   {game, stats} pruned

Pruning matters: raw payloads are ~134 KB each (mostly recentMatches/widgets
blobs), which would put >200 MB into a repo whose deploy reads data/ off disk.
The kept fields are ~5x smaller and lose nothing the pages use.

Resumable — already-written match files are skipped, so re-running only fetches
what is missing. `python3 scripts/harvest_leagues.py --only premier-league-2025-26`
limits it to one league.
"""
from __future__ import annotations

import argparse
import calendar
import json
import pathlib
import sys
import threading
import time
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
B = "https://webws.365scores.com/web"
Q = "appTypeId=5&langId=1&timezoneName=America/New_York&userCountryId=1"
ROOT = pathlib.Path(__file__).resolve().parent.parent / "data" / "leagues"

# slug, competition id, seasonNum, name, country
LEAGUES = [
    ("premier-league-2025-26", 7, 131, "Premier League", "England"),
    ("laliga-2025-26", 11, 98, "LaLiga", "Spain"),
    ("serie-a-2025-26", 17, 124, "Serie A", "Italy"),
    ("bundesliga-2025-26", 25, 117, "Bundesliga", "Germany"),
    ("ligue-1-2025-26", 35, 93, "Ligue 1", "France"),
]

# a European season runs Jul->Jun; the games endpoint caps a window at ~1 month
MONTHS = [(2025, m) for m in range(7, 13)] + [(2026, m) for m in range(1, 7)]

WORKERS = 5
_print_lock = threading.Lock()


def log(msg: str) -> None:
    with _print_lock:
        print(msg, flush=True)


def get(url: str, tries: int = 3) -> dict:
    last: Exception | None = None
    for attempt in range(tries):
        try:
            req = urllib.request.Request(url, headers={"User-Agent": UA})
            with urllib.request.urlopen(req, timeout=60) as r:
                return json.load(r)
        except Exception as exc:  # noqa: BLE001 - transient network/JSON, retry
            last = exc
            time.sleep(1.5 * (attempt + 1))
    raise RuntimeError(f"{url} failed after {tries}: {last}")


# ---------------------------------------------------------------- pruning

def keep(d: dict | None, fields: tuple[str, ...]) -> dict:
    return {k: d.get(k) for k in fields if d and d.get(k) is not None} if d else {}


def prune_member(m: dict, names: dict[str, int]) -> dict:
    """A lineup entry: rating, heatmap, pitch slot and the stat lines.

    Stat names are interned into a per-file table (`game.statNames`) and stored as
    [index, value] pairs. The same ~45 names otherwise repeat for all 32 players in
    every one of ~1,750 files, which is most of the payload. categoryId is dropped:
    nothing reads it.
    """
    out = keep(m, ("id", "competitorId", "status", "statusText", "ranking", "heatMap"))
    if m.get("position"):
        out["position"] = {"name": m["position"].get("name")}
    if m.get("yardFormation"):
        out["yardFormation"] = keep(
            m["yardFormation"], ("line", "fieldPosition", "fieldLine", "fieldSide")
        )
    stats = []
    for s in m.get("stats") or []:
        nm = s.get("name")
        if nm is None:
            continue
        stats.append([names.setdefault(nm, len(names)), s.get("value")])
    out["stats"] = stats
    return out


def prune_side(c: dict | None, names: dict[str, int]) -> dict:
    out = keep(
        c,
        ("id", "name", "shortName", "nameForURL", "score", "color", "awayColor",
         "imageVersion", "countryId"),
    )
    ls = (c or {}).get("lineups") or {}
    out["lineups"] = {
        "formation": ls.get("formation"),
        "members": [prune_member(m, names) for m in (ls.get("members") or [])],
    }
    return out


def prune_game(g: dict) -> dict:
    names: dict[str, int] = {}
    out = keep(
        g,
        ("id", "competitionId", "competitionDisplayName", "seasonNum", "stageNum",
         "roundNum", "roundName", "startTime", "statusText", "shortStatusText",
         "gameTime", "actualPlayTime"),
    )
    out["homeCompetitor"] = prune_side(g.get("homeCompetitor"), names)
    out["awayCompetitor"] = prune_side(g.get("awayCompetitor"), names)
    out["members"] = [
        keep(m, ("id", "athleteId", "name", "shortName", "nameForURL",
                 "jerseyNumber", "competitorId", "imageVersion"))
        for m in (g.get("members") or [])
    ]
    out["events"] = [
        keep(e, ("competitorId", "gameTime", "addedTime", "gameTimeDisplay",
                 "playerId", "eventType", "isMajor", "statusId"))
        for e in (g.get("events") or [])
    ]
    out["chartEvents"] = {"events": (g.get("chartEvents") or {}).get("events") or []}
    if g.get("venue"):
        out["venue"] = keep(g["venue"], ("id", "name", "capacity", "attendance", "googlePlaceId"))
    out["officials"] = [
        keep(o, ("id", "athleteId", "name")) for o in (g.get("officials") or [])
    ]
    # written last: prune_side populated it while walking the lineups
    out["statNames"] = [n for n, _ in sorted(names.items(), key=lambda kv: kv[1])]
    return out


def prune_stats(payload: dict) -> list[dict]:
    return [
        {
            "name": r.get("name"),
            "value": r.get("value"),
            "competitorId": r.get("competitorId"),
            "categoryName": r.get("categoryName"),
        }
        for r in (payload.get("statistics") or [])
    ]


# ---------------------------------------------------------------- harvest

def enumerate_games(comp: int, season: int) -> dict[int, dict]:
    """Walk the season month by month; the endpoint returns 0 for wider spans."""
    found: dict[int, dict] = {}
    for year, month in MONTHS:
        last = calendar.monthrange(year, month)[1]
        d1 = f"01/{month:02d}/{year}"
        d2 = f"{last}/{month:02d}/{year}"
        try:
            d = get(f"{B}/games/?{Q}&competitions={comp}&startDate={d1}&endDate={d2}&showOdds=false")
        except RuntimeError as exc:
            log(f"    !! window {d1}-{d2}: {exc}")
            continue
        for g in d.get("games") or []:
            if g.get("seasonNum") != season:
                continue
            # finished only: both sides carry a score
            if (g.get("homeCompetitor") or {}).get("score") is None:
                continue
            if (g.get("awayCompetitor") or {}).get("score") is None:
                continue
            found[g["id"]] = g
    return found


def fetch_match(gid: int, out_dir: pathlib.Path) -> str:
    path = out_dir / f"{gid}.json"
    if path.exists() and path.stat().st_size > 500:
        return "skip"
    game = get(f"{B}/game/?{Q}&gameId={gid}").get("game") or {}
    stats = get(f"{B}/game/stats/?{Q}&games={gid}")
    path.write_text(
        json.dumps({"game": prune_game(game), "stats": prune_stats(stats)}, ensure_ascii=False)
    )
    return "new"


def index_row(g: dict) -> dict:
    h, a = g.get("homeCompetitor") or {}, g.get("awayCompetitor") or {}
    return {
        "id": g["id"],
        "startTime": g.get("startTime"),
        "roundNum": g.get("roundNum"),
        "statusText": g.get("statusText"),
        "venue": (g.get("venue") or {}).get("name"),
        "home": keep(h, ("id", "name", "shortName", "score", "color", "nameForURL")),
        "away": keep(a, ("id", "name", "shortName", "score", "color", "nameForURL")),
    }


def run_league(slug: str, comp: int, season: int, name: str, country: str) -> dict:
    log(f"\n=== {name} ({slug})  comp={comp} season={season}")
    games_dir = ROOT / slug / "games"
    games_dir.mkdir(parents=True, exist_ok=True)

    found = enumerate_games(comp, season)
    log(f"  enumerated {len(found)} finished matches")
    if not found:
        return {"slug": slug, "matches": 0}

    ids = sorted(found)
    done = new = failed = 0
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futs = {pool.submit(fetch_match, gid, games_dir): gid for gid in ids}
        for fut in as_completed(futs):
            gid = futs[fut]
            try:
                if fut.result() == "new":
                    new += 1
            except Exception as exc:  # noqa: BLE001 - report and continue
                failed += 1
                log(f"    !! game {gid}: {exc}")
            done += 1
            if done % 50 == 0:
                log(f"    {done}/{len(ids)} ({new} fetched, {failed} failed)")

    rows = [index_row(found[i]) for i in ids]
    rows.sort(key=lambda r: (r.get("startTime") or ""))
    (ROOT / slug / "index.json").write_text(
        json.dumps(
            {
                "slug": slug,
                "name": name,
                "country": country,
                "season": "2025/26",
                "competitionId": comp,
                "seasonNum": season,
                "matches": rows,
            },
            ensure_ascii=False,
        )
    )
    size = sum(f.stat().st_size for f in games_dir.glob("*.json"))
    log(f"  {name}: {len(rows)} matches, {new} newly fetched, {failed} failed, {size // 1024 // 1024} MB")
    return {"slug": slug, "matches": len(rows), "failed": failed, "bytes": size}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="single league slug")
    args = ap.parse_args()

    leagues = [l for l in LEAGUES if not args.only or l[0] == args.only]
    if not leagues:
        sys.exit(f"no league matching {args.only!r}")

    started = time.time()
    summary = [run_league(*l) for l in leagues]
    total_mb = sum(s.get("bytes", 0) for s in summary) // 1024 // 1024
    total_m = sum(s["matches"] for s in summary)
    total_f = sum(s.get("failed", 0) for s in summary)
    log(f"\nDONE {total_m} matches, {total_f} failed, {total_mb} MB, "
        f"{int(time.time() - started)}s")


if __name__ == "__main__":
    main()
