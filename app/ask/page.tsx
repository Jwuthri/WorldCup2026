import Link from "next/link";
import AskClient from "./AskClient";

export const metadata = {
  title: "Ask the data — MUNDIAL·26",
  description: "An agentic analyst over the tournament's real tracking data — it retrieves, charts, and cites.",
};

export default function AskPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 sm:px-8">
      <h1 className="display mb-1 text-4xl font-bold">Ask the data</h1>
      <p className="mb-8 text-sm text-dim">
        A live analyst over the tournament database. It decides what to look up — team profiles,
        match files, leaderboards — shows you each retrieval as it happens, and answers with the
        numbers (and the occasional chart).
      </p>
      <p className="-mt-5 mb-8 text-sm text-dim">
        Have Claude Pro?{" "}
        <Link href="/connect" className="text-gold underline-offset-4 hover:underline">
          Connect this database to your own AI
        </Link>{" "}
        instead — same tools, your model.
      </p>
      <AskClient />
    </main>
  );
}
