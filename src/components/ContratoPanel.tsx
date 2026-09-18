import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  FileText, Plus, Pencil, Download, AlertTriangle,
  CheckCircle2, Clock, XCircle, FileSignature,
} from "lucide-react";
import { toast } from "sonner";
import { gerarContratoServicos } from "@/lib/pdf-lazy";

interface Contrato {
  id: string;
  numero: string;
  tipo: string;
  data_inicio: string;
  data_fim: string | null;
  renovacao_automatica: boolean;
  aviso_renovacao_dias: number;
  valor_mensal: number | null;
  valor_total: number | null;
  horas_incluidas: number | null;
  tarifa_hora_extra: number | null;
  inclui: string | null;
  nao_inclui: string | null;
  condicoes: string | null;
  assinado_em: string | null;
  assinado_por_cliente: string | null;
  estado: string;
}

const TIPO_LABEL: Record<string, string> = {
  avenca: "Avença Mensal",
  pontual: "Suporte Pontual",
  projeto: "Projecto",
  manutencao: "Manutenção",
};

const ESTADO_CONFIG: Record<string, { label: string; icon: typeof CheckCircle2; cls: string }> = {
  rascunho: { label: "Rascunho", icon: FileText, cls: "text-muted-foreground" },
  activo: { label: "Activo", icon: CheckCircle2, cls: "text-emerald-600 dark:text-emerald-400" },
  suspenso: { label: "Suspenso", icon: Clock, cls: "text-amber-600 dark:text-amber-400" },
  terminado: { label: "Terminado", icon: XCircle, cls: "text-red-600 dark:text-red-400" },
};

function diasParaRenovacao(c: Contrato): number | null {
  if (!c.data_fim || c.estado !== "activo") return null;
  return Math.floor((new Date(c.data_fim).getTime() - Date.now()) / 86400_000);
}

function formatDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("pt-PT");
}

function formatEuro(v: number | null) {
  if (v === null) return "—";
  return v.toLocaleString("pt-PT", { style: "currency", currency: "EUR" });
}

const DEFAULTS = {
  tipo: "avenca",
  data_inicio: new Date().toISOString().slice(0, 10),
  data_fim: "",
  renovacao_automatica: true,
  aviso_renovacao_dias: 30,
  valor_mensal: "",
  valor_total: "",
  horas_incluidas: "",
  tarifa_hora_extra: "",
  inclui: "",
  nao_inclui: "",
  condicoes: "Tempo de resposta: 4 horas úteis para problemas críticos, 1 dia útil para outros.\nO suporte é prestado em dias úteis (segunda a sexta), das 09h às 18h.\nTrabalho fora do horário normal é facturado com agravamento de 50%.",
  assinado_em: "",
  assinado_por_cliente: "",
  estado: "activo",
};

interface Props {
  clientId: string;
  canEdit?: boolean;
}

export function ContratoPanel({ clientId, canEdit = false }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Contrato | null>(null);
  const [form, setForm] = useState(DEFAULTS);
  const [generating, setGenerating] = useState<string | null>(null);

  const { data: contratos = [], isLoading } = useQuery<Contrato[]>({
    queryKey: ["contratos", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contratos" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("data_inicio", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Contrato[];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      const payload = {
        client_id: clientId,
        tipo: form.tipo,
        data_inicio: form.data_inicio,
        data_fim: form.data_fim || null,
        renovacao_automatica: form.renovacao_automatica,
        aviso_renovacao_dias: Number(form.aviso_renovacao_dias) || 30,
        valor_mensal: form.valor_mensal ? Number(form.valor_mensal) : null,
        valor_total: form.valor_total ? Number(form.valor_total) : null,
        horas_incluidas: form.horas_incluidas ? Number(form.horas_incluidas) : null,
        tarifa_hora_extra: form.tarifa_hora_extra ? Number(form.tarifa_hora_extra) : null,
        inclui: form.inclui || null,
        nao_inclui: form.nao_inclui || null,
        condicoes: form.condicoes || null,
        assinado_em: form.assinado_em || null,
        assinado_por_cliente: form.assinado_por_cliente || null,
        estado: form.estado,
      };
      if (editing) {
        const { error } = await supabase.from("contratos" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("contratos" as any).insert({ ...payload, numero: "" });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["contratos", clientId] });
      toast.success(editing ? "Contrato actualizado" : "Contrato criado");
      setDialogOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao guardar"),
  });

  const resetForm = () => { setForm(DEFAULTS); setEditing(null); };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (c: Contrato) => {
    setEditing(c);
    setForm({
      tipo: c.tipo,
      data_inicio: c.data_inicio,
      data_fim: c.data_fim ?? "",
      renovacao_automatica: c.renovacao_automatica,
      aviso_renovacao_dias: c.aviso_renovacao_dias,
      valor_mensal: c.valor_mensal?.toString() ?? "",
      valor_total: c.valor_total?.toString() ?? "",
      horas_incluidas: c.horas_incluidas?.toString() ?? "",
      tarifa_hora_extra: c.tarifa_hora_extra?.toString() ?? "",
      inclui: c.inclui ?? "",
      nao_inclui: c.nao_inclui ?? "",
      condicoes: c.condicoes ?? "",
      assinado_em: c.assinado_em ?? "",
      assinado_por_cliente: c.assinado_por_cliente ?? "",
      estado: c.estado,
    });
    setDialogOpen(true);
  };

  const gerarPDF = async (c: Contrato) => {
    setGenerating(c.id);
    try {
      await gerarContratoServicos(c.id);
      toast.success("PDF gerado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao gerar PDF");
    } finally {
      setGenerating(null);
    }
  };

  const set = (k: string, v: unknown) => setForm(prev => ({ ...prev, [k]: v }));

  // Alertas de renovação
  const alertas = contratos.filter(c => {
    const dias = diasParaRenovacao(c);
    return dias !== null && dias <= c.aviso_renovacao_dias && dias >= 0;
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <FileSignature className="h-4 w-4" /> Contratos
        </h3>
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Novo
          </Button>
        )}
      </div>

      {/* Alertas de renovação */}
      {alertas.map(c => {
        const dias = diasParaRenovacao(c)!;
        return (
          <div key={c.id} className="flex items-center gap-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10">
            <AlertTriangle className="h-4 w-4 text-amber-500 shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300 flex-1">
              <span className="font-medium">{c.numero}</span> renova em <span className="font-medium">{dias} dias</span> ({formatDate(c.data_fim)})
            </p>
            {canEdit && (
              <Button variant="outline" size="sm" className="h-6 text-xs" onClick={() => openEdit(c)}>
                Renovar
              </Button>
            )}
          </div>
        );
      })}

      {isLoading ? (
        <div className="h-20 rounded-lg bg-secondary animate-pulse" />
      ) : contratos.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-4">
          Sem contratos. {canEdit && "Clica em 'Novo' para criar."}
        </p>
      ) : (
        <div className="space-y-2">
          {contratos.map(c => {
            const est = ESTADO_CONFIG[c.estado] ?? ESTADO_CONFIG.activo;
            const Icon = est.icon;
            const dias = diasParaRenovacao(c);
            const expirou = c.data_fim && new Date(c.data_fim) < new Date();

            return (
              <div key={c.id} className={`border rounded-lg p-3 space-y-2 ${expirou && c.estado === "activo" ? "border-red-500/30 bg-red-500/5" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`h-4 w-4 shrink-0 ${est.cls}`} />
                    <div className="min-w-0">
                      <span className="text-xs font-mono text-muted-foreground">{c.numero}</span>
                      <span className="text-xs text-muted-foreground mx-1">·</span>
                      <span className="text-sm font-medium">{TIPO_LABEL[c.tipo] ?? c.tipo}</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      variant="ghost" size="icon" className="h-7 w-7"
                      onClick={() => void gerarPDF(c)}
                      disabled={generating === c.id}
                      title="Gerar PDF"
                    >
                      <Download className={`h-3.5 w-3.5 ${generating === c.id ? "animate-pulse" : ""}`} />
                    </Button>
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(c)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>

                {/* Detalhes rápidos */}
                <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                  <span>Início: <span className="text-foreground">{formatDate(c.data_inicio)}</span></span>
                  <span>Fim: <span className={`${expirou ? "text-red-500 font-medium" : "text-foreground"}`}>{c.data_fim ? formatDate(c.data_fim) : "Indeterminado"}</span></span>
                  {c.valor_mensal !== null && <span>Mensal: <span className="text-foreground font-medium">{formatEuro(c.valor_mensal)}</span></span>}
                  {c.horas_incluidas !== null && <span>Horas: <span className="text-foreground">{c.horas_incluidas}h/mês</span></span>}
                  {c.valor_total !== null && <span>Total: <span className="text-foreground font-medium">{formatEuro(c.valor_total)}</span></span>}
                  {dias !== null && dias >= 0 && <span className="text-amber-600 dark:text-amber-400">Renova em {dias}d</span>}
                  {expirou && <span className="text-red-500 font-medium">Expirado</span>}
                </div>

                {/* Assinatura */}
                {c.assinado_em && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500" />
                    Assinado a {formatDate(c.assinado_em)}{c.assinado_por_cliente ? ` por ${c.assinado_por_cliente}` : ""}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Dialog criar/editar */}
      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? `Editar ${editing.numero}` : "Novo contrato"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Tipo e estado */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Tipo de contrato</Label>
                <Select value={form.tipo} onValueChange={v => set("tipo", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="avenca">Avença Mensal</SelectItem>
                    <SelectItem value="pontual">Suporte Pontual</SelectItem>
                    <SelectItem value="projeto">Projecto</SelectItem>
                    <SelectItem value="manutencao">Manutenção</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Estado</Label>
                <Select value={form.estado} onValueChange={v => set("estado", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="rascunho">Rascunho</SelectItem>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="suspenso">Suspenso</SelectItem>
                    <SelectItem value="terminado">Terminado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Datas */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Data início *</Label>
                <Input type="date" value={form.data_inicio} onChange={e => set("data_inicio", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Data fim <span className="text-muted-foreground text-xs">(vazio = indeterminado)</span></Label>
                <Input type="date" value={form.data_fim} onChange={e => set("data_fim", e.target.value)} />
              </div>
            </div>

            {/* Renovação */}
            <div className="flex items-center gap-4 p-3 border rounded-lg">
              <div className="flex items-center gap-2 flex-1">
                <Switch checked={form.renovacao_automatica} onCheckedChange={v => set("renovacao_automatica", v)} />
                <Label className="cursor-pointer">Renovação automática</Label>
              </div>
              {form.data_fim && (
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground shrink-0">Avisar</Label>
                  <Input
                    type="number" min={7} max={180}
                    value={form.aviso_renovacao_dias}
                    onChange={e => set("aviso_renovacao_dias", e.target.value)}
                    className="w-16 h-8 text-sm"
                  />
                  <Label className="text-xs text-muted-foreground shrink-0">dias antes</Label>
                </div>
              )}
            </div>

            {/* Valores */}
            <div className="grid grid-cols-2 gap-3">
              {(form.tipo === "avenca" || form.tipo === "manutencao") && (
                <>
                  <div className="space-y-1.5">
                    <Label>Valor mensal (€ c/IVA)</Label>
                    <Input type="number" min="0" step="0.01" value={form.valor_mensal} onChange={e => set("valor_mensal", e.target.value)} placeholder="ex: 150" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Horas incluídas/mês</Label>
                    <Input type="number" min="0" value={form.horas_incluidas} onChange={e => set("horas_incluidas", e.target.value)} placeholder="ex: 5" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Hora extra (€ c/IVA)</Label>
                    <Input type="number" min="0" step="0.01" value={form.tarifa_hora_extra} onChange={e => set("tarifa_hora_extra", e.target.value)} placeholder="ex: 45" />
                  </div>
                </>
              )}
              {(form.tipo === "pontual" || form.tipo === "projeto") && (
                <div className="space-y-1.5 col-span-2">
                  <Label>Valor total (€ c/IVA)</Label>
                  <Input type="number" min="0" step="0.01" value={form.valor_total} onChange={e => set("valor_total", e.target.value)} placeholder="ex: 500" />
                </div>
              )}
            </div>

            {/* O que inclui */}
            <div className="space-y-1.5">
              <Label>O que está incluído</Label>
              <Textarea
                value={form.inclui}
                onChange={e => set("inclui", e.target.value)}
                rows={3}
                placeholder={"- Suporte remoto ilimitado\n- Manutenção preventiva mensal\n- Monitorização proactiva\n- Actualizações de segurança"}
              />
            </div>

            {/* O que não inclui */}
            <div className="space-y-1.5">
              <Label>O que NÃO está incluído</Label>
              <Textarea
                value={form.nao_inclui}
                onChange={e => set("nao_inclui", e.target.value)}
                rows={2}
                placeholder={"- Hardware e consumíveis\n- Deslocações (facturadas à parte)\n- Software de terceiros"}
              />
            </div>

            {/* Condições gerais */}
            <div className="space-y-1.5">
              <Label>Condições gerais e SLA</Label>
              <Textarea
                value={form.condicoes}
                onChange={e => set("condicoes", e.target.value)}
                rows={4}
              />
            </div>

            {/* Assinatura */}
            <div className="grid grid-cols-2 gap-3 pt-2 border-t">
              <div className="space-y-1.5">
                <Label>Data de assinatura</Label>
                <Input type="date" value={form.assinado_em} onChange={e => set("assinado_em", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Assinado por (cliente)</Label>
                <Input value={form.assinado_por_cliente} onChange={e => set("assinado_por_cliente", e.target.value)} placeholder="Nome de quem assinou" />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => { resetForm(); setDialogOpen(false); }}>Cancelar</Button>
            <Button onClick={() => upsert.mutate()} disabled={!form.data_inicio || upsert.isPending}>
              {upsert.isPending ? "A guardar…" : editing ? "Actualizar" : "Criar contrato"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
