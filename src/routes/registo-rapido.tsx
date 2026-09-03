import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Play, Square, Check, Zap, Clock } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/registo-rapido" as any)({
  component: RegistoRapidoPage,
});

function RegistoRapidoPage() {
  return (
    <RequireRole role="admin">
      <AppLayout><RegistoRapidoInner /></AppLayout>
    </RequireRole>
  );
}

interface RecentEntry {
  description: string;
  client: string;
  time: string;
}

function RegistoRapidoInner() {
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [clientId, setClientId] = useState("");
  const [ticketId, setTicketId] = useState("none");
  const [descricao, setDescricao] = useState("");
  const [data, setData] = useState(new Date().toISOString().slice(0, 10));
  const [horas, setHoras] = useState(0);
  const [minutos, setMinutos] = useState(0);
  const [deduct, setDeduct] = useState(true);
  const [recent, setRecent] = useState<RecentEntry[]>([]);

  // Timer
  const [timerRunning, setTimerRunning] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const timerStartRef = useRef<number | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Clientes
  const { data: clientes = [] } = useQuery({
    queryKey: ["clients-select"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("clients").select("id, nome").order("nome");
      if (error) throw error;
      return data ?? [];
    },
  });

  // Tickets abertos do cliente seleccionado
  const { data: tickets = [] } = useQuery({
    queryKey: ["tickets-select", clientId],
    enabled: !!clientId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tickets")
        .select("id, numero, titulo")
        .eq("client_id", clientId)
        .in("estado", ["aberto", "em_progresso", "aguarda_cliente"])
        .order("numero", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Mutação para guardar time entry
  const saveEntry = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sem sessão");

      const totalMins = horas * 60 + minutos;
      if (totalMins < 1) throw new Error("Tempo mínimo de 1 minuto");

      // Se há ticket seleccionado, guardar em time_entries
      if (ticketId !== "none") {
        const { error } = await supabase.from("time_entries").insert({
          ticket_id: ticketId,
          user_id: user.id,
          minutos: totalMins,
          descricao: descricao.trim() || null,
          data_trabalho: data,
          tipo_intervencao: "remota",
          estado_faturacao: "pendente",
          nao_contabilizar: !deduct,
        });
        if (error) throw error;

        // Actualizar tempo total no ticket
        const { data: tkt } = await supabase
          .from("tickets").select("tempo_gasto_minutos").eq("id", ticketId).single();
        await supabase.from("tickets")
          .update({ tempo_gasto_minutos: (tkt?.tempo_gasto_minutos ?? 0) + totalMins })
          .eq("id", ticketId);
      } else {
        // Sem ticket — usar ticket_id null (pode requerer migração se campo for NOT NULL)
        const { error: e2 } = await supabase.from("time_entries").insert({
          ticket_id: null as any,
          user_id: user.id,
          minutos: totalMins,
          descricao: descricao.trim() ? `[${clientes.find((c) => c.id === clientId)?.nome ?? clientId}] ${descricao.trim()}` : null,
          data_trabalho: data,
          tipo_intervencao: "remota",
          estado_faturacao: "pendente",
          nao_contabilizar: !deduct,
        });
        if (e2) throw new Error("Para registar sem ticket, associa a um ticket existente.");
      }

      qc.invalidateQueries({ queryKey: ["time_entries"] });
    },
    onSuccess: () => {
      const clientNome = clientes.find((c) => c.id === clientId)?.nome ?? "";
      const timeStr = horas > 0
        ? `${horas}h${minutos > 0 ? `${minutos}m` : ""}`
        : `${minutos}m`;
      setRecent((prev) => [
        { description: descricao.trim(), client: clientNome, time: timeStr },
        ...prev.slice(0, 4),
      ]);
      toast.success("Trabalho registado!");
      setDescricao("");
      setHoras(0);
      setMinutos(0);
      setTimerSeconds(0);
      setTimerRunning(false);
      timerStartRef.current = null;
      setTicketId("none");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro ao guardar"),
  });

  // Timer
  const startTimer = useCallback(() => {
    timerStartRef.current = Date.now();
    setTimerSeconds(0);
    setTimerRunning(true);
  }, []);

  const stopTimer = useCallback(() => {
    setTimerRunning(false);
    const totalMins = Math.ceil(timerSeconds / 60);
    setHoras(Math.floor(totalMins / 60));
    setMinutos(totalMins % 60);
  }, [timerSeconds]);

  useEffect(() => {
    if (timerRunning && timerStartRef.current) {
      intervalRef.current = setInterval(() => {
        setTimerSeconds(Math.floor((Date.now() - timerStartRef.current!) / 1000));
      }, 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [timerRunning]);

  const formatTimer = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  };

  const canSubmit = !!clientId && !!descricao.trim() && (horas > 0 || minutos > 0) && !timerRunning;

  return (
    <div className="max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-semibold flex items-center gap-2">
          <Zap className="h-6 w-6 text-primary" /> Registo rápido
        </h1>
        <p className="text-sm text-muted-foreground mt-0.5">Registar trabalho sem abrir um ticket</p>
      </div>

      <Card>
        <CardContent className="p-5 space-y-4">
          {/* Cliente + Ticket */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Cliente *</Label>
              <Select value={clientId} onValueChange={(v) => { setClientId(v); setTicketId("none"); }}>
                <SelectTrigger><SelectValue placeholder="Selecionar cliente…" /></SelectTrigger>
                <SelectContent>
                  {clientes.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Ticket (opcional)</Label>
              <Select value={ticketId} onValueChange={setTicketId} disabled={!clientId}>
                <SelectTrigger><SelectValue placeholder="Associar ticket…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sem ticket</SelectItem>
                  {tickets.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      #{String(t.numero).padStart(5, "0")} {t.titulo}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Descrição */}
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="O que foi feito…"
              rows={2}
              className="resize-none"
            />
          </div>

          {/* Timer */}
          <div className="bg-secondary/40 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <Clock className="h-4 w-4" /> Tempo
              </Label>
              {!timerRunning ? (
                <Button type="button" size="sm" onClick={startTimer} className="gap-1">
                  <Play className="h-4 w-4" /> Iniciar timer
                </Button>
              ) : (
                <Button type="button" size="sm" variant="destructive" onClick={stopTimer} className="gap-1">
                  <Square className="h-4 w-4" /> Parar
                </Button>
              )}
            </div>

            {(timerRunning || timerSeconds > 0) && (
              <div className="text-center">
                <p className="text-4xl font-mono font-bold tracking-wider">
                  {formatTimer(timerSeconds)}
                </p>
                {timerRunning && (
                  <p className="text-xs text-primary mt-1 animate-pulse">Timer a correr…</p>
                )}
              </div>
            )}

            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} value={horas}
                  onChange={(e) => setHoras(Math.max(0, Number(e.target.value)))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">horas</span>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  type="number" min={0} max={59} value={minutos}
                  onChange={(e) => setMinutos(Math.max(0, Math.min(59, Number(e.target.value))))}
                  className="w-20"
                />
                <span className="text-sm text-muted-foreground">min</span>
              </div>
            </div>
          </div>

          {/* Data + Opções */}
          <div className="flex items-end gap-4">
            <div className="space-y-1.5">
              <Label>Data</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} className="w-40" />
            </div>
            <div className="flex items-center gap-2 pb-1">
              <Checkbox
                id="deduct"
                checked={deduct}
                onCheckedChange={(v) => setDeduct(!!v)}
              />
              <Label htmlFor="deduct" className="text-sm cursor-pointer font-normal">
                Deduzir das horas contratadas
              </Label>
            </div>
          </div>

          <Button
            onClick={() => saveEntry.mutate()}
            disabled={!canSubmit || saveEntry.isPending}
            className="w-full h-11 text-base"
          >
            {saveEntry.isPending ? "A guardar…" : (
              <><Check className="h-5 w-5 mr-2" /> Registar trabalho</>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Registos desta sessão */}
      {recent.length > 0 && (
        <Card>
          <CardContent className="p-4 space-y-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Registos desta sessão</p>
            {recent.map((r, i) => (
              <div key={i} className="flex items-center gap-3 text-sm p-2 rounded-md bg-emerald-500/10">
                <Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span className="font-medium">{r.client}</span>
                <span className="text-muted-foreground truncate flex-1">{r.description}</span>
                <span className="text-muted-foreground shrink-0 font-mono text-xs">{r.time}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
