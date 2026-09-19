import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

/**
 * Health check público — usado para monitorização externa.
 * GET /api/health → { ok: true, db: true, ts: "..." }
 *
 * Útil para: UptimeRobot, BetterStack, Cloudflare Health Checks.
 */

export const Route = createFileRoute("/api/health" as any)({
  server: {
    handlers: {
      GET: async () => {
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

        const ts = new Date().toISOString();

        // Verificar ligação à base de dados
        let dbOk = false;
        if (SUPABASE_URL && SERVICE_KEY) {
          try {
            const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
            const { error } = await supabase
              .from("tickets")
              .select("id")
              .limit(1)
              .single();
            // PGRST116 = 0 rows (normal) — base de dados ok
            dbOk = !error || error.code === "PGRST116";
          } catch {
            dbOk = false;
          }
        }

        const ok = dbOk;
        return Response.json(
          { ok, db: dbOk, ts, version: "1.0.0" },
          { status: ok ? 200 : 503 }
        );
      },
    },
  },
});
