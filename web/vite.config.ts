import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development, the API is served by the server on its default port.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:5602", ws: true },
    },
  },
});
