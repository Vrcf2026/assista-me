// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

const loadedEnv = loadEnv(process.env.NODE_ENV ?? "production", process.cwd(), "");

// These values identify the public browser client and are intentionally safe
// to include in its bundle. Keep explicit fallbacks so a hosted build remains
// usable even when the build environment omits the generated VITE_ variables.
const publicBackendUrl =
  loadedEnv.VITE_SUPABASE_URL ||
  loadedEnv.SUPABASE_URL ||
  process.env.VITE_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://fzkpvtuswrezawhxrbsu.supabase.co";
const publicBackendKey =
  loadedEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  loadedEnv.SUPABASE_PUBLISHABLE_KEY ||
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZ6a3B2dHVzd3JlemF3aHhyYnN1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5Njc3MjgsImV4cCI6MjA5MjU0MzcyOH0.d4-_ay-W9ZhMEs2t2rzSFR0100VMF-oCGuFvZnTYqbY";
const publicBackendProjectId =
  loadedEnv.VITE_SUPABASE_PROJECT_ID ||
  loadedEnv.SUPABASE_PROJECT_ID ||
  process.env.VITE_SUPABASE_PROJECT_ID ||
  process.env.SUPABASE_PROJECT_ID ||
  "fzkpvtuswrezawhxrbsu";

export default defineConfig({
  // The preview disconnects requests while reopening. Its generic SSR logger
  // promotes those expected ECONNRESET events to a full-screen runtime error.
  // Real application errors remain logged by src/start.ts and src/server.ts.
  ssrErrorLogger: false,
  // TanStack otherwise uses its virtual default entry and never executes
  // src/server.ts, where disconnected preview requests are handled safely.
  tanstackStart: {
    server: { entry: "server" },
  },
  plugins: [
    {
      name: "load-server-environment",
      config: (_config, { mode }) => {
        // Keep secrets server-only while making them available to server routes.
        Object.assign(process.env, loadEnv(mode, process.cwd(), ""));
      },
    },
  ],
  vite: {
    define: {
      "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(publicBackendUrl),
      "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(publicBackendKey),
      "import.meta.env.VITE_SUPABASE_PROJECT_ID": JSON.stringify(publicBackendProjectId),
    },
    resolve: {
      alias: {
        // Force entities to v4.5.0 (hoisted copy) — react-email's htmlparser2
        // dep needs ./lib/decode.js which only exists in v4.x.
        "entities/lib/decode.js": path.resolve(__dirname, "node_modules/entities/lib/decode.js"),
        "entities/lib/encode.js": path.resolve(__dirname, "node_modules/entities/lib/encode.js"),
        entities: path.resolve(__dirname, "node_modules/entities"),
      },
    },
  },
});
