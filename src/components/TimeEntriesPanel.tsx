import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock, Trash2, Play, Square, RotateCcw } from "lucide-react";
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

function pad(n: number) { return String(n).padStart(2, "0"); }
function formatElapsed(ms: number) {
  const s = Math.floor(ms / 1000);
  return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
}
function nowHHMM() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function TimeEntriesPanel({ ticketId, isAdmin, onChange }: Props) {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);

  // Manual
  const [minutos, setMinutos] = useState("");

  // Cronómetro
  const storageKey = `chrono:${ticketId}`;
  const [chronoStart, setChronoStart] = useState<number | null>(null);
  const [chronoElapsed, setChronoElapsed] = useState(0);
  const tickRef = useRef<number | null>(null);

  // Hora início / fim
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");

  // restore chrono
  useEffect(() => {
    if (!isAdmin) return;
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const start = Number(raw);
      if (!Number.isNaN(start)) setChronoStart(start);
    }
  }, [storageKey, isAdmin]);

  useEffect(() => {
    if (chronoStart == null) {
      if (tickRef.current) { window.clearInterval(tickRef.current); tickRef.current = null; }
      return;
    }
    setChronoElapsed(Date.now() - chronoStart);
    tickRef.current = window.setInterval(() => setChronoElapsed(Date.now() - chronoStart), 1000);
    return () => { if (tickRef.current) window.clearInterval(tickRef.current); };
  }, [chronoStart]);

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

  const insertEntry = async (mins: number) => {
    if (!user) return;
    if (!mins || mins <= 0) { toast.error("Tempo inválido"); return; }
    setBusy(true);
    const { error } = await supabase.from("time_entries").insert({
      ticket_id: ticketId,
      user_id: user.id,
      minutos: mins,
      descricao: descricao.trim() || null,
      data_trabalho: data,
    });
    if (!error) {
      const newTotal = total + mins;
      await supabase.from("tickets").update({ tempo_gasto_minutos: newTotal }).eq("id", ticketId);
    }
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`+${mins} min registados`);
    setMinutos(""); setDescricao(""); setHoraInicio(""); setHoraFim("");
    await load();
    onChange?.();
  };

  const submitManual = (e: React.FormEvent) => {
    e.preventDefault();
    insertEntry(Number(minutos));
  };

  const startChrono = () => {
    const t = Date.now();
    setChronoStart(t);
    localStorage.setItem(storageKey, String(t));
  };
  const stopChrono = async () => {
    if (chronoStart == null) return;
    const mins = Math.max(1, Math.round((Date.now() - chronoStart) / 60000));
    setChronoStart(null);
    localStorage.removeItem(storageKey);
    setChronoElapsed(0);
    await insertEntry(mins);
  };
  const resetChrono = () => {
    setChronoStart(null);
    setChronoElapsed(0);
    localStorage.removeItem(storageKey);
  };

  const submitRange = (e: React.FormEvent) => {
    e.preventDefault();
    if (!horaInicio || !horaFim) return;
    const [h1, m1] = horaInicio.split(":").map(Number);
    const [h2, m2] = horaFim.split(":").map(Number);
    let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (mins <= 0) mins += 24 * 60; // dia seguinte
    insertEntry(mins);
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
        <div className="mb-4 p-3 bg-secondary/30 rounded space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-xs">Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Descrição (opcional)</Label>
              <Input value={descricao} onChange={(e) => setDescricao(e.target.value)} maxLength={500} placeholder="O que foi feito" />
            </div>
          </div>

          <Tabs defaultValue="manual">
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="manual">Manual</TabsTrigger>
              <TabsTrigger value="chrono">Cronómetro</TabsTrigger>
              <TabsTrigger value="range">Hora início/fim</TabsTrigger>
            </TabsList>

            <TabsContent value="manual" className="mt-3">
              <form onSubmit={submitManual} className="flex gap-2 items-end">
                <div className="flex-1 space-y-1">
                  <Label className="text-xs">Minutos</Label>
                  <Input type="number" min={1} value={minutos} onChange={(e) => setMinutos(e.target.value)} />
                </div>
                <Button type="submit" size="sm" disabled={busy || !minutos}>Registar</Button>
              </form>
            </TabsContent>

            <TabsContent value="chrono" className="mt-3">
              <div className="flex items-center justify-between gap-3">
                <div className="font-mono text-2xl tabular-nums">
                  {formatElapsed(chronoElapsed)}
                </div>
                <div className="flex gap-2">
                  {chronoStart == null ? (
                    <Button type="button" size="sm" onClick={startChrono} disabled={busy}>
                      <Play className="h-4 w-4 mr-1" /> Iniciar
                    </Button>
                  ) : (
                    <>
                      <Button type="button" size="sm" variant="destructive" onClick={() => void stopChrono()} disabled={busy}>
                        <Square className="h-4 w-4 mr-1" /> Parar e registar
                      </Button>
                      <Button type="button" size="sm" variant="ghost" onClick={resetChrono}>
                        <RotateCcw className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
              {chronoStart != null && (
                <p className="text-xs text-muted-foreground mt-2">
                  Cronómetro persiste enquanto este browser estiver aberto.
                </p>
              )}
            </TabsContent>

            <TabsContent value="range" className="mt-3">
              <form onSubmit={submitRange} className="flex gap-2 items-end flex-wrap">
                <div className="space-y-1">
                  <Label className="text-xs">Início</Label>
                  <div className="flex gap-1">
                    <Input type="time" value={horaInicio} onChange={(e) => setHoraInicio(e.target.value)} className="w-28" />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setHoraInicio(nowHHMM())}>Agora</Button>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Fim</Label>
                  <div className="flex gap-1">
                    <Input type="time" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} className="w-28" />
                    <Button type="button" size="sm" variant="ghost" onClick={() => setHoraFim(nowHHMM())}>Agora</Button>
                  </div>
                </div>
                <Button type="submit" size="sm" disabled={busy || !horaInicio || !horaFim}>Registar</Button>
              </form>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {entries.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Sem registos.</p>
      ) : (
        <ul className="space-y-1.5">
          {entries.map((e) => (
            <li key={e.id} className="text-sm border-l-2 border-primary/40 pl-3 flex items-start justify-between gap-2">
              <div className="flex-1">
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
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
