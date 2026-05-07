import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatusBadge, PriorityBadge, TipoBadge } from "@/components/StatusBadge";
import {
  formatTicketNumber,
  formatDateTime,
  formatCurrency,
  calcValor,
} from "@/lib/format";
import { toast } from "sonner";

interface Row {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  prioridade: string;
  tipo_intervencao: string;
  tempo_gasto_minutos: number;
  created_at: string;
  client: { id: string; nome: string; tarifa_hora: number } | null;
}

export function AdminTickets() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [estadoF, setEstadoF] = useState<string>("all");
  const [prioF, setPrioF] = useState<string>("all");
  const [tipoF, setTipoF] = useState<string>("all");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("tickets")
      .select(
        "id, numero, titulo, estado, prioridade, tipo_intervencao, tempo_gasto_minutos, created_at, client:clients(id, nome, tarifa_hora)",
      )
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data ?? []) as unknown as Row[]);
    setLoading(false);
  };

  const filtered = rows.filter((r) => {
    if (estadoF !== "all" && r.estado !== estadoF) return false;
    if (prioF !== "all" && r.prioridade !== prioF) return false;
    if (tipoF !== "all" && r.tipo_intervencao !== tipoF) return false;
    if (search) {
      const s = search.toLowerCase();
      if (
        !r.titulo.toLowerCase().includes(s) &&
        !String(r.numero).includes(s) &&
        !(r.client?.nome ?? "").toLowerCase().includes(s)
      )
        return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Tickets</h1>
          <p className="text-sm text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "ticket" : "tickets"}
          </p>
        </div>
      </div>

      <Card className="p-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Input
          placeholder="Procurar nº, título ou cliente…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select value={estadoF} onValueChange={setEstadoF}>
          <SelectTrigger><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os estados</SelectItem>
            <SelectItem value="aberto">Aberto</SelectItem>
            <SelectItem value="em_progresso">Em Progresso</SelectItem>
            <SelectItem value="aguarda_cliente">Aguarda Cliente</SelectItem>
            <SelectItem value="fechado">Fechado</SelectItem>
          </SelectContent>
        </Select>
        <Select value={prioF} onValueChange={setPrioF}>
          <SelectTrigger><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as prioridades</SelectItem>
            <SelectItem value="baixa">Baixa</SelectItem>
            <SelectItem value="media">Média</SelectItem>
            <SelectItem value="alta">Alta</SelectItem>
          </SelectContent>
        </Select>
        <Select value={tipoF} onValueChange={setTipoF}>
          <SelectTrigger><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os tipos</SelectItem>
            <SelectItem value="remota">Remota</SelectItem>
            <SelectItem value="presencial">Presencial</SelectItem>
            <SelectItem value="preventiva">Preventiva</SelectItem>
            <SelectItem value="critica">Crítica</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">A carregar…</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">
            Sem tickets.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Nº</th>
                  <th className="px-4 py-2 font-medium">Título</th>
                  <th className="px-4 py-2 font-medium">Cliente</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Prioridade</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium text-right">Valor</th>
                  <th className="px-4 py-2 font-medium">Criado</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-secondary/50">
                    <td className="px-4 py-2">
                      <Link to="/tickets/$id" params={{ id: r.id }} className="font-mono font-semibold text-primary hover:underline">
                        {formatTicketNumber(r.numero)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link to="/tickets/$id" params={{ id: r.id }} className="hover:underline">
                        {r.titulo}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{r.client?.nome ?? "—"}</td>
                    <td className="px-4 py-2"><StatusBadge estado={r.estado} /></td>
                    <td className="px-4 py-2"><PriorityBadge prioridade={r.prioridade} /></td>
                    <td className="px-4 py-2"><TipoBadge tipo={r.tipo_intervencao} /></td>
                    <td className="px-4 py-2 text-right font-mono text-xs">
                      {r.client
                        ? formatCurrency(calcValor(r.tempo_gasto_minutos, Number(r.client.tarifa_hora)))
                        : "—"}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {formatDateTime(r.created_at)}
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
