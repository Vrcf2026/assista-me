import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface CreateClientPayload {
  nome: string;
  nif?: string | null;
  tipo_cliente?: "particular" | "empresa";
  tipo_contrato: "avenca" | "pontual" | "nenhum";
  tarifa_hora: number;
  horas_pacote?: number | null;
  horas_pacote_anual?: number | null;
  contrato_inicio?: string | null;
  contrato_fim?: string | null;
  dias_fecho_automatico?: number | null;
  morada?: string | null;
  email_geral?: string | null;
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

    const body = (await req.json()) as CreateClientPayload;
    if (!body.nome) return json({ error: "Nome obrigatório" }, 400);

    const isAvenca = body.tipo_contrato === "avenca";
    const { data: client, error: clientErr } = await admin.from("clients").insert({
      nome: body.nome,
      nif: body.nif ?? null,
      tipo_cliente: body.tipo_cliente ?? "empresa",
      tipo_contrato: body.tipo_contrato,
      tarifa_hora: body.tarifa_hora,
      horas_pacote_anual: isAvenca && body.horas_pacote_anual ? body.horas_pacote_anual : null,
      contrato_inicio: isAvenca ? body.contrato_inicio ?? null : null,
      contrato_fim: isAvenca ? body.contrato_fim ?? null : null,
      dias_fecho_automatico: body.dias_fecho_automatico ?? null,
      morada: body.morada ?? null,
      email_geral: body.email_geral ?? null,
    }).select("id").single();

    if (clientErr) return json({ error: clientErr.message }, 400);

    return json({ ok: true, client_id: client.id });
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
