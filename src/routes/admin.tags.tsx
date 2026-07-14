import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";

export const Route = createFileRoute("/admin/tags")({
  component: AdminTagsPage,
});

interface Tag { id: string; nome: string; cor: string; }

function AdminTagsPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const [tags, setTags] = useState<Tag[]>([]);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState("#F97316");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data, error } = await supabase.from("ticket_tags").select("*").order("nome");
    if (error) toast.error(error.message);
    setTags((data ?? []) as Tag[]);
  };
  useEffect(() => { void load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nome.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("ticket_tags").insert({ nome: nome.trim(), cor });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Tag criada");
    setNome(""); setCor("#F97316");
    void load();
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar tag?")) return;
    const { error } = await supabase.from("ticket_tags").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Tag eliminada");
    void load();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Tags / Categorias</h1>
        <p className="text-sm text-muted-foreground">Categorize tickets para estatísticas e filtros.</p>
      </div>

      <Card className="p-4">
        <form onSubmit={create} className="flex items-end gap-3 flex-wrap">
          <div className="space-y-1.5 flex-1 min-w-[200px]">
            <Label>Nome</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="ex: impressora, rede…" maxLength={50} />
          </div>
          <div className="space-y-1.5">
            <Label>Cor</Label>
            <Input type="color" value={cor} onChange={(e) => setCor(e.target.value)} className="w-16 h-10 p-1" />
          </div>
          <Button type="submit" disabled={busy || !nome.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Criar
          </Button>
        </form>
      </Card>

      <Card className="p-4">
        {tags.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem tags definidas.</p>
        ) : (
          <ul className="space-y-2">
            {tags.map((t) => (
              <li key={t.id} className="flex items-center justify-between p-2 hover:bg-secondary/50 rounded">
                <span className="inline-flex items-center gap-2">
                  <span className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: t.cor }} />
                  <span className="font-medium">{t.nome}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => void remove(t.id)}>
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
