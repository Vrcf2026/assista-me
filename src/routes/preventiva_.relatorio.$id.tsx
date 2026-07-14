import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { ArrowLeft, FileDown } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { useSignedUrl } from "@/lib/storage";

export const Route = createFileRoute("/preventiva_/relatorio/$id")({
  component: Page,
});

interface Agendamento {
  id: string;
  proxima_data: string;
  ultima_data: string | null;
  client_id: string;
  template_id: string;
  clients: { nome: string } | null;
  preventiva_templates: { nome: string; periodicidade: string } | null;
}
interface Tarefa { descricao: string; }
interface Execucao { id: string; data_execucao: string; minutos: number; estado: string; tecnico_id: string | null; }
interface ChecklistRow {
  id: string;
  execucao_id: string;
  descricao: string;
  concluida: boolean;
  minutos: number | null;
  observacao: string | null;
  foto_url: string | null;
  concluida_em: string | null;
}

function Page() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [ag, setAg] = useState<Agendamento | null>(null);
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [execs, setExecs] = useState<Execucao[]>([]);
  const [checklist, setChecklist] = useState<ChecklistRow[]>([]);

  const load = async () => {
    const { data: a, error } = await supabase
      .from("preventiva_agendamentos")
      .select("id, proxima_data, ultima_data, client_id, template_id, clients(nome), preventiva_templates(nome, periodicidade)")
      .eq("id", id).single();
    if (error || !a) { toast.error(error?.message ?? "Não encontrado"); return; }
    const ag = a as unknown as Agendamento;
    setAg(ag);

    // tarefas: custom se existirem, senão template
    const { data: custom } = await supabase
      .from("preventiva_agendamento_tarefas")
      .select("descricao, ordem")
      .eq("agendamento_id", id)
      .eq("ativo", true)
      .order("ordem");
    if (custom && custom.length > 0) {
      setTarefas(custom as Tarefa[]);
    } else {
      const { data: tpl } = await supabase
        .from("preventiva_tarefas")
        .select("descricao, ordem")
        .eq("template_id", ag.template_id)
        .order("ordem");
      setTarefas((tpl ?? []) as Tarefa[]);
    }

    const { data: ex } = await supabase
      .from("preventiva_execucoes")
      .select("id, data_execucao, minutos, estado, tecnico_id")
      .eq("agendamento_id", id)
      .order("data_execucao", { ascending: false })
      .limit(12);
    const exList = (ex ?? []) as Execucao[];
    setExecs(exList);

    if (exList.length > 0) {
      const { data: ck } = await supabase
        .from("preventiva_checklist")
        .select("id, execucao_id, descricao, concluida, minutos, observacao, foto_url, concluida_em")
        .in("execucao_id", exList.map(e => e.id));
      setChecklist((ck ?? []) as ChecklistRow[]);
    }
  };
  useEffect(() => { void load(); }, [id]);

  const stats = useMemo(() => {
    const total = execs.length;
    const concluidas = execs.filter(e => e.estado === "concluida");
    const tempoMedio = concluidas.length === 0 ? 0 : Math.round(concluidas.reduce((s, e) => s + (e.minutos || 0), 0) / concluidas.length);
    let pctTotal = 0;
    if (concluidas.length > 0) {
      const pcts = concluidas.map(e => {
        const items = checklist.filter(c => c.execucao_id === e.id);
        if (items.length === 0) return 0;
        return (items.filter(i => i.concluida).length / items.length) * 100;
      });
      pctTotal = Math.round(pcts.reduce((s, p) => s + p, 0) / pcts.length);
    }
    return { total, tempoMedio, pctTotal };
  }, [execs, checklist]);

  const exportPdf = () => {
    if (!ag) return;
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text("Relatório de Manutenção Preventiva", 14, 18);
    doc.setFontSize(10);
    doc.text(`Cliente: ${ag.clients?.nome ?? "—"}`, 14, 28);
    doc.text(`Template: ${ag.preventiva_templates?.nome ?? "—"} (${ag.preventiva_templates?.periodicidade ?? ""})`, 14, 34);
    doc.text(`Período: últimas ${execs.length} execuções`, 14, 40);

    autoTable(doc, {
      startY: 48,
      head: [["Data", "Tarefas concluídas", "Tempo total", "Estado"]],
      body: execs.map(e => {
        const items = checklist.filter(c => c.execucao_id === e.id);
        const done = items.filter(i => i.concluida).length;
        return [
          new Date(e.data_execucao).toLocaleDateString("pt-PT"),
          `${done}/${items.length}`,
          `${e.minutos || 0} min`,
          e.estado,
        ];
      }),
      styles: { fontSize: 9 },
    });

    let y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;

    for (const t of tarefas) {
      const hist = historicoPorTarefa(t.descricao);
      if (hist.length === 0) continue;
      if (y > 250) { doc.addPage(); y = 20; }
      doc.setFontSize(11);
      doc.text(t.descricao, 14, y);
      y += 4;
      autoTable(doc, {
        startY: y,
        head: [["Data", "Concluída", "Min", "Observação"]],
        body: hist.map(h => [
          new Date(h.data_execucao).toLocaleDateString("pt-PT"),
          h.concluida ? "Sim" : "Não",
          h.minutos != null ? String(h.minutos) : "—",
          h.observacao ?? "—",
        ]),
        styles: { fontSize: 8 },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
    }

    const pageCount = doc.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(8);
      doc.setTextColor(150);
      doc.text("Documento confidencial — VRCF", w / 2, doc.internal.pageSize.getHeight() - 8, { align: "center" });
    }

    doc.save(`relatorio-${ag.clients?.nome ?? "cliente"}-${new Date().toISOString().slice(0,10)}.pdf`);
  };

  const historicoPorTarefa = (descricao: string) => {
    return checklist
      .filter(c => c.descricao === descricao)
      .map(c => {
        const e = execs.find(x => x.id === c.execucao_id);
        return { ...c, data_execucao: e?.data_execucao ?? "" };
      })
      .filter(x => x.data_execucao)
      .sort((a, b) => b.data_execucao.localeCompare(a.data_execucao));
  };

  if (!ag) return null;

  return (
    <div className="max-w-5xl mx-auto space-y-4 print:space-y-2">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/preventiva" })}>
          <ArrowLeft className="h-4 w-4 mr-1" />Voltar
        </Button>
        <Button onClick={exportPdf}>
          <FileDown className="h-4 w-4 mr-1" />Exportar PDF
        </Button>
      </div>

      <Card className="p-4">
        <h1 className="text-xl font-semibold">{ag.clients?.nome}</h1>
        <div className="text-sm text-muted-foreground mt-1">
          {ag.preventiva_templates?.nome} · <span className="capitalize">{ag.preventiva_templates?.periodicidade}</span>
        </div>
        <div className="text-xs text-muted-foreground mt-1">
          Próxima manutenção: {new Date(ag.proxima_data).toLocaleDateString("pt-PT")}
          {ag.ultima_data && <> · Última: {new Date(ag.ultima_data).toLocaleDateString("pt-PT")}</>}
        </div>
      </Card>

      <div className="grid grid-cols-3 gap-3">
        <Card className="p-4"><div className="text-xs text-muted-foreground">Execuções</div><div className="text-2xl font-semibold">{stats.total}</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Tempo médio</div><div className="text-2xl font-semibold">{stats.tempoMedio} min</div></Card>
        <Card className="p-4"><div className="text-xs text-muted-foreground">Conclusão média</div><div className="text-2xl font-semibold">{stats.pctTotal}%</div></Card>
      </div>

      <Card className="p-4 space-y-4">
        <h2 className="font-semibold">Histórico por tarefa</h2>
        {tarefas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem tarefas configuradas.</p>
        ) : tarefas.map(t => {
          const hist = historicoPorTarefa(t.descricao);
          return (
            <div key={t.descricao} className="space-y-2 border-t pt-3">
              <h3 className="text-sm font-medium">{t.descricao}</h3>
              {hist.length === 0 ? (
                <p className="text-xs text-muted-foreground">Sem execuções registadas.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-xs text-muted-foreground">
                      <tr>
                        <th className="py-1 pr-3">Data</th>
                        <th className="py-1 pr-3">Concluída</th>
                        <th className="py-1 pr-3">Min</th>
                        <th className="py-1 pr-3">Observação</th>
                        <th className="py-1 pr-3">Foto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {hist.map(h => (
                        <tr key={h.id} className="border-t">
                          <td className="py-1 pr-3">{new Date(h.data_execucao).toLocaleDateString("pt-PT")}</td>
                          <td className="py-1 pr-3">{h.concluida ? <Badge className="bg-emerald-600 text-white">Sim</Badge> : <Badge variant="secondary">Não</Badge>}</td>
                          <td className="py-1 pr-3 tabular-nums">{h.minutos ?? "—"}</td>
                          <td className="py-1 pr-3">{h.observacao ?? "—"}</td>
                          <td className="py-1 pr-3">
                            {h.foto_url ? (
                              <FotoThumb path={h.foto_url} />
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
