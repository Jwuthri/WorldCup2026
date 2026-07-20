#!/usr/bin/env python3
"""Compact per-match data briefs for the AI matchday columns -> data/story-inputs/{id}.json"""
import json, re, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent / "data"
OUT = ROOT / "story-inputs"
OUT.mkdir(exist_ok=True)

loc = lambda v: (v or [{}])[0].get("Description", "")
def strip(s):
    s = unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z]", "", s.lower())
ALIAS = {"unitedstates": "usa", "korearepublic": "southkorea", "cotedivoire": "ivorycoast",
         "iriran": "iran", "chinapr": "china", "congodr": "drcongo",
         "bosniaandherzegovina": "bosnia", "bosniaherzegovina": "bosnia", "caboverde": "capeverde"}
canon = lambda s: ALIAS.get(strip(s), strip(s))

cal = json.load(open(ROOT / "fifa/calendar.json"))["Results"]
idx = json.load(open(ROOT / "s365/games_index.json"))
from datetime import datetime, timezone
def ts(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00")).timestamp()

def find365(m):
    t = ts(m["Date"])
    pair = "|".join(sorted([canon(loc(m["Home"]["TeamName"])), canon(loc(m["Away"]["TeamName"]))]))
    for g in idx:
        try:
            if abs(ts(g["startTime"]) - t) < 3 * 3600 and \
               "|".join(sorted([canon(g.get("home")), canon(g.get("away"))])) == pair:
                return g
        except Exception:
            pass
    return None

def fdh(path, tid):
    try:
        T = json.load(open(path))
        return dict((r[0], r[1]) for r in T.get(tid, []))
    except Exception:
        return {}

n = 0
for m in cal:
    mid = m["IdMatch"]
    home, away = loc(m["Home"]["TeamName"]), loc(m["Away"]["TeamName"])
    th, ta = m["Home"]["IdTeam"], m["Away"]["IdTeam"]
    fh = fdh(ROOT / f"fifa/matches/{mid}.teams.json", th)
    fa = fdh(ROOT / f"fifa/matches/{mid}.teams.json", ta)
    g365meta = find365(m)
    top, goals, misses, formations = {}, [], [], {}
    if g365meta:
        try:
            g = json.load(open(ROOT / f"s365/games/{g365meta['id']}.json"))["game"]
            same = canon(g["homeCompetitor"]["name"]) == canon(home)
            mem = {x["id"]: x for x in g.get("members") or []}
            for side_key, team_name in [("homeCompetitor", home if same else away), ("awayCompetitor", away if same else home)]:
                c = g.get(side_key) or {}
                formations[team_name] = (c.get("lineups") or {}).get("formation")
                rated = sorted(
                    [(mem.get(e["id"], {}).get("name", "?"), e["ranking"]) for e in (c.get("lineups") or {}).get("members") or [] if e.get("ranking")],
                    key=lambda x: -x[1])[:3]
                top[team_name] = [{"name": nm, "rating": r} for nm, r in rated]
            mem_ath = {x.get("athleteId"): x for x in g.get("members") or []}
            for e in (g.get("chartEvents") or {}).get("events") or []:
                nm = (mem_ath.get(e.get("playerId")) or {}).get("name", "?")
                team_name = (home if same else away) if e.get("competitorNum") == 1 else (away if same else home)
                rec = {"team": team_name, "player": nm, "minute": e.get("time"), "xg": e.get("xg"), "outcome": (e.get("outcome") or {}).get("name")}
                if (e.get("outcome") or {}).get("name") == "Goal" or e.get("type") == 1:
                    goals.append(rec)
                elif e.get("xg") and float(e["xg"]) >= 0.15:
                    misses.append(rec)
        except Exception:
            pass
    misses = sorted(misses, key=lambda r: -float(r["xg"] or 0))[:4]

    reds = []
    try:
        T = json.load(open(ROOT / f"fifa/matches/{mid}.timeline.json"))
        for e in T.get("Event") or []:
            t = (e.get("TypeLocalized") or [{}])[0].get("Description", "")
            if "red" in t.lower():
                reds.append({"minute": e.get("MatchMinute"), "desc": loc(e.get("EventDescription"))})
    except Exception:
        pass

    def teamrow(name, f):
        return {
            "name": name,
            "xg": round(f.get("XG", 0), 2) if f.get("XG") is not None else None,
            "possession_pct": round(f.get("Possession", 0) * 100) if f.get("Possession") else None,
            "shots": f.get("AttemptAtGoal"), "on_target": f.get("AttemptAtGoalOnTarget"),
            "high_press_phases": round(f.get("PhaseAggregateHighPress", 0), 1) if f.get("PhaseAggregateHighPress") else None,
            "ball_recovery_s": round(f.get("BallRecoveryTime", 0), 1) if f.get("BallRecoveryTime") else None,
            "forced_turnovers": f.get("ForcedTurnovers"),
            "formation": formations.get(name),
            "top_players": top.get(name, []),
        }

    brief = {
        "match": f"{home} {m['HomeTeamScore']}-{m['AwayTeamScore']} {away}",
        "stage": loc(m["StageName"]) + (f" · {loc(m['GroupName'])}" if m.get("GroupName") else ""),
        "date": m["Date"][:10],
        "stadium": f"{loc((m.get('Stadium') or {}).get('Name'))}, {loc((m.get('Stadium') or {}).get('CityName'))}",
        "penalties": f"{m['HomeTeamPenaltyScore']}-{m['AwayTeamPenaltyScore']}" if m.get("HomeTeamPenaltyScore") is not None else None,
        "after_extra_time": m.get("ResultType") == 3,
        "winner": home if m.get("Winner") == th else away if m.get("Winner") == ta else None,
        "home": teamrow(home, fh), "away": teamrow(away, fa),
        "goals": goals, "big_chances_missed": misses, "red_cards": reds,
    }
    (OUT / f"{mid}.json").write_text(json.dumps(brief, ensure_ascii=False))
    n += 1
print(f"wrote {n} briefs")
