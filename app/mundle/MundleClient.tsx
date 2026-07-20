"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { flagUrl } from "@/lib/flags";

export type MundlePlayer = {
  id: string;
  name: string;
  team: string;
  abbr: string;
  pos: string;
  tribe: string;
  overall: number;
  confed: string;
  photo: string | null;
};

const MAX = 6;
type Saved = { guesses: string[]; done: boolean };

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export default function MundleClient({
  pool,
  answerId,
  dayNum,
  dateKey,
}: {
  pool: MundlePlayer[];
  answerId: string;
  dayNum: number;
  dateKey: string;
}) {
  const byId = useMemo(() => new Map(pool.map((p) => [p.id, p])), [pool]);
  const answer = byId.get(answerId)!;
  const storeKey = `mundle-${dateKey}`;

  const [guesses, setGuesses] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const s: Saved = JSON.parse(localStorage.getItem(storeKey) ?? "null");
      if (s?.guesses) setGuesses(s.guesses.filter((id) => byId.has(id)));
    } catch {}
  }, [storeKey, byId]);

  const won = guesses.includes(answerId);
  const lost = !won && guesses.length >= MAX;
  const done = won || lost;

  const save = (g: string[]) => {
    setGuesses(g);
    try {
      localStorage.setItem(storeKey, JSON.stringify({ guesses: g, done: g.includes(answerId) || g.length >= MAX }));
    } catch {}
  };

  const guess = (p: MundlePlayer) => {
    if (done || guesses.includes(p.id)) return;
    save([...guesses, p.id]);
    setQ("");
  };

  const nq = norm(q.trim());
  const hits = nq
    ? pool.filter((p) => norm(p.name).includes(nq) && !guesses.includes(p.id)).slice(0, 6)
    : [];

  // cell verdicts: 2 exact · 1 close · 0 wrong
  const teamV = (p: MundlePlayer) => (p.abbr === answer.abbr ? 2 : p.confed && p.confed === answer.confed ? 1 : 0);
  const posV = (p: MundlePlayer) => (p.pos === answer.pos ? 2 : 0);
  const tribeV = (p: MundlePlayer) => (p.tribe === answer.tribe ? 2 : 0);
  const ovrV = (p: MundlePlayer) => (p.overall === answer.overall ? 2 : Math.abs(p.overall - answer.overall) <= 2 ? 1 : 0);

  const cellStyle = (v: number) => ({
    background: v === 2 ? "color-mix(in oklab, var(--gold) 28%, var(--surface))" : v === 1 ? "color-mix(in oklab, var(--gold) 12%, var(--surface))" : "var(--raised)",
    border: `1px solid ${v === 2 ? "var(--gold)" : "var(--line)"}`,
  });

  const share = () => {
    const rows = guesses.map((id) => {
      const p = byId.get(id)!;
      const e = (v: number) => (v === 2 ? "🟩" : v === 1 ? "🟨" : "⬛");
      const arrow = p.overall === answer.overall ? "" : p.overall < answer.overall ? "⬆️" : "⬇️";
      return e(teamV(p)) + e(posV(p)) + e(tribeV(p)) + e(ovrV(p)) + arrow;
    });
    const text = `MUNDLE #${dayNum} ${won ? guesses.length : "X"}/${MAX}\n${rows.join("\n")}\n${location.origin}/mundle`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div>
      {!done && (
        <div className="relative mb-4">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Guess ${guesses.length + 1} of ${MAX} — type a player…`}
            aria-label="Guess a player"
            autoFocus
            className="w-full rounded-lg border border-pitchline bg-surface px-4 py-3 text-sm text-chalk placeholder:text-faint focus:border-gold focus:outline-none"
          />
          {hits.length > 0 && (
            <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-pitchline bg-raised shadow-xl">
              {hits.map((p) => (
                <button
                  key={p.id}
                  onClick={() => guess(p)}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-chalk transition-colors hover:bg-surface"
                >
                  <img src={flagUrl(p.abbr)} alt="" width={18} height={13} className="rounded-[2px]" />
                  <span>{p.name}</span>
                  <span className="ml-auto text-xs text-faint">{p.team}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* guess grid */}
      {guesses.length > 0 && (
        <div className="space-y-2">
          <div className="grid grid-cols-[1.6fr_repeat(4,1fr)] gap-1.5 text-center">
            {["player", "team", "pos", "tribe", "rating"].map((h) => (
              <span key={h} className="eyebrow !text-[9px] leading-6">{h}</span>
            ))}
          </div>
          {guesses.map((id) => {
            const p = byId.get(id)!;
            return (
              <div key={id} className="grid grid-cols-[1.6fr_repeat(4,1fr)] gap-1.5 text-center text-xs">
                <span className="flex items-center gap-1.5 truncate rounded px-2 py-2 text-left text-chalk" style={cellStyle(p.id === answerId ? 2 : 0)}>
                  {p.name}
                </span>
                <span className="flex items-center justify-center gap-1 rounded py-2 text-dim" style={cellStyle(teamV(p))} title={p.team}>
                  <img src={flagUrl(p.abbr)} alt={p.team} width={16} height={12} className="rounded-[1px]" /> {p.abbr}
                </span>
                <span className="rounded py-2 text-dim" style={cellStyle(posV(p))}>{p.pos}</span>
                <span className="truncate rounded px-1 py-2 text-dim" style={cellStyle(tribeV(p))}>{p.tribe}</span>
                <span className="data rounded py-2 text-dim" style={cellStyle(ovrV(p))}>
                  {p.overall} {p.overall === answer.overall ? "" : p.overall < answer.overall ? "↑" : "↓"}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {guesses.length === 0 && !done && (
        <p className="rounded-lg border border-pitchline bg-surface px-4 py-6 text-center text-sm text-faint">
          Gold cell = exact · faint gold = close (same confederation, or rating within 2) · arrow = the answer rates higher/lower.
        </p>
      )}

      {done && (
        <div className="mt-6 rounded-lg border border-gold/40 bg-surface p-5 text-center">
          <p className="eyebrow mb-3">{won ? `got it in ${guesses.length}` : "out of guesses"}</p>
          {answer.photo && (
            <span className="mx-auto mb-3 block h-20 w-20 overflow-hidden rounded-full" style={{ boxShadow: "0 0 0 2px var(--gold)" }}>
              <img src={answer.photo} alt="" className="h-full w-full object-cover" style={{ objectPosition: "50% 0%", transform: "scale(1.65)", transformOrigin: "50% 8%" }} />
            </span>
          )}
          <p className="display text-3xl font-semibold">{answer.name}</p>
          <p className="mt-1 text-sm text-dim">
            {answer.team} · {answer.pos} · {answer.tribe} · <span className="data text-gold">{answer.overall}</span>
          </p>
          <div className="mt-4 flex items-center justify-center gap-3">
            <button
              onClick={share}
              className="rounded border border-gold/60 px-4 py-2 text-sm text-gold transition-colors hover:bg-gold hover:text-bg"
            >
              {copied ? "copied ✓" : "share result"}
            </button>
            <Link href={`/player/${answer.id}`} className="text-sm text-dim underline-offset-4 hover:text-chalk hover:underline">
              open the full card →
            </Link>
          </div>
          <p className="mt-4 text-xs text-faint">New mystery player at midnight UTC.</p>
        </div>
      )}
    </div>
  );
}
