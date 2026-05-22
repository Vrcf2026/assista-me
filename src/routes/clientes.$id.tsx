import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  formatTicketNumber, formatDateTime, formatCurrency, formatHours,
  ESTADO_LABELS, MOTIVO_FECHO_LABELS, calcValor,
} from "@/lib/format";
import { StatusBadge } from "@/components/StatusBadge";
import { HoursPackageWidget } from "@/components/HoursPackageWidget";
import { ClientUsersPanel } from "@/components/ClientUsersPanel";
import { ArrowLeft, Plus } from "lucide-react";

export const Route = createFileRoute("/clientes/$id")({
  component: ClienteDetailPage,
});

function ClienteDetailPage() {
  const { id } = Route.useParams();
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate]);

  if (loading || role !== "admin") return null;

  return <AppLayout><ClienteDetail id={id} /></AppLayout>;
}

interface ClientFull {
  id: string;
  nome: string;
  nif: string | null;
  tipo_cliente: "particular" | "empresa";
  tipo_contrato: "avenca" | "pontual" | "nenhum";
  tarifa_hora: number;
  horas_pacote: number | null;
  horas_pacote_anual: number | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  dias_fecho_automatico: number | null;
  morada: string | null;
  email_geral: string | null;
}

interface TrabalhoRow {
  id: string;
  titulo: string;
  estado: string;
  prioridade: string;
  minutos: number;
  data_agendada: string | null;
  created_at: string;
}

interface OrcamentoRow {
  key: string;
  origem: "principal" | "ticket";
  ref: string; // ex: ORC-0001  ou  T#0012 v2
  link: { kind: "orcamento"; id: string } | { kind: "ticket"; id: string };
  estado: string;
  validade: string | null;
  created_at: string;
}

interface CampanhaRow {
  id: string;
  campanha_id: string;
  estado: string;
  minutos: number;
  data_agendada: string | null;
  concluido_em: string | null;
  campanha_titulo: string | null;
}

interface TicketRow {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  tipo_intervencao: string;
  tempo_gasto_minutos: number;
  motivo_fecho: string | null;
  solucao_aplicada: string | null;
  created_at: string;
}

function ClienteDetail({ id }: { id: string }) {
  const [client, setClient] = useState<ClientFull | null>(null);
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [trabalhos, setTrabalhos] = useState<TrabalhoRow[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([]);
  const [campanhas, setCampanhas] = useState<CampanhaRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mes, setMes] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  });

  useEffect(() => {
    void (async () => {
      setLoading(true);
      const [cRes, tRes, trRes, orcRes, cpRes] = await Promise.all([
        supabase.from("clients").select("*").eq("id", id).maybeSingle(),
        supabase
          .from("tickets")
          .select("id, numero, titulo, estado, tipo_intervencao, tempo_gasto_minutos, motivo_fecho, solucao_aplicada, created_at")
          .eq("client_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("trabalhos")
          .select("id, titulo, estado, prioridade, minutos, data_agendada, created_at")
          .eq("client_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("orcamentos")
          .select("id, numero, estado, validade, created_at")
          .eq("client_id", id)
          .order("created_at", { ascending: false }),
        supabase
          .from("campanha_clientes")
          .select("id, campanha_id, estado, minutos, data_agendada, concluido_em, campanhas(titulo)")
          .eq("client_id", id)
          .order("created_at", { ascending: false }),
      ]);
      setClient(cRes.data as ClientFull | null);
      setTickets((tRes.data ?? []) as TicketRow[]);
      setTrabalhos((trRes.data ?? []) as TrabalhoRow[]);
      setOrcamentos((orcRes.data ?? []) as OrcamentoRow[]);
      setCampanhas(((cpRes.data ?? []) as Array<{
        id: string; campanha_id: string; estado: string; minutos: number;
        data_agendada: string | null; concluido_em: string | null;
        campanhas: { titulo: string } | null;
      }>).map((r) => ({
        id: r.id,
        campanha_id: r.campanha_id,
        estado: r.estado,
        minutos: r.minutos,
        data_agendada: r.data_agendada,
        concluido_em: r.concluido_em,
        campanha_titulo: r.campanhas?.titulo ?? null,
      })));
      setLoading(false);
    })();
  }, [id]);

  if (loading) return <div className="text-sm text-muted-foreground">A carregar…</div>;
  if (!client) return <div className="text-sm">Cliente não encontrado</div>;

  const totalMin = tickets.reduce((s, t) => s + t.tempo_gasto_minutos, 0);
  const totalValor = calcValor(totalMin, Number(client.tarifa_hora));
  const pacoteAnual = Number(client.horas_pacote_anual ?? 0);

  // Filter for selected month
  const [year, monthStr] = mes.split("-");
  const monthTickets = tickets.filter((t) => {
    const d = new Date(t.created_at);
    return d.getFullYear() === Number(year) && d.getMonth() + 1 === Number(monthStr);
  });
  const monthMin = monthTickets.reduce((s, t) => s + t.tempo_gasto_minutos, 0);

  const printReport = () => window.print();

  const contratoLabel =
    client.tipo_contrato === "avenca" ? "Avença anual"
    : client.tipo_contrato === "pontual" ? "Pontual"
    : "Sem contrato";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between print:hidden">
        <Button asChild variant="ghost" size="sm">
          <Link to="/clientes"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/tickets/novo" search={{ clientId: client.id }}>
            <Plus className="h-4 w-4 mr-1" /> Novo ticket para este cliente
          </Link>
        </Button>
      </div>

      <Card className="p-6">
        <h1 className="text-2xl font-semibold">{client.nome}</h1>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mt-4 text-sm">
          <div><div className="text-muted-foreground text-xs">Tipo</div><div>{client.tipo_cliente === "particular" ? "Particular" : "Empresa"}</div></div>
          <div><div className="text-muted-foreground text-xs">NIF</div><div>{client.nif ?? "—"}</div></div>
          <div><div className="text-muted-foreground text-xs">Email geral</div><div>{client.email_geral ?? "—"}</div></div>
          <div className="sm:col-span-2 lg:col-span-2"><div className="text-muted-foreground text-xs">Morada</div><div>{client.morada ?? "—"}</div></div>
          <div><div className="text-muted-foreground text-xs">Contrato</div><div>{contratoLabel}</div></div>
          <div><div className="text-muted-foreground text-xs">Tarifa</div><div className="font-mono">{formatCurrency(Number(client.tarifa_hora))}/h</div></div>
          {client.tipo_contrato === "avenca" ? (
            <>
              <div><div className="text-muted-foreground text-xs">Pacote anual</div><div>{pacoteAnual > 0 ? `${pacoteAnual}h` : "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Início contrato</div><div>{client.contrato_inicio ? new Date(client.contrato_inicio).toLocaleDateString("pt-PT") : "—"}</div></div>
              <div><div className="text-muted-foreground text-xs">Fim contrato</div><div>{client.contrato_fim ? new Date(client.contrato_fim).toLocaleDateString("pt-PT") : "—"}</div></div>
            </>
          ) : null}
          <div><div className="text-muted-foreground text-xs">Total horas usadas</div><div>{formatHours(totalMin)}</div></div>
          <div><div className="text-muted-foreground text-xs">Total faturável</div><div className="font-mono font-semibold">{formatCurrency(totalValor)}</div></div>
          <div><div className="text-muted-foreground text-xs">Fecho automático</div><div>{client.dias_fecho_automatico ? `${client.dias_fecho_automatico} dias` : "Desativado"}</div></div>
        </div>
      </Card>

      {client.tipo_contrato === "pontual" ? (
        <HoursPackageWidget
          clientId={client.id}
          tipoContrato="pontual"
          horasPacoteAnual={0}
          contratoInicio={null}
          contratoFim={null}
        />
      ) : client.tipo_contrato === "avenca" && pacoteAnual > 0 ? (
        <HoursPackageWidget
          clientId={client.id}
          tipoContrato="avenca"
          horasPacoteAnual={pacoteAnual}
          contratoInicio={client.contrato_inicio}
          contratoFim={client.contrato_fim}
        />
      ) : null}

      <ClientUsersPanel clientId={client.id} />

      <Card className="p-6">
        <div className="flex items-end justify-between gap-4 flex-wrap mb-4 print:hidden">
          <div>
            <h2 className="text-lg font-semibold">Relatório mensal</h2>
            <p className="text-sm text-muted-foreground">Selecione o mês para gerar o relatório.</p>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="month"
              value={mes}
              onChange={(e) => setMes(e.target.value)}
              className="border rounded px-3 py-1.5 text-sm bg-background"
            />
            <Button onClick={printReport} variant="outline" size="sm">Imprimir / PDF</Button>
          </div>
        </div>

        <div className="border rounded-md p-4 bg-muted/20 print:bg-white">
          <h3 className="font-semibold mb-2">Resumo executivo — {mes}</h3>
          <div className="grid sm:grid-cols-3 gap-4 text-sm">
            <div><div className="text-muted-foreground text-xs">Total tickets</div><div className="text-xl font-semibold">{monthTickets.length}</div></div>
            <div><div className="text-muted-foreground text-xs">Total horas</div><div className="text-xl font-semibold">{formatHours(monthMin)}</div></div>
          </div>

          <h4 className="font-semibold mt-6 mb-2 text-sm">Detalhe por ticket</h4>
          {monthTickets.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem tickets neste mês.</p>
          ) : (
            <table className="w-full text-xs border-collapse">
              <thead className="text-left">
                <tr className="border-b">
                  <th className="py-1.5 pr-2">Nº</th>
                  <th className="py-1.5 pr-2">Título</th>
                  <th className="py-1.5 pr-2">Tipo</th>
                  <th className="py-1.5 pr-2 text-right">Tempo</th>
                  <th className="py-1.5 pr-2">Estado</th>
                  <th className="py-1.5 pr-2">Motivo</th>
                  <th className="py-1.5">Solução</th>
                </tr>
              </thead>
              <tbody>
                {monthTickets.map((t) => (
                  <tr key={t.id} className="border-b align-top">
                    <td className="py-1.5 pr-2 font-mono">{formatTicketNumber(t.numero)}</td>
                    <td className="py-1.5 pr-2">{t.titulo}</td>
                    <td className="py-1.5 pr-2">{t.tipo_intervencao}</td>
                    <td className="py-1.5 pr-2 text-right">{t.tempo_gasto_minutos}min</td>
                    <td className="py-1.5 pr-2">{ESTADO_LABELS[t.estado]}</td>
                    <td className="py-1.5 pr-2">{t.motivo_fecho ? MOTIVO_FECHO_LABELS[t.motivo_fecho] : "—"}</td>
                    <td className="py-1.5">{t.solucao_aplicada ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </Card>

      <Card className="p-6 print:hidden">
        <h2 className="text-lg font-semibold mb-3">Histórico completo de tickets</h2>
        {tickets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem tickets.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Nº</th>
                  <th className="px-3 py-2 font-medium">Título</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Tempo</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                </tr>
              </thead>
              <tbody>
                {tickets.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-secondary/50">
                    <td className="px-3 py-1.5">
                      <Link to="/tickets/$id" params={{ id: t.id }} className="font-mono text-primary hover:underline">
                        {formatTicketNumber(t.numero)}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">{t.titulo}</td>
                    <td className="px-3 py-1.5"><StatusBadge estado={t.estado} /></td>
                    <td className="px-3 py-1.5 text-right">{t.tempo_gasto_minutos}min</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatDateTime(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6 print:hidden">
        <h2 className="text-lg font-semibold mb-3">Histórico de trabalhos</h2>
        {trabalhos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem trabalhos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Título</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Prioridade</th>
                  <th className="px-3 py-2 font-medium text-right">Tempo</th>
                  <th className="px-3 py-2 font-medium">Agendado</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                </tr>
              </thead>
              <tbody>
                {trabalhos.map((t) => (
                  <tr key={t.id} className="border-t hover:bg-secondary/50">
                    <td className="px-3 py-1.5">{t.titulo}</td>
                    <td className="px-3 py-1.5"><span className="text-xs px-2 py-0.5 rounded border bg-secondary">{t.estado}</span></td>
                    <td className="px-3 py-1.5 text-xs">{t.prioridade}</td>
                    <td className="px-3 py-1.5 text-right">{t.minutos}min</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{t.data_agendada ? new Date(t.data_agendada).toLocaleDateString("pt-PT") : "—"}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatDateTime(t.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6 print:hidden">
        <h2 className="text-lg font-semibold mb-3">Histórico de orçamentos</h2>
        {orcamentos.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem orçamentos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Nº</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium">Validade</th>
                  <th className="px-3 py-2 font-medium">Criado</th>
                </tr>
              </thead>
              <tbody>
                {orcamentos.map((o) => (
                  <tr key={o.id} className="border-t hover:bg-secondary/50">
                    <td className="px-3 py-1.5">
                      <Link to="/orcamentos/$id" params={{ id: o.id }} className="font-mono text-primary hover:underline">
                        ORC-{String(o.numero).padStart(4, "0")}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5"><span className="text-xs px-2 py-0.5 rounded border bg-secondary">{o.estado}</span></td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{o.validade ? new Date(o.validade).toLocaleDateString("pt-PT") : "—"}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{formatDateTime(o.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="p-6 print:hidden">
        <h2 className="text-lg font-semibold mb-3">Histórico de campanhas</h2>
        {campanhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem campanhas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-3 py-2 font-medium">Campanha</th>
                  <th className="px-3 py-2 font-medium">Estado</th>
                  <th className="px-3 py-2 font-medium text-right">Tempo</th>
                  <th className="px-3 py-2 font-medium">Agendada</th>
                  <th className="px-3 py-2 font-medium">Concluída</th>
                </tr>
              </thead>
              <tbody>
                {campanhas.map((c) => (
                  <tr key={c.id} className="border-t hover:bg-secondary/50">
                    <td className="px-3 py-1.5">{c.campanha_titulo ?? "—"}</td>
                    <td className="px-3 py-1.5"><span className="text-xs px-2 py-0.5 rounded border bg-secondary">{c.estado}</span></td>
                    <td className="px-3 py-1.5 text-right">{c.minutos}min</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.data_agendada ? new Date(c.data_agendada).toLocaleDateString("pt-PT") : "—"}</td>
                    <td className="px-3 py-1.5 text-xs text-muted-foreground">{c.concluido_em ? formatDateTime(c.concluido_em) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
