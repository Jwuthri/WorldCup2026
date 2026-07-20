#!/usr/bin/env python3
"""Fetch hourly weather at kickoff for all 104 matches from Open-Meteo (free, no key).
Writes data/enrich/weather.json keyed by FIFA match id. Idempotent per match.
"""
import json, time, urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data/enrich/weather.json"
OUT.parent.mkdir(parents=True, exist_ok=True)

# city -> lat/lon (must match lib/venues.ts)
VENUES = {
    "Mexico City": (19.3029, -99.1505), "Guadalajara": (20.6817, -103.4626),
    "Monterrey": (25.6693, -100.2442), "Los Angeles": (33.9535, -118.3392),
    "San Francisco Bay Area": (37.403, -121.9696), "Seattle": (47.5952, -122.3316),
    "New Jersey": (40.8135, -74.0744), "Boston": (42.0909, -71.2643),
    "Philadelphia": (39.9008, -75.1675), "Miami": (25.958, -80.2389),
    "Atlanta": (33.7554, -84.401), "Houston": (29.6847, -95.4107),
    "Kansas City": (39.0489, -94.4839), "Dallas": (32.7473, -97.0945),
    "Toronto": (43.6332, -79.4186), "Vancouver": (49.2767, -123.1119),
}

weather = json.loads(OUT.read_text()) if OUT.exists() else {}
cal = json.loads((ROOT / "data/fifa/calendar.json").read_text())["Results"]
loc = lambda v: (v or [{}])[0].get("Description", "")

fetched = failed = 0
for m in cal:
    mid = m["IdMatch"]
    if mid in weather:
        continue
    city = loc(m["Stadium"].get("CityName"))
    if city not in VENUES:
        print("no venue for", city); continue
    lat, lon = VENUES[city]
    date, hour = m["Date"][:10], int(m["Date"][11:13])
    # forecast endpoint serves past ~90 days hourly; archive endpoint lags ~5 days
    url = (f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}"
           f"&start_date={date}&end_date={date}&timezone=UTC"
           f"&hourly=temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,precipitation")
    try:
        with urllib.request.urlopen(url, timeout=30) as r:
            d = json.loads(r.read())
        h = d["hourly"]
        i = h["time"].index(f"{date}T{hour:02d}:00")
        weather[mid] = {
            "tempC": h["temperature_2m"][i],
            "feelsLikeC": h["apparent_temperature"][i],
            "humidityPct": h["relative_humidity_2m"][i],
            "windKmh": h["wind_speed_10m"][i],
            "precipMm": h["precipitation"][i],
        }
        fetched += 1
        time.sleep(0.3)
    except Exception as e:
        failed += 1
        print("FAIL", mid, city, e)

OUT.write_text(json.dumps(weather, ensure_ascii=False, indent=0))
print(f"weather done: {fetched} fetched, {failed} failed, {len(weather)} total")

# ============ strength: Elo ratings + international match history ============
import csv, io, unicodedata, re
UA_H = {"User-Agent": "Mozilla/5.0 Chrome/126"}

def fetch(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA_H), timeout=40).read().decode()

def norm(s):
    return re.sub(r"[^a-z]", "", unicodedata.normalize("NFD", s or "").encode("ascii", "ignore").decode().lower())

# our 48 teams: abbr -> FIFA name
cal_teams = {}
for m in cal:
    for s in ("Home", "Away"):
        cal_teams[m[s]["Abbreviation"]] = loc(m[s]["TeamName"])

# alias: normalized FIFA name -> normalized external name (covers Elo + martj42 quirks)
ALIAS_NORM = {
    norm("Côte d'Ivoire"): norm("Ivory Coast"),
    norm("Congo DR"): norm("DR Congo"),
    norm("Cabo Verde"): norm("Cape Verde"),
    norm("Czechia"): norm("Czech Republic"),
    norm("IR Iran"): norm("Iran"),
    norm("Korea Republic"): norm("South Korea"),
    norm("Türkiye"): norm("Turkey"),
    norm("USA"): norm("United States"),
}
def ext_norm(fifa_name):
    n = norm(fifa_name)
    return ALIAS_NORM.get(n, n)

try:
    # --- Elo: en.teams.tsv (code->name) + World.tsv (rank, code, current elo) ---
    code2name = {}
    for line in fetch("https://www.eloratings.net/en.teams.tsv").strip().split("\n"):
        p = line.split("\t")
        if len(p) >= 2:
            code2name[p[0]] = p[1]
    name2elo = {}  # normalized elo-name -> (rank, elo, code)
    for line in fetch("https://www.eloratings.net/World.tsv").strip().split("\n"):
        p = line.split("\t")
        if len(p) >= 4 and p[2] in code2name:
            name2elo[norm(code2name[p[2]])] = (int(p[1]), int(p[3]), p[2])

    strength = {}
    elo_miss = []
    for ab, fifa_name in cal_teams.items():
        hit = name2elo.get(ext_norm(fifa_name)) or name2elo.get(norm(fifa_name))
        if hit:
            strength[ab] = {"elo": hit[1], "worldRank": hit[0], "eloCode": hit[2], "intlName": None}
        else:
            elo_miss.append((ab, fifa_name))
    # wc seed = rank among the 48 by elo
    for i, ab in enumerate(sorted(strength, key=lambda a: -strength[a]["elo"]), 1):
        strength[ab]["wcSeed"] = i
    print(f"elo: {len(strength)}/48 joined; misses: {elo_miss}")

    # --- international history (martj42, CC0): keep only rows touching our 48 teams ---
    our_ext = {ext_norm(n): ab for ab, n in cal_teams.items()}
    for ab, n in cal_teams.items():
        our_ext.setdefault(norm(n), ab)  # also index by plain norm
    rows = list(csv.reader(io.StringIO(fetch("https://raw.githubusercontent.com/martj42/international_results/master/results.csv"))))
    # map every external name we care about to our abbr (via alias); compact each kept row
    kept = []
    for r in rows[1:]:
        if len(r) < 9:
            continue
        ha, aa = our_ext.get(norm(r[1])), our_ext.get(norm(r[2]))
        if ha or aa:
            # [date, homeAbbr|extName, awayAbbr|extName, hs, as, tournament, neutral]
            kept.append([r[0], ha or r[1], aa or r[2], int(r[3]), int(r[4]), r[5], r[8] == "TRUE"])
    (ROOT / "data/enrich/intl_results.json").write_text(json.dumps(kept, ensure_ascii=False))
    (ROOT / "data/enrich/strength.json").write_text(json.dumps(strength, ensure_ascii=False, indent=0))
    print(f"intl history: kept {len(kept)} rows touching our teams (of {len(rows)-1})")
except Exception as e:
    print("STRENGTH FETCH FAILED:", e)
