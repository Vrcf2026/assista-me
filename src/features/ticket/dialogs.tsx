import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { TIPO_LABELS } from "@/lib/format";
import { notifyTicketFechado, notifyTicketSatisfacao } from "@/lib/email/notify-ticket-event";
import type { Ticket } from "./types";

export function EscalateDialog({
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

export function HeaderEscalateDialog({
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

export function CloseDialog({
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
