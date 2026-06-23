import { useMemo } from "react";

const COLORS = ["#3df5ff", "#ffd23f", "#39ff8b", "#ff2e88"];

/** Lightweight DOM confetti burst for a cleared floor. Self-clears via animation. */
export function Confetti({ count = 28 }: { count?: number }) {
  const bits = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        dur: 0.9 + Math.random() * 0.8,
        color: COLORS[i % COLORS.length],
        size: 4 + Math.round(Math.random() * 5),
      })),
    [count],
  );

  return (
    <div className="pointer-events-none absolute inset-0 z-20 overflow-hidden">
      {bits.map((b, i) => (
        <span
          key={i}
          className="absolute top-0"
          style={{
            left: `${b.left}%`,
            width: b.size,
            height: b.size,
            background: b.color,
            animation: `fall ${b.dur}s linear ${b.delay}s forwards`,
          }}
        />
      ))}
    </div>
  );
}
