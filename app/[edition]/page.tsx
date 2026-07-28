import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getEdition, getEditionLeaders, getEditionTable, getEditions } from "@/lib/editions";
import { getLeagueIndex } from "@/lib/leagues";

/** the boards worth a face, in the order they read best */
const BOARDS = [
  "Goals",
  "Assists",
  "Expected Goals",
  "Expected Assists",
  "365 Ratings",
  "Clean Sheets",
] as const;

export function generateStaticParams() {
  return getEditions()
    .filter((e) => e.slug !== "world-cup-2026")
    .map((e) => ({ edition: e.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ edition: string }> }) {
  const e = getEdition((await params).edition);
  if (!e) return {};
  return {
    title: `${e.name} ${e.season} — Football Analytic`,
    description: `${e.name} ${e.season}: ${e.crown} on top, ${e.goals} goals in ${e.matches} matches.`,
  };
}

const face = (athleteId?: number, imageVersion?: number) =>
  athleteId
    ? `https://imagecache.365scores.com/image/upload/f_png,w_200,d_Athletes:default.png,r_max,c_thumb,g_face,z_0.65/v${imageVersion ?? 1}/Athletes/${athleteId}`
    : null;

export default async function EditionPage({ params }: { params: Promise<{ edition: string }> }) {
  const slug = (await params).edition;
  const ed = getEdition(slug);
  // the 2026 tournament has its own pages; every league lands here
  if (!ed || slug === "world-cup-2026") notFound();
  const idx = getLeagueIndex(slug);

  const table = getEditionTable(slug);
  const leaders = getEditionLeaders(slug);
  const maxPts = Math.max(...table.map((r: any) => Number(r.points) || 0), 1);

  return (
    <main className="mx-auto max-w-6xl px-4 py-10 sm:px-8">
      <p className="eyebrow" style={{ color: ed.accent }}>
        {ed.country} · {ed.season}
      </p>
      <h1 className="display mt-1 text-5xl font-bold text-chalk sm:text-6xl">{ed.name}</h1>

      <dl className="mt-7 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        {[
          [ed.crownLabel, ed.crown ?? "—"],
          ["Matches", String(ed.matches)],
          ["Goals", String(ed.goals)],
          ["Goals per game", ed.goalsPerGame?.toFixed(2) ?? "—"],
        ].map(([k, v]) => (
          <div key={k}>
            <dt className="eyebrow">{k}</dt>
            <dd className="data mt-1 text-xl text-chalk">{v}</dd>
          </div>
        ))}
      </dl>

      {/* ---- leaders ---- */}
      <h2 className="display mt-14 text-2xl font-semibold text-chalk">Who led what</h2>
      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {BOARDS.filter((b) => leaders[b]).map((b) => {
          const l = leaders[b];
          const src = face(l.athleteId, l.imageVersion);
          return (
            <li
              key={b}
              className="flex items-center gap-3 rounded-lg border border-pitchline bg-surface p-3"
              style={{ borderLeft: `3px solid ${ed.accent}` }}
            >
              {src && (
                <Image
                  src={src}
                  alt=""
                  width={44}
                  height={44}
                  className="h-11 w-11 shrink-0 rounded-full bg-raised object-cover"
                  unoptimized
                />
              )}
              <div className="min-w-0">
                <p className="eyebrow truncate">{b}</p>
                <p className="truncate font-semibold text-chalk">{l.player}</p>
                <p className="data text-sm" style={{ color: ed.accent }}>
                  {l.value}
                  {l.position ? <span className="text-faint"> · {l.position}</span> : null}
                </p>
              </div>
            </li>
          );
        })}
      </ul>

      {/* ---- table ---- */}
      <h2 className="display mt-14 text-2xl font-semibold text-chalk">Final table</h2>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse text-sm">
          <thead>
            <tr className="border-b border-pitchline text-left">
              {["#", "Club", "P", "W", "D", "L", "GF", "GA", "GD", "Pts"].map((h, i) => (
                <th
                  key={h}
                  className={`eyebrow py-2 ${i > 1 ? "text-right" : ""} ${i === 1 ? "pl-2" : ""}`}
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {table.map((r: any) => {
              const pts = Number(r.points) || 0;
              const gd = (Number(r.for) || 0) - (Number(r.against) || 0);
              return (
                <tr key={r.id ?? r.name} className="border-b border-pitchline/60">
                  <td className="data py-2 text-faint">{r.pos}</td>
                  <td className="relative py-2 pl-2 font-medium text-chalk">
                    <span
                      aria-hidden
                      className="absolute inset-y-1 left-0 -z-10 rounded-sm"
                      style={{
                        width: `${(pts / maxPts) * 100}%`,
                        background: ed.accent,
                        opacity: r.pos === 1 ? 0.22 : 0.08,
                      }}
                    />
                    {r.name}
                  </td>
                  {[r.played, r.won, r.drawn, r.lost, r.for, r.against].map((v: any, i: number) => (
                    <td key={i} className="data py-2 text-right text-dim">
                      {v ?? "—"}
                    </td>
                  ))}
                  <td className="data py-2 text-right text-dim">{gd > 0 ? `+${gd}` : gd}</td>
                  <td className="data py-2 text-right font-semibold text-chalk">{pts.toFixed(0)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ---- honest state of the data ---- */}
      <div className="mt-14 rounded-lg border border-pitchline bg-surface p-5">
        <p className="eyebrow">What&rsquo;s in this season</p>
        {idx ? (
          <>
            <p className="mt-2 max-w-2xl text-sm text-dim">
              All {idx.matches.length} matches are harvested: formations, xG shot maps with
              goal-mouth placement, per-player heatmaps, match ratings and full team stats —
              the same theater the 2026 tournament gets. No physical or tracking data,
              though: that tier is FIFA-only and has no public equivalent for club football.
            </p>
            <Link
              href={`/${slug}/matches`}
              className="mt-4 inline-block rounded-full px-5 py-2.5 text-sm font-semibold text-bg"
              style={{ background: ed.accent }}
            >
              <span className="display">Open all {idx.matches.length} matches</span>
            </Link>
          </>
        ) : (
          <>
            <p className="mt-2 max-w-2xl text-sm text-dim">
              The final table and leader boards above are real. The per-match layer &mdash;{" "}
              {ed.matches} matches of shot maps, heatmaps and ratings &mdash; exists in the
              feed but has not been harvested into this site yet.
            </p>
            <Link href="/story" className="mt-4 inline-block text-sm text-gold hover:underline">
              See what that looks like on the 2026 tournament &rarr;
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
