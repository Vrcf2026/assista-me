import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { formatMinutes } from "@/lib/format";

export const Route = createFileRoute("/trabalhos")({
  component: Page,
});

const ESTADO_LABEL: Record<string, string> = {
  pendente: "Pendente",
  agendado: "Agendado",
  em_curso: "Em curso",
  concluido: "Concluído",
};
const PRIO_LABEL: Record<string, string> = { alta: "🔴 Alta", media: "🟡 Média", normal: "🟢 Normal" };
const PRIO_BADGE: Record<string, string> = {
  alta: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  media: "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
  normal: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
};

interface Trabalho {
  id: string;
  client_id: string | null;
  titulo: string;
  data_agendada: string | null;
  prioridade: string;
  estado: string;
  minutos: number;
  clients: { id: string; nome: string } | null;
}

function Page() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const navigate = useNavigate();
  const [rows, setRows] = useState<Trabalho[]>([]);
  const [busca, setBusca] = useState("");
  const [estados, setEstados] = useState<string[]>(["pendente", "agendado", "em_curso"]);
  const [prio, setPrio] = useState<string>("todas");
  const [openNovo, setOpenNovo] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("trabalhos")
      .select("id, client_id, titulo, data_agendada, prioridade, estado, minutos, clients(id, nome)")
      .order("data_agendada", { ascending: true, nullsFirst: false });
    if (error) return toast.error(error.message);
    setRows((data ?? []) as unknown as Trabalho[]);
  };
  useEffect(() => { void load(); }, []);

  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return rows.filter(r => {
      if (!estados.includes(r.estado)) return false;
      if (prio !== "todas" && r.prioridade !== prio) return false;
      if (q && !r.titulo.toLowerCase().includes(q) && !(r.clients?.nome ?? "").toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, busca, estados, prio]);

  const toggleEstado = (e: string) => {
    setEstados(prev => prev.includes(e) ? prev.filter(x => x !== e) : [...prev, e]);
  };

  const setEstadoInline = async (id: string, estado: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, estado } : r));
    const { error } = await supabase.from("trabalhos").update({ estado }).eq("id", id);
    if (error) { toast.error(error.message); void load(); }
  };

  const apagar = async (id: string) => {
    if (!confirm("Apagar este trabalho?")) return;
    const { error } = await supabase.from("trabalhos").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setRows(prev => prev.filter(r => r.id !== id));
    toast.success("Trabalho apagado");
  };

  const today = new Date(); today.setHours(0, 0, 0, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Trabalhos</h1>
          <p className="text-sm text-muted-foreground">Lista de trabalhos agendados internos</p>
        </div>
        <Button onClick={() => setOpenNovo(true)}><Plus className="h-4 w-4 mr-1" />Novo trabalho</Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px]">
            <Label className="text-xs">Pesquisar</Label>
            <Input placeholder="Título ou cliente…" value={busca} onChange={e => setBusca(e.target.value)} />
          </div>
          <div>
            <Label className="text-xs">Estado</Label>
            <div className="flex gap-1 flex-wrap">
              {(["pendente", "agendado", "em_curso", "concluido"] as const).map(e => (
                <button
                  key={e}
                  type="button"
                  onClick={() => toggleEstado(e)}
                  className={`px-2.5 py-1 text-xs rounded-md border transition ${estados.includes(e) ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary"}`}
                >
                  {ESTADO_LABEL[e]}
                </button>
              ))}
            </div>
          </div>
          <div>
            <Label className="text-xs">Prioridade</Label>
            <Select value={prio} onValueChange={setPrio}>
              <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todas">Todas</SelectItem>
                <SelectItem value="alta">🔴 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="normal">🟢 Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        {filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground p-8 text-center">Sem trabalhos.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead>Cliente</TableHead>
                <TableHead>Título</TableHead>
                <TableHead className="w-[110px]">Prioridade</TableHead>
                <TableHead className="w-[150px]">Estado</TableHead>
                <TableHead className="w-[100px]">Tempo</TableHead>
                <TableHead className="w-[140px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(r => {
                const data = r.data_agendada ? new Date(r.data_agendada) : null;
                const passada = data && data < today && r.estado !== "concluido";
                return (
                  <TableRow key={r.id}>
                    <TableCell className={passada ? "text-destructive font-medium" : ""}>
                      {data ? data.toLocaleDateString("pt-PT") : "—"}
                    </TableCell>
                    <TableCell className="text-sm truncate max-w-[180px]">{r.clients?.nome ?? "—"}</TableCell>
                    <TableCell>
                      <Link to="/trabalhos/$id" params={{ id: r.id }} className="text-sm hover:underline text-primary">
                        {r.titulo}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded text-xs ${PRIO_BADGE[r.prioridade]}`}>{PRIO_LABEL[r.prioridade]}</span>
                    </TableCell>
                    <TableCell>
                      <Select value={r.estado} onValueChange={v => void setEstadoInline(r.id, v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(["pendente", "agendado", "em_curso", "concluido"] as const).map(e => (
                            <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-xs tabular-nums">{r.minutos > 0 ? formatMinutes(r.minutos) : "—"}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button asChild size="sm" variant="outline">
                          <Link to="/trabalhos/$id" params={{ id: r.id }}>Abrir <ArrowRight className="h-3 w-3 ml-1" /></Link>
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => void apagar(r.id)}>
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <NovoTrabalhoSheet open={openNovo} onClose={() => setOpenNovo(false)} onCreated={(id) => { setOpenNovo(false); navigate({ to: "/trabalhos/$id", params: { id } }); }} />
    </div>
  );
}

function NovoTrabalhoSheet({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (id: string) => void }) {
  const [clients, setClients] = useState<{ id: string; nome: string }[]>([]);
  const [clientId, setClientId] = useState<string>("nenhum");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState("");
  const [prio, setPrio] = useState("normal");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitulo(""); setDescricao(""); setData(""); setPrio("normal"); setClientId("nenhum");
    void supabase.from("clients").select("id, nome").order("nome").then(({ data }) => setClients(data ?? []));
  }, [open]);

  const guardar = async () => {
    if (!titulo.trim()) return toast.error("Título é obrigatório");
    setBusy(true);
    const { data: u } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("trabalhos").insert({
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      client_id: clientId === "nenhum" ? null : clientId,
      data_agendada: data || null,
      prioridade: prio,
      estado: data ? "agendado" : "pendente",
      created_by: u.user?.id ?? null,
    }).select("id").single();
    setBusy(false);
    if (error || !row) return toast.error(error?.message ?? "Erro");
    toast.success("Trabalho criado");
    onCreated(row.id);
  };

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="space-y-4">
        <SheetHeader><SheetTitle>Novo trabalho</SheetTitle></SheetHeader>
        <div className="space-y-3">
          <div>
            <Label>Cliente</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="nenhum">— Sem cliente —</SelectItem>
                {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Título *</Label>
            <Input value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />
          </div>
          <div>
            <Label>Descrição</Label>
            <Textarea value={descricao} onChange={e => setDescricao(e.target.value)} rows={3} />
          </div>
          <div>
            <Label>Data agendada</Label>
            <Input type="date" value={data} onChange={e => setData(e.target.value)} />
          </div>
          <div>
            <Label>Prioridade</Label>
            <Select value={prio} onValueChange={setPrio}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="alta">🔴 Alta</SelectItem>
                <SelectItem value="media">🟡 Média</SelectItem>
                <SelectItem value="normal">🟢 Normal</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button className="w-full" onClick={() => void guardar()} disabled={busy}>Guardar</Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
