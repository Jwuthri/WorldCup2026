import type { Metadata } from "next";
import { Barlow_Condensed, Archivo, IBM_Plex_Mono } from "next/font/google";
import Link from "next/link";
import { ViewTransitions } from "next-view-transitions";
import "./globals.css";

const barlow = Barlow_Condensed({
  weight: ["500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow",
});
const archivo = Archivo({
  weight: ["400", "500", "600"],
  subsets: ["latin"],
  variable: "--font-archivo",
});
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:4026"),
  twitter: { card: "summary_large_image" },
  title: "MUNDIAL·26 — the 2026 tournament, every number that mattered",
  description:
    "An unofficial data theater for the 2026 World Cup: real xG, sprints, press phases, heatmaps and ratings for all 104 matches.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ViewTransitions>
    <html lang="en">
      <body className={`${barlow.variable} ${archivo.variable} ${plexMono.variable} min-h-screen`}>
        <header className="sticky top-0 z-50 border-b border-pitchline bg-bg">
          <div className="mx-auto flex max-w-7xl items-baseline gap-8 px-4 py-3 sm:px-8">
            <Link href="/" className="display text-2xl font-bold tracking-tight text-chalk">
              MUNDIAL<span className="text-gold">·26</span>
            </Link>
            <nav className="flex min-w-0 flex-1 gap-6 overflow-x-auto whitespace-nowrap text-sm text-dim">
              <Link href="/tournament" className="hover:text-chalk">Tournament</Link>
              <Link href="/matches" className="hover:text-chalk">All 104 matches</Link>
              <Link href="/players" className="hover:text-chalk">Player cards</Link>
              <Link href="/awards" className="hover:text-chalk">Honours</Link>
              <Link href="/rankings" className="hover:text-chalk">Rankings</Link>
              <Link href="/territory" className="hover:text-chalk">Territory</Link>
              <Link href="/whistle" className="hover:text-chalk">The whistle</Link>
              <Link href="/map" className="hover:text-chalk">The tribes</Link>
              <Link href="/mundle" className="hover:text-chalk">Mundle</Link>
              <Link href="/compare" className="hover:text-chalk">Compare</Link>
              <Link href="/connect" className="hover:text-chalk">Connect your AI</Link>
            </nav>
          </div>
        </header>
        {children}
        <footer className="mt-24 border-t border-pitchline px-4 py-8 text-center text-xs text-faint">
          Unofficial fan project — not affiliated with FIFA. Stats are facts; the
          presentation is ours. Data: public tournament feeds, June–July 2026.
        </footer>
      </body>
    </html>
    </ViewTransitions>
  );
}
