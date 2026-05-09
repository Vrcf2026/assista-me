import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { notifyTicketCriado } from "@/lib/email/notify-ticket-event";
import { notifyAdminNovoTicket } from "@/lib/email/notify-admin";
import { AttachmentPicker } from "@/components/AttachmentPicker";

export const Route = createFileRoute("/tickets/novo")({
  validateSearch: (s: Record<string, unknown>) => ({
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
  }),
  component: NovoTicketPage,
});

function NovoTicketPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user) return null;
  return <AppLayout>{role === "admin" ? <NovoAdmin /> : <NovoCliente />}</AppLayout>;
}

function NovoCliente() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta">("media");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      // Buscar primeiro cliente associado ao utilizador
      const { data: memberships } = await supabase
        .from("client_users").select("client_id").eq("user_id", user.id).limit(1);
      const clientId = memberships?.[0]?.client_id;
      if (!clientId) throw new Error("A sua conta não está associada a nenhum cliente.");
      const { data: clientRow } = await supabase
        .from("clients").select("nome").eq("id", clientId).maybeSingle();
      const client = { id: clientId, nome: clientRow?.nome ?? "Cliente" };
      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          client_id: client.id,
          titulo, descricao, prioridade,
          created_by: user.id,
        })
        .select("id, numero")
        .single();
      if (error) throw error;
      // upload files
      for (const f of files) {
        const path = `${ticket.id}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-attachments").upload(path, f);
        if (upErr) { toast.error(upErr.message); continue; }
        await supabase.from("attachments").insert({
          ticket_id: ticket.id,
          uploaded_by: user.id,
          file_url: path,
          file_name: f.name,
          file_size: f.size,
          mime_type: f.type,
          is_internal: false,
        });
      }
      toast.success(`Ticket #${String(ticket.numero).padStart(4, "0")} criado`);
      void notifyTicketCriado(
        { id: ticket.id, numero: ticket.numero, titulo: titulo, client_id: client.id, created_by: user.id },
        prioridade,
      );
      void notifyAdminNovoTicket(
        { id: ticket.id, numero: ticket.numero, titulo },
        client.nome,
        prioridade,
      );
      navigate({ to: "/tickets/$id", params: { id: ticket.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
      </Button>
      <Card className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Novo ticket</h1>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição do problema *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} required rows={6} maxLength={5000} />
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as typeof prioridade)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Anexos (imagens ou PDF)</Label>
            <Input
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">{files.length} ficheiro(s) selecionado(s)</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "..." : "Criar ticket"}</Button>
        </form>
      </Card>
    </div>
  );
}

function NovoAdmin() {
  // Admin can pick the client and create on their behalf
  const navigate = useNavigate();
  const { user } = useAuth();
  const { clientId: preselected } = Route.useSearch();
  const [clients, setClients] = useState<{ id: string; nome: string }[]>([]);
  const [clientId, setClientId] = useState(preselected ?? "");
  const [clientUsers, setClientUsers] = useState<{ user_id: string; nome: string | null; email: string | null }[]>([]);
  const [assignToUser, setAssignToUser] = useState(false);
  const [assignedUserId, setAssignedUserId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta">("media");
  const [tipo, setTipo] = useState<"remota" | "presencial" | "preventiva" | "critica">("remota");
  const [files, setFiles] = useState<File[]>([]);
  const [notificarCliente, setNotificarCliente] = useState(true);
  // Time entry (optional, registado imediatamente)
  const [logTime, setLogTime] = useState(false);
  const [minutos, setMinutos] = useState<number>(0);
  const [naoContabilizar, setNaoContabilizar] = useState(false);
  const [descTempo, setDescTempo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from("clients").select("id, nome").order("nome")
      .then(({ data }) => setClients((data ?? []) as { id: string; nome: string }[]));
  }, []);

  // Load users of the selected client
  useEffect(() => {
    if (!clientId) { setClientUsers([]); return; }
    void (async () => {
      const { data: links } = await supabase
        .from("client_users").select("user_id").eq("client_id", clientId);
      const ids = (links ?? []).map((l) => l.user_id);
      if (ids.length === 0) { setClientUsers([]); return; }
      const { data: profs } = await supabase
        .from("profiles").select("user_id, nome, email").in("user_id", ids);
      setClientUsers((profs ?? []) as { user_id: string; nome: string | null; email: string | null }[]);
    })();
    setAssignedUserId("");
    setAssignToUser(false);
  }, [clientId]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !clientId) return;
    setBusy(true);
    try {
      const client = clients.find((c) => c.id === clientId);
      const createdBy = assignToUser && assignedUserId ? assignedUserId : user.id;
      const { data: ticket, error } = await supabase
        .from("tickets").insert({
          client_id: clientId, titulo, descricao, prioridade, tipo_intervencao: tipo,
          created_by: createdBy,
        }).select("id, numero").single();
      if (error) throw error;

      for (const f of files) {
        const path = `${ticket.id}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-attachments").upload(path, f);
        if (upErr) { toast.error(upErr.message); continue; }
        await supabase.from("attachments").insert({
          ticket_id: ticket.id,
          uploaded_by: user.id,
          file_url: path,
          file_name: f.name,
          file_size: f.size,
          mime_type: f.type,
          is_internal: false,
        });
      }

      // Optional time entry — entra na avença/faturação
      if (logTime && minutos > 0) {
        const { data: estado } = await supabase.rpc("calcular_estado_faturacao", {
          _client_id: clientId, _minutos: minutos, _nao_contabilizar: naoContabilizar,
        });
        const { error: teErr } = await supabase.from("time_entries").insert({
          ticket_id: ticket.id,
          user_id: user.id,
          minutos,
          tipo_intervencao: tipo,
          nao_contabilizar: naoContabilizar,
          descricao: descTempo || null,
          estado_faturacao: (estado as string) ?? "pendente",
        });
        if (teErr) toast.error(`Tempo: ${teErr.message}`);
        else await supabase.from("tickets")
          .update({ tempo_gasto_minutos: minutos })
          .eq("id", ticket.id);
      }

      toast.success(`Ticket #${String(ticket.numero).padStart(4, "0")} criado`);
      if (notificarCliente) {
        void notifyTicketCriado(
          { id: ticket.id, numero: ticket.numero, titulo, client_id: clientId, created_by: createdBy },
          prioridade,
        );
      }
      void notifyAdminNovoTicket(
        { id: ticket.id, numero: ticket.numero, titulo },
        client?.nome ?? "Cliente",
        prioridade,
      );
      navigate({ to: "/tickets/$id", params: { id: ticket.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  const preselectedClient = preselected ? clients.find((c) => c.id === preselected) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to={preselected ? "/clientes/$id" : "/"} params={preselected ? { id: preselected } : undefined as never}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Voltar
        </Link>
      </Button>
      <Card className="p-6">
        <h1 className="text-2xl font-semibold mb-1">Novo ticket (em nome do cliente)</h1>
        <p className="text-sm text-muted-foreground mb-4">
          Use este formulário para abrir um ticket por telefone/email em nome de um cliente.
        </p>
        <form onSubmit={submit} className="space-y-4">
          {preselected ? (
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <div className="px-3 py-2 rounded-md border bg-muted/30 text-sm">
                {preselectedClient?.nome ?? "A carregar…"}
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          )}

          {clientId && clientUsers.length > 0 && (
            <div className="space-y-2 rounded-md border p-3 bg-muted/20">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={assignToUser}
                  onChange={(e) => setAssignToUser(e.target.checked)}
                  className="h-4 w-4"
                />
                Atribuir a um utilizador do cliente (para seguimento)
              </label>
              {assignToUser && (
                <Select value={assignedUserId} onValueChange={setAssignedUserId}>
                  <SelectTrigger><SelectValue placeholder="Escolher utilizador" /></SelectTrigger>
                  <SelectContent>
                    {clientUsers.map((u) => (
                      <SelectItem key={u.user_id} value={u.user_id}>
                        {u.nome ?? u.email ?? u.user_id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {assignToUser && (
                <p className="text-xs text-muted-foreground">
                  O ticket aparecerá como criado por este utilizador, que poderá seguir e responder.
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} required rows={5} maxLength={5000} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Prioridade</Label>
              <Select value={prioridade} onValueChange={(v) => setPrioridade(v as typeof prioridade)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="baixa">Baixa</SelectItem>
                  <SelectItem value="media">Média</SelectItem>
                  <SelectItem value="alta">Alta</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de intervenção</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as typeof tipo)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                 <SelectItem value="remota">Remota / Telefónica</SelectItem>
                 <SelectItem value="presencial">Presencial</SelectItem>
                 <SelectItem value="preventiva">Preventiva</SelectItem>
                 <SelectItem value="critica">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Anexos (imagens ou PDF)</Label>
            <Input
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">{files.length} ficheiro(s) selecionado(s)</p>
            )}
          </div>

          <div className="space-y-2 rounded-md border p-3 bg-muted/20">
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={logTime}
                onChange={(e) => setLogTime(e.target.checked)}
                className="h-4 w-4"
              />
              ⏱️ Registar tempo já trabalhado neste ticket
            </label>
            {logTime && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Minutos</Label>
                    <Input
                      type="number" min={0}
                      value={minutos || ""}
                      onChange={(e) => setMinutos(parseInt(e.target.value) || 0)}
                    />
                  </div>
                  <label className="flex items-end gap-2 text-sm cursor-pointer pb-2">
                    <input
                      type="checkbox"
                      checked={naoContabilizar}
                      onChange={(e) => setNaoContabilizar(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Não contabilizar
                  </label>
                </div>
                <Input
                  placeholder="Descrição do trabalho (opcional)"
                  value={descTempo}
                  onChange={(e) => setDescTempo(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  O tempo entra na avença/faturação conforme o tipo de contrato do cliente.
                </p>
              </div>
            )}
          </div>

          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={notificarCliente}
              onChange={(e) => setNotificarCliente(e.target.checked)}
              className="h-4 w-4"
            />
            Enviar email de confirmação ao cliente
          </label>
          <Button type="submit" className="w-full" disabled={busy || !clientId}>{busy ? "..." : "Criar ticket"}</Button>
        </form>
      </Card>
    </div>
  );
}
