"use client";

import { useEffect, useRef } from "react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

const SRC = "/mundial26-promo.mp4";

/** Scroll-synced promo reel — plays while the pinned scene is in view. */
export default function PromoVideo() {
  const wrap = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = wrap.current;
    const v = video.current;
    if (!el || !v) return;

    const st = ScrollTrigger.create({
      trigger: el,
      start: "top 75%",
      end: "bottom 25%",
      onEnter: () => void v.play().catch(() => {}),
      onEnterBack: () => void v.play().catch(() => {}),
      onLeave: () => v.pause(),
      onLeaveBack: () => v.pause(),
    });

    return () => st.kill();
  }, []);

  return (
    <div ref={wrap} className="promo-frame w-full max-w-5xl overflow-hidden rounded-xl border border-pitchline bg-black shadow-[0_0_80px_-20px_var(--gold)]">
      <video
        ref={video}
        className="aspect-video w-full object-cover"
        src={SRC}
        muted
        playsInline
        loop
        preload="metadata"
        aria-label="MUNDIAL·26 promo reel"
      />
    </div>
  );
}
