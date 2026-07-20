import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { formatDateTime } from "@/lib/format";
import { notifyNovoComentario } from "@/lib/email/notify-ticket-event";
import { notifyAdminNovoComentarioCliente } from "@/lib/email/notify-admin";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Lock, Paperclip, Clock, MessageSquare, Send } from "lucide-react";
import type { Comment, Attachment } from "./types";

export function CommentList({
  comments, attachments, isAdmin, isClientAdmin, currentUserId, onOpenAttachment,
}: {
  comments: Comment[];
  attachments: Attachment[];
  isAdmin: boolean;
  isClientAdmin: boolean;
  currentUserId: string | undefined;
  onOpenAttachment: (attachment: Attachment) => void | Promise<void>;
}) {
  const visible = comments.filter((c) => {
    if (isAdmin) return true;
    if (c.is_internal) return false;
    if (c.client_admin_only && !isClientAdmin) return false;
    return true;
  });
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
          : c.client_admin_only
            ? "bg-amber-500/10 border-amber-500/30"
            : own
              ? "bg-primary/10 border-primary/20"
              : "bg-secondary border-border";
        const label = own
          ? "Eu"
          : c.is_internal
            ? "Nota interna"
            : c.client_admin_only
              ? "Mensagem (só admin)"
              : "Mensagem";
        return (
          <li key={c.id} className={`border rounded-md p-3 ${baseCls}`}>
            <div className="flex items-center justify-between gap-2 text-xs mb-1">
              <span className="font-medium flex items-center gap-1">
                {c.is_internal && <Lock className="h-3 w-3" />}
                {!c.is_internal && c.client_admin_only && <Lock className="h-3 w-3 text-amber-600" />}
                {label}
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
            {isAdmin && !c.is_internal && !c.client_admin_only && c.user_id !== currentUserId && c.visto_em && (
              <p className="text-xs text-muted-foreground mt-1 italic">
                Visto pelo cliente às {formatDateTime(c.visto_em)}
              </p>
            )}
            {isAdmin && !c.is_internal && !c.client_admin_only && c.user_id === currentUserId && (
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

export function NewCommentForm({
  ticketId, clientId, isAdmin, isClientAdmin, onSent,
}: {
  ticketId: string;
  clientId: string;
  isAdmin: boolean;
  isClientAdmin: boolean;
  onSent: () => void;
}) {
  const { user } = useAuth();
  const [mensagem, setMensagem] = useState("");
  const [internal, setInternal] = useState(false);
  const [adminOnly, setAdminOnly] = useState(false);
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
      const sendAdminOnly = !sendInternal && (isAdmin || isClientAdmin) && adminOnly;
      const { data: comment, error } = await supabase
        .from("comments").insert({
          ticket_id: ticketId,
          user_id: user.id,
          mensagem,
          is_internal: sendInternal,
          client_admin_only: sendAdminOnly,
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
        if (isAdmin && !sendInternal && !sendAdminOnly) {
          void notifyNovoComentario(ticketLite, mensagem, "Equipa VRCF", comment.id);
        }
        if (!isAdmin) {
          const clientName = (t as unknown as { client?: { nome?: string } }).client?.nome ?? "Cliente";
          void notifyAdminNovoComentarioCliente(
            { id: t.id, numero: t.numero, titulo: t.titulo },
            clientName,
            mensagem,
            comment.id,
          );
        }
      }

      setMensagem(""); setFiles([]); setInternal(false); setAdminOnly(false);
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
        placeholder={isAdmin && internal ? "Nota interna (não visível pelo cliente)…" : adminOnly ? "Mensagem visível só para VRCF e admins do cliente…" : "Escreva uma mensagem…"}
        rows={3}
        className={isAdmin && internal ? "bg-internal-note" : adminOnly ? "bg-amber-500/5" : ""}
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
              <Checkbox checked={internal} onCheckedChange={(v) => { setInternal(!!v); if (v) setAdminOnly(false); }} />
              <Lock className="h-3.5 w-3.5" /> Nota interna
            </label>
          )}
          {(isAdmin || isClientAdmin) && (
            <label className="flex items-center gap-2 text-sm cursor-pointer" title="Visível apenas para VRCF e admins do cliente">
              <Checkbox checked={adminOnly} disabled={internal} onCheckedChange={(v) => setAdminOnly(!!v)} />
              <Lock className="h-3.5 w-3.5 text-amber-600" /> Partilhar só com admin
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
