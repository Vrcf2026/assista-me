import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Clock, Trash2 } from "lucide-react";
import { formatMinutes, formatDate } from "@/lib/format";
import {
  TIPO_INTERVENCAO_LABELS, TIPO_INTERVENCAO_COLORS,
  ESTADO_FATURACAO_LABELS, ESTADO_FATURACAO_COLORS,
} from "@/lib/billing";

type TipoIntervencao = "remota" | "presencial" | "preventiva" | "critica";

interface Entry {
  id: string;
  user_id: string;
  minutos: number;
  descricao: string | null;
  data_trabalho: string;
  created_at: string;
  tipo_intervencao: TipoIntervencao;
  nao_contabilizar: boolean;
  estado_faturacao: string;
  profile?: { nome: string | null; email: string } | null;
}

interface Props {
  ticketId: string;
  clientId: string;
  isAdmin: boolean;
  onChange?: () => void;
}

export function TimeEntriesPanel({ ticketId, isAdmin, onChange }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);

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

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Sem registos.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className={`text-sm border-l-2 border-primary/40 pl-3 flex items-start justify-between gap-2 ${e.nao_contabilizar ? "opacity-50" : ""}`}>
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  <span className="font-mono">{formatDate(e.data_trabalho)}</span>
                  <span>·</span>
                  <span>{e.profile?.nome ?? e.profile?.email ?? "—"}</span>
                  <span>·</span>
                  <span className="font-semibold text-foreground">{formatMinutes(e.minutos)}</span>
                  <span className={`px-1.5 py-0.5 rounded border text-[10px] ${TIPO_INTERVENCAO_COLORS[e.tipo_intervencao] ?? ""}`}>
                    {TIPO_INTERVENCAO_LABELS[e.tipo_intervencao] ?? e.tipo_intervencao}
                  </span>
                  {e.nao_contabilizar ? (
                    <span className="px-1.5 py-0.5 rounded border text-[10px] bg-gray-200 text-gray-700 border-gray-400">Não contabilizado</span>
                  ) : (
                    <span className={`px-1.5 py-0.5 rounded border text-[10px] ${ESTADO_FATURACAO_COLORS[e.estado_faturacao] ?? ""}`}>
                      {ESTADO_FATURACAO_LABELS[e.estado_faturacao] ?? e.estado_faturacao}
                    </span>
                  )}
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
