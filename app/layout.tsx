import type { Metadata } from "next";
import { Barlow_Condensed, Archivo, IBM_Plex_Mono } from "next/font/google";
import { ViewTransitions } from "next-view-transitions";
import SiteHeader, { SiteFooter } from "@/components/SiteHeader";
import { getEditions } from "@/lib/editions";
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
  title: "Football Analytic — pick a season, read every number",
  description:
    "Data theaters built on public football feeds: real xG, heatmaps, shot maps and ratings for the 2026 World Cup and Europe's big-five leagues.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const editions = getEditions().map(({ slug, name, season, accent }) => ({ slug, name, season, accent }));
  return (
    <ViewTransitions>
    <html lang="en">
      <body className={`${barlow.variable} ${archivo.variable} ${plexMono.variable} min-h-screen`}>
        <SiteHeader editions={editions} />
        {children}
        <SiteFooter />
      </body>
    </html>
    </ViewTransitions>
  );
}
