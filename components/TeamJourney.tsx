"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

export type JourneyStop = {
  matchId: string;
  city: string;
  stadium: string;
  date: string;
  opp: string;
  oppAbbr: string;
  score: string;
  outcome: "W" | "D" | "L";
  lat: number;
  lon: number;
  /** km travelled from the previous stop (0 for the first) */
  km: number;
};

const W = 900;
const H = 560;
const PAD = 80;

const outcomeColor = { W: "var(--gold)", D: "var(--dim)", L: "var(--ember)" } as const;

/** The tournament as a road trip: the path draws city to city, the odometer climbs. */
export default function TeamJourney({ stops, venues, color, teamName }: {
  stops: JourneyStop[];
  venues: { city: string; lat: number; lon: number }[];
  color: string;
  teamName: string;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const kmRef = useRef<HTMLSpanElement>(null);
  const legRefs = useRef<(SVGLineElement | null)[]>([]);
  const stopRefs = useRef<(SVGGElement | null)[]>([]);
  const labelRefs = useRef<(SVGGElement | null)[]>([]);
  const tlRef = useRef<gsap.core.Timeline | null>(null);
  const playedRef = useRef(false);

  // fixed projection over all 16 venues so every team's map is comparable
  const lats = venues.map((v) => v.lat);
  const lons = venues.map((v) => v.lon);
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];
  const [minLon, maxLon] = [Math.min(...lons), Math.max(...lons)];
  const X = (lon: number) => PAD + ((lon - minLon) / (maxLon - minLon)) * (W - 2 * PAD);
  const Y = (lat: number) => PAD + ((maxLat - lat) / (maxLat - minLat)) * (H - 2 * PAD);

  const pts = stops.map((s) => ({ x: X(s.lon), y: Y(s.lat) }));
  const totalKm = stops.reduce((s, x) => s + x.km, 0);

  useEffect(() => () => void tlRef.current?.kill(), []);

  const showFinal = () => {
    legRefs.current.forEach((l) => l && gsap.set(l, { strokeDashoffset: 0 }));
    stopRefs.current.forEach((d) => d && gsap.set(d, { scale: 1, opacity: 1 }));
    labelRefs.current.forEach((l) => l && gsap.set(l, { opacity: 1 }));
    if (kmRef.current) kmRef.current.textContent = totalKm.toLocaleString("en-US");
  };

  const play = () => {
    tlRef.current?.kill();
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return showFinal();
    const tl = gsap.timeline({ defaults: { ease: "power1.inOut" } });
    tlRef.current = tl;
    const odo = { v: 0 };
    let cum = 0;

    tl.set(stopRefs.current.filter(Boolean), { scale: 0, opacity: 0, transformOrigin: "center center" });
    tl.set(labelRefs.current.filter(Boolean), { opacity: 0 });
    legRefs.current.forEach((l, i) => {
      if (!l) return;
      const len = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y);
      gsap.set(l, { strokeDasharray: len, strokeDashoffset: len });
    });
    if (kmRef.current) kmRef.current.textContent = "0";

    stops.forEach((s, i) => {
      if (i > 0) {
        const leg = legRefs.current[i - 1];
        const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
        if (leg && len > 1) tl.to(leg, { strokeDashoffset: 0, duration: 0.5 });
        cum += s.km;
        tl.to(odo, {
          v: cum,
          duration: len > 1 ? 0.5 : 0.2,
          ease: "none",
          onUpdate: () => {
            if (kmRef.current) kmRef.current.textContent = Math.round(odo.v).toLocaleString("en-US");
          },
        }, "<");
      }
      const dot = stopRefs.current[i];
      if (dot) tl.to(dot, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2.2)" }, i === 0 ? 0.1 : ">-0.1");
      const label = labelRefs.current[i];
      if (label) tl.to(label, { opacity: 1, duration: 0.3 }, "<0.1");
    });
  };

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || playedRef.current) return;
        playedRef.current = true;
        io.disconnect();
        play();
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <section ref={rootRef} className="mt-12">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="display text-2xl font-semibold">The journey</h2>
        <p className="data text-sm text-dim">
          {new Set(stops.map((s) => s.city)).size} cities ·{" "}
          <span className="text-gold"><span ref={kmRef}>0</span> km</span> as the plane flies
        </p>
        <button
          onClick={play}
          className="display ml-auto rounded border border-gold/60 px-3 py-1 text-sm font-semibold text-gold transition-colors hover:bg-gold hover:text-bg"
        >
          ⟲ Replay
        </button>
      </div>
      <p className="mb-4 mt-1 text-sm text-dim">
        Every match of {teamName}&#39;s tournament, in order, across the 16 host cities.
      </p>
      <div className="rounded-lg border border-pitchline bg-surface p-2 sm:p-4">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label={`${teamName} travel map`}>
          {/* the 16 hosts as constellation */}
          {venues.map((v) => (
            <g key={v.city}>
              <circle cx={X(v.lon)} cy={Y(v.lat)} r={3.5} fill="var(--pitchline)" />
              <text x={X(v.lon)} y={Y(v.lat) - 9} textAnchor="middle" fontSize={9.5} fill="var(--faint)" opacity={0.75}>
                {v.city}
              </text>
            </g>
          ))}

          {/* legs */}
          {stops.slice(1).map((s, i) => (
            <line
              key={`${s.matchId}-leg`}
              ref={(el) => void (legRefs.current[i] = el)}
              x1={pts[i].x} y1={pts[i].y} x2={pts[i + 1].x} y2={pts[i + 1].y}
              stroke={color} strokeWidth={2} opacity={0.8}
            />
          ))}

          {/* stops + result chips — repeat visits to a city fan out so labels never stack */}
          {(() => {
            const seen = new Map<string, number>();
            return stops.map((s, i) => {
              const visit = seen.get(s.city) ?? 0;
              seen.set(s.city, visit + 1);
              const dy = [-16, 24, -34, 42][visit % 4];
              return (
              <g key={s.matchId}>
                <g ref={(el) => void (stopRefs.current[i] = el)} opacity={0}>
                  <circle cx={pts[i].x} cy={pts[i].y} r={7} fill={outcomeColor[s.outcome]} stroke="var(--bg)" strokeWidth={2}>
                    <title>{`${s.date} · ${s.stadium}, ${s.city} — vs ${s.opp} ${s.score} (${s.outcome})`}</title>
                  </circle>
                </g>
                <g ref={(el) => void (labelRefs.current[i] = el)} opacity={0}>
                  <text x={pts[i].x} y={pts[i].y + dy} textAnchor="middle" fontSize={11} fontFamily="var(--font-plex-mono)">
                    <tspan fill="var(--chalk)">{`vs ${s.oppAbbr} ${s.score}`}</tspan>{" "}
                    <tspan fill={outcomeColor[s.outcome]}>{s.outcome}</tspan>
                  </text>
                </g>
              </g>
              );
            });
          })()}
        </svg>
      </div>
      {/* ponytail: labels fan out per repeat city visit; two different-but-close cities can still kiss — smarter layout only if a real team hits it */}
    </section>
  );
}
