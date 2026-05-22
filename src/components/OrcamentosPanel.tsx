import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Trash2, Download, Pencil, Check, X, FileText } from "lucide-react";
import { formatCurrency, formatDate } from "@/lib/format";
import { gerarOrcamentoPDF } from "@/lib/pdf";
import { notifyNovoComentario } from "@/lib/email/notify-ticket-event";
import { notifyAdminNovoComentarioCliente } from "@/lib/email/notify-admin";

interface TicketLite {
  id: string;
  numero: number;
  titulo: string;
  client_id: string;
  created_by: string | null;
}

interface Orcamento {
  id: string;
  ticket_id: string;
  versao: number;
  estado: "pendente" | "aprovado" | "recusado";
  validade: string | null;
  notas: string | null;
  observacao_resposta: string | null;
  respondido_em: string | null;
  created_at: string;
}

interface Item {
  id: string;
  orcamento_id: string;
  ordem: number;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

interface ItemDraft {
  id?: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
}

function estadoBadge(estado: Orcamento["estado"]) {
  if (estado === "aprovado") return <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 border" variant="outline">Aprovado</Badge>;
  if (estado === "recusado") return <Badge className="bg-destructive/15 text-destructive border-destructive/30 border" variant="outline">Recusado</Badge>;
  return <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30 border" variant="outline">Pendente</Badge>;
}

function totalDe(itens: Pick<Item, "quantidade" | "valor_unitario">[]) {
  return itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario), 0);
}

export function OrcamentosPanel({ ticket, isAdmin, isClienteAdmin }: { ticket: TicketLite; isAdmin: boolean; isClienteAdmin?: boolean }) {
  const [orcamentos, setOrcamentos] = useState<Orcamento[]>([]);
  const [itensByOrc, setItensByOrc] = useState<Record<string, Item[]>>({});
  const [loading, setLoading] = useState(true);

  // editor
  const [editing, setEditing] = useState<Orcamento | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);

  // client viewer
  const [viewing, setViewing] = useState<Orcamento | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: orcs } = await supabase
      .from("ticket_orcamentos")
      .select("*")
      .eq("ticket_id", ticket.id)
      .order("versao", { ascending: false });
    const list = (orcs ?? []) as Orcamento[];
    setOrcamentos(list);
    if (list.length) {
      const { data: itens } = await supabase
        .from("ticket_orcamento_itens")
        .select("*")
        .in("orcamento_id", list.map((o) => o.id))
        .order("ordem");
      const map: Record<string, Item[]> = {};
      (itens ?? []).forEach((i: any) => {
        (map[i.orcamento_id] ||= []).push(i as Item);
      });
      setItensByOrc(map);
    } else {
      setItensByOrc({});
    }
    setLoading(false);
  }, [ticket.id]);

  useEffect(() => { void load(); }, [load]);

  const novo = async () => {
    const versao = (orcamentos[0]?.versao ?? 0) + 1;
    const validade = new Date(); validade.setDate(validade.getDate() + 15);
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("ticket_orcamentos").insert({
      ticket_id: ticket.id,
      versao,
      validade: validade.toISOString().slice(0, 10),
      created_by: user?.id,
    }).select().single();
    if (error) return toast.error(error.message);
    setEditing(data as Orcamento);
    setEditorOpen(true);
    void load();
  };

  const editar = (o: Orcamento) => { setEditing(o); setEditorOpen(true); };

  const apagar = async (o: Orcamento) => {
    if (!confirm(`Apagar orçamento v${o.versao}?`)) return;
    const { error } = await supabase.from("ticket_orcamentos").delete().eq("id", o.id);
    if (error) return toast.error(error.message);
    toast.success("Orçamento apagado");
    void load();
  };

  const exportar = async (o: Orcamento) => {
    try {
      await gerarOrcamentoPDF(o.id);
      toast.success("PDF gerado");
    } catch (e: any) { toast.error(e.message); }
  };

  if (loading) return null;
  if (!isAdmin && orcamentos.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">💰 Orçamentos</h3>
        {isAdmin && (
          <Button size="sm" onClick={novo}><Plus className="h-4 w-4 mr-1" />Novo orçamento</Button>
        )}
      </div>

      {orcamentos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem orçamentos.</p>
      ) : (
        <div className="border rounded-md divide-y">
          {orcamentos.map((o) => {
            const itens = itensByOrc[o.id] ?? [];
            const total = totalDe(itens);
            return (
              <div key={o.id} className="p-3 flex items-center gap-3">
                <div className="font-mono text-sm font-semibold w-12">v{o.versao}</div>
                <div className="text-xs text-muted-foreground w-24">{formatDate(o.created_at)}</div>
                <div className="w-24">{estadoBadge(o.estado)}</div>
                <div className="flex-1 font-semibold">{formatCurrency(total)}</div>
                <div className="flex gap-1">
                  {isAdmin ? (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => editar(o)}><Pencil className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => exportar(o)}><Download className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => apagar(o)}><Trash2 className="h-4 w-4" /></Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" variant="outline" onClick={() => setViewing(o)}>Ver</Button>
                      <Button size="sm" variant="ghost" onClick={() => exportar(o)}><Download className="h-4 w-4" /></Button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <OrcamentoEditor
          open={editorOpen}
          onOpenChange={(v) => { setEditorOpen(v); if (!v) setEditing(null); }}
          orcamento={editing}
          ticket={ticket}
          initialItens={itensByOrc[editing.id] ?? []}
          onSaved={() => { void load(); }}
        />
      )}

      {viewing && (
        <OrcamentoClientView
          open={!!viewing}
          onOpenChange={(v) => { if (!v) setViewing(null); }}
          orcamento={viewing}
          itens={itensByOrc[viewing.id] ?? []}
          ticket={ticket}
          onChanged={() => { void load(); setViewing(null); }}
        />
      )}
    </Card>
  );
}

// ============ Editor (admin) ============
function OrcamentoEditor({
  open, onOpenChange, orcamento, ticket, initialItens, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orcamento: Orcamento;
  ticket: TicketLite;
  initialItens: Item[];
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [validade, setValidade] = useState<string>(orcamento.validade ?? "");
  const [notas, setNotas] = useState<string>(orcamento.notas ?? "");
  const [itens, setItens] = useState<ItemDraft[]>(() => {
    if (initialItens.length) {
      return initialItens.map((i) => ({
        id: i.id, descricao: i.descricao,
        quantidade: Number(i.quantidade), valor_unitario: Number(i.valor_unitario),
      }));
    }
    return [{ descricao: "", quantidade: 1, valor_unitario: 0 }];
  });
  const [saving, setSaving] = useState(false);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const total = totalDe(itens);

  const addLinha = () => {
    setItens((prev) => [...prev, { descricao: "", quantidade: 1, valor_unitario: 0 }]);
    setTimeout(() => {
      const last = Object.keys(inputsRef.current).filter((k) => k.startsWith("desc-")).pop();
      if (last) inputsRef.current[last]?.focus();
    }, 0);
  };

  const removeLinha = (idx: number) => {
    setItens((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleEnter = (e: React.KeyboardEvent<HTMLInputElement>, idx: number, field: "desc" | "qtd" | "val") => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (field === "desc") inputsRef.current[`qtd-${idx}`]?.focus();
    else if (field === "qtd") inputsRef.current[`val-${idx}`]?.focus();
    else {
      if (idx === itens.length - 1) addLinha();
      else inputsRef.current[`desc-${idx + 1}`]?.focus();
    }
  };

  const update = (idx: number, patch: Partial<ItemDraft>) => {
    setItens((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
  };

  const guardar = async () => {
    const itensValidos = itens.filter((i) => i.descricao.trim().length > 0);
    if (itensValidos.length === 0) return toast.error("Adicione pelo menos um item");
    setSaving(true);
    try {
      const { error: e1 } = await supabase.from("ticket_orcamentos").update({
        validade: validade || null,
        notas: notas || null,
      }).eq("id", orcamento.id);
      if (e1) throw e1;

      // replace itens
      await supabase.from("ticket_orcamento_itens").delete().eq("orcamento_id", orcamento.id);
      const rows = itensValidos.map((it, idx) => ({
        orcamento_id: orcamento.id,
        ordem: idx,
        descricao: it.descricao,
        quantidade: it.quantidade || 0,
        valor_unitario: it.valor_unitario || 0,
      }));
      const { error: e2 } = await supabase.from("ticket_orcamento_itens").insert(rows);
      if (e2) throw e2;

      // notify client (best effort)
      try {
        await notifyNovoComentario(
          { id: ticket.id, numero: ticket.numero, titulo: ticket.titulo, client_id: ticket.client_id, created_by: ticket.created_by },
          `Foi preparado um orçamento (v${orcamento.versao}) — total ${formatCurrency(totalDe(itensValidos))}. Por favor aceda ao portal para aprovação.`,
          "VRCF",
          `orcamento-${orcamento.id}`,
        );
      } catch { /* silent */ }

      toast.success("Orçamento guardado");
      onSaved();
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Orçamento v{orcamento.versao}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Validade</Label>
              <Input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} />
            </div>
          </div>
          <div>
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="Observações opcionais…" />
          </div>

          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_90px_120px_120px_40px] gap-2 px-3 py-2 bg-muted text-xs font-medium">
              <div>Descrição</div><div>Qtd</div><div>Valor unit.</div><div>Total</div><div></div>
            </div>
            {itens.map((it, idx) => (
              <div key={idx} className="grid grid-cols-[1fr_90px_120px_120px_40px] gap-2 px-3 py-2 border-t items-center">
                <Input
                  ref={(el) => { inputsRef.current[`desc-${idx}`] = el; }}
                  value={it.descricao}
                  onChange={(e) => update(idx, { descricao: e.target.value })}
                  onKeyDown={(e) => handleEnter(e, idx, "desc")}
                  placeholder="Descrição do item"
                />
                <Input
                  ref={(el) => { inputsRef.current[`qtd-${idx}`] = el; }}
                  type="number" step="0.5" value={it.quantidade}
                  onChange={(e) => update(idx, { quantidade: parseFloat(e.target.value) || 0 })}
                  onKeyDown={(e) => handleEnter(e, idx, "qtd")}
                />
                <Input
                  ref={(el) => { inputsRef.current[`val-${idx}`] = el; }}
                  type="number" step="0.01" value={it.valor_unitario}
                  onChange={(e) => update(idx, { valor_unitario: parseFloat(e.target.value) || 0 })}
                  onKeyDown={(e) => handleEnter(e, idx, "val")}
                />
                <div className="text-sm font-mono">{formatCurrency(it.quantidade * it.valor_unitario)}</div>
                <Button size="icon" variant="ghost" onClick={() => removeLinha(idx)}><X className="h-4 w-4" /></Button>
              </div>
            ))}
            <div className="px-3 py-2 border-t flex justify-between items-center bg-muted/30">
              <Button size="sm" variant="outline" onClick={addLinha}><Plus className="h-4 w-4 mr-1" />Linha</Button>
              <div className="text-base font-semibold">Total: {formatCurrency(total)}</div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={guardar} disabled={saving}>{saving ? "A guardar…" : "Guardar"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ============ Client view ============
function OrcamentoClientView({
  open, onOpenChange, orcamento, itens, ticket, onChanged,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  orcamento: Orcamento;
  itens: Item[];
  ticket: TicketLite;
  onChanged: () => void;
}) {
  const { user } = useAuth();
  const [observacao, setObservacao] = useState("");
  const [saving, setSaving] = useState(false);
  const total = totalDe(itens);
  const isPendente = orcamento.estado === "pendente";

  const responder = async (estado: "aprovado" | "recusado") => {
    setSaving(true);
    try {
      const { error } = await supabase.from("ticket_orcamentos").update({
        estado,
        observacao_resposta: observacao || null,
        respondido_por: user?.id ?? null,
        respondido_em: new Date().toISOString(),
      }).eq("id", orcamento.id);
      if (error) throw error;

      try {
        await notifyAdminNovoComentarioCliente(
          { id: ticket.id, numero: ticket.numero, titulo: ticket.titulo },
          "Cliente",
          `Orçamento v${orcamento.versao} foi ${estado.toUpperCase()}.${observacao ? " Observação: " + observacao : ""}`,
          `orcamento-resp-${orcamento.id}`,
        );
      } catch { /* silent */ }

      toast.success(estado === "aprovado" ? "Orçamento aprovado" : "Orçamento recusado");
      onChanged();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Orçamento v{orcamento.versao} {estadoBadge(orcamento.estado)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {orcamento.validade && (
            <div className="text-sm text-muted-foreground">Válido até: {formatDate(orcamento.validade)}</div>
          )}
          <div className="border rounded-md overflow-hidden">
            <div className="grid grid-cols-[1fr_60px_100px_100px] gap-2 px-3 py-2 bg-muted text-xs font-medium">
              <div>Descrição</div><div>Qtd</div><div>Unit.</div><div className="text-right">Total</div>
            </div>
            {itens.map((it) => (
              <div key={it.id} className="grid grid-cols-[1fr_60px_100px_100px] gap-2 px-3 py-2 border-t text-sm">
                <div>{it.descricao}</div>
                <div>{Number(it.quantidade)}</div>
                <div>{formatCurrency(Number(it.valor_unitario))}</div>
                <div className="text-right font-mono">{formatCurrency(Number(it.quantidade) * Number(it.valor_unitario))}</div>
              </div>
            ))}
            <div className="px-3 py-2 border-t flex justify-end bg-muted/30">
              <div className="text-lg font-semibold">Total: {formatCurrency(total)}</div>
            </div>
          </div>
          {orcamento.notas && (
            <div className="text-sm"><strong>Notas:</strong> {orcamento.notas}</div>
          )}
          {orcamento.observacao_resposta && (
            <div className="text-sm text-muted-foreground"><strong>Resposta:</strong> {orcamento.observacao_resposta}</div>
          )}
          {isPendente && (
            <div className="space-y-2 pt-2 border-t">
              <Label>Observação (opcional)</Label>
              <Textarea value={observacao} onChange={(e) => setObservacao(e.target.value)} rows={2} />
            </div>
          )}
        </div>
        <DialogFooter>
          {isPendente ? (
            <>
              <Button variant="destructive" disabled={saving} onClick={() => responder("recusado")}>
                <X className="h-4 w-4 mr-1" />Recusar
              </Button>
              <Button disabled={saving} onClick={() => responder("aprovado")}>
                <Check className="h-4 w-4 mr-1" />Aprovar
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Fechar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
