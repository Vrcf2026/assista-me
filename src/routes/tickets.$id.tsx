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
import { StatusBadge, PriorityBadge, TipoBadge } from "@/components/StatusBadge";
import { SlaBadge } from "@/components/SlaBadge";
import {
  formatTicketNumber, formatDateTime, formatCurrency, formatMinutes,
  roundMinutes, calcValor, ESTADO_LABELS, MOTIVO_FECHO_LABELS, TIPO_LABELS,
} from "@/lib/format";
import { toast } from "sonner";
import { ArrowLeft, Lock, Paperclip, Send } from "lucide-react";
import { notifyNovoComentario, notifyTicketFechado } from "@/lib/email/notify-ticket-event";

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
  tipo_intervencao: "remota" | "presencial" | "critica";
  tecnico_responsavel: string | null;
  tempo_gasto_minutos: number;
  solucao_aplicada: string | null;
  motivo_fecho: string | null;
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
      <Button asChild variant="ghost" size="sm">
        <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
      </Button>

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

      {/* Original (non-comment) attachments */}
      {attachments.filter((a) => !a.comment_id && (isAdmin || !a.is_internal)).length > 0 && (
        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Anexos do ticket</h3>
          <ul className="space-y-1">
            {attachments.filter((a) => !a.comment_id && (isAdmin || !a.is_internal)).map((a) => (
              <li key={a.id}>
                <a href={a.file_url} target="_blank" rel="noopener" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
                  <Paperclip className="h-3.5 w-3.5" /> {a.file_name}
                </a>
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

      {/* Conversation */}
      <Card className="p-4">
        <h3 className="text-sm font-semibold mb-3">Conversação</h3>
        <CommentList
          comments={comments}
          attachments={attachments}
          isAdmin={isAdmin}
          currentUserId={user?.id}
        />
        <div className="mt-4 pt-4 border-t">
          <NewCommentForm ticketId={id} isAdmin={isAdmin} onSent={load} />
        </div>
      </Card>
    </div>
  );
}

// ============== Admin panel ==============
function AdminPanel({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const [tecnico, setTecnico] = useState(ticket.tecnico_responsavel ?? "");
  const [prio, setPrio] = useState(ticket.prioridade);
  const [estado, setEstado] = useState(ticket.estado);
  const [tipo, setTipo] = useState(ticket.tipo_intervencao);
  const [tempoInput, setTempoInput] = useState("");
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

  const addTempo = async () => {
    const min = Number(tempoInput);
    if (!min || min <= 0) return;
    const rounded = roundMinutes(min, ticket.tipo_intervencao);
    const newTotal = ticket.tempo_gasto_minutos + rounded;
    const { error } = await supabase.from("tickets")
      .update({ tempo_gasto_minutos: newTotal }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success(`+${rounded} min adicionados (arredondado)`);
    setTempoInput("");
    onChange();
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
              <SelectItem value="critica">Crítica (SLA 8h úteis)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={saveBasics} disabled={busy}>Guardar</Button>
      </div>

      <div className="border-t mt-4 pt-4">
        <Label className="text-xs">Adicionar tempo (minutos)</Label>
        <div className="flex items-center gap-2 mt-1.5 max-w-md">
          <Input type="number" min={1} value={tempoInput} onChange={(e) => setTempoInput(e.target.value)} placeholder="ex: 25" />
          <Button onClick={addTempo} size="sm">Adicionar</Button>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Arredondamento automático conforme o tipo (5min remota / mín 45min presencial).
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
      const { error: e1 } = await supabase.from("ticket_escalations").insert({
        ticket_id: ticket.id,
        tipo_anterior: ticket.tipo_intervencao,
        tipo_novo: novoTipo,
        motivo,
      });
      if (e1) throw e1;
      const { error: e2 } = await supabase.from("tickets")
        .update({ tipo_intervencao: novoTipo }).eq("id", ticket.id);
      if (e2) throw e2;
      toast.success("Tipo de intervenção atualizado");
      onOpenChange(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onCancel(); onOpenChange(v); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Alterar tipo de intervenção</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <p className="text-sm">
            <span className="font-medium">{TIPO_LABELS[ticket.tipo_intervencao]}</span> → <span className="font-medium">{TIPO_LABELS[novoTipo]}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Motivo *</Label>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} required rows={3} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { onCancel(); onOpenChange(false); }}>Cancelar</Button>
            <Button type="submit" disabled={busy || !motivo.trim()}>Confirmar</Button>
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
  comments, attachments, isAdmin, currentUserId,
}: {
  comments: Comment[];
  attachments: Attachment[];
  isAdmin: boolean;
  currentUserId: string | undefined;
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
                    <a href={a.file_url} target="_blank" rel="noopener" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
                      <Paperclip className="h-3 w-3" /> {a.file_name}
                    </a>
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
  ticketId, isAdmin, onSent,
}: {
  ticketId: string;
  isAdmin: boolean;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const [mensagem, setMensagem] = useState("");
  const [internal, setInternal] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

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
        const { data: pub } = supabase.storage.from("ticket-attachments").getPublicUrl(path);
        await supabase.from("attachments").insert({
          ticket_id: ticketId,
          comment_id: comment.id,
          uploaded_by: user.id,
          file_url: pub.publicUrl,
          file_name: f.name,
          file_size: f.size,
          mime_type: f.type,
          is_internal: isAdmin && internal,
        });
      }

      setMensagem(""); setFiles([]); setInternal(false);
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
        </div>
        <Button type="submit" disabled={busy || !mensagem.trim()}>
          <Send className="h-4 w-4 mr-1" /> Enviar
        </Button>
      </div>
    </form>
  );
}
