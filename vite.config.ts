// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import path from "node:path";
import { loadEnv } from "vite";
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

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
