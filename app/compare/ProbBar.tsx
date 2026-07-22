"use client";
import { useEffect, useRef } from "react";
import gsap from "gsap";

/** Rematch odds bar: the three segments spring from an even split to the real odds. */
export default function ProbBar({ aName, bName, pA, pDraw, pB }: {
  aName: string; bName: string; pA: number; pDraw: number; pB: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = (p: number) => `${Math.round(p * 100)}%`;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const segs = el.querySelectorAll<HTMLElement>("[data-p]");
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      segs.forEach((s) => (s.style.width = `${+s.dataset.p! * 100}%`));
      return;
    }
    gsap.fromTo(segs,
      { width: `${100 / 3}%` },
      { width: (i, t) => `${+(t as HTMLElement).dataset.p! * 100}%`, duration: 0.9, ease: "back.out(1.4)" });
  }, [pA, pDraw, pB]);

  return (
    <div ref={ref}>
      <div className="mb-1.5 flex justify-between text-sm">
        <span className="text-gold">{aName} {pct(pA)}</span>
        <span className="text-faint">draw {pct(pDraw)}</span>
        <span className="text-chalk">{bName} {pct(pB)}</span>
      </div>
      <div className="flex h-3 overflow-hidden rounded-full">
        <div className="bg-gold" data-p={pA} />
        <div className="bg-raised" data-p={pDraw} />
        <div className="bg-chalk" data-p={pB} />
      </div>
    </div>
  );
}
