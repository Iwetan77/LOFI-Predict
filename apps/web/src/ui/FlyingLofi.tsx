/** LOFI flying all over the closing screen — celebratory chaos, win or lose. */
export function FlyingLofi({ count = 3 }: { count?: number }) {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
      {Array.from({ length: count }, (_, i) => (
        <img
          key={i}
          src="/art/lofi_fly.png"
          alt=""
          className="absolute"
          style={{
            width: `${64 + i * 14}px`,
            animation: `flyAround ${7 + i * 2.5}s ease-in-out ${i * -2}s infinite`,
            opacity: 0.85 - i * 0.15,
            filter: "drop-shadow(0 0 10px rgba(61,245,255,0.4))",
          }}
        />
      ))}
    </div>
  );
}
