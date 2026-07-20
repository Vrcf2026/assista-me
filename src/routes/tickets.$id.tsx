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
import { ArrowLeft, Lock, Paperclip, Send, MessageSquare, Clock, FileText, Download, Plus, Trash2, KeyRound, Check, X, Pencil, Package } from "lucide-react";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";

import { Badge } from "@/components/ui/badge";
import { gerarRelatorioTicketCliente, gerarRelatorioTicketInterno } from "@/lib/pdf";
import { OrcamentosPanel } from "@/components/OrcamentosPanel";
import { ClientInfoPanel } from "@/components/ClientInfoPanel";
import { CredentialsPanel } from "@/features/ticket/CredentialsPanel";
import { EscalateDialog, HeaderEscalateDialog, CloseDialog } from "@/features/ticket/dialogs";
import { CommentList, NewCommentForm } from "@/features/ticket/Conversation";
import { notifyNovoComentario, notifyTicketFechado, notifyTicketSatisfacao } from "@/lib/email/notify-ticket-event";
import { notifyAdminNovoComentarioCliente, notifyAdminCredencialFornecida } from "@/lib/email/notify-admin";

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

import type { Ticket, Comment, Escalation, Attachment } from "@/features/ticket/types";


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
    if (!user?.id || isAdmin || !ticket?.client_id) { setIsClientAdmin(false); return; }
    void supabase.from("client_users")
      .select("is_client_admin").eq("user_id", user.id).eq("client_id", ticket.client_id).maybeSingle()
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

      {/* Informações do cliente (AnyDesk, contactos, notas) — só admin */}
      {isAdmin && <ClientInfoPanel clientId={ticket.client_id} canEdit compact />}

      {/* Credenciais seguras — admin VRCF e admin do cliente */}
      {(isAdmin || isClientAdmin) && <CredentialsPanel ticketId={ticket.id} isAdmin={isAdmin} ticketNumero={ticket.numero} ticketTitulo={ticket.titulo} clienteNome={ticket.client?.nome ?? "Cliente"} />}

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
        isClientAdmin={isClientAdmin}
        currentUserId={user?.id}
        onOpenAttachment={openAttachment}
        onChange={load}
      />

      <OrcamentosPanel
        ticket={{ id: ticket.id, numero: ticket.numero, titulo: ticket.titulo, client_id: ticket.client_id, created_by: (ticket as any).created_by ?? null }}
        isAdmin={isAdmin}
        isClienteAdmin={isClientAdmin}
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


// ============== Comments ==============

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


// ============== Conversation card ==============
function NotesTabsCard({
  ticket, comments, attachments, isAdmin, isClientAdmin, currentUserId, onOpenAttachment, onChange,
}: {
  ticket: Ticket;
  comments: Comment[];
  attachments: Attachment[];
  isAdmin: boolean;
  isClientAdmin: boolean;
  currentUserId: string | undefined;
  onOpenAttachment: (a: Attachment) => void | Promise<void>;
  onChange: () => void;
}) {
  return (
    <Card className="p-4 space-y-4">
      <h3 className="text-sm font-semibold">💬 Conversação</h3>
      <CommentList
        comments={comments}
        attachments={attachments}
        isAdmin={isAdmin}
        isClientAdmin={isClientAdmin}
        currentUserId={currentUserId}
        onOpenAttachment={onOpenAttachment}
      />
      <div className="pt-4 border-t">
        <NewCommentForm
          ticketId={ticket.id}
          clientId={ticket.client_id}
          isAdmin={isAdmin}
          isClientAdmin={isClientAdmin}
          onSent={onChange}
        />
      </div>
    </Card>
  );
}

