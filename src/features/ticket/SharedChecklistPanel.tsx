import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { toast } from "sonner";
import { Plus, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { formatDateTime } from "@/lib/format";

interface NotaPartilhada {
  id: string;
  descricao: string;
  concluida: boolean;
  concluida_em: string | null;
  ordem: number;
}

export function SharedChecklistPanel({ ticketId, canEdit }: { ticketId: string; canEdit: boolean }) {
  const { user } = useAuth();
  const [items, setItems] = useState<NotaPartilhada[]>([]);
  const [novo, setNovo] = useState("");

  const load = async () => {
    const { data } = await supabase.from("ticket_notas_partilhadas")
      .select("id, descricao, concluida, concluida_em, ordem")
      .eq("ticket_id", ticketId).order("ordem").order("created_at");
    setItems((data ?? []) as NotaPartilhada[]);
  };
  useEffect(() => { void load(); }, [ticketId]);

  const add = async (texto: string) => {
    const t = texto.trim();
    if (!t) return;
    const maxOrdem = items.reduce((m, i) => Math.max(m, i.ordem), 0);
    const { error } = await supabase.from("ticket_notas_partilhadas").insert({
      ticket_id: ticketId, descricao: t, ordem: maxOrdem + 1, created_by: user?.id ?? null,
    });
    if (error) return toast.error(error.message);
    setNovo("");
    void load();
  };

  const toggle = async (it: NotaPartilhada) => {
    const novoVal = !it.concluida;
    const { error } = await supabase.from("ticket_notas_partilhadas")
      .update({ concluida: novoVal, concluida_em: novoVal ? new Date().toISOString() : null })
      .eq("id", it.id);
    if (error) return toast.error(error.message);
    void load();
  };

  const editDesc = async (id: string, descricao: string) => {
    const { error } = await supabase.from("ticket_notas_partilhadas").update({ descricao }).eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("ticket_notas_partilhadas").delete().eq("id", id);
    if (error) return toast.error(error.message);
    void load();
  };

  const total = items.length;
  const done = items.filter((i) => i.concluida).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <div className="space-y-3">
      {total > 0 && (
        <div className="space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{done} de {total} concluídos</span>
            <span>{pct}%</span>
          </div>
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <ul className="space-y-1.5">
        {items.map((it) => (
          <ChecklistRow key={it.id} item={it} canEdit={canEdit} onToggle={() => void toggle(it)} onEdit={(d) => void editDesc(it.id, d)} onRemove={() => void remove(it.id)} />
        ))}
        {items.length === 0 && <li className="text-sm text-muted-foreground">Sem itens.</li>}
      </ul>

      {canEdit && (
        <div className="flex gap-2 pt-2 border-t">
          <Input
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(novo); } }}
            placeholder="Novo item — ENTER para adicionar"
          />
          <Button size="sm" onClick={() => void add(novo)} disabled={!novo.trim()}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar
          </Button>
        </div>
      )}
    </div>
  );
}

function ChecklistRow({ item, canEdit, onToggle, onEdit, onRemove }: {
  item: NotaPartilhada;
  canEdit: boolean;
  onToggle: () => void;
  onEdit: (d: string) => void;
  onRemove: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(item.descricao);
  useEffect(() => { setVal(item.descricao); }, [item.descricao]);

  return (
    <li className="flex items-center gap-2 group">
      <Checkbox checked={item.concluida} onCheckedChange={onToggle} />
      {editing && canEdit ? (
        <>
          <Input
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); onEdit(val); setEditing(false); }
              if (e.key === "Escape") { setVal(item.descricao); setEditing(false); }
            }}
            className="h-8 flex-1"
            autoFocus
          />
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { onEdit(val); setEditing(false); }}>
            <Check className="h-3 w-3" />
          </Button>
          <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setVal(item.descricao); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </>
      ) : (
        <>
          <span
            className={`flex-1 text-sm ${item.concluida ? "line-through text-muted-foreground" : ""} ${canEdit ? "cursor-text" : ""}`}
            onClick={() => canEdit && setEditing(true)}
          >
            {item.descricao}
          </span>
          {item.concluida_em && (
            <span className="text-xs text-muted-foreground">{formatDateTime(item.concluida_em)}</span>
          )}
          {canEdit && (
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 text-destructive" onClick={onRemove}>
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </>
      )}
    </li>
  );
}

export function InternalNotesPanel({ ticket, onChange }: { ticket: { id: string; internal_notes: string | null }; onChange: () => void }) {
  const [val, setVal] = useState(ticket.internal_notes ?? "");
  const [busy, setBusy] = useState(false);
  useEffect(() => { setVal(ticket.internal_notes ?? ""); }, [ticket.internal_notes]);

  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("tickets").update({ internal_notes: val }).eq("id", ticket.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Notas internas guardadas");
    onChange();
  };

  return (
    <div className="space-y-2">
      <textarea
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={10}
        placeholder="Notas internas — só visíveis pela equipa VRCF"
        className="w-full min-h-[80px] rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-yellow-500/30"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={save} disabled={busy}>Guardar</Button>
      </div>
    </div>
  );
}
