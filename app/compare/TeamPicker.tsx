"use client";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { flagUrl } from "@/lib/flags";

type Opt = { abbr: string; name: string };

export default function TeamPicker({ teams, ta, tb }: { teams: Opt[]; ta: string; tb: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = (slot: "ta" | "tb") => (abbr: string) => {
    const next = new URLSearchParams(params.toString());
    next.set(slot, abbr);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const Select = ({ slot, value }: { slot: "ta" | "tb"; value: string }) => (
    <span className="flex items-center gap-2">
      <img src={flagUrl(value)} alt="" width={24} height={18} className="rounded-[2px]" />
      <select
        value={value}
        onChange={(e) => set(slot)(e.target.value)}
        aria-label={slot === "ta" ? "First team" : "Second team"}
        className="rounded border border-pitchline bg-surface px-2 py-1.5 text-sm text-chalk focus:border-gold focus:outline-none"
      >
        {teams.map((t) => (
          <option key={t.abbr} value={t.abbr}>
            {t.name}
          </option>
        ))}
      </select>
    </span>
  );

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Select slot="ta" value={ta} />
      <span className="data text-sm text-faint">vs</span>
      <Select slot="tb" value={tb} />
    </div>
  );
}
