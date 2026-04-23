import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Trash2, Plus, Pencil } from "lucide-react";

export const Route = createFileRoute("/admin/templates")({
  component: AdminTemplatesPage,
});

interface Template { id: string; titulo: string; mensagem: string; ordem: number; }

function AdminTemplatesPage() {
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
  const [editing, setEditing] = useState<Template | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");

  const load = async () => {
    const { data, error } = await supabase.from("response_templates").select("*").order("ordem").order("titulo");
    if (error) toast.error(error.message);
    setItems((data ?? []) as Template[]);
  };
  useEffect(() => { void load(); }, []);

  const reset = () => { setEditing(null); setTitulo(""); setMensagem(""); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!titulo.trim() || !mensagem.trim()) return;
    if (editing) {
      const { error } = await supabase.from("response_templates")
        .update({ titulo: titulo.trim(), mensagem }).eq("id", editing.id);
      if (error) return toast.error(error.message);
      toast.success("Template atualizado");
    } else {
      const { error } = await supabase.from("response_templates")
        .insert({ titulo: titulo.trim(), mensagem });
      if (error) return toast.error(error.message);
      toast.success("Template criado");
    }
    reset();
    void load();
  };

  const startEdit = (t: Template) => { setEditing(t); setTitulo(t.titulo); setMensagem(t.mensagem); };

  const remove = async (id: string) => {
    if (!confirm("Eliminar template?")) return;
    const { error } = await supabase.from("response_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Template eliminado");
    void load();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Respostas rápidas</h1>
        <p className="text-sm text-muted-foreground">Templates de resposta reutilizáveis nos comentários.</p>
      </div>

      <Card className="p-4">
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="ex: Pedido recebido" maxLength={100} />
          </div>
          <div className="space-y-1.5">
            <Label>Mensagem</Label>
            <Textarea value={mensagem} onChange={(e) => setMensagem(e.target.value)} rows={4} maxLength={2000} />
          </div>
          <div className="flex justify-end gap-2">
            {editing && <Button type="button" variant="outline" onClick={reset}>Cancelar</Button>}
            <Button type="submit" disabled={!titulo.trim() || !mensagem.trim()}>
              <Plus className="h-4 w-4 mr-1" /> {editing ? "Atualizar" : "Criar"}
            </Button>
          </div>
        </form>
      </Card>

      <Card className="p-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem templates definidos.</p>
        ) : (
          <ul className="space-y-3">
            {items.map((t) => (
              <li key={t.id} className="border rounded p-3">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="font-semibold">{t.titulo}</h3>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => void remove(t.id)}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground whitespace-pre-wrap">{t.mensagem}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
