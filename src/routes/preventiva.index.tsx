import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ShieldCheck, Play, FileText, Settings, CalendarClock } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/preventiva/")({
  component: PreventivaPage,
});

interface AgendamentoRow {
  id: string;
  proxima_data: string;
  ultima_data: string | null;
  ativo: boolean;
  client_id: string;
  template_id: string;
  clients: { nome: string } | null;
  preventiva_templates: { nome: string; periodicidade: string } | null;
}

function PreventivaPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate]);
  if (loading || role !== "admin") return null;
  return <AppLayout><Inner /></AppLayout>;
}

function Inner() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<AgendamentoRow[]>([]);
  const [stats, setStats] = useState({ mes: 0, concluidas: 0, semana: 0, atrasadas: 0 });
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("preventiva_agendamentos")
      .select("id, proxima_data, ultima_data, ativo, client_id, template_id, clients(nome), preventiva_templates(nome, periodicidade)")
      .eq("ativo", true)
      .order("proxima_data", { ascending: true });
    if (error) { toast.error(error.message); return; }
    const list = (data ?? []) as unknown as AgendamentoRow[];
    setRows(list);

    const today = new Date(); today.setHours(0,0,0,0);
    const in7 = new Date(today); in7.setDate(in7.getDate() + 7);
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth()+1, 1);

    const mesAgenda = list.filter(r => {
      const d = new Date(r.proxima_data);
      return d >= monthStart && d < monthEnd;
    }).length;

    const semana = list.filter(r => {
      const d = new Date(r.proxima_data);
      return d >= today && d <= in7;
    }).length;

    const atrasadas = list.filter(r => new Date(r.proxima_data) < today).length;

    const { count } = await supabase
      .from("preventiva_execucoes")
      .select("id", { count: "exact", head: true })
      .eq("estado", "concluida")
      .gte("data_execucao", monthStart.toISOString().slice(0,10))
      .lt("data_execucao", monthEnd.toISOString().slice(0,10));

    setStats({ mes: mesAgenda, concluidas: count ?? 0, semana, atrasadas });
  };

  useEffect(() => { void load(); }, []);

  const iniciar = async (a: AgendamentoRow) => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { data: exec, error } = await supabase
        .from("preventiva_execucoes")
        .insert({
          agendamento_id: a.id,
          client_id: a.client_id,
          template_id: a.template_id,
          tecnico_id: user?.id ?? null,
        })
        .select("id")
        .single();
      if (error || !exec) throw error;

      // Tarefas: usa agendamento_tarefas activas se existirem; fallback ao template
      const { data: agTarefas } = await supabase
        .from("preventiva_agendamento_tarefas")
        .select("descricao, ordem, tarefa_id, ativo")
        .eq("agendamento_id", a.id)
        .eq("ativo", true)
        .order("ordem");
      let items: { execucao_id: string; tarefa_id: string | null; descricao: string }[] = [];
      if (agTarefas && agTarefas.length > 0) {
        items = agTarefas.map(t => ({
          execucao_id: exec.id,
          tarefa_id: t.tarefa_id ?? null,
          descricao: t.descricao,
        }));
      } else {
        const { data: tarefas } = await supabase
          .from("preventiva_tarefas")
          .select("id, descricao, ordem")
          .eq("template_id", a.template_id)
          .order("ordem");
        items = (tarefas ?? []).map(t => ({
          execucao_id: exec.id,
          tarefa_id: t.id,
          descricao: t.descricao,
        }));
      }
      if (items.length > 0) {
        const { error: cErr } = await supabase.from("preventiva_checklist").insert(items);
        if (cErr) throw cErr;
      }

      navigate({ to: "/preventiva/execucao/$id", params: { id: exec.id } });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar");
    } finally {
      setBusy(false);
    }
  };

  const estadoBadge = (proxima: string) => {
    const d = new Date(proxima); d.setHours(0,0,0,0);
    const today = new Date(); today.setHours(0,0,0,0);
    const diff = (d.getTime() - today.getTime()) / 86400000;
    if (diff < 0) return <Badge variant="destructive">Atrasada</Badge>;
    if (diff <= 7) return <Badge className="bg-amber-500 text-white">Esta semana</Badge>;
    return <Badge className="bg-emerald-600 text-white">A tempo</Badge>;
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" /> Manutenção Preventiva
          </h1>
          <p className="text-sm text-muted-foreground">Planeamento e execução de manutenções periódicas.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild><Link to="/preventiva/templates"><Settings className="h-4 w-4 mr-1" />Templates</Link></Button>
          <Button asChild><Link to="/preventiva/agendamentos"><CalendarClock className="h-4 w-4 mr-1" />Agendamentos</Link></Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Agendadas este mês" value={stats.mes} />
        <Stat label="Concluídas este mês" value={stats.concluidas} tone="green" />
        <Stat label="Próximos 7 dias" value={stats.semana} tone="amber" />
        <Stat label="Atrasadas" value={stats.atrasadas} tone="red" />
      </div>

      <Card className="p-4">
        <h2 className="font-semibold mb-3">Próximas manutenções</h2>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem agendamentos activos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Periodicidade</th>
                  <th className="py-2 pr-3">Próxima</th>
                  <th className="py-2 pr-3">Última</th>
                  <th className="py-2 pr-3">Estado</th>
                  <th className="py-2 pr-3 text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0 hover:bg-secondary/30">
                    <td className="py-2 pr-3">{r.clients?.nome ?? "—"}</td>
                    <td className="py-2 pr-3">{r.preventiva_templates?.nome ?? "—"}</td>
                    <td className="py-2 pr-3 capitalize">{r.preventiva_templates?.periodicidade ?? "—"}</td>
                    <td className="py-2 pr-3">{formatDate(r.proxima_data)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.ultima_data ? formatDate(r.ultima_data) : "—"}</td>
                    <td className="py-2 pr-3">{estadoBadge(r.proxima_data)}</td>
                    <td className="py-2 pr-3 text-right">
                      <div className="flex gap-1 justify-end">
                        <Button size="sm" variant="outline" asChild>
                          <Link to="/preventiva/relatorio/$id" params={{ id: r.id }}>
                            <FileText className="h-3.5 w-3.5 mr-1" />Relatório
                          </Link>
                        </Button>
                        <Button size="sm" disabled={busy} onClick={() => void iniciar(r)}>
                          <Play className="h-3.5 w-3.5 mr-1" />Iniciar
                        </Button>
                      </div>
                    </td>
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

function Stat({ label, value, tone }: { label: string; value: number; tone?: "green"|"amber"|"red" }) {
  const cls = tone === "green" ? "text-emerald-600" : tone === "amber" ? "text-amber-600" : tone === "red" ? "text-destructive" : "text-foreground";
  return (
    <Card className="p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`text-3xl font-semibold mt-1 ${cls}`}>{value}</div>
    </Card>
  );
}
