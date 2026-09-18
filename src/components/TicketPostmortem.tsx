import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { AlertOctagon, CheckCircle2, Pencil, Save } from "lucide-react";
import { toast } from "sonner";

interface Postmortem {
  id: string;
  ticket_id: string;
  resumo: string;
  causa_raiz: string;
  impacto: string | null;
  duracao_minutos: number | null;
  primeira_resposta_em: string | null;
  resolucao_em: string | null;
  acoes_imediatas: string | null;
  acoes_preventivas: string | null;
  mudancas_necessarias: string | null;
  severidade: "P1" | "P2" | "P3";
  recorrente: boolean;
}

const SEV_CONFIG = {
  P1: { label: "P1 — Crítico total (sistema em baixo)", cls: "text-red-600 dark:text-red-400" },
  P2: { label: "P2 — Funcionalidade major afectada", cls: "text-amber-600 dark:text-amber-400" },
  P3: { label: "P3 — Impacto parcial / degradação", cls: "text-blue-600 dark:text-blue-400" },
};

interface Props {
  ticketId: string;
  ticketEstado: string;
  isAdmin: boolean;
}

export function TicketPostmortem({ ticketId, ticketEstado, isAdmin }: Props) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<Partial<Postmortem>>({
    severidade: "P2",
    recorrente: false,
    resumo: "",
    causa_raiz: "",
  });

  const { data: pm, isLoading } = useQuery<Postmortem | null>({
    queryKey: ["postmortem", ticketId],
    queryFn: async () => {
      const { data } = await supabase
        .from("ticket_postmortem" as any)
        .select("*")
        .eq("ticket_id", ticketId)
        .maybeSingle();
      return (data as unknown as Postmortem) ?? null;
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      if (!form.resumo?.trim() || !form.causa_raiz?.trim()) {
        throw new Error("Resumo e causa raiz são obrigatórios");
      }
      const payload = {
        ticket_id: ticketId,
        resumo: form.resumo!.trim(),
        causa_raiz: form.causa_raiz!.trim(),
        impacto: form.impacto?.trim() || null,
        duracao_minutos: form.duracao_minutos ?? null,
        primeira_resposta_em: form.primeira_resposta_em || null,
        resolucao_em: form.resolucao_em || null,
        acoes_imediatas: form.acoes_imediatas?.trim() || null,
        acoes_preventivas: form.acoes_preventivas?.trim() || null,
        mudancas_necessarias: form.mudancas_necessarias?.trim() || null,
        severidade: form.severidade ?? "P2",
        recorrente: form.recorrente ?? false,
        updated_at: new Date().toISOString(),
      };
      if (pm) {
        const { error } = await supabase
          .from("ticket_postmortem" as any).update(payload).eq("id", pm.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("ticket_postmortem" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["postmortem", ticketId] });
      toast.success("Post-mortem guardado");
      setEditing(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const startEdit = () => {
    setForm(pm ? {
      ...pm,
      primeira_resposta_em: pm.primeira_resposta_em?.slice(0, 16) ?? "",
      resolucao_em: pm.resolucao_em?.slice(0, 16) ?? "",
    } : {
      severidade: "P2", recorrente: false, resumo: "", causa_raiz: "",
    });
    setEditing(true);
  };

  if (!isAdmin) return null;

  const set = (k: string, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

  return (
    <Card className="p-4 border-red-500/20 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2 text-red-600 dark:text-red-400">
          <AlertOctagon className="h-4 w-4" /> Post-mortem do incidente
        </h3>
        {pm && !editing && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
        )}
      </div>

      {isLoading ? (
        <div className="h-16 rounded-lg bg-secondary animate-pulse" />
      ) : !pm && !editing ? (
        <div className="text-center py-4 space-y-2">
          <p className="text-xs text-muted-foreground">
            {ticketEstado === "fechado"
              ? "Incidente resolvido — documenta a causa raiz e acções preventivas."
              : "Preenche o post-mortem após resolver o incidente."}
          </p>
          <Button size="sm" variant="outline" onClick={startEdit}>
            <AlertOctagon className="h-3.5 w-3.5 mr-1" /> Criar post-mortem
          </Button>
        </div>
      ) : !editing && pm ? (
        // Vista do post-mortem existente
        <div className="space-y-3 text-sm">
          <div className="flex items-center gap-2">
            <span className={`font-semibold ${SEV_CONFIG[pm.severidade].cls}`}>
              {SEV_CONFIG[pm.severidade].label}
            </span>
            {pm.recorrente && (
              <span className="text-xs bg-red-500/10 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full border border-red-500/20">
                Recorrente
              </span>
            )}
            {pm.duracao_minutos && (
              <span className="text-xs text-muted-foreground ml-auto">
                Duração: {Math.floor(pm.duracao_minutos / 60)}h{pm.duracao_minutos % 60 > 0 ? `${pm.duracao_minutos % 60}m` : ""}
              </span>
            )}
          </div>

          <div className="space-y-2">
            <Field label="O que aconteceu" value={pm.resumo} />
            <Field label="Causa raiz" value={pm.causa_raiz} highlight />
            {pm.impacto && <Field label="Impacto" value={pm.impacto} />}
            {pm.acoes_imediatas && <Field label="Acções imediatas" value={pm.acoes_imediatas} />}
            {pm.acoes_preventivas && <Field label="Acções preventivas" value={pm.acoes_preventivas} highlight />}
            {pm.mudancas_necessarias && <Field label="Mudanças necessárias" value={pm.mudancas_necessarias} />}
          </div>

          {(pm.primeira_resposta_em || pm.resolucao_em) && (
            <div className="flex gap-4 text-xs text-muted-foreground pt-1 border-t">
              {pm.primeira_resposta_em && (
                <span>1ª resposta: {new Date(pm.primeira_resposta_em).toLocaleString("pt-PT")}</span>
              )}
              {pm.resolucao_em && (
                <span>Resolvido: {new Date(pm.resolucao_em).toLocaleString("pt-PT")}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        // Formulário de edição
        <div className="space-y-3">
          {/* Severidade e Recorrente */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Severidade</Label>
              <Select value={form.severidade ?? "P2"} onValueChange={v => set("severidade", v)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(SEV_CONFIG).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 pt-5">
              <Switch checked={form.recorrente ?? false} onCheckedChange={v => set("recorrente", v)} />
              <Label className="text-xs cursor-pointer">Incidente recorrente</Label>
            </div>
          </div>

          {/* O que aconteceu */}
          <div className="space-y-1.5">
            <Label className="text-xs">O que aconteceu *</Label>
            <Textarea
              value={form.resumo ?? ""}
              onChange={e => set("resumo", e.target.value)}
              rows={2} className="text-sm resize-none"
              placeholder="Descrição breve do incidente..."
            />
          </div>

          {/* Causa raiz */}
          <div className="space-y-1.5">
            <Label className="text-xs">Causa raiz * <span className="text-muted-foreground">(porquê aconteceu)</span></Label>
            <Textarea
              value={form.causa_raiz ?? ""}
              onChange={e => set("causa_raiz", e.target.value)}
              rows={2} className="text-sm resize-none"
              placeholder="Ex: Disco cheio no servidor principal, falta de monitorização..."
            />
          </div>

          {/* Impacto */}
          <div className="space-y-1.5">
            <Label className="text-xs">Impacto</Label>
            <Textarea
              value={form.impacto ?? ""}
              onChange={e => set("impacto", e.target.value)}
              rows={2} className="text-sm resize-none"
              placeholder="Sistemas afectados, utilizadores impactados, tempo de paragem..."
            />
          </div>

          {/* Duração */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Duração (min)</Label>
              <Input
                type="number" min="0"
                value={form.duracao_minutos ?? ""}
                onChange={e => set("duracao_minutos", e.target.value ? parseInt(e.target.value) : null)}
                className="h-9 text-sm"
                placeholder="ex: 90"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">1ª resposta</Label>
              <Input
                type="datetime-local"
                value={form.primeira_resposta_em ?? ""}
                onChange={e => set("primeira_resposta_em", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Resolução</Label>
              <Input
                type="datetime-local"
                value={form.resolucao_em ?? ""}
                onChange={e => set("resolucao_em", e.target.value)}
                className="h-9 text-sm"
              />
            </div>
          </div>

          {/* Acções */}
          <div className="space-y-1.5">
            <Label className="text-xs">Acções imediatas tomadas</Label>
            <Textarea
              value={form.acoes_imediatas ?? ""}
              onChange={e => set("acoes_imediatas", e.target.value)}
              rows={2} className="text-sm resize-none"
              placeholder="O que foi feito para resolver..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Acções preventivas <span className="text-muted-foreground">(para não voltar a acontecer)</span></Label>
            <Textarea
              value={form.acoes_preventivas ?? ""}
              onChange={e => set("acoes_preventivas", e.target.value)}
              rows={2} className="text-sm resize-none"
              placeholder="Ex: Monitorização do espaço em disco, alertas automáticos..."
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs">Mudanças de infraestrutura ou processos</Label>
            <Textarea
              value={form.mudancas_necessarias ?? ""}
              onChange={e => set("mudancas_necessarias", e.target.value)}
              rows={2} className="text-sm resize-none"
              placeholder="Ex: Adicionar disco, actualizar firmware, rever procedimentos..."
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => setEditing(false)}>Cancelar</Button>
            <Button
              size="sm" className="flex-1 gap-1.5"
              onClick={() => save.mutate()}
              disabled={save.isPending || !form.resumo?.trim() || !form.causa_raiz?.trim()}
            >
              <Save className="h-3.5 w-3.5" />
              {save.isPending ? "A guardar…" : "Guardar post-mortem"}
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Field({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`p-2.5 rounded-md ${highlight ? "bg-amber-500/10 border border-amber-500/20" : "bg-secondary/40"}`}>
      <p className="text-xs font-medium text-muted-foreground mb-0.5">{label}</p>
      <p className="text-sm whitespace-pre-wrap">{value}</p>
    </div>
  );
}
