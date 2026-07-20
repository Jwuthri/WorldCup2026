"use client";

import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import ChatChart, { type ChartSpec } from "@/components/ChatChart";

type Part =
  | { kind: "text"; text: string }
  | { kind: "tool"; label: string }
  | { kind: "chart"; spec: ChartSpec };
type Turn = { role: "user"; text: string } | { role: "assistant"; parts: Part[] };

const TOOL_LABELS: Record<string, (i: any) => string> = {
  list_matches: (i) => `listing matches${i?.team ? ` · ${i.team}` : ""}${i?.stage ? ` · ${i.stage}` : ""}`,
  get_match: (i) => `opening match ${i?.match_id ?? ""}`,
  get_team: (i) => `pulling team profile · ${i?.team ?? ""}`,
  get_player: (i) => `pulling player file · ${i?.name ?? ""}`,
  leaderboard: (i) => `running leaderboard · ${i?.metric ?? ""}`,
  render_chart: () => "drawing a chart",
};

const EXAMPLES = [
  "How should France have approached the semifinal against Spain?",
  "Chart the golden boot race against xG — who overperformed their chances?",
  "Which team pressed hardest, and did it pay off?",
  "Compare Yamal and Mbappé's tournaments with the numbers.",
];

const MD_COMPONENTS = {
  h1: (p: any) => <h3 className="display mt-4 mb-1.5 text-xl font-semibold text-chalk" {...p} />,
  h2: (p: any) => <h3 className="display mt-4 mb-1.5 text-xl font-semibold text-chalk" {...p} />,
  h3: (p: any) => <h4 className="display mt-3 mb-1 text-lg font-semibold text-chalk" {...p} />,
  p: (p: any) => <p className="my-2 leading-relaxed" {...p} />,
  strong: (p: any) => <strong className="font-semibold text-gold" {...p} />,
  ul: (p: any) => <ul className="my-2 list-disc space-y-1 pl-5" {...p} />,
  ol: (p: any) => <ol className="my-2 list-decimal space-y-1 pl-5" {...p} />,
  table: (p: any) => (
    <div className="my-3 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...p} />
    </div>
  ),
  th: (p: any) => <th className="eyebrow border-b border-pitchline px-2 py-1.5 text-left" {...p} />,
  td: (p: any) => <td className="data border-b border-pitchline/50 px-2 py-1.5 text-chalk" {...p} />,
  code: (p: any) => <code className="data rounded bg-raised px-1 py-0.5 text-[13px]" {...p} />,
  a: (p: any) => <a className="text-gold underline-offset-4 hover:underline" {...p} />,
};

export default function AskClient() {
  const [transcript, setTranscript] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [transcript, loading]);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");
    setLoading(true);

    const history = [...transcript, { role: "user" as const, text: q }];
    setTranscript([...history, { role: "assistant", parts: [] }]);

    const apiMessages = history.map((t) => ({
      role: t.role,
      content: t.role === "user" ? t.text : t.parts.filter((p) => p.kind === "text").map((p: any) => p.text).join("\n"),
    }));

    const push = (fn: (parts: Part[]) => Part[]) =>
      setTranscript((cur) => {
        const next = [...cur];
        const last = next[next.length - 1];
        if (last?.role === "assistant") next[next.length - 1] = { role: "assistant", parts: fn(last.parts) };
        return next;
      });

    try {
      const res = await fetch("/api/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: apiMessages }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? `Request failed (${res.status}).`);
        setLoading(false);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.trim()) continue;
          let ev: any;
          try { ev = JSON.parse(line); } catch { continue; }
          if (ev.type === "text") {
            push((parts) => {
              const last = parts[parts.length - 1];
              if (last?.kind === "text") return [...parts.slice(0, -1), { kind: "text", text: last.text + ev.delta }];
              return [...parts, { kind: "text", text: ev.delta }];
            });
          } else if (ev.type === "tool") {
            const label = TOOL_LABELS[ev.name]?.(ev.input) ?? ev.name;
            push((parts) => [...parts, { kind: "tool", label }]);
          } else if (ev.type === "chart") {
            push((parts) => [...parts, { kind: "chart", spec: ev.spec }]);
          } else if (ev.type === "error") {
            setError(ev.message);
          }
        }
      }
    } catch {
      setError("Lost connection while streaming.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="space-y-4">
        {transcript.map((turn, i) =>
          turn.role === "user" ? (
            <div key={i} className="ml-auto max-w-[85%] rounded-lg rounded-br-none border border-gold/30 bg-raised px-4 py-2.5 text-sm text-chalk">
              {turn.text}
            </div>
          ) : (
            <div key={i} className="rounded-lg border border-pitchline bg-surface px-5 py-3 text-[15px] text-chalk">
              {turn.parts.length === 0 && loading && i === transcript.length - 1 && (
                <p className="display animate-pulse py-1 text-dim">Reading the data…</p>
              )}
              {turn.parts.map((part, j) =>
                part.kind === "text" ? (
                  <ReactMarkdown key={j} remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                    {part.text}
                  </ReactMarkdown>
                ) : part.kind === "tool" ? (
                  <span key={j} className="data my-1 mr-2 inline-flex items-center gap-1.5 rounded-full border border-pitchline bg-raised px-2.5 py-1 text-[11px] text-dim">
                    <span className="h-1.5 w-1.5 rounded-full bg-gold" /> {part.label}
                  </span>
                ) : (
                  <ChatChart key={j} spec={part.spec} />
                )
              )}
            </div>
          )
        )}
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-ember/50 bg-surface p-4 text-sm text-ember">{error}</div>
      )}

      {transcript.length === 0 && (
        <div className="mb-6 flex flex-wrap gap-2">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => ask(ex)}
              disabled={loading}
              className="rounded-full border border-pitchline px-3 py-1.5 text-xs text-dim transition-colors hover:border-gold/60 hover:text-chalk disabled:opacity-40"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); ask(input); }}
        className="sticky bottom-4 mt-6 flex gap-2 rounded-lg border border-pitchline bg-surface p-2 shadow-[0_10px_40px_-10px_rgba(0,0,0,.7)]"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={transcript.length ? "Follow up…" : "e.g. France vs Spain — what should France have done differently?"}
          className="grow rounded border-none bg-transparent px-3 py-2 text-sm text-chalk placeholder:text-faint focus:outline-none"
        />
        <button
          type="submit"
          disabled={loading || !input.trim()}
          className="display rounded bg-gold px-5 py-2 font-semibold text-bg transition-opacity disabled:opacity-40"
        >
          {loading ? "…" : "Ask"}
        </button>
      </form>
      <div ref={bottomRef} />
    </div>
  );
}
