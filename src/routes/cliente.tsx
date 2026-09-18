import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Ticket, MessageSquare, Plus, Camera, Bell, BellOff,
  ChevronRight, ArrowLeft, Send, Loader2, Clock,
  CheckCircle2, AlertCircle, HelpCircle,
} from "lucide-react";
import { usePushNotifications } from "@/hooks/use-push-notifications";

export const Route = createFileRoute("/cliente" as any)({
  component: ClientePWA,
});

// ── Tipos ──────────────────────────────────────────────────────────────────────
type Tab = "tickets" | "novo" | "ticket_detalhe";

const ESTADO_CONFIG: Record<string, { label: string; icon: typeof Ticket; cls: string }> = {
  aberto: { label: "Aberto", icon: AlertCircle, cls: "text-blue-500" },
  em_progresso: { label: "Em progresso", icon: Loader2, cls: "text-amber-500" },
  aguarda_cliente: { label: "Aguarda resposta", icon: HelpCircle, cls: "text-purple-500" },
  fechado: { label: "Resolvido", icon: CheckCircle2, cls: "text-emerald-500" },
};

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("pt-PT", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ── Componente principal ───────────────────────────────────────────────────────
function ClientePWA() {
  const { user, role, loading } = useAuth();
  const [tab, setTab] = useState<Tab>("tickets");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <div className="text-center space-y-2">
          <div className="h-14 w-14 rounded-2xl bg-primary flex items-center justify-center mx-auto">
            <Ticket className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="text-xl font-semibold">VRCF Suporte</h1>
          <p className="text-sm text-muted-foreground">Acede à tua conta para ver os teus tickets</p>
        </div>
        <Button asChild className="w-full max-w-xs">
          <Link to="/login">Entrar</Link>
        </Button>
      </div>
    );
  }

  // Se for admin, redirecionar para a app completa
  if (role === "admin") {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-muted-foreground">Estás como administrador.</p>
        <Button asChild><Link to="/">Ir para a app completa</Link></Button>
        <Button variant="outline" asChild><Link to={"/tecnico" as any}>Vista técnico</Link></Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen max-w-md mx-auto bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        {tab === "ticket_detalhe" || tab === "novo" ? (
          <button onClick={() => setTab("tickets")} className="text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-5 w-5" />
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded-lg bg-primary flex items-center justify-center">
              <Ticket className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-semibold text-sm">Suporte VRCF</span>
          </div>
        )}
        <div className="flex items-center gap-2">
          <PushBell />
          {tab === "tickets" && (
            <Button size="sm" onClick={() => setTab("novo")} className="h-8 gap-1">
              <Plus className="h-3.5 w-3.5" /> Novo
            </Button>
          )}
        </div>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto">
        {tab === "tickets" && (
          <TabListaTickets onOpen={(id) => { setSelectedTicketId(id); setTab("ticket_detalhe"); }} />
        )}
        {tab === "novo" && (
          <TabNovoTicket onCreated={() => setTab("tickets")} />
        )}
        {tab === "ticket_detalhe" && selectedTicketId && (
          <TabDetalheTicket ticketId={selectedTicketId} />
        )}
      </div>
    </div>
  );
}

// ── Push Bell ─────────────────────────────────────────────────────────────────
function PushBell() {
  const { status, subscribe, unsubscribe } = usePushNotifications();
  if (status === "unsupported" || status === "loading") return null;
  return (
    <button
      onClick={status === "granted" ? unsubscribe : subscribe}
      className={`p-1.5 rounded-lg transition-colors ${status === "granted" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
      title={status === "granted" ? "Notificações activas" : "Activar notificações"}
    >
      {status === "granted" ? <Bell className="h-5 w-5" /> : <BellOff className="h-5 w-5" />}
    </button>
  );
}

// ── Tab: Lista de tickets ─────────────────────────────────────────────────────
function TabListaTickets({ onOpen }: { onOpen: (id: string) => void }) {
  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["cliente-tickets"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from("tickets")
        .select("id, numero, titulo, estado, prioridade, created_at, updated_at")
        .order("updated_at", { ascending: false })
        .limit(30);
      return data ?? [];
    },
  });

  if (isLoading) return (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  if (!tickets.length) return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center gap-3">
      <Ticket className="h-12 w-12 text-muted-foreground/40" />
      <p className="font-medium">Sem tickets</p>
      <p className="text-sm text-muted-foreground">Clica em "Novo" para pedir ajuda</p>
    </div>
  );

  const abertos = tickets.filter(t => t.estado !== "fechado");
  const fechados = tickets.filter(t => t.estado === "fechado");

  return (
    <div className="p-3 space-y-4">
      {abertos.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Em andamento</p>
          {abertos.map(t => <TicketCard key={t.id} ticket={t} onOpen={onOpen} />)}
        </div>
      )}
      {fechados.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Resolvidos</p>
          {fechados.map(t => <TicketCard key={t.id} ticket={t} onOpen={onOpen} />)}
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket, onOpen }: { ticket: any; onOpen: (id: string) => void }) {
  const cfg = ESTADO_CONFIG[ticket.estado] ?? ESTADO_CONFIG.aberto;
  const Icon = cfg.icon;
  return (
    <button
      onClick={() => onOpen(ticket.id)}
      className="w-full text-left p-4 rounded-2xl border bg-card hover:bg-secondary/30 transition-colors"
    >
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${cfg.cls}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-0.5">
            <span className="text-xs font-mono text-muted-foreground">#{String(ticket.numero).padStart(5, "0")}</span>
            <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
          </div>
          <p className="text-sm font-medium leading-snug">{ticket.titulo}</p>
          <p className="text-xs text-muted-foreground mt-1">{formatDate(ticket.updated_at)}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
      </div>
    </button>
  );
}

// ── Tab: Novo ticket ──────────────────────────────────────────────────────────
function TabNovoTicket({ onCreated }: { onCreated: () => void }) {
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [tipo, setTipo] = useState("remota");
  const [uploading, setUploading] = useState(false);
  const [fotosIds, setFotosIds] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFoto = async (file: File) => {
    setUploading(true);
    try {
      const path = `temp/${Date.now()}_${file.name}`;
      const { error } = await supabase.storage.from("ticket-attachments").upload(path, file);
      if (!error) { setFotosIds(prev => [...prev, path]); toast.success("Foto adicionada"); }
    } catch { toast.error("Erro ao enviar foto"); }
    finally { setUploading(false); }
  };

  const submit = async () => {
    if (!titulo.trim()) { toast.error("Descreve o problema"); return; }
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sem sessão");

      const { data: clientLink } = await supabase
        .from("client_users")
        .select("client_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();

      if (!clientLink) throw new Error("Conta não associada a nenhum cliente. Contacta a VRCF.");

      const clientId = String(clientLink.client_id ?? "");
      const { data: ticket, error } = await supabase.from("tickets").insert(({
        titulo: titulo.trim(),
        descricao: descricao.trim() || null,
        client_id: clientId,
        prioridade: "media",
        estado: "aberto",
        tipo_intervencao: tipo as any,
        pedido_por: user.id,
      }) as any).select("id, numero").single();

      if (error) throw error;
      toast.success(`Ticket #${String((ticket as any).numero).padStart(5,"0")} criado!`);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar ticket");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Descreve o problema</p>
        <Input
          value={titulo}
          onChange={e => setTitulo(e.target.value)}
          placeholder="ex: Impressora não funciona, Email não abre…"
          className="h-12 text-base"
          autoFocus
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Mais detalhes (opcional)</p>
        <Textarea
          value={descricao}
          onChange={e => setDescricao(e.target.value)}
          placeholder="Quando começou? O que tentaste fazer? Aparece alguma mensagem de erro?"
          rows={4}
          className="text-sm resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo de suporte</p>
        <Select value={tipo} onValueChange={setTipo}>
          <SelectTrigger className="h-11">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="remota">💻 Remotamente (via TeamViewer)</SelectItem>
            <SelectItem value="presencial">🚗 Presencial (técnico deslocação)</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Adicionar foto */}
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Foto do ecrã (opcional)</p>
        <button
          onClick={() => fileRef.current?.click()}
          className="w-full flex items-center justify-center gap-2 p-4 rounded-xl border-2 border-dashed text-sm text-muted-foreground hover:bg-secondary/30 transition-colors"
        >
          <Camera className="h-5 w-5" />
          {uploading ? "A enviar…" : fotosIds.length > 0 ? `${fotosIds.length} foto(s) adicionada(s)` : "Tirar foto ou escolher da galeria"}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) void handleFoto(f); }}
        />
      </div>

      <Button
        onClick={submit}
        disabled={busy || !titulo.trim()}
        className="w-full h-12 text-base"
      >
        {busy ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> A enviar…</> : "Pedir ajuda"}
      </Button>

      <p className="text-xs text-muted-foreground text-center">
        Recebes uma notificação quando o técnico responder.
      </p>
    </div>
  );
}

// ── Tab: Detalhe do ticket ────────────────────────────────────────────────────
function TabDetalheTicket({ ticketId }: { ticketId: string }) {
  const qc = useQueryClient();
  const [mensagem, setMensagem] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: ticket } = useQuery({
    queryKey: ["cliente-ticket", ticketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("tickets")
        .select("id, numero, titulo, estado, descricao, created_at")
        .eq("id", ticketId)
        .single();
      return data;
    },
  });

  const { data: comments = [] } = useQuery({
    queryKey: ["cliente-comments", ticketId],
    refetchInterval: 15000, // polling 15s para actualizações
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      const { data } = await supabase
        .from("comments")
        .select("id, mensagem, created_at, user_id, is_internal")
        .eq("ticket_id", ticketId)
        .eq("is_internal", false)
        .order("created_at");
      return (data ?? []).map(c => ({
        ...c,
        isMine: c.user_id === user?.id,
      }));
    },
  });

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [comments]);

  const enviar = async () => {
    if (!mensagem.trim()) return;
    setSending(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase.from("comments").insert({
        ticket_id: ticketId,
        user_id: user?.id ?? "",
        mensagem: mensagem.trim(),
        is_internal: false,
      });
      if (error) throw error;
      setMensagem("");
      qc.invalidateQueries({ queryKey: ["cliente-comments", ticketId] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao enviar");
    } finally {
      setSending(false);
    }
  };

  const cfg = ticket ? (ESTADO_CONFIG[ticket.estado] ?? ESTADO_CONFIG.aberto) : null;

  return (
    <div className="flex flex-col h-full">
      {/* Info do ticket */}
      {ticket && (
        <div className="px-4 pt-3 pb-3 border-b space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-mono text-muted-foreground">#{String((ticket as any).numero).padStart(5,"0")}</span>
            {cfg && (
              <span className={`text-xs font-medium ${cfg.cls}`}>{cfg.label}</span>
            )}
          </div>
          <p className="text-sm font-semibold leading-snug">{ticket.titulo}</p>
          {ticket.descricao && (
            <p className="text-xs text-muted-foreground line-clamp-2">{ticket.descricao}</p>
          )}
        </div>
      )}

      {/* Conversa */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {comments.length === 0 && (
          <div className="text-center py-8">
            <MessageSquare className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">O técnico vai responder em breve</p>
          </div>
        )}
        {comments.map((c: any) => (
          <div key={c.id} className={`flex ${c.isMine ? "justify-end" : "justify-start"}`}>
            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${
              c.isMine
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-secondary rounded-bl-sm"
            }`}>
              {!c.isMine && (
                <p className="text-[10px] font-semibold text-muted-foreground mb-0.5">VRCF Suporte</p>
              )}
              <p className="text-sm leading-relaxed whitespace-pre-wrap">{c.mensagem}</p>
              <p className={`text-[10px] mt-1 ${c.isMine ? "text-primary-foreground/60" : "text-muted-foreground"}`}>
                {formatDate(c.created_at)}
              </p>
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input de mensagem */}
      {ticket?.estado !== "fechado" && (
        <div className="border-t p-3 flex gap-2 bg-background">
          <Input
            value={mensagem}
            onChange={e => setMensagem(e.target.value)}
            placeholder="Escreve uma mensagem…"
            className="flex-1 h-10"
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && !sending && void enviar()}
          />
          <Button
            onClick={enviar}
            disabled={!mensagem.trim() || sending}
            size="icon"
            className="h-10 w-10 shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      )}
      {ticket?.estado === "fechado" && (
        <div className="border-t p-3 text-center">
          <p className="text-xs text-muted-foreground flex items-center justify-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> Ticket resolvido
          </p>
        </div>
      )}
    </div>
  );
}
