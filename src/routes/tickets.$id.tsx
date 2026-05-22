import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { StatusBadge, PriorityBadge, TipoBadge } from "@/components/StatusBadge";
import { SlaBadge } from "@/components/SlaBadge";
import { TicketTagsEditor } from "@/components/TicketTagsEditor";
import { TimeEntriesPanel } from "@/components/TimeEntriesPanel";
import {
  formatTicketNumber, formatDateTime, formatCurrency, formatMinutes,
  calcValor, MOTIVO_FECHO_LABELS, TIPO_LABELS,
} from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Lock, Paperclip, Send, MessageSquare, Clock, FileText, Download, Eye, EyeOff, Plus, Trash2, KeyRound, Check, X, Pencil, Package } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { gerarRelatorioTicketCliente, gerarRelatorioTicketInterno } from "@/lib/pdf";
import { OrcamentosPanel } from "@/components/OrcamentosPanel";
import { notifyNovoComentario, notifyTicketFechado, notifyTicketSatisfacao } from "@/lib/email/notify-ticket-event";
import { notifyAdminNovoComentarioCliente } from "@/lib/email/notify-admin";

export const Route = createFileRoute("/tickets/$id")({
  component: TicketPage,
});

function TicketPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);
  if (loading || !user) return null;
  return <AppLayout><TicketDetail id={id} /></AppLayout>;
}

interface Ticket {
  id: string;
  numero: number;
  client_id: string;
  titulo: string;
  descricao: string;
  prioridade: "baixa" | "media" | "alta";
  estado: "aberto" | "em_progresso" | "aguarda_cliente" | "fechado";
  tipo_intervencao: "remota" | "presencial" | "preventiva" | "critica";
  tecnico_responsavel: string | null;
  tempo_gasto_minutos: number;
  solucao_aplicada: string | null;
  motivo_fecho: string | null;
  equipamento: string | null;
  localizacao: string | null;
  contacto_local: string | null;
  pedido_por: string | null;
  num_ordem_oficina: string | null;
  internal_notes: string | null;
  created_at: string;
  updated_at: string;
  client?: { id: string; nome: string; tarifa_hora: number } | null;
}

interface Comment {
  id: string;
  ticket_id: string;
  user_id: string;
  mensagem: string;
  is_internal: boolean;
  visto_em: string | null;
  created_at: string;
}

interface Escalation {
  id: string;
  tipo_anterior: string;
  tipo_novo: string;
  motivo: string;
  created_at: string;
}

interface Attachment {
  id: string;
  file_url: string;
  file_name: string;
  is_internal: boolean;
  created_at: string;
  comment_id: string | null;
}

function TicketDetail({ id }: { id: string }) {
  const { user, role } = useAuth();
  const isAdmin = role === "admin";

  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [escalations, setEscalations] = useState<Escalation[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [headerEscalateOpen, setHeaderEscalateOpen] = useState(false);
  const [isClientAdmin, setIsClientAdmin] = useState(false);

  useEffect(() => {
    if (!user?.id || isAdmin) { setIsClientAdmin(false); return; }
    void supabase.from("client_users")
      .select("is_client_admin").eq("user_id", user.id).eq("client_id", ticket?.client_id ?? "").maybeSingle()
      .then(({ data }) => setIsClientAdmin(!!data?.is_client_admin));
  }, [user?.id, ticket?.client_id, isAdmin]);

  const load = async () => {
    setLoading(true);
    const { data: t, error } = await supabase
      .from("tickets")
      .select("*, client:clients(id, nome, tarifa_hora)")
      .eq("id", id)
      .maybeSingle();
    if (error) toast.error(error.message);
    setTicket(t as Ticket | null);

    const { data: cs } = await supabase
      .from("comments").select("*").eq("ticket_id", id).order("created_at");
    setComments((cs ?? []) as Comment[]);

    const { data: es } = await supabase
      .from("ticket_escalations").select("*").eq("ticket_id", id).order("created_at");
    setEscalations((es ?? []) as Escalation[]);

    const { data: at } = await supabase
      .from("attachments").select("*").eq("ticket_id", id).order("created_at");
    setAttachments((at ?? []) as Attachment[]);

    setLoading(false);
  };

  const openAttachment = async (attachment: Attachment) => {
    if (/^https?:\/\//i.test(attachment.file_url)) {
      window.open(attachment.file_url, "_blank", "noopener,noreferrer");
      return;
    }
    const { data, error } = await supabase.storage
      .from("ticket-attachments")
      .createSignedUrl(attachment.file_url, 60 * 10);
    if (error || !data?.signedUrl) {
      toast.error(error?.message ?? "Não foi possível abrir o anexo");
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  useEffect(() => { void load(); }, [id]);

  // Mark admin comments as seen by client (first time)
  useEffect(() => {
    if (!ticket || !user || isAdmin) return;
    const unseen = comments.filter((c) => !c.is_internal && c.user_id !== user.id && !c.visto_em);
    if (unseen.length === 0) return;
    void (async () => {
      const ids = unseen.map((c) => c.id);
      await supabase.from("comments").update({ visto_em: new Date().toISOString() }).in("id", ids);
    })();
  }, [comments, user, ticket, isAdmin]);

  if (loading) return <div className="text-sm text-muted-foreground">A carregar…</div>;
  if (!ticket) return <div className="text-sm">Ticket não encontrado</div>;

  const valor = ticket.client
    ? calcValor(ticket.tempo_gasto_minutos, Number(ticket.client.tarifa_hora))
    : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm"><FileText className="h-4 w-4 mr-1" /> Exportar</Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => { void gerarRelatorioTicketCliente(ticket.id).then(() => toast.success("PDF gerado")).catch((e) => toast.error(e.message)); }}>
              <Download className="h-4 w-4 mr-2" />PDF Cliente
            </DropdownMenuItem>
            {isAdmin && (
              <DropdownMenuItem onClick={() => { void gerarRelatorioTicketInterno(ticket.id).then(() => toast.success("PDF gerado")).catch((e) => toast.error(e.message)); }}>
                <Download className="h-4 w-4 mr-2" />PDF Interno
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Header card */}
      <Card className="p-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="font-mono text-xl font-bold text-primary">
                {formatTicketNumber(ticket.numero)}
              </span>
              <StatusBadge estado={ticket.estado} />
              <PriorityBadge prioridade={ticket.prioridade} />
              <TipoBadge tipo={ticket.tipo_intervencao} />
              {isAdmin && (
                <Button size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={() => setHeaderEscalateOpen(true)}>
                  🔺 Escalar
                </Button>
              )}
              {ticket.tipo_intervencao === "critica" && ticket.estado !== "fechado" && (
                <SlaBadge openedAt={ticket.created_at} />
              )}
            </div>
            <h1 className="text-2xl font-semibold">{ticket.titulo}</h1>
            {isAdmin && ticket.client && (
              <p className="text-sm text-muted-foreground">
                Cliente: <Link to="/clientes/$id" params={{ id: ticket.client.id }} className="text-primary hover:underline">{ticket.client.nome}</Link>
              </p>
            )}
            <PedidoPorField ticket={ticket} isAdmin={isAdmin} onChange={load} />
            {isAdmin && (
              <OrdemOficinaInline ticket={ticket} onChange={load} />
            )}
            <TicketTagsEditor ticketId={ticket.id} canEdit={isAdmin} />
          </div>
          {isAdmin && (
            <div className="text-right">
              <div className="text-xs text-muted-foreground">Valor calculado</div>
              <div className="font-mono font-semibold text-lg">{formatCurrency(valor)}</div>
              <div className="text-xs text-muted-foreground">{formatMinutes(ticket.tempo_gasto_minutos)}</div>
            </div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t">
          <Label className="text-xs text-muted-foreground">Descrição</Label>
          <p className="mt-1 text-sm whitespace-pre-wrap">{ticket.descricao}</p>
        </div>

        {(ticket.equipamento || ticket.localizacao || ticket.contacto_local) && (
          <div className="mt-4 pt-4 border-t">
            <Label className="text-xs text-muted-foreground">Detalhes</Label>
            <div className="mt-2 space-y-1 text-sm">
              {ticket.equipamento && <div>🖥️ <span className="text-muted-foreground">Equipamento:</span> {ticket.equipamento}</div>}
              {ticket.localizacao && <div>📍 <span className="text-muted-foreground">Localização:</span> {ticket.localizacao}</div>}
              {ticket.contacto_local && <div>👤 <span className="text-muted-foreground">Contacto:</span> {ticket.contacto_local}</div>}
            </div>
          </div>
        )}

        {ticket.estado === "fechado" && (
          <div className="mt-4 pt-4 border-t space-y-2">
            <div>
              <Label className="text-xs text-muted-foreground">Solução aplicada</Label>
              <p className="text-sm whitespace-pre-wrap mt-1">{ticket.solucao_aplicada ?? "—"}</p>
            </div>
            {ticket.motivo_fecho && (
              <div>
                <Label className="text-xs text-muted-foreground">Motivo de fecho</Label>
                <p className="text-sm mt-1">{MOTIVO_FECHO_LABELS[ticket.motivo_fecho]}</p>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* Admin management panel */}
      {isAdmin && <AdminPanel ticket={ticket} onChange={load} />}

      {/* Credenciais seguras — só admin VRCF */}
      {isAdmin && <CredentialsPanel ticketId={ticket.id} />}

      {/* Time entries — visíveis a admin (com formulário) e cliente (read-only) */}
      <TimeEntriesPanel ticketId={ticket.id} clientId={ticket.client_id} isAdmin={isAdmin} onChange={load} />

      {/* Original (non-comment) attachments */}
      {attachments.filter((a) => !a.comment_id && (isAdmin || !a.is_internal)).length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Anexos do ticket</h3>
          <ul className="space-y-1">
            {attachments.filter((a) => !a.comment_id && (isAdmin || !a.is_internal)).map((a) => (
              <li key={a.id}>
                <button type="button" onClick={() => void openAttachment(a)} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                  <Paperclip className="h-3.5 w-3.5" /> {a.file_name}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Escalation history (admin only) */}
      {isAdmin && escalations.length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Histórico de escaladas</h3>
          <ul className="space-y-2 text-sm">
            {escalations.map((e) => (
              <li key={e.id} className="border-l-2 border-primary pl-3">
                <div className="text-xs text-muted-foreground">{formatDateTime(e.created_at)}</div>
                <div>
                  <span className="font-medium">{TIPO_LABELS[e.tipo_anterior]}</span>
                  {" → "}
                  <span className="font-medium">{TIPO_LABELS[e.tipo_novo]}</span>
                </div>
                <div className="text-muted-foreground italic">"{e.motivo}"</div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* Notas + Conversação em tabs */}
      <NotesTabsCard
        ticket={ticket}
        comments={comments}
        attachments={attachments}
        isAdmin={isAdmin}
        currentUserId={user?.id}
        onOpenAttachment={openAttachment}
        onChange={load}
      />

      <OrcamentosPanel
        ticket={{ id: ticket.id, numero: ticket.numero, titulo: ticket.titulo, client_id: ticket.client_id, created_by: (ticket as any).created_by ?? null }}
        isAdmin={isAdmin}
      />

      {isAdmin && (
        <HeaderEscalateDialog
          open={headerEscalateOpen}
          onOpenChange={setHeaderEscalateOpen}
          ticket={ticket}
          onDone={load}
        />
      )}
    </div>
  );
}

// ============== Admin panel ==============
function AdminPanel({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const [tecnico, setTecnico] = useState(ticket.tecnico_responsavel ?? "");
  const [prio, setPrio] = useState(ticket.prioridade);
  const [estado, setEstado] = useState(ticket.estado);
  const [tipo, setTipo] = useState(ticket.tipo_intervencao);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTecnico(ticket.tecnico_responsavel ?? "");
    setPrio(ticket.prioridade);
    setEstado(ticket.estado);
    setTipo(ticket.tipo_intervencao);
  }, [ticket]);

  const saveBasics = async () => {
    setBusy(true);
    const { error } = await supabase.from("tickets").update({
      tecnico_responsavel: tecnico || null,
      prioridade: prio,
    }).eq("id", ticket.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Guardado");
    onChange();
  };

  const changeEstado = async (newEstado: typeof estado) => {
    if (newEstado === "fechado") { setCloseOpen(true); return; }
    setEstado(newEstado);
    const { error } = await supabase.from("tickets").update({ estado: newEstado }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Estado atualizado");
    onChange();
  };

  const changeTipo = (newTipo: typeof tipo) => {
    if (newTipo === tipo) return;
    setTipo(newTipo);
    setEscalateOpen(true);
  };

  return (
    <Card className="p-4 bg-secondary/30">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Lock className="h-3.5 w-3.5" /> Painel do técnico
      </h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Técnico responsável</Label>
          <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Nome" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Prioridade</Label>
          <Select value={prio} onValueChange={(v) => setPrio(v as typeof prio)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Estado</Label>
          <Select value={estado} onValueChange={(v) => changeEstado(v as typeof estado)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="em_progresso">Em Progresso</SelectItem>
              <SelectItem value="aguarda_cliente">Aguarda Cliente</SelectItem>
              <SelectItem value="fechado">Fechado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de intervenção</Label>
          <Select value={tipo} onValueChange={(v) => changeTipo(v as typeof tipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="remota">Remota / Telefónica</SelectItem>
              <SelectItem value="presencial">Presencial</SelectItem>
              <SelectItem value="preventiva">Preventiva</SelectItem>
              <SelectItem value="critica">Crítica (SLA 8h úteis)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={saveBasics} disabled={busy}>Guardar</Button>
      </div>

      <div className="border-t mt-4 pt-4">
        <p className="text-xs text-muted-foreground">
          Use o painel <strong>Tempo registado</strong> abaixo para adicionar entradas detalhadas (com data e descrição).
          Total atual: <span className="font-mono">{formatMinutes(ticket.tempo_gasto_minutos)}</span>
        </p>
      </div>

      <EscalateDialog
        open={escalateOpen}
        onOpenChange={setEscalateOpen}
        ticket={ticket}
        novoTipo={tipo}
        onCancel={() => setTipo(ticket.tipo_intervencao)}
        onDone={onChange}
      />
      <CloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        ticket={ticket}
        onCancel={() => setEstado(ticket.estado)}
        onDone={onChange}
      />
    </Card>
  );
}

function EscalateDialog({
  open, onOpenChange, ticket, novoTipo, onCancel, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: Ticket;
  novoTipo: Ticket["tipo_intervencao"];
  onCancel: () => void;
  onDone: () => void;
}) {
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) setMotivo(""); }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const { error: e1 } = await supabase.from("ticket_escalations").insert({
        ticket_id: ticket.id,
        tipo_anterior: ticket.tipo_intervencao,
        tipo_novo: novoTipo,
        motivo: motivo.trim() || null,
        escalado_por: uid,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("tickets")
        .update({ tipo_intervencao: novoTipo }).eq("id", ticket.id);
      if (e2) throw e2;
      if (uid) {
        const msg = `🔺 Intervenção escalada de ${TIPO_LABELS[ticket.tipo_intervencao]} → ${TIPO_LABELS[novoTipo]}${motivo.trim() ? ` — Motivo: ${motivo.trim()}` : ""}`;
        await supabase.from("comments").insert({
          ticket_id: ticket.id,
          user_id: uid,
          mensagem: msg,
          is_internal: true,
        });
      }
      toast.success("Intervenção escalada");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Escalar intervenção</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tipo actual: <span className="font-medium text-foreground">{TIPO_LABELS[ticket.tipo_intervencao]}</span>
          </p>
          <p className="text-sm">
            <span className="font-medium">{TIPO_LABELS[ticket.tipo_intervencao]}</span> → <span className="font-medium">{TIPO_LABELS[novoTipo]}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Ex: Problema não resolvido remotamente" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onCancel(); onOpenChange(false); }}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Escalar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HeaderEscalateDialog({
  open, onOpenChange, ticket, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: Ticket;
  onDone: () => void;
}) {
  const TIPOS: Ticket["tipo_intervencao"][] = ["remota", "presencial", "preventiva", "critica"];
  const opcoes = TIPOS.filter((t) => t !== ticket.tipo_intervencao);
  const [novoTipo, setNovoTipo] = useState<Ticket["tipo_intervencao"]>(opcoes[0]);
  const [motivo, setMotivo] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setNovoTipo(opcoes[0]);
      setMotivo("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ticket.tipo_intervencao]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: userData } = await supabase.auth.getUser();
      const uid = userData.user?.id;
      const { error: e1 } = await supabase.from("ticket_escalations").insert({
        ticket_id: ticket.id,
        tipo_anterior: ticket.tipo_intervencao,
        tipo_novo: novoTipo,
        motivo: motivo.trim() || null,
        escalado_por: uid,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("tickets")
        .update({ tipo_intervencao: novoTipo }).eq("id", ticket.id);
      if (e2) throw e2;
      if (uid) {
        const msg = `🔺 Intervenção escalada de ${TIPO_LABELS[ticket.tipo_intervencao]} → ${TIPO_LABELS[novoTipo]}${motivo.trim() ? ` — Motivo: ${motivo.trim()}` : ""}`;
        await supabase.from("comments").insert({
          ticket_id: ticket.id,
          user_id: uid,
          mensagem: msg,
          is_internal: true,
        });
      }
      toast.success("Intervenção escalada");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Escalar intervenção</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Tipo actual: <span className="font-medium text-foreground">{TIPO_LABELS[ticket.tipo_intervencao]}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Novo tipo</Label>
            <Select value={novoTipo} onValueChange={(v) => setNovoTipo(v as Ticket["tipo_intervencao"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {opcoes.map((t) => (
                  <SelectItem key={t} value={t}>{TIPO_LABELS[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} placeholder="Ex: Problema não resolvido remotamente" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>Escalar</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CloseDialog({
  open, onOpenChange, ticket, onCancel, onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticket: Ticket;
  onCancel: () => void;
  onDone: () => void;
}) {
  const [solucao, setSolucao] = useState("");
  const [motivo, setMotivo] = useState<string>("resolvido");
  const [busy, setBusy] = useState(false);

  useEffect(() => { if (open) { setSolucao(""); setMotivo("resolvido"); } }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { error } = await supabase.from("tickets").update({
        estado: "fechado" as const,
        solucao_aplicada: solucao,
        motivo_fecho: motivo as "resolvido" | "nao_reproduzivel" | "duplicado" | "fechado_pelo_cliente",
        fechado_em: new Date().toISOString(),
      }).eq("id", ticket.id);
      if (error) throw error;
      toast.success("Ticket fechado");
      void notifyTicketFechado(
        { id: ticket.id, numero: ticket.numero, titulo: ticket.titulo, client_id: ticket.client_id },
        motivo,
        solucao,
      );
      // Pedir avaliação de satisfação ao cliente
      void notifyTicketSatisfacao(
        { id: ticket.id, numero: ticket.numero, titulo: ticket.titulo, client_id: ticket.client_id },
      );
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Fechar ticket</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Solução aplicada *</Label>
            <Textarea value={solucao} onChange={(e) => setSolucao(e.target.value)} required rows={4} />
          </div>
          <div className="space-y-1.5">
            <Label>Motivo de fecho *</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="resolvido">Resolvido</SelectItem>
                <SelectItem value="nao_reproduzivel">Não Reproduzível</SelectItem>
                <SelectItem value="duplicado">Duplicado</SelectItem>
                <SelectItem value="fechado_pelo_cliente">Fechado pelo Cliente</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onCancel(); onOpenChange(false); }}>Cancelar</Button>
            <Button type="submit" disabled={busy || !solucao.trim()}>Fechar ticket</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ============== Comments ==============
function CommentList({
  comments, attachments, isAdmin, currentUserId, onOpenAttachment,
}: {
  comments: Comment[];
  attachments: Attachment[];
  isAdmin: boolean;
  currentUserId: string | undefined;
  onOpenAttachment: (attachment: Attachment) => void | Promise<void>;
}) {
  const visible = comments.filter((c) => isAdmin || !c.is_internal);
  const attsByComment = useMemo(() => {
    const m: Record<string, Attachment[]> = {};
    attachments.forEach((a) => {
      if (a.comment_id) (m[a.comment_id] ??= []).push(a);
    });
    return m;
  }, [attachments]);

  if (visible.length === 0) return <p className="text-sm text-muted-foreground">Sem mensagens.</p>;
  return (
    <ul className="space-y-3">
      {visible.map((c) => {
        const own = c.user_id === currentUserId;
        const baseCls = c.is_internal
          ? "bg-internal-note border-internal-note-border text-internal-note-foreground"
          : own
            ? "bg-primary/10 border-primary/20"
            : "bg-secondary border-border";
        return (
          <li key={c.id} className={`border rounded-md p-3 ${baseCls}`}>
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className="font-medium flex items-center gap-1">
                {c.is_internal && <Lock className="h-3 w-3" />}
                {own ? "Eu" : c.is_internal ? "Nota interna" : "Mensagem"}
              </span>
              <span className="text-muted-foreground">{formatDateTime(c.created_at)}</span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{c.mensagem}</p>
            {attsByComment[c.id]?.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {attsByComment[c.id].map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => void onOpenAttachment(a)} className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> {a.file_name}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {isAdmin && !c.is_internal && c.user_id !== currentUserId && c.visto_em && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Visto pelo cliente às {formatDateTime(c.visto_em)}
              </p>
            )}
            {isAdmin && !c.is_internal && c.user_id === currentUserId && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                {c.visto_em ? `Visto às ${formatDateTime(c.visto_em)}` : "Ainda não visto"}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function NewCommentForm({
  ticketId, clientId, isAdmin, onSent,
}: {
  ticketId: string;
  clientId: string;
  isAdmin: boolean;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const [mensagem, setMensagem] = useState("");
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [templates, setTemplates] = useState<{ id: string; titulo: string; mensagem: string }[]>([]);

  // Tempo
  const [showTime, setShowTime] = useState(false);
  const [tipoInt, setTipoInt] = useState<"remota" | "presencial" | "preventiva">("remota");
  const [naoContab, setNaoContab] = useState(false);
  const [timeMode, setTimeMode] = useState<"manual" | "chrono" | "range">("manual");
  const [minutos, setMinutos] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");

  // Cronómetro
  const chronoKey = `chrono:reply:${ticketId}`;
  const [chronoStart, setChronoStart] = useState<number | null>(null);
  const [chronoElapsed, setChronoElapsed] = useState(0);

  useEffect(() => {
    if (!isAdmin) return;
    void supabase.from("response_templates").select("id, titulo, mensagem").order("ordem").order("titulo")
      .then(({ data }) => setTemplates((data ?? []) as { id: string; titulo: string; mensagem: string }[]));
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    const raw = localStorage.getItem(chronoKey);
    if (raw) {
      const start = Number(raw);
      if (!Number.isNaN(start)) setChronoStart(start);
    }
  }, [chronoKey, isAdmin]);

  useEffect(() => {
    if (chronoStart == null) return;
    setChronoElapsed(Date.now() - chronoStart);
    const t = window.setInterval(() => setChronoElapsed(Date.now() - chronoStart), 1000);
    return () => window.clearInterval(t);
  }, [chronoStart]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  const nowHHMM = () => {
    const d = new Date();
    return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const startChrono = () => {
    const t = Date.now();
    setChronoStart(t);
    localStorage.setItem(chronoKey, String(t));
  };
  const stopChrono = () => {
    if (chronoStart == null) return;
    const mins = Math.max(1, Math.round((Date.now() - chronoStart) / 60000));
    setChronoStart(null);
    localStorage.removeItem(chronoKey);
    setChronoElapsed(0);
    setMinutos(String(mins));
    setTimeMode("manual");
    toast.success(`${mins} min preenchidos no campo Manual`);
  };

  const computeMinutes = (): number => {
    if (timeMode === "manual") return Number(minutos) || 0;
    if (timeMode === "chrono") {
      if (chronoStart != null) return Math.max(1, Math.round((Date.now() - chronoStart) / 60000));
      return Number(minutos) || 0;
    }
    if (timeMode === "range") {
      if (!horaInicio || !horaFim) return 0;
      const [h1, m1] = horaInicio.split(":").map(Number);
      const [h2, m2] = horaFim.split(":").map(Number);
      let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (mins <= 0) mins += 24 * 60;
      return mins;
    }
    return 0;
  };

  const resetTime = () => {
    setMinutos(""); setHoraInicio(""); setHoraFim("");
    setNaoContab(false); setTipoInt("remota");
    setShowTime(false); setTimeMode("manual");
    if (chronoStart != null) {
      setChronoStart(null);
      localStorage.removeItem(chronoKey);
      setChronoElapsed(0);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !mensagem.trim()) return;
    setBusy(true);
    try {
      const sendInternal = isAdmin && internal;
      const { data: comment, error } = await supabase
        .from("comments").insert({
          ticket_id: ticketId,
          user_id: user.id,
          mensagem,
          is_internal: sendInternal,
        }).select("id").single();
      if (error) throw error;

      for (const f of files) {
        const path = `${ticketId}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-attachments").upload(path, f);
        if (upErr) { toast.error(upErr.message); continue; }
        await supabase.from("attachments").insert({
          ticket_id: ticketId,
          comment_id: comment.id,
          uploaded_by: user.id,
          file_url: path,
          file_name: f.name,
          file_size: f.size,
          mime_type: f.type,
          is_internal: sendInternal,
        });
      }

      // Tempo associado à resposta (admin)
      if (isAdmin) {
        const mins = computeMinutes();
        if (mins > 0) {
          let estado_faturacao = "pendente";
          const { data: estadoData } = await supabase.rpc("calcular_estado_faturacao", {
            _client_id: clientId,
            _minutos: mins,
            _nao_contabilizar: naoContab,
          });
          if (typeof estadoData === "string") estado_faturacao = estadoData;

          const { error: teErr } = await supabase.from("time_entries").insert({
            ticket_id: ticketId,
            user_id: user.id,
            minutos: mins,
            descricao: mensagem.slice(0, 500),
            data_trabalho: new Date().toISOString().slice(0, 10),
            tipo_intervencao: tipoInt,
            nao_contabilizar: naoContab,
            estado_faturacao,
          });
          if (teErr) {
            toast.error(teErr.message);
          } else if (!naoContab) {
            const { data: tk } = await supabase
              .from("tickets").select("tempo_gasto_minutos").eq("id", ticketId).maybeSingle();
            const novo = (tk?.tempo_gasto_minutos ?? 0) + mins;
            await supabase.from("tickets").update({ tempo_gasto_minutos: novo }).eq("id", ticketId);
          }
        }
      }

      // Notificações
      const { data: t } = await supabase
        .from("tickets")
        .select("id, numero, titulo, client_id, client:clients(nome)")
        .eq("id", ticketId)
        .maybeSingle();
      if (t) {
        const ticketLite = { id: t.id, numero: t.numero, titulo: t.titulo, client_id: t.client_id };
        if (isAdmin && !sendInternal) {
          void notifyNovoComentario(ticketLite, mensagem, "Equipa VRCF", comment.id);
        }
        if (!isAdmin) {
          const clientName = (t as any).client?.nome ?? "Cliente";
          void notifyAdminNovoComentarioCliente(
            { id: t.id, numero: t.numero, titulo: t.titulo },
            clientName,
            mensagem,
            comment.id,
          );
        }
      }

      setMensagem(""); setFiles([]); setInternal(false);
      resetTime();
      onSent();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <form onSubmit={submit} className="space-y-2">
      <Textarea
        value={mensagem}
        onChange={(e) => setMensagem(e.target.value)}
        placeholder={isAdmin && internal ? "Nota interna (não visível pelo cliente)…" : "Escreva uma mensagem…"}
        rows={3}
        className={isAdmin && internal ? "bg-internal-note" : ""}
      />

      {isAdmin && (
        <div className="border rounded-md">
          <button
            type="button"
            onClick={() => setShowTime((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-secondary/50"
          >
            <span className="flex items-center gap-2">
              <Clock className="h-3.5 w-3.5" /> Registar tempo nesta resposta
              {chronoStart != null && (
                <span className="text-xs font-mono text-primary">{formatElapsed(chronoElapsed)}</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground">{showTime ? "▲" : "▼"}</span>
          </button>
          {showTime && (
            <div className="p-3 border-t space-y-3 bg-secondary/20">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo de intervenção</Label>
                  <Select value={tipoInt} onValueChange={(v) => setTipoInt(v as typeof tipoInt)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remota">Remota</SelectItem>
                      <SelectItem value="presencial">Presencial</SelectItem>
                      <SelectItem value="preventiva">Preventiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <label className="flex items-center gap-2 text-xs cursor-pointer">
                    <Checkbox checked={naoContab} onCheckedChange={(v) => setNaoContab(!!v)} />
                    Não contabilizar (cortesia / interno)
                  </label>
                </div>
              </div>

              <div className="flex gap-1 border rounded p-0.5 bg-background w-fit">
                {(["manual", "chrono", "range"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setTimeMode(m)}
                    className={`px-3 py-1 text-xs rounded ${timeMode === m ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
                  >
                    {m === "manual" ? "Manual" : m === "chrono" ? "Cronómetro" : "Início/Fim"}
                  </button>
                ))}
              </div>

              {timeMode === "manual" && (
                <div className="flex items-end gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Minutos</Label>
                    <Input
                      type="number"
                      min={1}
                      value={minutos}
                      onChange={(e) => setMinutos(e.target.value)}
                      className="w-32"
                    />
                  </div>
                </div>
              )}

              {timeMode === "chrono" && (
                <div className="flex items-center justify-between gap-3">
                  <div className="font-mono text-2xl tabular-nums">{formatElapsed(chronoElapsed)}</div>
                  <div className="flex gap-2">
                    {chronoStart == null ? (
                      <Button type="button" size="sm" onClick={startChrono}>▶ Iniciar</Button>
                    ) : (
                      <Button type="button" size="sm" variant="destructive" onClick={stopChrono}>⏹ Parar</Button>
                    )}
                  </div>
                </div>
              )}

              {timeMode === "range" && (
                <div className="flex gap-3 flex-wrap">
                  <div className="space-y-1">
                    <Label className="text-xs">Início</Label>
                    <div className="flex gap-1">
                      <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-28" />
                      <Button type="button" size="sm" variant="ghost" onClick={() => setHoraInicio(nowHHMM())}>Agora</Button>
                    </div>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Fim</Label>
                    <div className="flex gap-1">
                      <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="w-28" />
                      <Button type="button" size="sm" variant="ghost" onClick={() => setHoraFim(nowHHMM())}>Agora</Button>
                    </div>
                  </div>
                  {horaInicio && horaFim && (
                    <div className="text-xs text-muted-foreground self-end pb-2">
                      = {computeMinutes()} min
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-3">
          <Input
            type="file"
            multiple
            accept="image/*,application/pdf"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="text-xs h-9 max-w-[240px]"
          />
          {isAdmin && (
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={internal} onCheckedChange={(v) => setInternal(!!v)} />
              <Lock className="h-3.5 w-3.5" /> Nota interna
            </label>
          )}
          {isAdmin && templates.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="ghost" size="sm" type="button" className="h-9">
                  <MessageSquare className="h-4 w-4 mr-1" /> Respostas
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-1" align="start">
                {templates.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMensagem((m) => (m ? m + "\n\n" : "") + t.mensagem)}
                    className="w-full text-left text-sm px-2 py-1.5 rounded hover:bg-secondary"
                  >
                    <div className="font-medium">{t.titulo}</div>
                    <div className="text-xs text-muted-foreground line-clamp-2">{t.mensagem}</div>
                  </button>
                ))}
              </PopoverContent>
            </Popover>
          )}
        </div>
        <Button type="submit" disabled={busy || !mensagem.trim()}>
          <Send className="h-4 w-4 mr-1" /> Enviar resposta
        </Button>
      </div>
    </form>
  );
}

// ============== Pedido por ==============
function PedidoPorField({ ticket, isAdmin, onChange }: { ticket: Ticket; isAdmin: boolean; onChange: () => void }) {
  const [name, setName] = useState<string>("—");
  const [editing, setEditing] = useState(false);
  const [clientUsers, setClientUsers] = useState<{ user_id: string; nome: string | null; email: string | null }[]>([]);
  const [val, setVal] = useState<string>(ticket.pedido_por ?? "");

  useEffect(() => {
    setVal(ticket.pedido_por ?? "");
    if (!ticket.pedido_por) { setName("—"); return; }
    void supabase.from("profiles").select("nome, email").eq("user_id", ticket.pedido_por).maybeSingle()
      .then(({ data }) => setName(data?.nome || data?.email || "—"));
  }, [ticket.pedido_por]);

  useEffect(() => {
    if (!isAdmin || !editing) return;
    void (async () => {
      const { data: links } = await supabase.from("client_users").select("user_id").eq("client_id", ticket.client_id);
      const ids = (links ?? []).map((l) => l.user_id);
      if (ids.length === 0) { setClientUsers([]); return; }
      const { data: profs } = await supabase.from("profiles").select("user_id, nome, email").in("user_id", ids);
      setClientUsers((profs ?? []) as { user_id: string; nome: string | null; email: string | null }[]);
    })();
  }, [isAdmin, editing, ticket.client_id]);

  const save = async () => {
    const { error } = await supabase.from("tickets").update({ pedido_por: val || null }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Pedido por actualizado");
    setEditing(false);
    onChange();
  };

  return (
    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
      <span>Pedido por:</span>
      {!editing ? (
        <>
          <span className="text-foreground font-medium">{name}</span>
          {isAdmin && (
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1">
          <Select value={val || "_none_"} onValueChange={(v) => setVal(v === "_none_" ? "" : v)}>
            <SelectTrigger className="h-7 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">— Nenhum —</SelectItem>
              {clientUsers.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.nome ?? u.email ?? u.user_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={save}><Check className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setVal(ticket.pedido_por ?? ""); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ============== Ordem oficina (admin) ==============
function OrdemOficinaInline({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(ticket.num_ordem_oficina ?? "");

  useEffect(() => { setVal(ticket.num_ordem_oficina ?? ""); }, [ticket.num_ordem_oficina]);

  const save = async () => {
    const { error } = await supabase.from("tickets").update({ num_ordem_oficina: val.trim() || null }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Ordem oficina guardada");
    setEditing(false);
    onChange();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <Package className="h-3.5 w-3.5 text-muted-foreground" />
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Nº ordem" className="h-7 w-32" autoFocus />
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={save}><Check className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setVal(ticket.num_ordem_oficina ?? ""); setEditing(false); }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }
  return (
    <div className="text-sm">
      {ticket.num_ordem_oficina ? (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1">
          <Badge variant="secondary" className="cursor-pointer">
            <Package className="h-3 w-3 mr-1" /> Ordem #{ticket.num_ordem_oficina}
          </Badge>
        </button>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Package className="h-3 w-3" /> + Adicionar ordem oficina
        </button>
      )}
    </div>
  );
}

// ============== Credentials (admin only) ==============
interface Credencial {
  id: string;
  ticket_id: string;
  tipo: "email" | "vpn" | "windows" | "router" | "outro";
  utilizador: string | null;
  password: string;
  notas: string | null;
  created_at: string;
}

const TIPO_CRED_LABEL: Record<string, string> = { email: "Email", vpn: "VPN", windows: "Windows", router: "Router", outro: "Outro" };
const TIPO_CRED_CLS: Record<string, string> = {
  email: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  vpn: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  windows: "bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30",
  router: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  outro: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
};

function CredentialsPanel({ ticketId }: { ticketId: string }) {
  const { user } = useAuth();
  const [items, setItems] = useState<Credencial[]>([]);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Credencial | null>(null);

  const load = async () => {
    const { data } = await supabase.from("ticket_credenciais").select("*").eq("ticket_id", ticketId).order("created_at");
    setItems((data ?? []) as Credencial[]);
  };
  useEffect(() => { void load(); }, [ticketId]);

  const remove = async (id: string) => {
    if (!confirm("Apagar esta credencial?")) return;
    const { error } = await supabase.from("ticket_credenciais").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Credencial removida");
    void load();
  };

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (c: Credencial) => { setEditing(c); setOpen(true); };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5" /> Credenciais
        </h3>
        <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar credencial</Button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem credenciais registadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 pr-2">Tipo</th>
                <th className="text-left py-2 pr-2">Utilizador</th>
                <th className="text-left py-2 pr-2">Password</th>
                <th className="text-left py-2 pr-2">Notas</th>
                <th className="text-right py-2">Acções</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-2">
                    <Badge variant="outline" className={TIPO_CRED_CLS[c.tipo]}>{TIPO_CRED_LABEL[c.tipo]}</Badge>
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{c.utilizador || "—"}</td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">{reveal[c.id] ? c.password : "••••••••"}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setReveal((r) => ({ ...r, [c.id]: !r[c.id] }))}>
                        {reveal[c.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      {reveal[c.id] && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { void navigator.clipboard.writeText(c.password); toast.success("Copiado"); }}>
                          Copiar
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[240px] truncate">{c.notas || "—"}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => void remove(c.id)}><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CredentialDialog
        open={open}
        onOpenChange={setOpen}
        ticketId={ticketId}
        userId={user?.id}
        editing={editing}
        onSaved={() => { setOpen(false); void load(); }}
      />
    </Card>
  );
}

function CredentialDialog({ open, onOpenChange, ticketId, userId, editing, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId: string;
  userId: string | undefined;
  editing: Credencial | null;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<Credencial["tipo"]>("outro");
  const [utilizador, setUtilizador] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTipo(editing.tipo); setUtilizador(editing.utilizador ?? ""); setPassword(editing.password); setNotas(editing.notas ?? "");
    } else {
      setTipo("outro"); setUtilizador(""); setPassword(""); setNotas("");
    }
    setShowPw(false);
  }, [open, editing]);

  const gerarPw = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
    let p = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 12; i++) p += chars[arr[i] % chars.length];
    setPassword(p);
    setShowPw(true);
  };

  const save = async () => {
    if (!password.trim()) { toast.error("Password obrigatória"); return; }
    setBusy(true);
    try {
      if (editing) {
        const { error } = await supabase.from("ticket_credenciais")
          .update({ tipo, utilizador: utilizador.trim() || null, password, notas: notas.trim() || null })
          .eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("ticket_credenciais").insert({
          ticket_id: ticketId, tipo, utilizador: utilizador.trim() || null, password,
          notas: notas.trim() || null, created_by: userId ?? null,
        });
        if (error) throw error;
      }
      toast.success("Credencial guardada");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar credencial" : "Nova credencial"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as Credencial["tipo"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="vpn">VPN</SelectItem>
                <SelectItem value="windows">Windows</SelectItem>
                <SelectItem value="router">Router</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Utilizador / Email</Label>
            <Input value={utilizador} onChange={(e) => setUtilizador(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <div className="flex gap-2">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" onClick={gerarPw}>Gerar</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Ex: alterar após resolução" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============== Notes tabs ==============
function NotesTabsCard({
  ticket, comments, attachments, isAdmin, currentUserId, onOpenAttachment, onChange,
}: {
  ticket: Ticket;
  comments: Comment[];
  attachments: Attachment[];
  isAdmin: boolean;
  currentUserId: string | undefined;
  onOpenAttachment: (a: Attachment) => void | Promise<void>;
  onChange: () => void;
}) {
  const [isClientAdmin, setIsClientAdmin] = useState(false);

  useEffect(() => {
    if (!currentUserId || isAdmin) { setIsClientAdmin(false); return; }
    void supabase.from("client_users")
      .select("is_client_admin").eq("user_id", currentUserId).eq("client_id", ticket.client_id).maybeSingle()
      .then(({ data }) => setIsClientAdmin(!!data?.is_client_admin));
  }, [currentUserId, ticket.client_id, isAdmin]);

  const showSharedTab = isAdmin || isClientAdmin;

  return (
    <Card className="p-4">
      <Tabs defaultValue="conversa">
        <TabsList>
          <TabsTrigger value="conversa">Conversa</TabsTrigger>
          {isAdmin && <TabsTrigger value="internas">Notas internas</TabsTrigger>}
          {showSharedTab && <TabsTrigger value="partilhado">Partilhado com cliente</TabsTrigger>}
        </TabsList>

        <TabsContent value="conversa" className="mt-4">
          <CommentList
            comments={comments}
            attachments={attachments}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            onOpenAttachment={onOpenAttachment}
          />
          <div className="mt-4 pt-4 border-t">
            <NewCommentForm ticketId={ticket.id} clientId={ticket.client_id} isAdmin={isAdmin} onSent={onChange} />
          </div>
        </TabsContent>

        {isAdmin && (
          <TabsContent value="internas" className="mt-4">
            <InternalNotesPanel ticket={ticket} onChange={onChange} />
          </TabsContent>
        )}

        {showSharedTab && (
          <TabsContent value="partilhado" className="mt-4">
            <SharedChecklistPanel ticketId={ticket.id} canEdit={isAdmin} />
          </TabsContent>
        )}
      </Tabs>
    </Card>
  );
}

function InternalNotesPanel({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const [val, setVal] = useState(ticket.internal_notes ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(ticket.internal_notes ?? ""); }, [ticket.internal_notes]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("tickets").update({ internal_notes: val }).eq("id", ticket.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Notas internas guardadas");
    onChange();
  };

  return (
    <div className="space-y-2">
      <Textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={10}
        placeholder="Notas internas — só visíveis pela equipa VRCF"
        className="bg-yellow-500/5 border-yellow-500/30 focus-visible:ring-yellow-500/30"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={busy}>Guardar</Button>
      </div>
    </div>
  );
}

interface NotaPartilhada {
  id: string;
  descricao: string;
  concluida: boolean;
  concluida_em: string | null;
  ordem: number;
}

function SharedChecklistPanel({ ticketId, canEdit }: { ticketId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const [items, setItems] = useState<NotaPartilhada[]>([]);
  const [novo, setNovo] = useState("");

  const load = async () => {
    const { data } = await supabase.from("ticket_notas_partilhadas")
      .select("id, descricao, concluida, concluida_em, ordem")
      .eq("ticket_id", ticketId).order("ordem").order("created_at");
    setItems((data ?? []) as NotaPartilhada[]);
  };
  useEffect(() => { void load(); }, [ticketId]);

  const add = async (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    const maxOrdem = items.reduce((m, i) => Math.max(m, i.ordem), 0);
    const { error } = await supabase.from("ticket_notas_partilhadas").insert({
      ticket_id: ticketId, descricao: t, ordem: maxOrdem + 1, created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    setNovo("");
    void load();
  };

  const toggle = async (it: NotaPartilhada) => {
    const novoVal = !it.concluida;
    const { error } = await supabase.from("ticket_notas_partilhadas")
      .update({ concluida: novoVal, concluida_em: novoVal ? new Date().toISOString() : null })
      .eq("id", it.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const editDesc = async (id: string, descricao: string) => {
    const { error } = await supabase.from("ticket_notas_partilhadas").update({ descricao }).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("ticket_notas_partilhadas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const total = items.length;
  const done = items.filter((i) => i.concluida).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-3">
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{done} de {total} concluídos</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <ul className="space-y-1.5">
        {items.map((it) => (
          <ChecklistRow key={it.id} item={it} canEdit={canEdit} onToggle={() => void toggle(it)} onEdit={(d) => void editDesc(it.id, d)} onRemove={() => void remove(it.id)} />
        ))}
        {items.length === 0 && <li className="text-sm text-muted-foreground">Sem itens.</li>}
      </ul>

      {canEdit && (
        <div className="flex gap-2 pt-2 border-t">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(novo); } }}
            placeholder="Novo item — ENTER para adicionar"
          />
          <Button size="sm" onClick={() => void add(novo)} disabled={!novo.trim()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item, canEdit, onToggle, onEdit, onRemove }: {
  item: NotaPartilhada;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: (d: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.descricao);
  useEffect(() => { setVal(item.descricao); }, [item.descricao]);

  return (
    <li className="flex items-center gap-2 group">
      <Checkbox checked={item.concluida} onCheckedChange={onToggle} />
      {editing && canEdit ? (
        <>
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onEdit(val); setEditing(false); }
              if (e.key === "Escape") { setVal(item.descricao); setEditing(false); }
            }}
            className="h-8 flex-1"
            autoFocus
          />
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { onEdit(val); setEditing(false); }}>
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setVal(item.descricao); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </>
      ) : (
        <>
          <span
            className={`flex-1 text-sm ${item.concluida ? "line-through text-muted-foreground" : ""} ${canEdit ? "cursor-text" : ""}`}
            onClick={() => canEdit && setEditing(true)}
          >
            {item.descricao}
          </span>
          {item.concluida_em && (
            <span className="text-xs text-muted-foreground">{formatDateTime(item.concluida_em)}</span>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive" onClick={onRemove}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}
    </li>
  );
}
