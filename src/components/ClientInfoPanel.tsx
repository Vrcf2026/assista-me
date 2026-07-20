import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Pencil, Check, X, Plus, Trash2, GripVertical, StickyNote } from "lucide-react";
import { toast } from "sonner";

interface InfoItem {
  id: string;
  label: string;
  value: string;
  sort_order: number;
}

interface Props {
  clientId: string;
  canEdit: boolean;
  compact?: boolean;
}

const SUGGESTIONS = ["AnyDesk", "TeamViewer", "VPN", "Servidor principal", "Router / IP público", "Câmara IP", "Wi-Fi", "Contacto técnico", "Telefone", "Horário assistência"];

export function ClientInfoPanel({ clientId, canEdit, compact = false }: Props) {
  const [items, setItems] = useState<InfoItem[]>([]);
  const [notas, setNotas] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draftItems, setDraftItems] = useState<InfoItem[]>([]);
  const [draftNotas, setDraftNotas] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const [itemsRes, internalRes] = await Promise.all([
      supabase.from("client_info_items")
        .select("id, label, value, sort_order")
        .eq("client_id", clientId)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true }),
      canEdit
        ? supabase.from("clients_internal").select("notas_internas").eq("client_id", clientId).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);
    const list = (itemsRes.data ?? []) as InfoItem[];
    setItems(list);
    setDraftItems(list);
    const n = (internalRes.data as { notas_internas: string | null } | null)?.notas_internas ?? "";
    setNotas(n);
    setDraftNotas(n);
    setLoading(false);
  };


  useEffect(() => { void load(); }, [clientId]);

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const addRow = () => {
    setDraftItems([...draftItems, {
      id: `new-${Date.now()}-${Math.random()}`,
      label: "",
      value: "",
      sort_order: draftItems.length,
    }]);
  };

  const updateRow = (id: string, patch: Partial<InfoItem>) => {
    setDraftItems(draftItems.map((r) => r.id === id ? { ...r, ...patch } : r));
  };

  const removeRow = (id: string) => {
    setDraftItems(draftItems.filter((r) => r.id !== id));
  };

  const moveRow = (id: string, dir: -1 | 1) => {
    const idx = draftItems.findIndex((r) => r.id === id);
    const next = idx + dir;
    if (idx < 0 || next < 0 || next >= draftItems.length) return;
    const copy = [...draftItems];
    [copy[idx], copy[next]] = [copy[next], copy[idx]];
    setDraftItems(copy);
  };

  const startEdit = () => {
    setDraftItems(items);
    setDraftNotas(notas);
    setEditing(true);
  };

  const cancelEdit = () => {
    setDraftItems(items);
    setDraftNotas(notas);
    setEditing(false);
  };

  const save = async () => {
    setBusy(true);
    try {
      const clean = draftItems
        .map((r, i) => ({ ...r, label: r.label.trim(), value: r.value.trim(), sort_order: i }))
        .filter((r) => r.label && r.value);

      const originalIds = new Set(items.map((r) => r.id));
      const draftIds = new Set(clean.filter((r) => !r.id.startsWith("new-")).map((r) => r.id));
      const toDelete = [...originalIds].filter((id) => !draftIds.has(id));

      if (toDelete.length > 0) {
        const { error } = await supabase.from("client_info_items").delete().in("id", toDelete);
        if (error) throw error;
      }

      const toInsert = clean.filter((r) => r.id.startsWith("new-")).map((r) => ({
        client_id: clientId, label: r.label, value: r.value, sort_order: r.sort_order,
      }));
      if (toInsert.length > 0) {
        const { error } = await supabase.from("client_info_items").insert(toInsert);
        if (error) throw error;
      }

      const toUpdate = clean.filter((r) => !r.id.startsWith("new-"));
      for (const r of toUpdate) {
        const orig = items.find((o) => o.id === r.id);
        if (!orig) continue;
        if (orig.label !== r.label || orig.value !== r.value || orig.sort_order !== r.sort_order) {
          const { error } = await supabase.from("client_info_items")
            .update({ label: r.label, value: r.value, sort_order: r.sort_order })
            .eq("id", r.id);
          if (error) throw error;
        }
      }

      if (draftNotas !== notas) {
        const { error } = await supabase.from("clients")
          .update({ notas_internas: draftNotas.trim() || null })
          .eq("id", clientId);
        if (error) throw error;
      }

      toast.success("Informações atualizadas");
      setEditing(false);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;

  const hasContent = items.length > 0 || !!notas;

  return (
    <Card className={compact ? "p-4" : "p-6"}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}>
          Informações de acesso
        </h3>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={startEdit}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {draftItems.length === 0 && (
            <p className="text-xs text-muted-foreground">Adiciona linhas com o que precisas: AnyDesk, VPN, IPs, contactos…</p>
          )}
          <div className="space-y-2">
            {draftItems.map((r, i) => (
              <div key={r.id} className="flex gap-2 items-start">
                <div className="flex flex-col pt-1.5">
                  <button
                    type="button"
                    onClick={() => moveRow(r.id, -1)}
                    disabled={i === 0}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none px-1"
                    title="Subir"
                  >▲</button>
                  <button
                    type="button"
                    onClick={() => moveRow(r.id, 1)}
                    disabled={i === draftItems.length - 1}
                    className="text-muted-foreground hover:text-foreground disabled:opacity-30 text-xs leading-none px-1"
                    title="Descer"
                  >▼</button>
                </div>
                <Input
                  className="w-48"
                  placeholder="Rótulo"
                  list="client-info-labels"
                  value={r.label}
                  onChange={(e) => updateRow(r.id, { label: e.target.value })}
                />
                <Input
                  className="flex-1"
                  placeholder="Valor"
                  value={r.value}
                  onChange={(e) => updateRow(r.id, { value: e.target.value })}
                />
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-9 w-9 p-0 text-destructive"
                  onClick={() => removeRow(r.id)}
                  title="Remover"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
            <datalist id="client-info-labels">
              {SUGGESTIONS.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addRow}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar linha
          </Button>

          <div className="space-y-1.5 pt-2 border-t">
            <Label className="text-xs">Notas internas (texto livre)</Label>
            <Textarea
              rows={4}
              value={draftNotas}
              onChange={(e) => setDraftNotas(e.target.value)}
              placeholder="Ex: servidor no armário do 1º andar; falar sempre com o João; VPN só depois das 18h…"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={cancelEdit} disabled={busy}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              <Check className="h-3.5 w-3.5 mr-1" /> {busy ? "..." : "Guardar"}
            </Button>
          </div>
        </div>
      ) : !hasContent ? (
        <p className="text-sm text-muted-foreground">
          Sem informações registadas. {canEdit && "Clica em Editar para adicionar."}
        </p>
      ) : (
        <div className="space-y-3">
          {items.length > 0 && (
            <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5">
              {items.map((r) => (
                <div key={r.id} className="flex items-baseline gap-2 text-sm group py-1 border-b border-border/40">
                  <div className="text-xs text-muted-foreground min-w-[110px]">{r.label}</div>
                  <div className="flex-1 font-mono text-sm break-all">{r.value}</div>
                  <Button
                    variant="ghost" size="sm"
                    className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition"
                    onClick={() => void copy(r.label, r.value)}
                    title="Copiar"
                  >
                    <Copy className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          {notas && (
            <div className="flex items-start gap-2 text-sm pt-2 border-t">
              <span className="mt-0.5 text-muted-foreground"><StickyNote className="h-4 w-4" /></span>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground mb-0.5">Notas internas</div>
                <div className="whitespace-pre-wrap">{notas}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
