"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const EDGES: Record<string, string> = {
  gold: "linear-gradient(160deg,#8a6d1f,#e9d18a 30%,#caa53d 55%,#f3e3ab 80%,#8a6d1f)",
  silver: "linear-gradient(160deg,#5a6b5c,#dfe6dc 30%,#9fb0a0 55%,#eef2e9 80%,#5a6b5c)",
  bronze: "linear-gradient(160deg,#5e4326,#c9995f 30%,#8f6a3c 55%,#d8b083 80%,#5e4326)",
};

/** FUT-style pack opening around a server-rendered PlayerCard (passed as children). */
export default function PackReveal({ tier, children }: { tier: string; children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  const { contextSafe } = useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        buildTimeline();
      });
    },
    { scope: root }
  );

  const buildTimeline = () => {
    const q = gsap.utils.selector(root);
    const tl = gsap.timeline();
    // shards burst outward from behind the card at the flip moment
    const shards = q(".shard");
    shards.forEach((s) => {
      const angle = Math.random() * Math.PI * 2;
      const dist = 130 + Math.random() * 160;
      gsap.set(s, { x: 0, y: 0, autoAlpha: 0, rotation: Math.random() * 180 });
      tl.to(s, {
        x: Math.cos(angle) * dist,
        y: Math.sin(angle) * dist,
        autoAlpha: 0,
        keyframes: [
          { autoAlpha: 1, duration: 0.05 },
          { autoAlpha: 0, duration: 0.55 },
        ],
        rotation: `+=${Math.random() * 240 - 120}`,
        duration: 0.6,
        ease: "power3.out",
      }, 1.25);
    });
    tl
      // arrive: card back pops in with a wobble (anticipation)
      .fromTo(q(".flip"), { rotationY: 180, scale: 0.55, y: 50, autoAlpha: 0 },
        { scale: 1, y: 0, autoAlpha: 1, duration: 0.55, ease: "back.out(1.4)" }, 0)
      .to(q(".flip"), { rotation: 1.6, yoyo: true, repeat: 3, duration: 0.09, ease: "sine.inOut" }, 0.6)
      .to(q(".flip"), { scale: 0.94, duration: 0.14, ease: "power2.in" }, 1.0)
      // the flip
      .to(q(".flip"), { rotationY: 0, scale: 1, duration: 0.65, ease: "power4.inOut" }, 1.15)
      .fromTo(q(".flash"), { opacity: 0 }, { opacity: 0.9, duration: 0.08, yoyo: true, repeat: 1, ease: "power1.in" }, 1.38)
      // stats build: bars sweep, numbers pop, overall lands last
      .from(q(".statbar"), { scaleX: 0, duration: 0.45, stagger: 0.06, ease: "power2.out" }, 1.75)
      .from(q(".statnum"), { autoAlpha: 0, scale: 1.6, duration: 0.3, stagger: 0.06, ease: "back.out(1.6)" }, 1.75)
      .from(q(".ovr"), { autoAlpha: 0, scale: 2.4, duration: 0.5, ease: "back.out(1.8)" }, 2.15);
    return tl;
  };

  const replay = contextSafe(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    buildTimeline();
  });

  return (
    <div ref={root} className="inline-block">
      <div className="relative [perspective:1200px]">
        {/* burst layer sits behind the card */}
        <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center" aria-hidden>
          {Array.from({ length: 14 }, (_, i) => (
            <span key={i} className="shard absolute h-2.5 w-1 rounded-full opacity-0"
              style={{ background: i % 3 ? "var(--gold)" : "var(--chalk)" }} />
          ))}
        </div>
        <div className="flip relative z-10 [transform-style:preserve-3d]">
          {/* front */}
          <div className="[backface-visibility:hidden]">{children}</div>
          {/* back */}
          <div className="absolute inset-0 rounded-2xl p-[3px] [backface-visibility:hidden] [transform:rotateY(180deg)]"
            style={{ background: EDGES[tier] ?? EDGES.bronze }} aria-hidden>
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-[13px]"
              style={{ background: "linear-gradient(175deg,#12241a 0%,#0a150e 45%,#050d08 100%)" }}>
              <span className="display text-4xl font-bold tracking-tight text-chalk">
                M<span className="text-gold">·</span>26
              </span>
              <span className="eyebrow">real-data card</span>
            </div>
          </div>
          {/* flash on flip */}
          <div className="flash pointer-events-none absolute inset-0 z-20 rounded-2xl opacity-0"
            style={{ background: "radial-gradient(circle, rgba(243,227,171,.85), transparent 70%)" }} aria-hidden />
        </div>
      </div>
      <button onClick={replay}
        className="eyebrow mt-3 block w-full text-center transition-colors hover:text-gold">
        ↻ replay the reveal
      </button>
    </div>
  );
}
