"use client";
import { type ReactNode, useEffect, useRef } from "react";
import gsap from "gsap";

/** Award panel shell: four-act reveal (anticipation → winner burst → runners react →
 *  settle), then the winner's tournament field-density breathes behind the card.
 *  `backdrop` is server-rendered (Heatmap needs fs) and animated here as one layer.
 *  Children mark their beats with data-r="title|winner|badge|official|runner". */
export default function AwardReveal({ backdrop, disagree, children }: {
  backdrop: ReactNode;
  disagree: boolean;
  children: ReactNode;
}) {
  const root = useRef<HTMLElement>(null);
  const bdRef = useRef<HTMLDivElement>(null);
  const played = useRef(false);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const q = gsap.utils.selector(el);
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      if (bdRef.current) gsap.set(bdRef.current, { opacity: 0.3 });
      return; // content stays server-rendered and visible; the field just doesn't breathe
    }
    gsap.set(q("[data-r]"), { opacity: 0 });
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting || played.current) return;
        played.current = true;
        io.disconnect();
        const tl = gsap.timeline();
        /* act 1 — anticipation: the field fades up first, title arrives quietly */
        tl.to(bdRef.current, { opacity: 0.3, duration: 0.55, ease: "power1.out" }, 0);
        tl.fromTo(q('[data-r="title"]'), { y: 10 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out" }, 0.05);
        /* act 2 — action: winner bursts in, rating badge punches */
        tl.fromTo(q('[data-r="winner"]'), { scale: 0.7, y: 26 }, { scale: 1, y: 0, opacity: 1, duration: 0.5, ease: "back.out(1.6)" }, 0.3);
        tl.fromTo(q('[data-r="badge"]'), { scale: 2.2 }, { scale: 1, opacity: 1, duration: 0.4, ease: "back.out(2.5)" }, 0.62);
        /* act 3 — reaction: the rest of the podium ripples in */
        tl.fromTo(q('[data-r="runner"]'), { y: 14 }, { y: 0, opacity: 1, duration: 0.35, ease: "power2.out", stagger: 0.07 }, 0.75);
        if (disagree) {
          /* the jury slam */
          tl.fromTo(q('[data-r="official"]'), { scale: 1.7, rotation: -4 }, { scale: 1, rotation: 0, opacity: 1, duration: 0.4, ease: "back.out(2)" }, 0.95);
          tl.to(el, { x: 3, duration: 0.05, repeat: 3, yoyo: true, clearProps: "x" }, 1.0);
        } else {
          tl.fromTo(q('[data-r="official"]'), { y: 10 }, { y: 0, opacity: 1, duration: 0.4, ease: "power2.out" }, 0.95);
        }
        /* act 4 — resolution: background-element breathing (±1.5% scale, 4s sine) */
        tl.call(() => {
          if (bdRef.current)
            gsap.to(bdRef.current, { scale: 1.015, opacity: 0.24, duration: 4, ease: "sine.inOut", yoyo: true, repeat: -1 });
        }, [], 1.35);
      },
      { threshold: 0.3 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [disagree]);

  return (
    <section ref={root} className="relative overflow-hidden rounded-lg border border-pitchline bg-surface p-5">
      <div ref={bdRef} className="pointer-events-none absolute inset-0 opacity-0" aria-hidden>
        <div className="flex h-full w-full items-center justify-center blur-[3px]">{backdrop}</div>
      </div>
      <div className="relative">{children}</div>
    </section>
  );
}
