#!/usr/bin/env python3
"""ML layer over the frozen WC2026 dataset -> data/ml/ml.json

- player style vectors (per-90, z-scored) -> cosine neighbors ("similar players")
- k-means archetypes (outfield k=8) + t-SNE 2D coords (the style map)
- team style families (k=4 on per-match team vectors)
- our own xG model (logistic regression on shot geometry) vs 365scores xG

Names/teams/photos are NOT here — the app joins those at render time by player id.
Run: npm run ml  (or python3 scripts/ml.py). Deterministic: seed 26 everywhere.
"""
import json
import math
from pathlib import Path

import numpy as np
from sklearn.cluster import KMeans
from sklearn.linear_model import LogisticRegression
from sklearn.manifold import TSNE

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

ts = TSNE(n_components=2, perplexity=40, random_state=SEED, init="pca").fit_transform(map_Z)
ts = (ts - ts.min(axis=0)) / (ts.max(axis=0) - ts.min(axis=0)) * 100.0  # 0-100 both axes

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

# ---------------- xG model ----------------

shots, shot_meta = [], []
for gf in sorted((DATA / "s365/games").glob("*[0-9].json")):
    game = json.loads(gf.read_text()).get("game") or {}
    names = {mm.get("id"): mm.get("name") for mm in game.get("members", []) if mm.get("id") is not None}
    for ev in (game.get("chartEvents") or {}).get("events", []):
        try:
            fifa_xg = float(ev.get("xg"))
        except (TypeError, ValueError):
            continue
        t = str(ev.get("time", "")).replace("'", "")
        if not t.split("+")[0].isdigit():  # drops shootout rows
            continue
        line, side = float(ev.get("line", 50)), float(ev.get("side", 50))
        body = str(ev.get("bodyPart") or "").lower()
        sub = int(ev.get("subType") or 0)
        outcome = (ev.get("outcome") or {}).get("name", "")
        dist = math.hypot(line, (side - 50.0) * 0.68)
        angle = math.atan2(abs(side - 50.0) * 0.68, max(line, 1e-6))
        shots.append([dist, angle, dist * angle, 1.0 if "head" in body else 0.0, 1.0 if sub == 9 else 0.0])
        shot_meta.append({
            "player": names.get(ev.get("playerId")), "minute": t, "fifa": fifa_xg,
            "goal": 1 if outcome == "Goal" else 0,
        })

X = np.array(shots)
y = np.array([s["goal"] for s in shot_meta])
print(f"shots {len(y)}, goals {int(y.sum())} ({y.mean():.3f})")
lr = LogisticRegression(max_iter=1000, random_state=SEED).fit(X, y)
ours = lr.predict_proba(X)[:, 1]

# calibration by 365-xG decile-ish buckets
BUCKETS = [0, 0.03, 0.06, 0.1, 0.15, 0.25, 0.4, 1.01]
calib = []
fifa_xgs = np.array([s["fifa"] for s in shot_meta])
for lo, hi in zip(BUCKETS, BUCKETS[1:]):
    mask = (fifa_xgs >= lo) & (fifa_xgs < hi)
    if mask.sum() < 5:
        continue
    calib.append({
        "range": f"{lo:.2f}–{hi if hi <= 1 else 1:.2f}",
        "n": int(mask.sum()),
        "fifa": round(float(fifa_xgs[mask].mean()), 3),
        "ours": round(float(ours[mask].mean()), 3),
        "scored": round(float(y[mask].mean()), 3),
    })

diff = ours - fifa_xgs
order = np.argsort(-np.abs(diff))
disagreements = [
    {**{k: shot_meta[i][k] for k in ("player", "minute", "fifa")},
     "ours": round(float(ours[i]), 2), "goal": int(y[i])}
    for i in order[:12] if shot_meta[i]["player"]
][:10]

# ---------------- labels (informed by the centroid prints above) ----------------

ARCHETYPES = json.loads((ROOT / "scripts/ml_labels.json").read_text()) if (ROOT / "scripts/ml_labels.json").exists() else None

# ---------------- write ----------------

out = {
    "players": {
        pid: {"x": round(float(ts[i, 0]), 1), "y": round(float(ts[i, 1]), 1), "cluster": int(labels[i])}
        for i, pid in enumerate(map_ids)
    },
    "similar": similar,
    "teamStyles": {tid: int(tkm.labels_[i]) for i, tid in enumerate(team_ids)},
    "labels": ARCHETYPES,  # filled from scripts/ml_labels.json after eyeballing the prints
    "xgModel": {
        "n": len(y),
        "coefs": {k: round(float(c), 4) for k, c in zip(["dist", "angle", "dist_angle", "header", "penalty"], lr.coef_[0])},
        "intercept": round(float(lr.intercept_[0]), 4),
        "calib": calib,
        "disagreements": disagreements,
    },
}
(DATA / "ml").mkdir(exist_ok=True)
(DATA / "ml/ml.json").write_text(json.dumps(out))
print(f"wrote data/ml/ml.json ({(DATA / 'ml/ml.json').stat().st_size // 1024} kB)")
