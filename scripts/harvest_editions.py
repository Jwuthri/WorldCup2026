#!/usr/bin/env python3
"""Harvest the headline spine for each competition-season shown in the chooser.

Two calls per league (standings + leaders) -> data/editions.json. That's all the
menu needs; the deep per-match harvest is a separate, much bigger job.

ponytail: no caching/retry layer, it's 14 requests. Re-run it if one 500s.
"""
import json
import pathlib
import sys
import time
import urllib.parse
import urllib.request

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36"
B = "https://webws.365scores.com/web"
Q = "appTypeId=5&langId=1&timezoneName=America/New_York&userCountryId=1"
OUT = pathlib.Path(__file__).resolve().parent.parent / "data" / "editions.json"

# slug, 365 competition id, season num, display name
LEAGUES = [
    ("premier-league-2025-26", 7, 131, "Premier League", "England"),
    ("laliga-2025-26", 11, 98, "LaLiga", "Spain"),
    ("serie-a-2025-26", 17, 124, "Serie A", "Italy"),
    ("bundesliga-2025-26", 25, 117, "Bundesliga", "Germany"),
    ("ligue-1-2025-26", 35, 93, "Ligue 1", "France"),
    # UEFA Europa League (comp 573) is deliberately absent: its standings endpoint
    # serves a 12x4 group table (48 rows, positions restarting at 1) for every
    # seasonNum/stageNum tried, so there is no single final table to show. It needs
    # league-phase + bracket handling before it earns a tile.
]


def get(url: str) -> dict:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=45) as r:
        return json.load(r)


def standings(comp: int, season: int) -> list[dict]:
    d = get(f"{B}/standings/?{Q}&competitions={comp}&seasonNum={season}&stageNum=1&live=false")
    tables = d.get("standings") or []
    return (tables[0].get("rows") or []) if tables else []


def leaders(comp: int) -> dict[str, dict]:
    """{stat name: {player, team, value}} — the league's own top-N boards."""
    d = get(f"{B}/stats/?{Q}&competitions={comp}")
    out = {}
    for blk in (d.get("stats") or {}).get("athletesStats") or []:
        rows = blk.get("rows") or []
        if not rows:
            continue
        e = rows[0].get("entity") or {}
        stats = rows[0].get("stats") or []
        out[blk.get("name")] = {
            "player": e.get("name"),
            "athleteId": e.get("id"),
            "imageVersion": e.get("imageVersion"),
            "position": e.get("positionName"),
            "value": stats[0].get("value") if stats else None,
        }
    return out


def build(slug, comp, season, name, country) -> dict:
    rows = standings(comp, season)
    if not rows:
        raise RuntimeError(f"{slug}: empty standings (wrong seasonNum?)")
    goals = sum(int(r.get("for") or 0) for r in rows)
    played = sum(int(r.get("gamePlayed") or 0) for r in rows)
    top = rows[0]
    return {
        "slug": slug,
        "name": name,
        "country": country,
        "season": "2025/26",
        "source": {"provider": "365scores", "competitionId": comp, "seasonNum": season},
        "depth": "summary",  # deep per-match data not harvested yet
        "champion": (top.get("competitor") or {}).get("name"),
        "championPts": top.get("points"),
        "teams": len(rows),
        "matches": played // 2,
        "goals": goals,
        "goalsPerGame": round(goals / (played / 2), 2) if played else None,
        "leaders": leaders(comp),
        "table": [
            {
                "pos": r.get("position"),
                "name": (r.get("competitor") or {}).get("name"),
                "id": (r.get("competitor") or {}).get("id"),
                "played": r.get("gamePlayed"),
                "won": r.get("gamesWon"),
                "drawn": r.get("gamesEven"),
                "lost": r.get("gamesLost"),
                "for": r.get("for"),
                "against": r.get("against"),
                "points": r.get("points"),
            }
            for r in rows
        ],
    }


def main() -> None:
    editions = []
    for slug, comp, season, name, country in LEAGUES:
        try:
            e = build(slug, comp, season, name, country)
        except Exception as exc:  # keep going; a partial menu beats no menu
            print(f"  !! {slug}: {exc}", file=sys.stderr)
            continue
        scorer = e["leaders"].get("Goals", {})
        print(f"  {slug:24s} {e['champion']:22s} {e['matches']:3d} matches "
              f"{e['goals']:4d} goals  top: {scorer.get('player')} {scorer.get('value')}")
        editions.append(e)
        time.sleep(0.4)
    OUT.write_text(json.dumps(editions, indent=1, ensure_ascii=False))
    print(f"\nwrote {OUT} ({len(editions)} editions, {OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
