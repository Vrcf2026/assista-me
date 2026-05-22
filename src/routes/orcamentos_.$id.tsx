import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
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

import { Plus, X, Download, Save, ClipboardList, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { formatCurrency } from "@/lib/format";
import { gerarOrcamentoIndependentePDF } from "@/lib/pdf";

export const Route = createFileRoute("/orcamentos_/$id")({
  component: Page,
});

interface Orcamento {
  id: string;
  numero: number;
  tipo_cliente: "particular" | "empresa";
  client_id: string | null;
  cliente_nome: string | null;
  cliente_contacto: string | null;
  cliente_nif: string | null;
  estado: "rascunho" | "enviado" | "aprovado" | "recusado" | "expirado";
  validade: string;
  condicao_pagamento: "pronto" | "50_50";
  iva_incluido: boolean;
  notas: string | null;
  trabalho_id: string | null;
  created_at: string;
}

interface ItemDraft {
  id?: string;
  descricao: string;
  quantidade: number;
  valor_unitario: number;
  iva_taxa: number;
}

const IVA_TAXAS = [0, 6, 13, 23] as const;

const ESTADOS = ["rascunho", "enviado", "aprovado", "recusado", "expirado"] as const;
const ESTADO_LABEL: Record<typeof ESTADOS[number], string> = {
  rascunho: "Rascunho",
  enviado: "Enviado",
  aprovado: "Aprovado",
  recusado: "Recusado",
  expirado: "Expirado",
};

function Page() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate]);
  if (loading || role !== "admin") return null;
  return <AppLayout><Inner /></AppLayout>;
}


function Inner() {
  const { id } = Route.useParams();
  const [orc, setOrc] = useState<Orcamento | null>(null);
  const [itens, setItens] = useState<ItemDraft[]>([]);
  const [clients, setClients] = useState<{ id: string; nome: string; nif: string | null }[]>([]);
  const [clienteMode, setClienteMode] = useState<"existente" | "ocasional">("existente");
  const [saving, setSaving] = useState(false);
  const inputsRef = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("orcamentos")
      .select("*")
      .eq("id", id)
      .single();
    if (error || !data) {
      toast.error(error?.message ?? "Orçamento não encontrado");
      return;
    }
    setOrc(data as Orcamento);
    setClienteMode(data.client_id ? "existente" : "ocasional");

    const { data: its } = await supabase
      .from("orcamento_itens")
      .select("*")
      .eq("orcamento_id", id)
      .order("ordem");
    setItens(
      (its ?? []).length
        ? (its ?? []).map((i: any) => ({
            id: i.id,
            descricao: i.descricao,
            quantidade: Number(i.quantidade),
            valor_unitario: Number(i.valor_unitario),
            iva_taxa: Number(i.iva_taxa ?? 23),
          }))
        : [{ descricao: "", quantidade: 1, valor_unitario: 0, iva_taxa: 23 }],
    );
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void supabase.from("clients").select("id, nome, nif").order("nome").then(({ data }) => setClients(data ?? []));
  }, []);

  if (!orc) {
    return <div className="text-sm text-muted-foreground">A carregar…</div>;
  }

  const updateOrc = <K extends keyof Orcamento>(field: K, value: Orcamento[K]) => {
    setOrc((prev) => prev ? { ...prev, [field]: value } : prev);
  };

  const addLinha = () => {
    setItens((prev) => [...prev, { descricao: "", quantidade: 1, valor_unitario: 0, iva_taxa: 23 }]);
    setTimeout(() => {
      const last = Object.keys(inputsRef.current).filter((k) => k.startsWith("desc-")).pop();
      if (last) inputsRef.current[last]?.focus();
    }, 0);
  };
  const removeLinha = (idx: number) => setItens((prev) => prev.filter((_, i) => i !== idx));
  const updateItem = (idx: number, patch: Partial<ItemDraft>) => {
    setItens((prev) => prev.map((it, i) => i === idx ? { ...it, ...patch } : it));
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

  const guardar = async () => {
    if (!orc) return;
    setSaving(true);
    try {
      const payload: Partial<Orcamento> = {
        tipo_cliente: orc.tipo_cliente,
        client_id: clienteMode === "existente" ? orc.client_id : null,
        cliente_nome: clienteMode === "ocasional" ? orc.cliente_nome : null,
        cliente_contacto: clienteMode === "ocasional" ? orc.cliente_contacto : null,
        cliente_nif: clienteMode === "ocasional" ? orc.cliente_nif : null,
        estado: orc.estado,
        validade: orc.validade,
        iva_incluido: orc.iva_incluido,
        notas: orc.notas,
      };
      const { error: e1 } = await supabase.from("orcamentos").update(payload).eq("id", orc.id);
      if (e1) throw e1;

      const itensValidos = itens.filter((i) => i.descricao.trim().length > 0);
      await supabase.from("orcamento_itens").delete().eq("orcamento_id", orc.id);
      if (itensValidos.length) {
        const rows = itensValidos.map((it, idx) => ({
          orcamento_id: orc.id,
          ordem: idx,
          descricao: it.descricao,
          quantidade: it.quantidade || 0,
          valor_unitario: it.valor_unitario || 0,
          iva_taxa: it.iva_taxa ?? 23,
        }));
        const { error: e2 } = await supabase.from("orcamento_itens").insert(rows);
        if (e2) throw e2;
      }
      toast.success("Orçamento guardado");
      await load();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const gerarPDF = async () => {
    try {
      await guardar();
      await gerarOrcamentoIndependentePDF(orc.id);
      toast.success("PDF gerado");
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const criarTrabalho = async () => {
    if (!orc) return;
    const nomeCliente = clients.find((c) => c.id === orc.client_id)?.nome ?? orc.cliente_nome ?? "Cliente";
    const { data: u } = await supabase.auth.getUser();
    const { data, error } = await supabase.from("trabalhos").insert({
      titulo: `Orçamento #${orc.numero} — ${nomeCliente}`,
      client_id: orc.client_id,
      estado: "pendente",
      prioridade: "normal",
      created_by: u.user?.id ?? null,
    }).select("id").single();
    if (error || !data) return toast.error(error?.message ?? "Erro");
    await supabase.from("orcamentos").update({ trabalho_id: data.id }).eq("id", orc.id);
    toast.success("Trabalho criado");
    void load();
  };

  // Cálculo de totais
  // Se "iva_incluido": valor_unitario JÁ inclui IVA → subtotal = total/(1+iva), iva = total - subtotal
  // Se NÃO incluído: valor_unitario é líquido → iva = subtotal * taxa, total = subtotal + iva
  let subtotal = 0;
  let totalIva = 0;
  let total = 0;
  for (const it of itens) {
    const bruto = Number(it.quantidade) * Number(it.valor_unitario);
    const taxa = Number(it.iva_taxa ?? 23) / 100;
    if (orc.iva_incluido) {
      const liq = bruto / (1 + taxa);
      subtotal += liq;
      totalIva += bruto - liq;
      total += bruto;
    } else {
      subtotal += bruto;
      totalIva += bruto * taxa;
      total += bruto * (1 + taxa);
    }
  }

  return (
    <div className="space-y-4 max-w-5xl">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/orcamentos"><ArrowLeft className="h-4 w-4 mr-1" />Voltar</Link>
        </Button>
      </div>

      <Card className="p-5 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Orçamento #{orc.numero}</h1>
            <p className="text-xs text-muted-foreground">Criado em {new Date(orc.created_at).toLocaleString("pt-PT")}</p>
          </div>
          <div className="flex items-center gap-2">
            <div>
              <Label className="text-xs">Estado</Label>
              <Select value={orc.estado} onValueChange={(v) => updateOrc("estado", v as Orcamento["estado"])}>
                <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ESTADOS.map((e) => <SelectItem key={e} value={e}>{ESTADO_LABEL[e]}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Validade</Label>
              <Input type="date" value={orc.validade ?? ""} onChange={(e) => updateOrc("validade", e.target.value)} className="w-[160px]" />
            </div>
          </div>
        </div>

        {orc.trabalho_id && (
          <Link to="/trabalhos/$id" params={{ id: orc.trabalho_id }} className="inline-flex">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-300 hover:underline">
              📋 Trabalho criado
            </span>
          </Link>
        )}
      </Card>

      <Card className="p-5 space-y-3">
        <h3 className="text-sm font-semibold">Cliente</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setClienteMode("existente")}
            className={`px-3 py-1.5 text-sm rounded-md border transition ${clienteMode === "existente" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary"}`}
          >Cliente existente</button>
          <button
            type="button"
            onClick={() => setClienteMode("ocasional")}
            className={`px-3 py-1.5 text-sm rounded-md border transition ${clienteMode === "ocasional" ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-secondary"}`}
          >Cliente ocasional</button>
        </div>

        {clienteMode === "existente" ? (
          <div>
            <Label>Cliente</Label>
            <Select value={orc.client_id ?? ""} onValueChange={(v) => updateOrc("client_id", v)}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente…" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <Label>Nome</Label>
              <Input value={orc.cliente_nome ?? ""} onChange={(e) => updateOrc("cliente_nome", e.target.value)} />
            </div>
            <div>
              <Label>Contacto</Label>
              <Input value={orc.cliente_contacto ?? ""} onChange={(e) => updateOrc("cliente_contacto", e.target.value)} />
            </div>
            <div>
              <Label>NIF</Label>
              <Input value={orc.cliente_nif ?? ""} onChange={(e) => updateOrc("cliente_nif", e.target.value)} />
            </div>
          </div>
        )}

        <div>
          <Label>Tipo de cliente</Label>
          <Select value={orc.tipo_cliente} onValueChange={(v) => updateOrc("tipo_cliente", v as Orcamento["tipo_cliente"])}>
            <SelectTrigger className="w-[200px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="particular">Particular</SelectItem>
              <SelectItem value="empresa">Empresa</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-5 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h3 className="text-sm font-semibold">Itens</h3>
          <div className="flex items-center gap-2">
            <Label className="text-xs">Valores</Label>
            <Select
              value={orc.iva_incluido ? "incluido" : "sem"}
              onValueChange={(v) => updateOrc("iva_incluido", v === "incluido")}
            >
              <SelectTrigger className="w-[200px] h-8 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="incluido">Com IVA incluído</SelectItem>
                <SelectItem value="sem">Sem IVA (acresce no total)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="border rounded-md overflow-hidden">
          <div className="grid grid-cols-[32px_1fr_70px_110px_80px_110px_36px] gap-2 px-3 py-2 bg-muted text-[11px] font-medium">
            <div>#</div><div>Descrição</div><div>Qtd</div><div>Valor unit.</div><div>IVA</div><div>Total linha</div><div></div>
          </div>
          {itens.map((it, idx) => {
            const bruto = Number(it.quantidade) * Number(it.valor_unitario);
            const taxa = Number(it.iva_taxa ?? 23) / 100;
            const totalLinha = orc.iva_incluido ? bruto : bruto * (1 + taxa);
            return (
              <div key={idx} className="grid grid-cols-[32px_1fr_70px_110px_80px_110px_36px] gap-2 px-3 py-2 border-t items-center">
                <div className="text-xs text-muted-foreground">{idx + 1}</div>
                <Input
                  ref={(el) => { inputsRef.current[`desc-${idx}`] = el; }}
                  value={it.descricao}
                  onChange={(e) => updateItem(idx, { descricao: e.target.value })}
                  onKeyDown={(e) => handleEnter(e, idx, "desc")}
                  placeholder="Descrição do item ou serviço"
                />
                <Input
                  ref={(el) => { inputsRef.current[`qtd-${idx}`] = el; }}
                  type="number" step="0.5" value={it.quantidade}
                  onChange={(e) => updateItem(idx, { quantidade: parseFloat(e.target.value) || 0 })}
                  onKeyDown={(e) => handleEnter(e, idx, "qtd")}
                />
                <Input
                  ref={(el) => { inputsRef.current[`val-${idx}`] = el; }}
                  type="number" step="0.01" value={it.valor_unitario}
                  onChange={(e) => updateItem(idx, { valor_unitario: parseFloat(e.target.value) || 0 })}
                  onKeyDown={(e) => handleEnter(e, idx, "val")}
                />
                <Select
                  value={String(it.iva_taxa ?? 23)}
                  onValueChange={(v) => updateItem(idx, { iva_taxa: Number(v) })}
                >
                  <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {IVA_TAXAS.map((t) => <SelectItem key={t} value={String(t)}>{t}%</SelectItem>)}
                  </SelectContent>
                </Select>
                <div className="text-sm font-mono">{formatCurrency(totalLinha)}</div>
                <Button size="icon" variant="ghost" onClick={() => removeLinha(idx)}><X className="h-4 w-4" /></Button>
              </div>
            );
          })}
          <div className="px-3 py-2 border-t bg-muted/30 space-y-1">
            <div className="flex justify-between items-center">
              <Button size="sm" variant="outline" onClick={addLinha}><Plus className="h-4 w-4 mr-1" />Linha</Button>
              <div className="text-right text-sm space-y-0.5">
                <div className="text-muted-foreground">Subtotal: <span className="font-mono">{formatCurrency(subtotal)}</span></div>
                <div className="text-muted-foreground">IVA: <span className="font-mono">{formatCurrency(totalIva)}</span></div>
                <div className="text-lg font-bold">Total: {formatCurrency(total)}</div>
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-5 space-y-2">
        <h3 className="text-sm font-semibold">Notas internas</h3>
        <Textarea value={orc.notas ?? ""} onChange={(e) => updateOrc("notas", e.target.value)} rows={3} placeholder="Observações internas (não aparecem no PDF)" />
      </Card>

      <div className="flex flex-wrap gap-2 sticky bottom-0 bg-background/95 backdrop-blur py-3 border-t">
        <Button onClick={() => void guardar()} disabled={saving}>
          <Save className="h-4 w-4 mr-1" />{saving ? "A guardar…" : "Guardar"}
        </Button>
        <Button variant="outline" onClick={() => void gerarPDF()}>
          <Download className="h-4 w-4 mr-1" />Gerar PDF
        </Button>
        {orc.estado === "aprovado" && !orc.trabalho_id && (
          <Button variant="outline" onClick={() => void criarTrabalho()}>
            <ClipboardList className="h-4 w-4 mr-1" />Criar trabalho
          </Button>
        )}
      </div>
    </div>
  );
}
