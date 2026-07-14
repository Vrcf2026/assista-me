import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { FileText, Download, AlertTriangle } from "lucide-react";
import {
  gerarRelatorioTicketCliente,
  gerarRelatorioTicketInterno,
  gerarRelatorioMensalCliente,
  gerarRelatorioMensalInterno,
  gerarArquivoCliente,
} from "@/lib/pdf";

export const Route = createFileRoute("/admin/relatorios")({
  component: RelatoriosPage,
});

function RelatoriosPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><Relatorios /></AppLayout>
    </RequireRole>
  );
}

function Relatorios() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Relatórios</h1>
        <p className="text-sm text-muted-foreground">Gerar PDFs de tickets, mensais e arquivos.</p>
      </div>
      <Tabs defaultValue="ticket">
        <TabsList>
          <TabsTrigger value="ticket">Por ticket</TabsTrigger>
          <TabsTrigger value="mensal">Mensal</TabsTrigger>
          <TabsTrigger value="arquivo">Arquivo</TabsTrigger>
        </TabsList>
        <TabsContent value="ticket"><TabTicket /></TabsContent>
        <TabsContent value="mensal"><TabMensal /></TabsContent>
        <TabsContent value="arquivo"><TabArquivo /></TabsContent>
      </Tabs>
    </div>
  );
}

function TabTicket() {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [sel, setSel] = useState<any | null>(null);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    if (!q.trim()) return;
    const num = parseInt(q.replace(/\D/g, ""));
    let query = supabase.from("tickets").select("id, numero, titulo, client:clients(nome)").limit(20);
    if (!isNaN(num)) query = query.eq("numero", num);
    else query = query.ilike("titulo", `%${q}%`);
    const { data } = await query;
    setResults(data ?? []);
  };

  const run = async (fn: (id: string) => Promise<void>) => {
    if (!sel) return;
    setBusy(true);
    try { await fn(sel.id); toast.success("PDF gerado"); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <Card className="p-6 mt-4 space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Nº de ticket ou título" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} />
        <Button onClick={search}>Pesquisar</Button>
      </div>
      {results.length > 0 && (
        <div className="border rounded-md divide-y">
          {results.map((r) => (
            <button key={r.id} className={`w-full text-left p-3 hover:bg-muted ${sel?.id === r.id ? "bg-muted" : ""}`} onClick={() => setSel(r)}>
              <span className="font-mono text-primary">#{String(r.numero).padStart(4, "0")}</span> {r.titulo}
              <span className="text-xs text-muted-foreground ml-2">{r.client?.nome}</span>
            </button>
          ))}
        </div>
      )}
      {sel && (
        <div className="flex gap-2 pt-2 border-t">
          <Button disabled={busy} onClick={() => run(gerarRelatorioTicketCliente)}><Download className="h-4 w-4 mr-1" />PDF Cliente</Button>
          <Button disabled={busy} variant="secondary" onClick={() => run(gerarRelatorioTicketInterno)}><Download className="h-4 w-4 mr-1" />PDF Interno</Button>
        </div>
      )}
    </Card>
  );
}

function TabMensal() {
  const now = new Date();
  const [mes, setMes] = useState(String(now.getMonth() + 1));
  const [ano, setAno] = useState(String(now.getFullYear()));
  const [clientId, setClientId] = useState<string>("");
  const [clients, setClients] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("id, nome").order("nome").then(({ data }) => setClients(data ?? []));
  }, []);

  const runCliente = async () => {
    if (!clientId) return toast.error("Seleccione um cliente");
    setBusy(true);
    try { await gerarRelatorioMensalCliente(clientId, parseInt(mes), parseInt(ano)); toast.success("PDF gerado"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };
  const runInterno = async () => {
    setBusy(true);
    try { await gerarRelatorioMensalInterno(parseInt(mes), parseInt(ano)); toast.success("PDF gerado"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const meses = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
  const anos = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  return (
    <Card className="p-6 mt-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Mês</Label>
          <Select value={mes} onValueChange={setMes}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{meses.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Ano</Label>
          <Select value={ano} onValueChange={setAno}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{anos.map((a) => <SelectItem key={a} value={String(a)}>{a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div>
          <Label>Cliente (para PDF cliente)</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex gap-2 pt-2 border-t">
        <Button disabled={busy || !clientId} onClick={runCliente}><Download className="h-4 w-4 mr-1" />PDF Cliente</Button>
        <Button disabled={busy} variant="secondary" onClick={runInterno}><Download className="h-4 w-4 mr-1" />PDF Interno (todos os clientes)</Button>
      </div>
    </Card>
  );
}

function TabArquivo() {
  const [clientId, setClientId] = useState<string>("");
  const [clients, setClients] = useState<any[]>([]);
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");
  const [busy, setBusy] = useState(false);
  const [generated, setGenerated] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [archiving, setArchiving] = useState(false);

  useEffect(() => {
    supabase.from("clients").select("id, nome").order("nome").then(({ data }) => setClients(data ?? []));
  }, []);

  const gerar = async () => {
    if (!clientId || !inicio || !fim) return toast.error("Preencha todos os campos");
    setBusy(true);
    try { await gerarArquivoCliente(clientId, inicio, fim); setGenerated(true); toast.success("PDF gerado"); }
    catch (e: any) { toast.error(e.message); } finally { setBusy(false); }
  };

  const arquivar = async () => {
    if (!confirm("Tem mesmo a certeza? Esta acção é IRREVERSÍVEL.")) return;
    setArchiving(true);
    try {
      const { data: ts } = await supabase.from("tickets").select("id").eq("client_id", clientId);
      const ticketIds = (ts ?? []).map((t) => t.id);
      let removed = 0;
      if (ticketIds.length) {
        const { count: cTime } = await supabase.from("time_entries").delete({ count: "exact" }).in("ticket_id", ticketIds);
        const { count: cCom } = await supabase.from("comments").delete({ count: "exact" }).in("ticket_id", ticketIds);
        removed += (cTime ?? 0) + (cCom ?? 0);
      }
      const { data: ags } = await supabase.from("preventiva_agendamentos").select("id").eq("client_id", clientId);
      const agIds = (ags ?? []).map((a) => a.id);
      const { data: execs } = agIds.length ? await supabase.from("preventiva_execucoes").select("id").in("agendamento_id", agIds) : { data: [] as any[] };
      const execIds = (execs ?? []).map((e: any) => e.id);
      if (execIds.length) {
        const { count: cCk } = await supabase.from("preventiva_checklist").delete({ count: "exact" }).in("execucao_id", execIds);
        removed += cCk ?? 0;
      }
      if (agIds.length) {
        const { count: cEx } = await supabase.from("preventiva_execucoes").delete({ count: "exact" }).in("agendamento_id", agIds);
        removed += cEx ?? 0;
      }
      const { count: cT } = await supabase.from("tickets").delete({ count: "exact" }).eq("client_id", clientId);
      removed += cT ?? 0;
      toast.success(`Cliente arquivado. ${removed} registos removidos.`);
      setGenerated(false); setConfirmed(false); setClientId(""); setInicio(""); setFim("");
    } catch (e: any) { toast.error(e.message); }
    finally { setArchiving(false); }
  };

  return (
    <Card className="p-6 mt-4 space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <Label>Cliente</Label>
          <Select value={clientId} onValueChange={setClientId}>
            <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div><Label>Data início</Label><Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} /></div>
        <div><Label>Data fim</Label><Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} /></div>
      </div>
      <div>
        <Button disabled={busy} onClick={gerar}><FileText className="h-4 w-4 mr-1" />Gerar arquivo PDF</Button>
      </div>

      {generated && (
        <div className="border border-destructive/40 rounded-md p-4 bg-destructive/5 space-y-3">
          <div className="flex items-start gap-2 text-sm">
            <AlertTriangle className="h-5 w-5 text-destructive shrink-0" />
            <div>
              <p className="font-semibold text-destructive">Arquivar cliente</p>
              <p className="text-muted-foreground">Esta acção remove todos os dados operacionais deste cliente (tickets, time entries, execuções de preventiva, comentários) da base de dados. O PDF gerado é o único registo que ficará.</p>
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(!!v)} />
            Confirmo que o PDF foi guardado em local seguro
          </label>
          <Button variant="destructive" disabled={!confirmed || archiving} onClick={arquivar}>
            {archiving ? "A arquivar…" : "Arquivar cliente"}
          </Button>
        </div>
      )}
    </Card>
  );
}
