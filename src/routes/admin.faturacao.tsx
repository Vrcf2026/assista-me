import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCurrency, formatHours, formatDate, calcValor } from "@/lib/format";
import { TIPO_INTERVENCAO_LABELS } from "@/lib/billing";

export const Route = createFileRoute("/admin/faturacao")({
  component: FaturacaoPage,
});

interface Entry {
  id: string;
  ticket_id: string;
  user_id: string;
  minutos: number;
  descricao: string | null;
  data_trabalho: string;
  tipo_intervencao: string;
  estado_faturacao: string;
  ticket?: { numero: number; titulo: string; client_id: string };
}

interface ClientInfo {
  id: string;
  nome: string;
  tarifa_hora: number;
}

function FaturacaoPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><Faturacao /></AppLayout>
    </RequireRole>
  );
}

function Faturacao() {
  const [paraFaturar, setParaFaturar] = useState<Entry[]>([]);
  const [faturados, setFaturados] = useState<Entry[]>([]);
  const [clients, setClients] = useState<Record<string, ClientInfo>>({});
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [expandedHist, setExpandedHist] = useState<Record<string, boolean>>({});

  const load = async () => {
    setLoading(true);
    const { data: rows } = await supabase
      .from("time_entries")
      .select("*, ticket:tickets(numero, titulo, client_id)")
      .eq("nao_contabilizar", false)
      .in("estado_faturacao", ["para_faturar", "faturado"])
      .order("data_trabalho", { ascending: false });

    const all = (rows ?? []) as Entry[];
    setParaFaturar(all.filter((e) => e.estado_faturacao === "para_faturar"));
    setFaturados(all.filter((e) => e.estado_faturacao === "faturado"));

    const clientIds = [...new Set(all.map((e) => e.ticket?.client_id).filter(Boolean) as string[])];
    if (clientIds.length > 0) {
      const { data: cs } = await supabase.from("clients").select("id, nome, tarifa_hora").in("id", clientIds);
      const map: Record<string, ClientInfo> = {};
      (cs ?? []).forEach((c) => { map[c.id] = c as ClientInfo; });
      setClients(map);
    }
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  const groupByClient = (entries: Entry[]) => {
    const groups: Record<string, Entry[]> = {};
    entries.forEach((e) => {
      const cid = e.ticket?.client_id ?? "unknown";
      (groups[cid] ??= []).push(e);
    });
    return groups;
  };

  const marcarFaturado = async (clientId: string) => {
    const ids = paraFaturar.filter((e) => e.ticket?.client_id === clientId).map((e) => e.id);
    if (ids.length === 0) return;
    if (!confirm(`Marcar ${ids.length} registos como faturados?`)) return;
    const { error } = await supabase.from("time_entries").update({ estado_faturacao: "faturado" }).in("id", ids);
    if (error) return toast.error(error.message);
    toast.success("Marcado como faturado");
    await load();
  };

  if (loading) return <div className="text-sm text-muted-foreground">A carregar…</div>;

  const groupsPara = groupByClient(paraFaturar);
  const groupsFat = groupByClient(faturados);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Faturação</h1>
        <p className="text-sm text-muted-foreground">Gestão de horas a faturar e histórico.</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Para faturar</h2>
        {Object.keys(groupsPara).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem registos pendentes de faturação.</p>
        ) : (
          <div className="space-y-3">
            {Object.entries(groupsPara).map(([cid, entries]) => {
              const client = clients[cid];
              const totalMin = entries.reduce((s, e) => s + e.minutos, 0);
              const tarifa = Number(client?.tarifa_hora ?? 0);
              const valor = calcValor(totalMin, tarifa);
              const isOpen = expanded[cid];
              return (
                <div key={cid} className="border rounded-md">
                  <div className="flex items-center justify-between p-3 bg-muted/30">
                    <button onClick={() => setExpanded({ ...expanded, [cid]: !isOpen })} className="flex items-center gap-2 flex-1 text-left">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">{client?.nome ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">({entries.length} registos)</span>
                    </button>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-mono">{formatHours(totalMin)}</span>
                      <span className="font-mono text-muted-foreground">{formatCurrency(tarifa)}/h</span>
                      <span className="font-mono font-semibold">{formatCurrency(valor)}</span>
                      <Button size="sm" onClick={() => void marcarFaturado(cid)}>Marcar como faturado</Button>
                    </div>
                  </div>
                  {isOpen && (
                    <table className="w-full text-xs">
                      <thead className="bg-muted/10 text-left">
                        <tr>
                          <th className="px-3 py-1.5">Data</th>
                          <th className="px-3 py-1.5">Tipo</th>
                          <th className="px-3 py-1.5">Ticket</th>
                          <th className="px-3 py-1.5">Descrição</th>
                          <th className="px-3 py-1.5 text-right">Min</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id} className="border-t">
                            <td className="px-3 py-1.5 font-mono">{formatDate(e.data_trabalho)}</td>
                            <td className="px-3 py-1.5">{TIPO_INTERVENCAO_LABELS[e.tipo_intervencao] ?? e.tipo_intervencao}</td>
                            <td className="px-3 py-1.5">#{e.ticket?.numero} {e.ticket?.titulo}</td>
                            <td className="px-3 py-1.5">{e.descricao ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{e.minutos}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-6">
        <h2 className="text-lg font-semibold mb-4">Histórico faturado</h2>
        {Object.keys(groupsFat).length === 0 ? (
          <p className="text-sm text-muted-foreground">Sem histórico.</p>
        ) : (
          <div className="space-y-2">
            {Object.entries(groupsFat).map(([cid, entries]) => {
              const client = clients[cid];
              const totalMin = entries.reduce((s, e) => s + e.minutos, 0);
              const tarifa = Number(client?.tarifa_hora ?? 0);
              const valor = calcValor(totalMin, tarifa);
              const isOpen = expandedHist[cid];
              return (
                <div key={cid} className="border rounded-md">
                  <button onClick={() => setExpandedHist({ ...expandedHist, [cid]: !isOpen })} className="w-full flex items-center justify-between p-3 hover:bg-muted/20">
                    <div className="flex items-center gap-2">
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      <span className="font-semibold">{client?.nome ?? "—"}</span>
                      <span className="text-xs text-muted-foreground">({entries.length} registos)</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-mono">{formatHours(totalMin)}</span>
                      <span className="font-mono font-semibold">{formatCurrency(valor)}</span>
                    </div>
                  </button>
                  {isOpen && (
                    <table className="w-full text-xs border-t">
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id} className="border-t">
                            <td className="px-3 py-1.5 font-mono">{formatDate(e.data_trabalho)}</td>
                            <td className="px-3 py-1.5">{TIPO_INTERVENCAO_LABELS[e.tipo_intervencao] ?? e.tipo_intervencao}</td>
                            <td className="px-3 py-1.5">#{e.ticket?.numero} {e.ticket?.titulo}</td>
                            <td className="px-3 py-1.5">{e.descricao ?? "—"}</td>
                            <td className="px-3 py-1.5 text-right font-mono">{e.minutos}min</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
