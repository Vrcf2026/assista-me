import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ArrowLeft, Camera, Check, MessageSquarePlus, Play, Square } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/campanhas_/execucao/$clienteId")({
  component: Page,
});

interface Item {
  id: string;
  descricao: string;
  concluida: boolean;
  foto_url: string | null;
  observacao: string | null;
  minutos: number | null;
}
interface CampCliente {
  id: string;
  campanha_id: string;
  estado: string;
  minutos: number;
  notas: string | null;
  clients: { nome: string } | null;
  campanhas: { id: string; titulo: string } | null;
}

function Page() {
  return (
    <RequireRole role="admin">
      <AppLayout><Inner /></AppLayout>
    </RequireRole>
  );
}

function Inner() {
  const { clienteId } = Route.useParams();
  const navigate = useNavigate();
  const [cc, setCc] = useState<CampCliente | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [notas, setNotas] = useState("");
  const [minutos, setMinutos] = useState(0);
  const [timeMode, setTimeMode] = useState<"manual" | "chrono" | "range">("manual");
  const [chronoStart, setChronoStart] = useState<number | null>(null);
  const [chronoElapsed, setChronoElapsed] = useState(0);
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFim, setHoraFim] = useState("");
  const [busy, setBusy] = useState(false);
  const [openObsId, setOpenObsId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const minutosRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("campanha_clientes")
      .select("id, campanha_id, estado, minutos, notas, clients(nome), campanhas(id, titulo)")
      .eq("id", clienteId).single();
    if (error || !data) { toast.error(error?.message ?? "Não encontrado"); return; }
    const r = data as unknown as CampCliente;
    setCc(r); setNotas(r.notas ?? ""); setMinutos(r.minutos ?? 0);

    const { data: ck } = await supabase
      .from("campanha_checklist")
      .select("id, descricao, concluida, foto_url, observacao, minutos, ordem")
      .eq("campanha_cliente_id", clienteId)
      .order("ordem");
    setItems((ck ?? []) as Item[]);
  };
  useEffect(() => { void load(); }, [clienteId]);

  // Cronómetro
  useEffect(() => {
    if (chronoStart == null) return;
    setChronoElapsed(Date.now() - chronoStart);
    const t = window.setInterval(() => setChronoElapsed(Date.now() - chronoStart), 1000);
    return () => window.clearInterval(t);
  }, [chronoStart]);

  const pad = (n: number) => String(n).padStart(2, "0");
  const formatElapsed = (ms: number) => {
    const s = Math.floor(ms / 1000);
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`;
  };
  const nowHHMM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

  const computeMin = (): number => {
    if (timeMode === "manual") return minutos || 0;
    if (timeMode === "chrono") {
      if (chronoStart != null) return Math.max(1, Math.round((Date.now() - chronoStart) / 60000));
      return minutos || 0;
    }
    if (timeMode === "range") {
      if (!horaInicio || !horaFim) return 0;
      const [h1, m1] = horaInicio.split(":").map(Number);
      const [h2, m2] = horaFim.split(":").map(Number);
      let mins = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (mins <= 0) mins += 24 * 60;
      return mins;
    }
    return 0;
  };
  const stopChrono = () => {
    if (chronoStart == null) return;
    const mins = Math.max(1, Math.round((Date.now() - chronoStart) / 60000));
    setChronoStart(null); setChronoElapsed(0); setMinutos(mins); setTimeMode("manual");
    toast.success(`${mins} min preenchidos`);
  };

  const toggleItem = async (it: Item) => {
    const next = !it.concluida;
    await supabase.from("campanha_checklist").update({
      concluida: next,
      concluida_em: next ? new Date().toISOString() : null,
    }).eq("id", it.id);
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, concluida: next } : x));
    if (next) setTimeout(() => minutosRefs.current[it.id]?.focus(), 50);
  };
  const updateMin = async (it: Item, v: number | null) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, minutos: v } : x));
    await supabase.from("campanha_checklist").update({ minutos: v }).eq("id", it.id);
  };
  const updateObs = async (it: Item, v: string) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, observacao: v } : x));
    await supabase.from("campanha_checklist").update({ observacao: v }).eq("id", it.id);
  };
  const uploadFoto = async (it: Item, file: File) => {
    const path = `${clienteId}/${it.id}-${Date.now()}-${file.name}`;
    const { error } = await supabase.storage.from("campanhas-fotos").upload(path, file, { upsert: true });
    if (error) return toast.error(error.message);
    const { data: pub } = supabase.storage.from("campanhas-fotos").getPublicUrl(path);
    await supabase.from("campanha_checklist").update({ foto_url: pub.publicUrl }).eq("id", it.id);
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, foto_url: pub.publicUrl } : x));
    toast.success("Foto guardada");
  };

  const concluir = async () => {
    if (!cc) return;
    const pendentes = items.filter(i => !i.concluida).length;
    if (pendentes > 0 && !confirm(`Há ${pendentes} tarefa(s) por fazer. Concluir mesmo assim?`)) return;
    setBusy(true);
    try {
      let finalMin = computeMin();
      const totalTar = items.reduce((s, i) => s + (i.minutos || 0), 0);
      if (finalMin === 0 && totalTar > 0 && confirm(`Usar o total das tarefas (${totalTar} min)?`)) {
        finalMin = totalTar;
      }
      const { error } = await supabase.from("campanha_clientes").update({
        estado: "concluido",
        minutos: finalMin,
        notas: notas || null,
        concluido_em: new Date().toISOString(),
      }).eq("id", clienteId);
      if (error) throw error;

      // Verificar se todos os clientes da campanha estão concluídos
      const { data: outros } = await supabase
        .from("campanha_clientes")
        .select("estado")
        .eq("campanha_id", cc.campanha_id);
      const todosConcluidos = (outros ?? []).every(o => o.estado === "concluido");
      if (todosConcluidos && cc.campanhas) {
        if (confirm("Todos os clientes concluídos. Marcar campanha como concluída?")) {
          await supabase.from("campanhas").update({ estado: "concluida" }).eq("id", cc.campanha_id);
        }
      }

      toast.success("Cliente concluído");
      if (cc.campanhas) {
        navigate({ to: "/campanhas/$id", params: { id: cc.campanha_id } });
      } else {
        navigate({ to: "/campanhas" });
      }
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  if (!cc) return null;
  const concluidas = items.filter(i => i.concluida).length;
  const pct = items.length === 0 ? 0 : Math.round((concluidas / items.length) * 100);
  const isDone = cc.estado === "concluido";

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/campanhas/$id", params: { id: cc.campanha_id } })}>
        <ArrowLeft className="h-4 w-4 mr-1" />Voltar à campanha
      </Button>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">{cc.campanhas?.titulo}</div>
            <h1 className="text-xl font-semibold">{cc.clients?.nome}</h1>
          </div>
          <Badge className={isDone ? "bg-emerald-600 text-white" : "bg-blue-600 text-white"}>
            {isDone ? "Concluído" : "Em curso"}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span>{concluidas} de {items.length} tarefas</span><span>{pct}%</span></div>
          <Progress value={pct} />
        </div>
      </Card>

      {/* Tempo */}
      <Card className="p-4 space-y-3">
        <Label className="text-xs">Tempo de execução</Label>
        <div className="flex gap-1 border rounded p-0.5 bg-background w-fit">
          {(["manual", "chrono", "range"] as const).map(m => (
            <button
              key={m}
              type="button"
              onClick={() => setTimeMode(m)}
              disabled={isDone}
              className={`px-3 py-1 text-xs rounded ${timeMode === m ? "bg-primary text-primary-foreground" : "hover:bg-secondary"}`}
            >
              {m === "manual" ? "Manual" : m === "chrono" ? "Cronómetro" : "Início/Fim"}
            </button>
          ))}
        </div>
        {timeMode === "manual" && (
          <div>
            <Label className="text-xs">Minutos</Label>
            <Input type="number" min={0} className="w-32" value={minutos || ""} onChange={e => setMinutos(parseInt(e.target.value) || 0)} disabled={isDone} />
          </div>
        )}
        {timeMode === "chrono" && (
          <div className="flex items-center justify-between gap-3">
            <div className="font-mono text-2xl tabular-nums">{formatElapsed(chronoElapsed)}</div>
            {chronoStart == null ? (
              <Button size="sm" onClick={() => setChronoStart(Date.now())} disabled={isDone}><Play className="h-3.5 w-3.5 mr-1" />Iniciar</Button>
            ) : (
              <Button size="sm" variant="destructive" onClick={stopChrono}><Square className="h-3.5 w-3.5 mr-1" />Parar</Button>
            )}
          </div>
        )}
        {timeMode === "range" && (
          <div className="flex gap-3 flex-wrap">
            <div>
              <Label className="text-xs">Início</Label>
              <div className="flex gap-1">
                <Input type="time" value={horaInicio} onChange={e => setHoraInicio(e.target.value)} className="w-28" disabled={isDone} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setHoraInicio(nowHHMM())} disabled={isDone}>Agora</Button>
              </div>
            </div>
            <div>
              <Label className="text-xs">Fim</Label>
              <div className="flex gap-1">
                <Input type="time" value={horaFim} onChange={e => setHoraFim(e.target.value)} className="w-28" disabled={isDone} />
                <Button type="button" size="sm" variant="ghost" onClick={() => setHoraFim(nowHHMM())} disabled={isDone}>Agora</Button>
              </div>
            </div>
            {horaInicio && horaFim && <div className="text-xs text-muted-foreground self-end pb-2">= {computeMin()} min</div>}
          </div>
        )}
        <div className="text-xs text-muted-foreground">Total: <span className="font-mono font-semibold text-foreground">{computeMin()} min</span></div>
      </Card>

      {/* Notas */}
      <Card className="p-4 space-y-2">
        <Label>Notas (este cliente)</Label>
        <Textarea rows={3} value={notas} onChange={e => setNotas(e.target.value)} disabled={isDone} />
      </Card>

      {/* Checklist */}
      <div className="space-y-2">
        {items.map(it => (
          <Card key={it.id} className={`p-3 ${it.concluida ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}`}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => void toggleItem(it)}
                disabled={isDone}
                className={`flex-shrink-0 h-8 w-8 rounded border-2 flex items-center justify-center mt-0.5 ${it.concluida ? "bg-emerald-600 border-emerald-600 text-white" : "border-border"}`}
              >
                {it.concluida && <Check className="h-5 w-5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className={`text-sm ${it.concluida ? "line-through text-muted-foreground" : ""}`}>{it.descricao}</div>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    <Input
                      ref={el => { minutosRefs.current[it.id] = el; }}
                      type="number" min={0} placeholder="min"
                      value={it.minutos ?? ""}
                      onChange={e => {
                        const v = e.target.value === "" ? null : parseInt(e.target.value);
                        void updateMin(it, Number.isNaN(v as number) ? null : v);
                      }}
                      disabled={isDone}
                      className="w-16 h-8 text-sm tabular-nums"
                    />
                    <span className="text-xs text-muted-foreground">min</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <input
                    ref={el => { fileRefs.current[it.id] = el; }}
                    type="file" accept="image/*" capture="environment" className="hidden"
                    onChange={e => { const f = e.target.files?.[0]; if (f) void uploadFoto(it, f); }}
                  />
                  <Button size="sm" variant="outline" onClick={() => fileRefs.current[it.id]?.click()} disabled={isDone}>
                    <Camera className="h-3.5 w-3.5 mr-1" />Foto
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setOpenObsId(openObsId === it.id ? null : it.id)} disabled={isDone}>
                    <MessageSquarePlus className="h-3.5 w-3.5 mr-1" />Nota
                  </Button>
                  {it.foto_url && <a href={it.foto_url} target="_blank" rel="noreferrer" className="text-xs underline">ver foto</a>}
                </div>
                {(openObsId === it.id || it.observacao) && (
                  <Textarea
                    className="mt-2" rows={2} placeholder="Observação"
                    value={it.observacao ?? ""}
                    onChange={e => updateObs(it, e.target.value)}
                    disabled={isDone}
                  />
                )}
              </div>
            </div>
          </Card>
        ))}
        {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Sem tarefas nesta campanha.</p>}
      </div>

      {!isDone && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-background border-t md:static md:border-0 md:p-0">
          <div className="max-w-2xl mx-auto">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" size="lg" onClick={() => void concluir()} disabled={busy}>
              <Check className="h-5 w-5 mr-1" />Concluir
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
