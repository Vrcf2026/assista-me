import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
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
import { Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/preventiva/templates")({
  component: Page,
});

interface Template {
  id: string;
  nome: string;
  descricao: string | null;
  periodicidade: string;
  ativo: boolean;
  num_tarefas?: number;
}

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
  const [items, setItems] = useState<Template[]>([]);
  const [open, setOpen] = useState(false);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [periodicidade, setPeriodicidade] = useState("mensal");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("preventiva_templates")
      .select("id, nome, descricao, periodicidade, ativo, preventiva_tarefas(count)")
      .order("nome");
    if (error) return toast.error(error.message);
    const list = (data ?? []).map((t: { id: string; nome: string; descricao: string | null; periodicidade: string; ativo: boolean; preventiva_tarefas: { count: number }[] }) => ({
      ...t,
      num_tarefas: t.preventiva_tarefas?.[0]?.count ?? 0,
    })) as Template[];
    setItems(list);
  };
  useEffect(() => { void load(); }, []);

  const create = async () => {
    if (!nome.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("preventiva_templates").insert({
      nome: nome.trim(),
      descricao: descricao.trim() || null,
      periodicidade,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Template criado");
    setNome(""); setDescricao(""); setPeriodicidade("mensal");
    setOpen(false);
    void load();
  };

  const toggleAtivo = async (t: Template) => {
    const { error } = await supabase.from("preventiva_templates").update({ ativo: !t.ativo }).eq("id", t.id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Templates de Preventiva</h1>
          <p className="text-sm text-muted-foreground">Define checklists reutilizáveis por periodicidade.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4 mr-1" />Novo template</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo template</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5"><Label>Nome</Label><Input value={nome} onChange={e=>setNome(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Descrição</Label><Input value={descricao} onChange={e=>setDescricao(e.target.value)} /></div>
              <div className="space-y-1.5">
                <Label>Periodicidade</Label>
                <Select value={periodicidade} onValueChange={setPeriodicidade}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="mensal">Mensal</SelectItem>
                    <SelectItem value="trimestral">Trimestral</SelectItem>
                    <SelectItem value="semestral">Semestral</SelectItem>
                    <SelectItem value="anual">Anual</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void create()} disabled={busy || !nome.trim()}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem templates.</p>
        ) : (
          <ul className="divide-y">
            {items.map(t => (
              <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="font-medium">{t.nome}</div>
                  <div className="text-xs text-muted-foreground capitalize">{t.periodicidade} · {t.num_tarefas} tarefas{t.descricao ? ` · ${t.descricao}` : ""}</div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch checked={t.ativo} onCheckedChange={() => void toggleAtivo(t)} />
                  <Button variant="outline" size="sm" asChild>
                    <Link to="/preventiva/templates/$id" params={{ id: t.id }}><Pencil className="h-3.5 w-3.5 mr-1" />Editar</Link>
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
