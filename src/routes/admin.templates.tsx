import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, Variable } from "lucide-react";
import { TEMPLATE_VARS } from "@/lib/template-vars";

export const Route = createFileRoute("/admin/templates")({
  component: AdminTemplatesPage,
});

interface Template { id: string; titulo: string; mensagem: string; ordem: number; }

function AdminTemplatesPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const [items, setItems] = useState<Template[]>([]);
  const [editing, setEditing] = useState<Template | null>(null);
  const [titulo, setTitulo] = useState("");
  const [mensagem, setMensagem] = useState("");
  const [previewMode, setPreviewMode] = useState(false);

  const load = async () => {
    const { data, error } = await supabase
      .from("response_templates").select("*").order("ordem").order("titulo");
    if (error) toast.error(error.message);
    setItems((data ?? []) as Template[]);
  };
  useEffect(() => { void load(); }, []);

  const reset = () => { setEditing(null); setTitulo(""); setMensagem(""); setPreviewMode(false); };

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

  const startEdit = (t: Template) => {
    setEditing(t); setTitulo(t.titulo); setMensagem(t.mensagem); setPreviewMode(false);
  };

  const remove = async (id: string) => {
    if (!confirm("Eliminar template?")) return;
    const { error } = await supabase.from("response_templates").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Template eliminado");
    void load();
  };

  // Inserir variável no cursor da textarea
  const insertVar = (key: string) => {
    const tag = `{{${key}}}`;
    const ta = document.getElementById("template-mensagem") as HTMLTextAreaElement | null;
    if (!ta) { setMensagem((m) => m + tag); return; }
    const start = ta.selectionStart ?? mensagem.length;
    const end = ta.selectionEnd ?? mensagem.length;
    const newVal = mensagem.slice(0, start) + tag + mensagem.slice(end);
    setMensagem(newVal);
    setTimeout(() => {
      ta.focus();
      ta.setSelectionRange(start + tag.length, start + tag.length);
    }, 0);
  };

  // Preview com valores de exemplo
  const previewText = previewMode
    ? mensagem.replace(/\{\{(\w+)\}\}/g, (_, key) => {
        const v = TEMPLATE_VARS.find((v) => v.key === key);
        return v ? `[${v.exemplo}]` : `{{${key}}}`;
      })
    : mensagem;

  // Destacar variáveis no preview da lista
  const highlightVars = (text: string) =>
    text.replace(/\{\{(\w+)\}\}/g, (match) =>
      `<span class="bg-primary/10 text-primary rounded px-0.5 font-mono text-[11px]">${match}</span>`
    );

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Respostas rápidas</h1>
        <p className="text-sm text-muted-foreground">
          Templates reutilizáveis com variáveis dinâmicas. Use <code className="text-xs bg-secondary px-1 rounded">{"{{variavel}}"}</code> para inserir contexto automaticamente.
        </p>
      </div>

      <Card className="p-4">
        <form onSubmit={save} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Título</Label>
            <Input
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder="ex: Pedido recebido"
              maxLength={100}
            />
          </div>

          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="template-mensagem">Mensagem</Label>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setPreviewMode((v) => !v)}
              >
                {previewMode ? "Editar" : "Pré-visualizar"}
              </Button>
            </div>

            {previewMode ? (
              <div className="min-h-[100px] rounded-md border bg-secondary/20 p-3 text-sm whitespace-pre-wrap">
                {previewText || <span className="text-muted-foreground italic">Sem conteúdo</span>}
              </div>
            ) : (
              <Textarea
                id="template-mensagem"
                value={mensagem}
                onChange={(e) => setMensagem(e.target.value)}
                rows={5}
                maxLength={2000}
                placeholder={"Olá {{nome_cliente}},\n\nRecebemos o seu pedido #{{numero_ticket}} e já estamos a trabalhar nisso.\n\nCumprimentos,\n{{tecnico}}"}
              />
            )}
          </div>

          {/* Palete de variáveis */}
          {!previewMode && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground flex items-center gap-1">
                <Variable className="h-3 w-3" /> Inserir variável:
              </p>
              <div className="flex flex-wrap gap-1.5">
                {TEMPLATE_VARS.map((v) => (
                  <button
                    key={v.key}
                    type="button"
                    onClick={() => insertVar(v.key)}
                    className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded border bg-secondary hover:bg-secondary/80 font-mono transition"
                    title={`Exemplo: ${v.exemplo}`}
                  >
                    {`{{${v.key}}}`}
                    <span className="text-muted-foreground font-sans">— {v.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

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
            {items.map((t) => {
              const hasVars = /\{\{\w+\}\}/.test(t.mensagem);
              return (
                <li key={t.id} className="border rounded p-3">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold">{t.titulo}</h3>
                      {hasVars && (
                        <Badge variant="secondary" className="text-[10px] gap-1">
                          <Variable className="h-2.5 w-2.5" /> variáveis
                        </Badge>
                      )}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => startEdit(t)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => void remove(t.id)}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                  <p
                    className="text-sm text-muted-foreground whitespace-pre-wrap"
                    dangerouslySetInnerHTML={{ __html: highlightVars(t.mensagem) }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
