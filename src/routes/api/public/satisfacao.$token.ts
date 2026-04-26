import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

function json(data: unknown, status = 200) {
  return Response.json(data, { status });
}

function isValidToken(token: string) {
  return /^[a-f0-9]{24,80}$/i.test(token);
}

export const Route = createFileRoute("/api/public/satisfacao/$token")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const token = params.token;
        if (!token || !isValidToken(token)) return json({ error: "Invalid token" }, 400);

        const { data, error } = await supabaseAdmin
          .from("ticket_satisfaction")
          .select("id, submitted_at, ticket:tickets(numero)")
          .eq("token", token)
          .maybeSingle();

        if (error) {
          console.error("satisfaction lookup failed", error);
          return json({ error: "Server error" }, 500);
        }
        if (!data) return json({ error: "Not found" }, 404);

        const ticket = (data as any).ticket as { numero?: number } | null;
        return json({
          valid: true,
          submitted_at: data.submitted_at,
          ticketNumero: ticket?.numero ?? null,
        });
      },
      POST: async ({ request, params }) => {
        const token = params.token;
        if (!token || !isValidToken(token)) return json({ error: "Invalid token" }, 400);

        let body: { rating?: unknown; comentario?: unknown } = {};
        try {
          body = await request.json();
        } catch {
          return json({ error: "Invalid body" }, 400);
        }

        const rating = Number(body.rating);
        const comentario = typeof body.comentario === "string" ? body.comentario.trim().slice(0, 500) : null;
        if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
          return json({ error: "Invalid rating" }, 400);
        }

        const { data, error } = await supabaseAdmin
          .from("ticket_satisfaction")
          .update({
            rating,
            comentario: comentario || null,
            submitted_at: new Date().toISOString(),
          })
          .eq("token", token)
          .is("submitted_at", null)
          .select("id")
          .maybeSingle();

        if (error) {
          console.error("satisfaction submit failed", error);
          return json({ error: "Server error" }, 500);
        }
        if (!data) return json({ success: false, reason: "already_submitted" });

        return json({ success: true });
      },
    },
  },
});
