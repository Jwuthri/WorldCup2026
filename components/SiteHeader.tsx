"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export type HeaderEdition = { slug: string; name: string; season: string; accent: string };

/** every flat route in the app belongs to the 2026 tournament */
const WC_NAV = [
  ["/tournament", "Tournament"],
  ["/matches", "All 104 matches"],
  ["/players", "Player cards"],
  ["/awards", "Honours"],
  ["/rankings", "Rankings"],
  ["/territory", "Territory"],
  ["/whistle", "The whistle"],
  ["/map", "The tribes"],
  ["/compare", "Compare"],
  ["/connect", "Connect your AI"],
] as const;

/** the chooser is a full-viewport scene; chrome would only add a scrollbar to it */
export function SiteFooter() {
  if ((usePathname() ?? "/") === "/") return null;
  return (
    <footer className="mt-24 border-t border-pitchline px-4 py-8 text-center text-xs text-faint">
      Unofficial fan project — not affiliated with FIFA, UEFA or any league. Stats are
      facts; the presentation is ours. Data: public football feeds.
    </footer>
  );
}

export default function SiteHeader({ editions }: { editions: HeaderEdition[] }) {
  const pathname = usePathname() ?? "/";

  // the chooser owns the whole viewport — no chrome over it
  if (pathname === "/") return null;

  const league = editions.find((e) => e.slug !== "world-cup-2026" && pathname.startsWith(`/${e.slug}`));
  const current = league ?? editions.find((e) => e.slug === "world-cup-2026");

  return (
    <header className="sticky top-0 z-50 border-b border-pitchline bg-bg">
      <div className="mx-auto flex max-w-7xl items-baseline gap-5 px-4 py-3 sm:px-8">
        <Link href="/" className="display shrink-0 text-xl font-bold tracking-tight text-chalk">
          FOOTBALL<span className="text-gold">·</span>ANALYTIC
        </Link>

        {current && (
          <Link
            href="/"
            title="Switch dataset"
            className="group flex shrink-0 items-center gap-1.5 rounded-full border border-pitchline px-2.5 py-1 text-xs text-dim transition hover:border-chalk hover:text-chalk"
          >
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: current.accent }} />
            <span className="data">{current.name} {current.season}</span>
            <span className="opacity-60 transition group-hover:opacity-100">⇄</span>
          </Link>
        )}

        <nav className="flex min-w-0 flex-1 gap-6 overflow-x-auto whitespace-nowrap text-sm text-dim">
          {(league
            ? ([
                [`/${league.slug}`, "Season"],
                [`/${league.slug}/matches`, "All matches"],
                [`/${league.slug}/players`, "Player cards"],
                [`/${league.slug}/rankings`, "Rankings"],
                [`/${league.slug}/territory`, "Territory"],
                [`/${league.slug}/compare`, "Compare"],
              ] as const)
            : WC_NAV
          ).map(([href, label]) => (
            <Link key={href} href={href} className="hover:text-chalk">
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
