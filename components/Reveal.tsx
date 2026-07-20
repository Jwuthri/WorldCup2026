"use client";
import { useEffect, useRef, type ReactNode } from "react";

/** Staggers direct children in (fade + rise) when the block scrolls into view. */
export default function Reveal({ children, className = "", stagger = 70 }: { children: ReactNode; className?: string; stagger?: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        [...el.children].forEach((c, i) => ((c as HTMLElement).style.transitionDelay = `${i * stagger}ms`));
        el.classList.add("reveal-on");
      },
      { threshold: 0.15 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [stagger]);

  return (
    <div ref={ref} className={`reveal ${className}`}>
      {children}
    </div>
  );
}
