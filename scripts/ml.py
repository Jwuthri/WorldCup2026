#!/usr/bin/env python3
"""ML layer over the frozen WC2026 dataset -> data/ml/ml.json

- player style vectors (per-90, z-scored) -> cosine neighbors ("similar players")
- k-means archetypes (outfield k=8) — the tribes
- team style families (k=4 on per-match team vectors)

Names/teams/photos are NOT here — the app joins those at render time by player id.
Run: npm run ml  (or python3 scripts/ml.py). Deterministic: seed 26 everywhere.
"""
import json
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
SEED = 26

# ---------------- load ----------------

season = json.loads((DATA / "fifa/season_players.json").read_text())
calendar = json.loads((DATA / "fifa/calendar.json").read_text())["Results"]
season_teams = json.loads((DATA / "fifa/season_teams.json").read_text())

def metrics(rows):
    return {r[0]: float(r[1]) for r in rows}

players = {pid: metrics(rows) for pid, rows in season.items()}

# ---------------- player vectors ----------------

def per90(m, key, minutes):
    return m.get(key, 0.0) / minutes * 90.0

def ratio(m, num, den):
    d = m.get(den, 0.0)
    return m.get(num, 0.0) / d if d > 0 else 0.0

OUTFIELD_DIMS = [
    "shots", "box_share", "xg", "finishing", "threat", "crosses", "switches",
    "dead_balls", "progressions", "linebreaks", "takeons", "recv_behind",
    "recv_pocket", "offers", "passes", "pass_pct", "press_resist",
    "pressures", "turnovers_forced", "distance", "sprints", "top_speed",
]

def outfield_vector(m, minutes):
    return [
        per90(m, "AttemptAtGoal", minutes),
        ratio(m, "AttemptAtGoalInsideThePenaltyArea", "AttemptAtGoal"),
        per90(m, "XG", minutes),
        (m.get("Goals", 0.0) - m.get("XG", 0.0)) / minutes * 90.0,
        per90(m, "Threat", minutes),
        per90(m, "Crosses", minutes),
        per90(m, "CompletedSwitchesOfPlay", minutes),
        per90(m, "Corners", minutes) + per90(m, "FreeKicks", minutes),
        per90(m, "CompletedBallProgressions", minutes),
        per90(m, "LinebreaksAttemptedCompleted", minutes),
        per90(m, "TakeOnsCompleted", minutes),
        per90(m, "ReceptionsInBehind", minutes),
        per90(m, "ReceptionsBetweenMidfieldAndDefensiveLine", minutes),
        per90(m, "OffersToReceiveTotal", minutes),
        per90(m, "Passes", minutes),
        ratio(m, "PassesCompleted", "Passes"),
        per90(m, "ReceptionsUnderPressure", minutes),
        per90(m, "DefensivePressuresApplied", minutes),
        per90(m, "ForcedTurnovers", minutes),
        per90(m, "TotalDistance", minutes),
        per90(m, "Sprints", minutes),
        m.get("TopSpeed", 0.0),
    ]

def gk_vector(m, minutes):
    return [
        per90(m, "GoalkeeperSaves", minutes),
        m.get("GoalkeeperSavePercentage", 0.0),
        per90(m, "AttemptAtGoalAgainstOnTarget", minutes),
        per90(m, "GoalkeeperDefensiveActionsOutsidePenaltyArea", minutes),
        per90(m, "Passes", minutes),
        ratio(m, "PassesCompleted", "Passes"),
        ratio(m, "DistributionsCompletedUnderPressure", "DistributionsUnderPressure"),
        per90(m, "LinebreaksAttemptedCompleted", minutes),
    ]

def is_gk(m):
    return m.get("GoalkeeperSaves", 0.0) + m.get("GKSaves", 0.0) >= 1.0

MIN_SIM, MIN_MAP = 90.0, 180.0

out_ids, out_X, gk_ids, gk_X = [], [], [], []
for pid, m in players.items():
    minutes = m.get("TimePlayed", 0.0)
    if minutes < MIN_SIM:
        continue
    if is_gk(m):
        gk_ids.append(pid)
        gk_X.append(gk_vector(m, minutes))
    else:
        out_ids.append(pid)
        out_X.append(outfield_vector(m, minutes))

out_X = np.array(out_X)
gk_X = np.array(gk_X)
print(f"outfield {len(out_ids)}, GK {len(gk_ids)} (minutes >= {MIN_SIM:.0f})")

def zscore(X):
    mu, sd = X.mean(axis=0), X.std(axis=0)
    sd[sd == 0] = 1.0
    return (X - mu) / sd

out_Z, gk_Z = zscore(out_X), zscore(gk_X)

# ---------------- similarity (cosine, within pool) ----------------

def neighbors(ids, Z, k=6):
    N = Z / np.linalg.norm(Z, axis=1, keepdims=True)
    S = N @ N.T
    np.fill_diagonal(S, -2)
    out = {}
    for i, pid in enumerate(ids):
        top = np.argsort(-S[i])[:k]
        out[pid] = [[ids[j], round(float(S[i, j]), 3)] for j in top]
    return out

similar = {**neighbors(out_ids, out_Z), **neighbors(gk_ids, gk_Z)}

# ---------------- archetypes + map (outfield, minutes >= MIN_MAP) ----------------

map_mask = np.array([players[p]["TimePlayed"] >= MIN_MAP for p in out_ids])
map_ids = [p for p, keep in zip(out_ids, map_mask) if keep]
map_Z = out_Z[map_mask]
print(f"map pool {len(map_ids)} (minutes >= {MIN_MAP:.0f})")

K = 8
km = KMeans(n_clusters=K, n_init=10, random_state=SEED).fit(map_Z)
labels = km.labels_

# print centroid profiles so the hardcoded names below can be sanity-checked
for c in range(K):
    z = km.cluster_centers_[c]
    top = sorted(zip(OUTFIELD_DIMS, z), key=lambda t: -t[1])[:4]
    low = sorted(zip(OUTFIELD_DIMS, z), key=lambda t: t[1])[:2]
    print(f"cluster {c} (n={int((labels == c).sum())}): +{top} -{low}")

# ---------------- team styles ----------------

TEAM_DIMS = [
    "XG", "XGAgainst", "AttemptAtGoal", "AttemptAtGoalAgainst", "PassesCompleted",
    "CompletedBallProgressions", "LinebreaksAttemptedCompleted", "Crosses",
    "DefensivePressuresApplied", "ForcedTurnovers", "ReceptionsInBehind", "TotalDistance",
]
matches_by_team = {}
for m in calendar:
    for side in ("Home", "Away"):
        t = (m.get(side) or {}).get("IdTeam")
        if t:
            matches_by_team[t] = matches_by_team.get(t, 0) + 1

team_ids, team_X = [], []
for tid, rows in season_teams.items():
    tm, n = metrics(rows), matches_by_team.get(tid, 0)
    if not n:
        continue
    team_ids.append(tid)
    team_X.append([tm.get(k, 0.0) / n for k in TEAM_DIMS])
team_Z = zscore(np.array(team_X))
tkm = KMeans(n_clusters=4, n_init=10, random_state=SEED).fit(team_Z)
for c in range(4):
    z = tkm.cluster_centers_[c]
    prof = sorted(zip(TEAM_DIMS, z), key=lambda t: -abs(t[1]))[:4]
    members = [team_ids[i] for i in range(len(team_ids)) if tkm.labels_[i] == c]
    print(f"team style {c} (n={len(members)}): {prof}")

# ---------------- labels (informed by the centroid prints above) ----------------

ARCHETYPES = json.loads((ROOT / "scripts/ml_labels.json").read_text()) if (ROOT / "scripts/ml_labels.json").exists() else None

# ---------------- write ----------------

out = {
    "players": {pid: {"cluster": int(labels[i])} for i, pid in enumerate(map_ids)},
    "similar": similar,
    "teamStyles": {tid: int(tkm.labels_[i]) for i, tid in enumerate(team_ids)},
    "labels": ARCHETYPES,  # filled from scripts/ml_labels.json after eyeballing the prints
}
(DATA / "ml").mkdir(exist_ok=True)
(DATA / "ml/ml.json").write_text(json.dumps(out))
print(f"wrote data/ml/ml.json ({(DATA / 'ml/ml.json').stat().st_size // 1024} kB)")
