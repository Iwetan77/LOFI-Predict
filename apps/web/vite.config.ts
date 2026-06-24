import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    // Same-origin proxy to the relay/auth API so the zkLogin session cookie
    // stays first-party. The browser only ever talks to the Vite origin.
    proxy: {
      "/api": { target: process.env.VITE_API_BASE ?? "http://127.0.0.1:8787", changeOrigin: true },
    },
  },
  define: {
    // API base for the relay; overridable at build time.
    __API_BASE__: JSON.stringify(process.env.VITE_API_BASE ?? "http://127.0.0.1:8787"),
  },
});
