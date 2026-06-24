/** A glowing live sparkline of the BTC price — the "is it moving?" read. */
export function BtcChart({ history, w = 320, h = 70 }: { history: number[]; w?: number; h?: number }) {
  if (history.length < 2) {
    return <div style={{ height: h }} className="flex items-center justify-center text-[8px] text-white/30">reading the market…</div>;
  }
  const min = Math.min(...history);
  const max = Math.max(...history);
  const range = max - min || 1;
  const pad = 6;
  const pts = history.map((v, i) => {
    const x = pad + (i / (history.length - 1)) * (w - pad * 2);
    const y = pad + (1 - (v - min) / range) * (h - pad * 2);
    return [x, y] as const;
  });
  const up = history[history.length - 1] >= history[0];
  const color = up ? "#39ff8b" : "#ff4d4d";
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const area = `${line} L${pts[pts.length - 1][0].toFixed(1)},${h} L${pts[0][0].toFixed(1)},${h} Z`;
  const [ex, ey] = pts[pts.length - 1];

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height: h }} preserveAspectRatio="none">
      <defs>
        <linearGradient id="btcfill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#btcfill)" />
      <path d={line} fill="none" stroke={color} strokeWidth="2" style={{ filter: `drop-shadow(0 0 4px ${color})` }} />
      <circle cx={ex} cy={ey} r="4" fill={color} style={{ filter: `drop-shadow(0 0 6px ${color})` }} />
    </svg>
  );
}
