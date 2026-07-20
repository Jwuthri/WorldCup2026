"use client";
import { useEffect, useRef } from "react";

/** Counts the first number in `text` up from 0 when scrolled into view (power3-out). */
export default function TickNumber({ text, className }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const m = text.match(/^([^0-9]*)([\d.,]+)(.*)$/);
    if (!m || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = parseFloat(m[2].replace(/,/g, ""));
    const decimals = (m[2].split(".")[1] ?? "").length;
    const grouped = m[2].includes(",");
    el.textContent = `${m[1]}0${m[3]}`;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        const t0 = performance.now();
        const D = 1400;
        const step = (t: number) => {
          const k = Math.min((t - t0) / D, 1);
          const v = target * (1 - Math.pow(1 - k, 3));
          el.textContent =
            k >= 1
              ? text
              : `${m[1]}${grouped ? Math.round(v).toLocaleString("en-US") : decimals ? v.toFixed(decimals) : Math.round(v)}${m[3]}`;
          if (k < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      },
      { threshold: 0.5 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [text]);

  return (
    <span ref={ref} className={className}>
      {text}
    </span>
  );
}
