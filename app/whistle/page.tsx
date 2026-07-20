import Link from "next/link";
import { flagUrl } from "@/lib/flags";
import { getTeamWhistle, getWhistle, getRefs } from "@/lib/whistle";

export const metadata = {
  title: "The Whistle — MUNDIAL·26",
  description: "Refereeing, counted: fouls, cards, penalties, VAR and offsides for all 48 teams and every official. A ledger, not a verdict.",
};

const f1 = (v: number) => (Math.round(v * 10) / 10).toFixed(1);

export default function WhistlePage() {
  const teams = getTeamWhistle().sort((a, b) => b.bookingsPer10 - a.bookingsPer10);
  const matches = getWhistle();
  const refs = getRefs();

  const fieldBookings = teams.reduce((a, t) => a + t.yellows + t.reds, 0) / Math.max(1, teams.reduce((a, t) => a + t.foulsFor, 0)) * 10;
  const qualified = teams.filter((t) => t.m >= 3);
  const harsh = [...qualified].sort((a, b) => b.bookingsPer10 - a.bookingsPer10)[0];
  const soft = [...qualified].sort((a, b) => a.bookingsPer10 - b.bookingsPer10)[0];
  const varFriend = [...qualified].sort((a, b) => (b.varFor - b.varAgainst) - (a.varFor - a.varAgainst))[0];
  const penTarget = [...qualified].sort((a, b) => b.pensAgainst - a.pensAgainst)[0];

  // matches with the most refereeing in them: VAR calls + penalties + card asymmetry
  const argued = [...matches]
    .map((m) => {
      const cardDiff = Math.abs(m.counts.home.yellows + m.counts.home.reds * 2 - (m.counts.away.yellows + m.counts.away.reds * 2));
      const pens = m.counts.home.pens + m.counts.away.pens;
      return { m, score: m.var.length * 2 + pens * 2 + cardDiff, cardDiff, pens };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 8);

  const tiles = [
    { label: "Tightest whistle", team: harsh, value: `${f1(harsh.bookingsPer10)} bookings / 10 fouls`, note: `field average ${f1(fieldBookings)}` },
    { label: "Most lenient whistle", team: soft, value: `${f1(soft.bookingsPer10)} bookings / 10 fouls`, note: `field average ${f1(fieldBookings)}` },
    { label: "VAR's friend", team: varFriend, value: `${varFriend.varFor}–${varFriend.varAgainst} calls for–against`, note: "where direction is attributable" },
    { label: "Most penalties conceded", team: penTarget, value: `${penTarget.pensAgainst} against · ${penTarget.pensFor} won`, note: "penalties awarded in their matches" },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 sm:px-8">
      <h1 className="display mb-1 text-4xl font-bold">The Whistle</h1>
      <p className="mb-3 max-w-3xl text-sm text-dim">
        Refereeing, counted — every foul, card, offside, penalty and VAR intervention across all 104
        matches, from FIFA&#39;s own event feed.
      </p>
      <p className="mb-8 max-w-3xl rounded border border-pitchline bg-surface px-3 py-2 text-xs text-faint">
        Read it honestly: whistle counts follow playing style. Pressing teams commit more fouls,
        chasing teams pick up more cards, and deep runs mean more matches. This page is a ledger,
        not a verdict — the numbers say what happened, not why.
      </p>

      {/* the headlines */}
      <div className="mb-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {tiles.map((t) => (
          <Link key={t.label} href={`/team/${t.team.abbr}`} className="rounded-lg border border-pitchline bg-surface p-4 transition-colors hover:border-gold/40">
            <p className="eyebrow mb-2">{t.label}</p>
            <p className="flex items-center gap-2 text-lg text-chalk">
              <img src={flagUrl(t.team.abbr)} alt="" width={22} height={22} className="rounded-[2px]" />
              {t.team.name}
            </p>
            <p className="data mt-1 text-sm text-gold">{t.value}</p>
            <p className="mt-0.5 text-xs text-faint">{t.note}</p>
          </Link>
        ))}
      </div>

      {/* team ledger */}
      <section className="mb-12">
        <h2 className="display mb-1 text-2xl font-semibold">All 48, by how the whistle treated them</h2>
        <p className="mb-4 text-sm text-dim">
          Sorted by bookings per 10 fouls committed — how often a foul turned into a card. Penalties
          and VAR are raw counts for and against.
        </p>
        <div className="overflow-x-auto rounded-lg border border-pitchline bg-surface">
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-pitchline text-left">
                {["Team", "M", "Fouls", "Drawn", "Y", "R", "Bookings /10 fouls", "Pens +/−", "VAR +/−", "Offsides"].map((h) => (
                  <th key={h} className="eyebrow px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((t) => (
                <tr key={t.abbr} className="border-b border-pitchline/40 last:border-0 hover:bg-raised/50">
                  <td className="px-3 py-1.5">
                    <Link href={`/team/${t.abbr}`} className="flex items-center gap-2 hover:text-gold">
                      <img src={flagUrl(t.abbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
                      <span className="text-chalk">{t.name}</span>
                    </Link>
                  </td>
                  <td className="data px-3 text-dim">{t.m}</td>
                  <td className="data px-3 text-dim">{t.foulsFor}</td>
                  <td className="data px-3 text-dim">{t.foulsAgainst}</td>
                  <td className="data px-3 text-dim">{t.yellows}</td>
                  <td className="data px-3" style={{ color: t.reds ? "var(--ember)" : "var(--faint)" }}>{t.reds || "—"}</td>
                  <td className="px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-24 rounded-full bg-raised">
                        <div className="h-1.5 rounded-full bg-gold" style={{ width: `${Math.min(100, (t.bookingsPer10 / 6) * 100)}%`, opacity: 0.5 + Math.min(0.5, t.bookingsPer10 / 8) }} />
                      </div>
                      <span className="data text-chalk">{f1(t.bookingsPer10)}</span>
                    </div>
                  </td>
                  <td className="data px-3 text-dim">{t.pensFor}/{t.pensAgainst}</td>
                  <td className="data px-3 text-dim">{t.varFor}/{t.varAgainst}</td>
                  <td className="data px-3 text-dim">{t.offsides}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* argued matches */}
      <section className="mb-12">
        <h2 className="display mb-1 text-2xl font-semibold">The argued matches</h2>
        <p className="mb-4 text-sm text-dim">
          Where the refereeing was loudest — most VAR interventions, penalties and card asymmetry in
          one place. Open the theater and judge for yourself.
        </p>
        <div className="space-y-1.5">
          {argued.map(({ m, cardDiff, pens }) => (
            <Link key={m.id} href={`/match/${m.id}`}
              className="grid grid-cols-[auto_1fr] items-center gap-3 rounded border border-transparent px-2 py-2 text-sm transition-colors hover:border-pitchline hover:bg-surface sm:grid-cols-[14rem_auto_1fr]">
              <span className="flex items-center gap-2 text-chalk">
                <img src={flagUrl(m.home.abbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
                <span className="data">{m.home.abbr} {m.home.score}:{m.away.score} {m.away.abbr}</span>
                <img src={flagUrl(m.away.abbr)} alt="" width={18} height={18} className="rounded-[2px]" loading="lazy" />
              </span>
              <span className="eyebrow hidden sm:block">{m.ref ?? "—"}</span>
              <span className="flex flex-wrap gap-1.5 text-xs">
                {m.var.map((v, i) => {
                  const to = v.benefitId === m.home.id ? m.home.abbr : v.benefitId === m.away.id ? m.away.abbr : null;
                  return (
                    <span key={i} className="rounded border border-gold/40 px-1.5 py-0.5 text-gold">
                      VAR {v.minute.replace(/\s/g, "")} {v.decision.toLowerCase()}{to ? ` → ${to}` : ""}
                    </span>
                  );
                })}
                {pens > 0 && <span className="rounded border border-pitchline px-1.5 py-0.5 text-dim">{pens} pen{pens > 1 ? "s" : ""}</span>}
                {cardDiff >= 3 && (
                  <span className="rounded border border-pitchline px-1.5 py-0.5 text-dim">
                    cards {m.counts.home.yellows + m.counts.home.reds}–{m.counts.away.yellows + m.counts.away.reds}
                  </span>
                )}
              </span>
            </Link>
          ))}
        </div>
      </section>

      {/* referees */}
      <section>
        <h2 className="display mb-1 text-2xl font-semibold">The officials</h2>
        <p className="mb-4 text-sm text-dim">Every referee, ranked by cards shown per match.</p>
        <div className="overflow-x-auto rounded-lg border border-pitchline bg-surface">
          <table className="w-full min-w-[560px] text-sm">
            <thead>
              <tr className="border-b border-pitchline text-left">
                {["Referee", "M", "Fouls /m", "Yellows /m", "Reds", "Pens", "VAR calls"].map((h) => (
                  <th key={h} className="eyebrow px-3 py-2 font-normal">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {refs.map((r) => (
                <tr key={r.name} className="border-b border-pitchline/40 last:border-0 hover:bg-raised/50">
                  <td className="px-3 py-1.5 text-chalk">{r.name}</td>
                  <td className="data px-3 text-dim">{r.m}</td>
                  <td className="data px-3 text-dim">{f1(r.fouls / r.m)}</td>
                  <td className="data px-3 text-chalk">{f1(r.yellows / r.m)}</td>
                  <td className="data px-3" style={{ color: r.reds ? "var(--ember)" : "var(--faint)" }}>{r.reds || "—"}</td>
                  <td className="data px-3 text-dim">{r.pens}</td>
                  <td className="data px-3 text-dim">{r.varCalls}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-faint">
          Sources: FIFA match event feed and official team stats. VAR direction is inferred by
          matching the decision to the card, penalty or goal at that minute — uninferable calls are
          listed but count for neither side. Event counts can differ by ±1 from official totals.
        </p>
      </section>
    </main>
  );
}
