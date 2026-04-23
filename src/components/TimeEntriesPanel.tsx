import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Clock, Trash2 } from "lucide-react";
import { formatMinutes, formatDate } from "@/lib/format";

interface Entry {
  id: string;
  user_id: string;
  minutos: number;
  descricao: string | null;
  data_trabalho: string;
  created_at: string;
  profile?: { nome: string | null; email: string } | null;
}

interface Props {
  ticketId: string;
  isAdmin: boolean;
  onChange?: () => void;
}

export function TimeEntriesPanel({ ticketId, isAdmin, onChange }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [minutos, setMinutos] = useState("");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data: rows } = await supabase
      .from("time_entries")
      .select("*")
      .eq("ticket_id", ticketId)
      .order("data_trabalho", { ascending: false })
      .order("created_at", { ascending: false });
    if (rows && rows.length > 0) {
      const userIds = [...new Set(rows.map((r: any) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, nome, email")
        .in("user_id", userIds);
      const map = new Map((profiles ?? []).map((p: any) => [p.user_id, p]));
      setEntries(rows.map((r: any) => ({ ...r, profile: map.get(r.user_id) ?? null })) as Entry[]);
    } else {
      setEntries([]);
    }
  };
  useEffect(() => { void load(); }, [ticketId]);

  const total = entries.reduce((s, e) => s + e.minutos, 0);

  const add = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const m = Number(minutos);
    if (!m || m <= 0) return;
    setBusy(true);
    const { error } = await supabase.from("time_entries").insert({
      ticket_id: ticketId,
      user_id: user.id,
      minutos: m,
      descricao: descricao.trim() || null,
      data_trabalho: data,
    });
    if (!error) {
      // Atualizar tempo_gasto_minutos do ticket (cumulativo)
      const newTotal = total + m;
      await supabase.from("tickets").update({ tempo_gasto_minutos: newTotal }).eq("id", ticketId);
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`+${m} min registados`);
    setMinutos(""); setDescricao("");
    await load();
    onChange?.();
  };

  const remove = async (id: string, mins: number) => {
    if (!confirm("Eliminar registo?")) return;
    const { error } = await supabase.from("time_entries").delete().eq("id", id);
    if (error) return toast.error(error.message);
    const newTotal = Math.max(0, total - mins);
    await supabase.from("tickets").update({ tempo_gasto_minutos: newTotal }).eq("id", ticketId);
    toast.success("Registo eliminado");
    await load();
    onChange?.();
  };

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Clock className="h-4 w-4" /> Tempo registado
        </h3>
        <span className="text-sm font-mono">{formatMinutes(total)}</span>
      </div>

      {isAdmin && (
        <form onSubmit={add} className="space-y-2 mb-4 p-3 bg-secondary/30 rounded">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Minutos</Label>
              <Input type="number" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Descrição (opcional)</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} rows={2} maxLength={500} />
          </div>
          <Button type="submit" size="sm" disabled={busy || !minutos}>Registar</Button>
        </form>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Sem registos.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="text-sm border-l-2 border-primary/40 pl-3 flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="font-mono">{formatDate(e.data_trabalho)}</span>
                  <span>·</span>
                  <span>{e.profile?.nome ?? e.profile?.email ?? "—"}</span>
                  <span>·</span>
                  <span className="font-semibold text-foreground">{formatMinutes(e.minutos)}</span>
                </div>
                {e.descricao && <div className="text-sm mt-0.5">{e.descricao}</div>}
              </div>
              {isAdmin && e.user_id === user?.id && (
                <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={() => void remove(e.id, e.minutos)}>
                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
