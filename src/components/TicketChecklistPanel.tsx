import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2, MessageSquare, ListChecks, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useTicketChecklists,
  useChecklistTemplates,
  useApplyChecklistTemplate,
  useToggleChecklistItem,
  useDeleteTicketChecklist,
} from "@/hooks/use-ticket-checklists";
import { toast } from "sonner";

interface Props {
  ticketId: string;
  isAdmin: boolean;
}

export function TicketChecklistPanel({ ticketId, isAdmin }: Props) {
  const { data: checklists = [], isLoading } = useTicketChecklists(ticketId);
  const { data: templates = [] } = useChecklistTemplates();
  const applyTemplate = useApplyChecklistTemplate();
  const toggleItem = useToggleChecklistItem();
  const deleteChecklist = useDeleteTicketChecklist();

  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [noteEditing, setNoteEditing] = useState<string | null>(null);
  const [noteValue, setNoteValue] = useState("");
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (!isAdmin) return null;

  const handleApply = async () => {
    if (!selectedTemplate) return;
    try {
      await applyTemplate.mutateAsync({ ticketId, templateId: selectedTemplate });
      setSelectedTemplate("");
      toast.success("Checklist aplicada!");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aplicar checklist");
    }
  };

  const handleToggle = async (itemId: string, currentChecked: boolean) => {
    await toggleItem.mutateAsync({ id: itemId, checked: !currentChecked });
  };

  const handleSaveNote = async (itemId: string) => {
    await toggleItem.mutateAsync({ id: itemId, checked: true, notes: noteValue });
    setNoteEditing(null);
    setNoteValue("");
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Eliminar esta checklist?")) return;
    try {
      await deleteChecklist.mutateAsync(id);
      toast.success("Checklist eliminada");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao eliminar");
    }
  };

  if (isLoading) {
    return <div className="h-16 rounded-lg bg-secondary animate-pulse" />;
  }

  // Contagem global
  const totalItems = checklists.reduce((s, cl) => s + cl.ticket_checklist_items.length, 0);
  const checkedItems = checklists.reduce(
    (s, cl) => s + cl.ticket_checklist_items.filter((i) => i.checked).length, 0,
  );

  return (
    <div className="space-y-3">
      {/* Header com progresso global */}
      {checklists.length > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ListChecks className="h-3.5 w-3.5" />
              {checkedItems}/{totalItems} itens concluídos
            </span>
            <span>{totalItems > 0 ? Math.round((checkedItems / totalItems) * 100) : 0}%</span>
          </div>
          <Progress value={totalItems > 0 ? (checkedItems / totalItems) * 100 : 0} className="h-1.5" />
        </div>
      )}

      {/* Aplicar template */}
      <div className="flex gap-2">
        <Select value={selectedTemplate} onValueChange={setSelectedTemplate}>
          <SelectTrigger className="text-sm flex-1">
            <SelectValue placeholder="Aplicar checklist…" />
          </SelectTrigger>
          <SelectContent>
            {templates.map((t) => (
              <SelectItem key={t.id} value={t.id}>
                {t.name}
                <span className="text-muted-foreground ml-1 text-xs">({t.category})</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          onClick={handleApply}
          disabled={!selectedTemplate || applyTemplate.isPending}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> Aplicar
        </Button>
      </div>

      {/* Checklists */}
      {checklists.map((cl) => {
        const items = [...cl.ticket_checklist_items].sort((a, b) => a.sort_order - b.sort_order);
        const done = items.filter((i) => i.checked).length;
        const total = items.length;
        const isCollapsed = collapsed[cl.id];

        return (
          <div key={cl.id} className="border rounded-lg overflow-hidden">
            {/* Header da checklist */}
            <div className="flex items-center justify-between px-3 py-2 bg-secondary/40">
              <button
                className="flex items-center gap-2 flex-1 text-left"
                onClick={() => setCollapsed((prev) => ({ ...prev, [cl.id]: !prev[cl.id] }))}
              >
                <ListChecks className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm font-medium">{cl.name}</span>
                <Badge variant="secondary" className="text-xs ml-auto mr-2">
                  {done}/{total}
                </Badge>
                {isCollapsed
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                }
              </button>
              <Button
                variant="ghost" size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => void handleDelete(cl.id)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {/* Barra de progresso da checklist */}
            {!isCollapsed && total > 0 && (
              <div className="h-1 bg-secondary">
                <div
                  className="h-1 bg-emerald-500 transition-all"
                  style={{ width: `${(done / total) * 100}%` }}
                />
              </div>
            )}

            {/* Itens */}
            {!isCollapsed && (
              <ul className="divide-y">
                {items.map((item) => (
                  <li key={item.id} className="px-3 py-2">
                    <div className="flex items-start gap-2">
                      <button
                        className="mt-0.5 shrink-0"
                        onClick={() => void handleToggle(item.id, item.checked)}
                      >
                        {item.checked
                          ? <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                          : <Circle className="h-4.5 w-4.5 text-muted-foreground" />
                        }
                      </button>
                      <div className="flex-1 min-w-0">
                        <span className={`text-sm ${item.checked ? "line-through text-muted-foreground" : ""}`}>
                          {item.label}
                        </span>
                        {item.notes && (
                          <p className="text-xs text-muted-foreground mt-0.5">{item.notes}</p>
                        )}
                        {noteEditing === item.id && (
                          <div className="mt-1.5 flex gap-2">
                            <Input
                              value={noteValue}
                              onChange={(e) => setNoteValue(e.target.value)}
                              placeholder="Nota…"
                              className="h-7 text-xs"
                              autoFocus
                              onKeyDown={(e) => e.key === "Enter" && void handleSaveNote(item.id)}
                            />
                            <Button size="sm" className="h-7 text-xs" onClick={() => void handleSaveNote(item.id)}>
                              Ok
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setNoteEditing(null)}>
                              ✕
                            </Button>
                          </div>
                        )}
                      </div>
                      {!item.checked && noteEditing !== item.id && (
                        <button
                          className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
                          onClick={() => { setNoteEditing(item.id); setNoteValue(item.notes ?? ""); }}
                          title="Adicionar nota"
                        >
                          <MessageSquare className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}

      {checklists.length === 0 && templates.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">
          Sem templates de checklist. Cria em Admin → Checklists.
        </p>
      )}
    </div>
  );
}
