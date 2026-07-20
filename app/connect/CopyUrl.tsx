"use client";
import { useEffect, useState } from "react";

// NEXT_PUBLIC_ vars are inlined at build time — set NEXT_PUBLIC_SITE_URL at deploy.
const SITE = process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "");

/** Shows a copyable string with the site's MCP endpoint substituted for {url}. */
export default function CopyUrl({ template = "{url}", wrap = false }: { template?: string; wrap?: boolean }) {
  const [url, setUrl] = useState(`${SITE ?? "https://<this-site>"}/api/mcp`);
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!SITE) setUrl(`${location.origin}/api/mcp`);
  }, []);
  const text = template.replace("{url}", url);
  return (
    <div className="flex items-center gap-2 rounded-lg border border-pitchline bg-surface px-3 py-2.5">
      <code className={`data min-w-0 grow text-sm text-chalk ${wrap ? "break-all" : "overflow-x-auto whitespace-nowrap"}`}>{text}</code>
      <button
        onClick={() => {
          navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="shrink-0 rounded border border-pitchline px-2.5 py-1 text-xs text-dim transition-colors hover:border-gold/60 hover:text-chalk"
      >
        {copied ? "copied ✓" : "copy"}
      </button>
    </div>
  );
}
