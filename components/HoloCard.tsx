"use client";
import { useRef, type ReactNode } from "react";

/**
 * Pointer-tracked 3D tilt + holographic foil sheen. Gold cards get the full
 * treatment, silver a hint, bronze stays matte. Reduced motion: static.
 */
export default function HoloCard({ tier, children }: { tier: "gold" | "silver" | "bronze"; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const foil = tier === "gold" ? 0.4 : tier === "silver" ? 0.18 : 0;

  const move = (e: React.PointerEvent) => {
    const el = ref.current;
    if (!el || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const r = el.getBoundingClientRect();
    const nx = ((e.clientX - r.left) / r.width) * 2 - 1;
    const ny = ((e.clientY - r.top) / r.height) * 2 - 1;
    el.style.setProperty("--rx", `${(-ny * 8).toFixed(2)}deg`);
    el.style.setProperty("--ry", `${(nx * 10).toFixed(2)}deg`);
    el.style.setProperty("--gx", `${(((nx + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--gy", `${(((ny + 1) / 2) * 100).toFixed(1)}%`);
    el.style.setProperty("--go", "1");
  };
  const leave = () => {
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
    el.style.setProperty("--go", "0");
  };

  return (
    <div style={{ perspective: "900px" }}>
      <div ref={ref} className="holo" onPointerMove={move} onPointerLeave={leave}>
        {children}
        {/* glare following the pointer */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-2xl"
          style={{
            background: "radial-gradient(420px circle at var(--gx,50%) var(--gy,50%), rgba(255,255,255,0.26), transparent 55%)",
            opacity: "var(--go, 0)",
            transition: "opacity 0.3s",
            mixBlendMode: "overlay",
          }}
        />
        {/* holographic foil, tier-gated */}
        {foil > 0 && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl"
            style={{
              background:
                "conic-gradient(from calc(var(--ry,0deg) * 9) at var(--gx,50%) var(--gy,50%), rgba(227,190,86,0.55), rgba(120,215,255,0.4), rgba(240,130,205,0.4), rgba(150,255,190,0.35), rgba(227,190,86,0.55))",
              opacity: `calc(var(--go, 0) * ${foil})`,
              transition: "opacity 0.3s",
              mixBlendMode: "color-dodge",
              filter: "blur(16px) saturate(1.3)",
            }}
          />
        )}
      </div>
    </div>
  );
}
