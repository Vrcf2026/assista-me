// Edge function para CRUD de credenciais de tickets com encriptação pgcrypto.
// Actions: list, create, update, delete, request, fulfill, listRequests, cancelRequest
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface Payload {
  action: string;
  ticketId?: string;
  credentialId?: string;
  requestId?: string;
  tipo?: string;
  utilizador?: string | null;
  password?: string;
  notas?: string | null;
  nota?: string | null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;
    const KEY = Deno.env.get("CREDENTIALS_ENCRYPTION_KEY");
    if (!KEY) return json({ error: "Encryption key not configured" }, 500);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    // Check role
    const { data: roleRows } = await admin.from("user_roles")
      .select("role").eq("user_id", userId).eq("role", "admin");
    const isVrcfAdmin = (roleRows ?? []).length > 0;

    const body = (await req.json()) as Payload;
    const action = body.action;

    // Verify access to ticket: vrcf admin or client admin of that ticket
    async function canAccessTicket(ticketId: string): Promise<{ ok: boolean; clientId?: string }> {
      if (isVrcfAdmin) {
        const { data: t } = await admin.from("tickets").select("client_id").eq("id", ticketId).maybeSingle();
        return { ok: !!t, clientId: t?.client_id };
      }
      const { data: t } = await admin.from("tickets").select("client_id").eq("id", ticketId).maybeSingle();
      if (!t) return { ok: false };
      const { data: cu } = await admin.from("client_users")
        .select("is_client_admin").eq("user_id", userId).eq("client_id", t.client_id).maybeSingle();
      return { ok: !!cu?.is_client_admin, clientId: t.client_id };
    }

    if (action === "list") {
      if (!body.ticketId) return json({ error: "ticketId required" }, 400);
      const access = await canAccessTicket(body.ticketId);
      if (!access.ok) return json({ error: "Forbidden" }, 403);
      // Use SQL to decrypt
      const { data, error } = await admin.rpc("decrypt_ticket_credentials", {
        _ticket_id: body.ticketId,
        _key: KEY,
      });
      if (error) return json({ error: error.message }, 500);
      return json({ items: data ?? [] });
    }

    if (action === "create" || action === "update") {
      if (!body.ticketId || !body.password || !body.tipo) return json({ error: "Campos obrigatórios em falta" }, 400);
      const access = await canAccessTicket(body.ticketId);
      if (!access.ok) return json({ error: "Forbidden" }, 403);

      const { data: encResult, error: encErr } = await admin.rpc("encrypt_password", {
        _password: body.password, _key: KEY,
      });
      if (encErr) return json({ error: encErr.message }, 500);

      if (action === "create") {
        const { data, error } = await admin.from("ticket_credenciais").insert({
          ticket_id: body.ticketId,
          tipo: body.tipo,
          utilizador: body.utilizador ?? null,
          password_encrypted: encResult,
          notas: body.notas ?? null,
          created_by: userId,
        }).select("id").single();
        if (error) return json({ error: error.message }, 500);
        return json({ id: data.id });
      } else {
        if (!body.credentialId) return json({ error: "credentialId required" }, 400);
        const { error } = await admin.from("ticket_credenciais").update({
          tipo: body.tipo,
          utilizador: body.utilizador ?? null,
          password_encrypted: encResult,
          notas: body.notas ?? null,
        }).eq("id", body.credentialId);
        if (error) return json({ error: error.message }, 500);
        return json({ ok: true });
      }
    }

    if (action === "delete") {
      if (!body.credentialId) return json({ error: "credentialId required" }, 400);
      // Look up ticket of this credential
      const { data: cred } = await admin.from("ticket_credenciais")
        .select("ticket_id").eq("id", body.credentialId).maybeSingle();
      if (!cred) return json({ error: "Not found" }, 404);
      const access = await canAccessTicket(cred.ticket_id);
      if (!access.ok) return json({ error: "Forbidden" }, 403);
      const { error } = await admin.from("ticket_credenciais").delete().eq("id", body.credentialId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "request") {
      if (!isVrcfAdmin) return json({ error: "Forbidden" }, 403);
      if (!body.ticketId || !body.tipo) return json({ error: "Campos obrigatórios em falta" }, 400);
      const { data, error } = await admin.from("ticket_credential_requests").insert({
        ticket_id: body.ticketId,
        tipo: body.tipo,
        nota: body.nota ?? null,
        created_by: userId,
      }).select("id").single();
      if (error) return json({ error: error.message }, 500);
      return json({ id: data.id });
    }

    if (action === "fulfill") {
      if (!body.requestId || !body.password) return json({ error: "Campos obrigatórios em falta" }, 400);
      const { data: reqRow } = await admin.from("ticket_credential_requests")
        .select("id, ticket_id, tipo, fulfilled_at, cancelled_at").eq("id", body.requestId).maybeSingle();
      if (!reqRow) return json({ error: "Pedido não encontrado" }, 404);
      if (reqRow.fulfilled_at || reqRow.cancelled_at) return json({ error: "Pedido já respondido" }, 400);
      const access = await canAccessTicket(reqRow.ticket_id);
      if (!access.ok) return json({ error: "Forbidden" }, 403);

      const { data: encResult, error: encErr } = await admin.rpc("encrypt_password", {
        _password: body.password, _key: KEY,
      });
      if (encErr) return json({ error: encErr.message }, 500);

      const { data: cred, error: credErr } = await admin.from("ticket_credenciais").insert({
        ticket_id: reqRow.ticket_id,
        tipo: reqRow.tipo,
        utilizador: body.utilizador ?? null,
        password_encrypted: encResult,
        notas: body.notas ?? null,
        created_by: userId,
      }).select("id").single();
      if (credErr) return json({ error: credErr.message }, 500);

      await admin.from("ticket_credential_requests").update({
        fulfilled_at: new Date().toISOString(),
        fulfilled_credential_id: cred.id,
      }).eq("id", reqRow.id);

      return json({ ok: true });
    }

    if (action === "cancelRequest") {
      if (!body.requestId) return json({ error: "requestId required" }, 400);
      const { data: reqRow } = await admin.from("ticket_credential_requests")
        .select("ticket_id, fulfilled_at, cancelled_at").eq("id", body.requestId).maybeSingle();
      if (!reqRow) return json({ error: "Not found" }, 404);
      if (reqRow.fulfilled_at || reqRow.cancelled_at) return json({ error: "Já fechado" }, 400);
      const access = await canAccessTicket(reqRow.ticket_id);
      if (!access.ok) return json({ error: "Forbidden" }, 403);
      const { error } = await admin.from("ticket_credential_requests")
        .update({ cancelled_at: new Date().toISOString() }).eq("id", body.requestId);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    return json({ error: "Unknown action" }, 400);
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
