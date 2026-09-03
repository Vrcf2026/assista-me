import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Plus, Trash2, ListChecks, GripVertical } from "lucide-react";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  useChecklistTemplates,
  useCreateChecklistTemplate,
  useDeleteChecklistTemplate,
} from "@/hooks/use-ticket-checklists";

export const Route = createFileRoute("/admin/checklists" as any)({
  component: AdminChecklistsPage,
});

const CATEGORIAS = [
  { value: "geral", label: "Geral" },
  { value: "manutencao", label: "Manutenção" },
  { value: "instalacao", label: "Instalação" },
  { value: "backup", label: "Backup" },
  { value: "rede", label: "Rede" },
  { value: "seguranca", label: "Segurança" },
];

function AdminChecklistsPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const { data: templates = [], isLoading } = useChecklistTemplates();
  const createTemplate = useCreateChecklistTemplate();
  const deleteTemplate = useDeleteChecklistTemplate();

  const [name, setName] = useState("");
  const [category, setCategory] = useState("geral");
  const [items, setItems] = useState<string[]>(["", "", ""]);

  const addItem = () => setItems((prev) => [...prev, ""]);
  const updateItem = (i: number, val: string) =>
    setItems((prev) => prev.map((v, idx) => (idx === i ? val : v)));
  const removeItem = (i: number) =>
    setItems((prev) => prev.filter((_, idx) => idx !== i));

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const filtered = items.map((i) => i.trim()).filter(Boolean);
    if (!name.trim() || filtered.length === 0) {
      toast.error("Preenche o nome e pelo menos 1 item.");
      return;
    }
    try {
      await createTemplate.mutateAsync({ name: name.trim(), category, items: filtered });
      toast.success("Template criado!");
      setName("");
      setCategory("geral");
      setItems(["", "", ""]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao criar template");
    }
  };

  const handleDelete = async (id: string, nome: string) => {
    if (!confirm(`Eliminar template "${nome}"?`)) return;
    try {
      await deleteTemplate.mutateAsync(id);
      toast.success("Template eliminado");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao eliminar");
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Checklists</h1>
        <p className="text-sm text-muted-foreground">Templates reutilizáveis aplicáveis a qualquer ticket.</p>
      </div>

      {/* Formulário de criação */}
      <Card className="p-4">
        <form onSubmit={handleCreate} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Nome do template</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex: Manutenção preventiva PC"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Categoria</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CATEGORIAS.map((c) => (
                    <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Itens da checklist</Label>
            <div className="space-y-1.5">
              {items.map((item, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <GripVertical className="h-4 w-4 text-muted-foreground shrink-0" />
                  <Input
                    value={item}
                    onChange={(e) => updateItem(i, e.target.value)}
                    placeholder={`Item ${i + 1}…`}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive shrink-0"
                    onClick={() => removeItem(i)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addItem} className="w-full mt-1">
                <Plus className="h-4 w-4 mr-1" /> Adicionar item
              </Button>
            </div>
          </div>

          <Button type="submit" disabled={createTemplate.isPending || !name.trim()}>
            <Plus className="h-4 w-4 mr-1" /> Criar template
          </Button>
        </form>
      </Card>

      {/* Lista de templates */}
      <Card className="p-4">
        {isLoading ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => <div key={i} className="h-16 rounded bg-secondary animate-pulse" />)}
          </div>
        ) : templates.length === 0 ? (
          <p className="text-center text-muted-foreground py-6 text-sm">Sem templates criados ainda.</p>
        ) : (
          <ul className="space-y-3">
            {templates.map((t) => {
              const itemsList = [...(t.checklist_template_items ?? [])].sort(
                (a, b) => a.sort_order - b.sort_order,
              );
              return (
                <li key={t.id} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <ListChecks className="h-4 w-4 text-primary" />
                      <span className="font-medium text-sm">{t.name}</span>
                      <Badge variant="secondary" className="text-xs">{t.category}</Badge>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                      onClick={() => void handleDelete(t.id, t.name)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <ul className="space-y-0.5">
                    {itemsList.map((item) => (
                      <li key={item.id} className="text-xs text-muted-foreground flex items-center gap-1.5">
                        <span className="w-3 h-3 rounded-full border border-muted-foreground/30 shrink-0" />
                        {item.label}
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
