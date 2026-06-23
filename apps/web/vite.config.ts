import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "LOFI PREDICT",
        short_name: "LOFI",
        description: "Help LOFI climb. Call it right, climb higher.",
        theme_color: "#0b0420",
        background_color: "#0b0420",
        display: "fullscreen",
        orientation: "portrait",
        icons: [],
      },
    }),
  ],
  server: { host: true },
  define: {
    // API base for the relay; overridable at build time.
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE ?? "http://127.0.0.1:8787"),
  },
});
