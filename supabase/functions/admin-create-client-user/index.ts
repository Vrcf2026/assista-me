import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  client_id: string;
  email: string;
  password: string;
  nome: string;
  is_client_admin?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization" }, 401);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) return json({ error: "Invalid token" }, 401);

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: roleRows } = await admin.from("user_roles")
      .select("role").eq("user_id", userData.user.id).eq("role", "admin");
    if (!roleRows || roleRows.length === 0) return json({ error: "Forbidden" }, 403);

    const body = (await req.json()) as Payload;
    if (!body.client_id || !body.email || !body.password || !body.nome) {
      return json({ error: "Faltam campos obrigatórios" }, 400);
    }
    if (body.password.length < 6) return json({ error: "Password mínima 6 caracteres" }, 400);

    // Verificar se cliente existe
    const { data: cli } = await admin.from("clients").select("id").eq("id", body.client_id).maybeSingle();
    if (!cli) return json({ error: "Cliente inexistente" }, 404);

    // Tentar criar utilizador (auto-confirmado)
    let newUserId: string | null = null;
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
      user_metadata: { nome: body.nome },
    });
    if (createErr) {
      // Se já existir, tentar reaproveitar
      const msg = createErr.message ?? "";
      if (msg.toLowerCase().includes("already") || msg.toLowerCase().includes("registered")) {
        // Procurar user existente
        const { data: list } = await admin.auth.admin.listUsers();
        const existing = list?.users.find((u) => u.email?.toLowerCase() === body.email.toLowerCase());
        if (!existing) return json({ error: createErr.message }, 400);
        newUserId = existing.id;
      } else {
        return json({ error: createErr.message }, 400);
      }
    } else {
      newUserId = created.user?.id ?? null;
    }
    if (!newUserId) return json({ error: "Não foi possível obter user_id" }, 500);

    // Garantir profile
    await admin.from("profiles").upsert(
      { user_id: newUserId, email: body.email, nome: body.nome },
      { onConflict: "user_id" }
    );

    // Garantir role 'client'
    await admin.from("user_roles").upsert(
      { user_id: newUserId, role: "client" },
      { onConflict: "user_id,role" }
    );

    // Associar ao cliente
    const { error: linkErr } = await admin.from("client_users").upsert(
      {
        client_id: body.client_id,
        user_id: newUserId,
        is_client_admin: body.is_client_admin ?? false,
      },
      { onConflict: "client_id,user_id" }
    );
    if (linkErr) return json({ error: linkErr.message }, 400);

    return json({ ok: true, user_id: newUserId });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Unknown error" }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
