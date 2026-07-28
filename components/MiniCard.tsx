import { Link } from "next-view-transitions";
import { flagUrl } from "@/lib/flags";

export type MiniCardData = {
  id: string;
  name: string;
  abbr: string;
  pos: string;
  overall: number;
  tier: string;
  photo: string | null;
};

export const tierColor = (t: string) => (t === "gold" ? "var(--gold)" : t === "silver" ? "var(--chalk)" : "#d8b083");

export default function MiniCard({ c, showFlag = true, base = "", badge }: {
  c: MiniCardData;
  showFlag?: boolean;
  /** route prefix — "" at the tournament, "/<edition>" in a league */
  base?: string;
  /** overrides the nation flag; leagues pass a club crest */
  badge?: string;
}) {
  return (
    <Link
      href={`${base}/player/${c.id}`}
      className="group rounded-lg border border-pitchline bg-surface p-3 text-center transition-colors hover:border-gold/60"
    >
      <div className="relative mx-auto h-20 w-20">
        <div className="h-20 w-20 overflow-hidden rounded-full border-2"
          style={{ borderColor: tierColor(c.tier), viewTransitionName: `player-photo-${c.id}` }}>
          {c.photo ? (
            <img src={c.photo} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
          ) : (
            <div className="display flex h-full w-full items-center justify-center bg-raised text-lg text-faint">{c.abbr}</div>
          )}
        </div>
        <span
          className="data absolute -right-1 -top-1 rounded border bg-bg px-1.5 py-0.5 text-sm"
          style={{ color: tierColor(c.tier), borderColor: tierColor(c.tier) }}
        >
          {c.overall}
        </span>
      </div>
      <p className="display mt-2 truncate text-base font-semibold text-chalk group-hover:text-gold">{c.name}</p>
      <p className="eyebrow mt-0.5 flex items-center justify-center gap-1.5">
        {showFlag && (
          <img
            src={badge ?? flagUrl(c.abbr)}
            alt=""
            width={14}
            height={14}
            className="h-3.5 w-3.5 rounded-[2px] object-contain"
            loading="lazy"
          />
        )}
        {c.pos}
      </p>
    </Link>
  );
}
