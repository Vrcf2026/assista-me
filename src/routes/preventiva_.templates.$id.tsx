import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useRef, KeyboardEvent } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { Plus, X, ArrowLeft, Save } from "lucide-react";

export const Route = createFileRoute("/preventiva_/templates/$id")({
  component: Page,
});

interface Tarefa { id?: string; ordem: number; descricao: string; _new?: boolean; _delete?: boolean; }

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
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [periodicidade, setPeriodicidade] = useState("mensal");
  const [tarefas, setTarefas] = useState<Tarefa[]>([]);
  const [busy, setBusy] = useState(false);
  const [propagar, setPropagar] = useState<{ ids: string[]; descricoes: string[]; agendamentos: { id: string }[] } | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const load = async () => {
    const { data: tpl, error: e1 } = await supabase
      .from("preventiva_templates")
      .select("nome, descricao, periodicidade")
      .eq("id", id).single();
    if (e1) return toast.error(e1.message);
    setNome(tpl.nome); setDescricao(tpl.descricao ?? ""); setPeriodicidade(tpl.periodicidade);

    const { data: t } = await supabase
      .from("preventiva_tarefas")
      .select("id, ordem, descricao")
      .eq("template_id", id)
      .order("ordem");
    setTarefas((t ?? []) as Tarefa[]);
  };
  useEffect(() => { void load(); }, [id]);

  const addTarefa = (afterIdx?: number) => {
    setTarefas(prev => {
      const next = [...prev];
      const idx = afterIdx === undefined ? next.length : afterIdx + 1;
      next.splice(idx, 0, { ordem: 0, descricao: "", _new: true });
      return next.map((t, i) => ({ ...t, ordem: i + 1 }));
    });
    setTimeout(() => {
      const target = afterIdx === undefined ? tarefas.length : afterIdx + 1;
      inputRefs.current[target]?.focus();
    }, 0);
  };

  const updateDesc = (i: number, v: string) => {
    setTarefas(prev => prev.map((t, idx) => idx === i ? { ...t, descricao: v } : t));
  };

  const removeTarefa = (i: number) => {
    setTarefas(prev => {
      const t = prev[i];
      if (t._new) return prev.filter((_, idx) => idx !== i).map((x, idx) => ({ ...x, ordem: idx + 1 }));
      return prev.map((x, idx) => idx === i ? { ...x, _delete: true } : x);
    });
  };

  const onKey = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") { e.preventDefault(); addTarefa(i); }
  };

  const save = async () => {
    setBusy(true);
    try {
      const { error } = await supabase.from("preventiva_templates")
        .update({ nome: nome.trim(), descricao: descricao.trim() || null, periodicidade })
        .eq("id", id);
      if (error) throw error;

      const visiveis = tarefas.filter(t => !t._delete);
      // Update existing
      for (let i = 0; i < visiveis.length; i++) {
        const t = visiveis[i];
        const ordem = i + 1;
        if (t.id) {
          await supabase.from("preventiva_tarefas").update({ descricao: t.descricao, ordem }).eq("id", t.id);
        }
      }
      // Insert new
      const novas = visiveis.filter(t => t._new && t.descricao.trim()).map((t, i) => ({
        template_id: id,
        descricao: t.descricao.trim(),
        ordem: visiveis.findIndex(x => x === t) + 1 || (i + 1),
      }));
      if (novas.length) {
        const { error: iErr } = await supabase.from("preventiva_tarefas").insert(novas);
        if (iErr) throw iErr;
      }
      // Delete
      const ids = tarefas.filter(t => t._delete && t.id).map(t => t.id!);
      if (ids.length) {
        const { error: dErr } = await supabase.from("preventiva_tarefas").delete().in("id", ids);
        if (dErr) throw dErr;
      }

      toast.success("Template guardado");
      void load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro a guardar");
    } finally {
      setBusy(false);
    }
  };

  const visiveis = tarefas.filter(t => !t._delete);

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/preventiva/templates" })}>
        <ArrowLeft className="h-4 w-4 mr-1" />Voltar
      </Button>

      <Card className="p-4 space-y-3">
        <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={e=>setNome(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Descrição</Label><Textarea rows={2} value={descricao} onChange={e=>setDescricao(e.target.value)} /></div>
        <div className="space-y-1.5">
          <Label>Periodicidade</Label>
          <Select value={periodicidade} onValueChange={setPeriodicidade}>
            <SelectTrigger className="w-60"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="mensal">Mensal</SelectItem>
              <SelectItem value="trimestral">Trimestral</SelectItem>
              <SelectItem value="semestral">Semestral</SelectItem>
              <SelectItem value="anual">Anual</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Checklist de tarefas</h2>
          <Button size="sm" variant="outline" onClick={() => addTarefa()}><Plus className="h-3.5 w-3.5 mr-1" />Adicionar</Button>
        </div>
        {visiveis.length === 0 ? (
          <p className="text-sm text-muted-foreground py-3 text-center">Sem tarefas. Clica em "Adicionar".</p>
        ) : (
          <ul className="space-y-2">
            {tarefas.map((t, i) => t._delete ? null : (
              <li key={t.id ?? `new-${i}`} className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground w-6 text-right">{visiveis.findIndex(x => x === t) + 1}.</span>
                <Input
                  ref={el => { inputRefs.current[i] = el; }}
                  value={t.descricao}
                  onChange={e => updateDesc(i, e.target.value)}
                  onKeyDown={e => onKey(i, e)}
                  placeholder="Descrição da tarefa"
                />
                <Button variant="ghost" size="sm" onClick={() => removeTarefa(i)}><X className="h-4 w-4" /></Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={() => void save()} disabled={busy}><Save className="h-4 w-4 mr-1" />Guardar template</Button>
      </div>
    </div>
  );
}
