/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0420",
        neon: "#3df5ff",
        hot: "#ff2e88",
        gold: "#ffd23f",
        warm: "#39ff8b",
        danger: "#ff4d4d",
      },
      fontFamily: {
        pixel: ['"Press Start 2P"', "ui-monospace", "monospace"],
      },
      keyframes: {
        blink: { "0%,49%": { opacity: "1" }, "50%,100%": { opacity: "0" } },
        floaty: { "0%,100%": { transform: "translateY(0)" }, "50%": { transform: "translateY(-6px)" } },
      },
      animation: {
        blink: "blink 1s steps(1) infinite",
        floaty: "floaty 2.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
