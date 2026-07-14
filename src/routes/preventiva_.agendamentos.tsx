import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, KeyboardEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, X, Pencil } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/preventiva_/agendamentos")({
  component: Page,
});

interface Row {
  id: string;
  proxima_data: string;
  ultima_data: string | null;
  ativo: boolean;
  client_id: string;
  template_id: string;
  clients: { nome: string } | null;
  preventiva_templates: { nome: string; periodicidade: string } | null;
}

interface Tarefa {
  id?: string;          // db id (preventiva_agendamento_tarefas)
  tarefa_id?: string | null; // ref to template tarefa
  descricao: string;
  ativo: boolean;
  ordem: number;
  _delete?: boolean;
  _new?: boolean;
}

function Page() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<{ id: string; nome: string }[]>([]);
  const [templates, setTemplates] = useState<{ id: string; nome: string; periodicidade: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [clientId, setClientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [proximaData, setProximaData] = useState(new Date().toISOString().slice(0, 10));
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [busy, setBusy] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const load = async () => {
    const [{ data: ag }, { data: cs }, { data: ts }] = await Promise.all([
      supabase.from("preventiva_agendamentos")
        .select("id, proxima_data, ultima_data, ativo, client_id, template_id, clients(nome), preventiva_templates(nome, periodicidade)")
        .order("proxima_data"),
      supabase.from("clients").select("id, nome").order("nome"),
      supabase.from("preventiva_templates").select("id, nome, periodicidade").eq("ativo", true).order("nome"),
    ]);
    setRows((ag ?? []) as unknown as Row[]);
    setClients((cs ?? []) as { id: string; nome: string }[]);
    setTemplates((ts ?? []) as { id: string; nome: string; periodicidade: string }[]);
  };
  useEffect(() => { void load(); }, []);

  const resetForm = () => {
    setEditingId(null);
    setClientId("");
    setTemplateId("");
    setProximaData(new Date().toISOString().slice(0, 10));
    setTarefas([]);
  };

  const openCreate = () => {
    resetForm();
    setOpen(true);
  };

  const openEdit = async (r: Row) => {
    resetForm();
    setEditingId(r.id);
    setClientId(r.client_id);
    setTemplateId(r.template_id);
    setProximaData(r.proxima_data);
    // load existing custom tarefas, fallback to template
    const { data: existing } = await supabase
      .from("preventiva_agendamento_tarefas")
      .select("id, tarefa_id, descricao, ativo, ordem")
      .eq("agendamento_id", r.id)
      .order("ordem");
    if (existing && existing.length > 0) {
      setTarefas(existing as Tarefa[]);
    } else {
      const { data: tpl } = await supabase
        .from("preventiva_tarefas")
        .select("id, descricao, ordem")
        .eq("template_id", r.template_id)
        .order("ordem");
      setTarefas((tpl ?? []).map((t, i) => ({
        tarefa_id: t.id,
        descricao: t.descricao,
        ativo: true,
        ordem: i + 1,
        _new: true,
      })));
    }
    setOpen(true);
  };

  // Quando o template muda no modo create, carrega tarefas do template
  useEffect(() => {
    if (!open || editingId || !templateId) return;
    void (async () => {
      const { data } = await supabase
        .from("preventiva_tarefas")
        .select("id, descricao, ordem")
        .eq("template_id", templateId)
        .order("ordem");
      setTarefas((data ?? []).map((t, i) => ({
        tarefa_id: t.id,
        descricao: t.descricao,
        ativo: true,
        ordem: i + 1,
        _new: true,
      })));
    })();
  }, [templateId, open, editingId]);

  const addTarefa = (afterIdx?: number) => {
    setTarefas(prev => {
      const next = [...prev];
      const idx = afterIdx === undefined ? next.length : afterIdx + 1;
      next.splice(idx, 0, { descricao: "", ativo: true, ordem: 0, _new: true, tarefa_id: null });
      return next.map((t, i) => ({ ...t, ordem: i + 1 }));
    });
    setTimeout(() => {
      const target = afterIdx === undefined ? tarefas.length : afterIdx + 1;
      inputRefs.current[target]?.focus();
    }, 0);
  };

  const updateTarefa = (i: number, patch: Partial<Tarefa>) => {
    setTarefas(prev => prev.map((t, idx) => idx === i ? { ...t, ...patch } : t));
  };

  const removeTarefa = (i: number) => {
    setTarefas(prev => {
      const t = prev[i];
      if (t._new && !t.id) return prev.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, ordem: idx + 1 }));
      return prev.map((x, idx) => idx === i ? { ...x, _delete: true } : x);
    });
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addTarefa(i); }
  };

  const guardar = async () => {
    if (!clientId || !templateId || !proximaData) return;
    setBusy(true);
    try {
      let agId = editingId;
      if (!agId) {
        const { data, error } = await supabase.from("preventiva_agendamentos").insert({
          client_id: clientId,
          template_id: templateId,
          proxima_data: proximaData,
        }).select("id").single();
        if (error || !data) throw error;
        agId = data.id;
      } else {
        const { error } = await supabase.from("preventiva_agendamentos").update({
          client_id: clientId,
          template_id: templateId,
          proxima_data: proximaData,
        }).eq("id", agId);
        if (error) throw error;
      }

      // sync tarefas
      const visiveis = tarefas.filter(t => !t._delete);
      // updates
      for (let i = 0; i < visiveis.length; i++) {
        const t = visiveis[i];
        const ordem = i + 1;
        if (t.id) {
          await supabase.from("preventiva_agendamento_tarefas")
            .update({ descricao: t.descricao, ordem, ativo: t.ativo })
            .eq("id", t.id);
        }
      }
      // inserts
      const novas = visiveis.filter(t => !t.id && t.descricao.trim()).map((t, _i) => ({
        agendamento_id: agId!,
        tarefa_id: t.tarefa_id ?? null,
        descricao: t.descricao.trim(),
        ativo: t.ativo,
        ordem: visiveis.findIndex(x => x === t) + 1,
      }));
      if (novas.length) {
        const { error } = await supabase.from("preventiva_agendamento_tarefas").insert(novas);
        if (error) throw error;
      }
      // deletes
      const ids = tarefas.filter(t => t._delete && t.id).map(t => t.id!);
      if (ids.length) {
        await supabase.from("preventiva_agendamento_tarefas").delete().in("id", ids);
      }

      toast.success(editingId ? "Agendamento actualizado" : "Agendamento criado");
      setOpen(false);
      resetForm();
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (r: Row) => {
    const { error } = await supabase.from("preventiva_agendamentos").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const visiveis = tarefas.filter(t => !t._delete);

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agendamentos de Preventiva</h1>
          <p className="text-sm text-muted-foreground">Plano periódico por cliente.</p>
        </div>
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) resetForm(); }}>
          <DialogTrigger asChild>
            <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" />Novo agendamento</Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editingId ? "Editar agendamento" : "Novo agendamento"}</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Cliente</Label>
                  <Select value={clientId} onValueChange={setClientId} disabled={!!editingId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Template</Label>
                  <Select value={templateId} onValueChange={setTemplateId}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar" /></SelectTrigger>
                    <SelectContent>
                      {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.nome} ({t.periodicidade})</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5 md:col-span-2">
                  <Label>Próxima data</Label>
                  <Input type="date" value={proximaData} onChange={e => setProximaData(e.target.value)} />
                </div>
              </div>

              {templateId && (
                <div className="space-y-2 pt-2 border-t">
                  <div className="flex items-center justify-between">
                    <Label>Checklist personalizada</Label>
                    <Button size="sm" variant="outline" type="button" onClick={() => addTarefa()}>
                      <Plus className="h-3.5 w-3.5 mr-1" />Adicionar tarefa
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">Carregada do template; podes acrescentar ou desactivar tarefas para este cliente.</p>
                  {visiveis.length === 0 ? (
                    <p className="text-sm text-muted-foreground py-3 text-center">Sem tarefas.</p>
                  ) : (
                    <ul className="space-y-2">
                      {tarefas.map((t, i) => t._delete ? null : (
                        <li key={t.id ?? `new-${i}`} className="flex items-center gap-2">
                          <Switch checked={t.ativo} onCheckedChange={(v) => updateTarefa(i, { ativo: v })} />
                          <span className="text-xs text-muted-foreground w-6 text-right">{visiveis.findIndex(x => x === t) + 1}.</span>
                          <Input
                            ref={el => { inputRefs.current[i] = el; }}
                            value={t.descricao}
                            onChange={e => updateTarefa(i, { descricao: e.target.value })}
                            onKeyDown={e => onKey(i, e)}
                            placeholder="Descrição"
                            className={t.ativo ? "" : "opacity-60 line-through"}
                          />
                          <Button type="button" variant="ghost" size="sm" onClick={() => removeTarefa(i)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button onClick={() => void guardar()} disabled={busy || !clientId || !templateId}>
                {editingId ? "Guardar" : "Criar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem agendamentos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Periodicidade</th>
                  <th className="py-2 pr-3">Próxima</th>
                  <th className="py-2 pr-3">Última</th>
                  <th className="py-2 pr-3">Activo</th>
                  <th className="py-2 pr-3 text-right">Acções</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.clients?.nome ?? "—"}</td>
                    <td className="py-2 pr-3">{r.preventiva_templates?.nome ?? "—"}</td>
                    <td className="py-2 pr-3 capitalize">{r.preventiva_templates?.periodicidade ?? "—"}</td>
                    <td className="py-2 pr-3">{formatDate(r.proxima_data)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.ultima_data ? formatDate(r.ultima_data) : "—"}</td>
                    <td className="py-2 pr-3"><Switch checked={r.ativo} onCheckedChange={() => void toggle(r)} /></td>
                    <td className="py-2 pr-3 text-right">
                      <Button size="sm" variant="ghost" onClick={() => void openEdit(r)}>
                        <Pencil className="h-3.5 w-3.5 mr-1" />Editar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
