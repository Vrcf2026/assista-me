import { createFileRoute } from "@tanstack/react-router";
import webpush from "web-push";
import { createClient } from "@supabase/supabase-js";

/**
 * Envia push notification a um utilizador específico (ou a todos os admins).
 *
 * Variáveis de ambiente necessárias:
 *   VAPID_PRIVATE_KEY=8WEptCBq10OJoxH_MDcUQSRuC_bQVLKBOrlEN3MobEA
 *   VAPID_PUBLIC_KEY=BPHH73SyLZAGxPPPQNUaHZ7AMN4ZckHRZ8khcpeWURWPJDz7l2-fdDlR5vFNPnc0v_N0MLuSq69TKVUGqVLzC8E
 *   VAPID_EMAIL=mailto:vrcf.loja@gmail.com
 *
 * Body:
 *   { user_id?: string, title: string, body: string, link?: string }
 *   Se user_id omitido → envia a todos os admins
 */

export const Route = createFileRoute("/api/push/send" as any)({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const SUPABASE_URL = process.env.SUPABASE_URL!;
        const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const VAPID_PRIVATE = process.env.VAPID_PRIVATE_KEY;
        const VAPID_PUBLIC = process.env.VAPID_PUBLIC_KEY ??
          "BPHH73SyLZAGxPPPQNUaHZ7AMN4ZckHRZ8khcpeWURWPJDz7l2-fdDlR5vFNPnc0v_N0MLuSq69TKVUGqVLzC8E";
        const VAPID_EMAIL = process.env.VAPID_EMAIL ?? "mailto:vrcf.loja@gmail.com";

        if (!VAPID_PRIVATE) {
          return Response.json({ error: "VAPID_PRIVATE_KEY não configurada" }, { status: 500 });
        }

        // Autenticação interna — só chamada por outros workers/hooks
        const authHeader = request.headers.get("x-internal-secret");
        const SERVICE_SECRET = process.env.INTERNAL_SECRET ?? SERVICE_KEY.slice(0, 32);
        if (authHeader !== SERVICE_SECRET) {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }

        webpush.setVapidDetails(VAPID_EMAIL, VAPID_PUBLIC, VAPID_PRIVATE);

        const body = await request.json() as {
          user_id?: string;
          title: string;
          body: string;
          link?: string;
        };

        const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

        // Buscar subscrições
        let query = supabase.from("push_subscriptions" as any).select("*");
        if (body.user_id) query = query.eq("user_id", body.user_id);

        const { data: subs } = await query;
        if (!subs?.length) return Response.json({ ok: true, sent: 0 });

        const payload = JSON.stringify({
          title: body.title,
          body: body.body,
          link: body.link ?? "/",
        });

        let sent = 0;
        let failed = 0;

        await Promise.allSettled(
          subs.map(async (sub: any) => {
            try {
              await webpush.sendNotification(
                { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
                payload
              );
              sent++;
            } catch (e: any) {
              failed++;
              // Subscrição expirada → remover
              if (e.statusCode === 410) {
                await supabase.from("push_subscriptions" as any)
                  .delete().eq("endpoint", sub.endpoint);
              }
            }
          })
        );

        return Response.json({ ok: true, sent, failed });
      },
    },
  },
});
