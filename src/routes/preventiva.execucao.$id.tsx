import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { Camera, Check, MessageSquarePlus, Play, Square, ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/preventiva/execucao/$id")({
  component: Page,
});

interface Item {
  id: string;
  descricao: string;
  concluida: boolean;
  foto_url: string | null;
  observacao: string | null;
  concluida_em: string | null;
}

interface ExecData {
  id: string;
  estado: string;
  observacoes: string | null;
  minutos: number;
  data_execucao: string;
  agendamento_id: string;
  template_id: string;
  client_id: string;
  clients: { nome: string } | null;
  preventiva_templates: { nome: string; periodicidade: string } | null;
}

function Page() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate]);
  if (loading || role !== "admin") return null;
  return <AppLayout><Inner /></AppLayout>;
}

function Inner() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const [exec, setExec] = useState<ExecData | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [obs, setObs] = useState("");
  const [minutos, setMinutos] = useState(0);
  const [running, setRunning] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const [busy, setBusy] = useState(false);
  const [openObsId, setOpenObsId] = useState<string | null>(null);
  const fileRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = async () => {
    const { data, error } = await supabase
      .from("preventiva_execucoes")
      .select("id, estado, observacoes, minutos, data_execucao, agendamento_id, template_id, client_id, clients(nome), preventiva_templates(nome, periodicidade)")
      .eq("id", id).single();
    if (error || !data) { toast.error(error?.message ?? "Não encontrado"); return; }
    const e = data as unknown as ExecData;
    setExec(e); setObs(e.observacoes ?? ""); setMinutos(e.minutos ?? 0);

    const { data: ck } = await supabase
      .from("preventiva_checklist")
      .select("id, descricao, concluida, foto_url, observacao, concluida_em")
      .eq("execucao_id", id)
      .order("created_at");
    setItems((ck ?? []) as Item[]);
  };
  useEffect(() => { void load(); }, [id]);

  // Timer tick
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setTick(x => x + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  const liveMin = running && startedAt ? Math.floor((Date.now() - startedAt) / 60000) : 0;
  const totalMin = minutos + liveMin;

  const toggleTimer = () => {
    if (running) {
      setMinutos(m => m + Math.max(1, Math.floor((Date.now() - (startedAt ?? Date.now())) / 60000)));
      setRunning(false); setStartedAt(null);
    } else {
      setStartedAt(Date.now()); setRunning(true);
    }
  };

  const toggleItem = async (it: Item) => {
    const next = !it.concluida;
    const { error } = await supabase.from("preventiva_checklist").update({
      concluida: next,
      concluida_em: next ? new Date().toISOString() : null,
    }).eq("id", it.id);
    if (error) return toast.error(error.message);
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, concluida: next, concluida_em: next ? new Date().toISOString() : null } : x));
  };

  const updateObs = async (it: Item, value: string) => {
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, observacao: value } : x));
    await supabase.from("preventiva_checklist").update({ observacao: value }).eq("id", it.id);
  };

  const uploadFoto = async (it: Item, file: File) => {
    const path = `${id}/${it.id}-${Date.now()}-${file.name}`;
    const { error: upErr } = await supabase.storage.from("preventiva-fotos").upload(path, file, { upsert: true });
    if (upErr) return toast.error(upErr.message);
    const { data: pub } = supabase.storage.from("preventiva-fotos").getPublicUrl(path);
    await supabase.from("preventiva_checklist").update({ foto_url: pub.publicUrl }).eq("id", it.id);
    setItems(prev => prev.map(x => x.id === it.id ? { ...x, foto_url: pub.publicUrl } : x));
    toast.success("Foto guardada");
  };

  const concluir = async () => {
    if (!exec) return;
    const pendentes = items.filter(i => !i.concluida).length;
    if (pendentes > 0 && !confirm(`Há ${pendentes} tarefa(s) por fazer. Concluir mesmo assim?`)) return;
    setBusy(true);
    try {
      let finalMin = minutos;
      if (running && startedAt) finalMin += Math.max(1, Math.floor((Date.now() - startedAt) / 60000));

      // Update execucao
      const { error } = await supabase.from("preventiva_execucoes").update({
        estado: "concluida",
        observacoes: obs || null,
        minutos: finalMin,
      }).eq("id", id);
      if (error) throw error;

      // Calc proxima data
      const period = exec.preventiva_templates?.periodicidade ?? "mensal";
      const today = new Date();
      const next = new Date(today);
      const months = period === "trimestral" ? 3 : period === "semestral" ? 6 : period === "anual" ? 12 : 1;
      next.setMonth(next.getMonth() + months);

      const { error: aErr } = await supabase.from("preventiva_agendamentos").update({
        ultima_data: today.toISOString().slice(0,10),
        proxima_data: next.toISOString().slice(0,10),
      }).eq("id", exec.agendamento_id);
      if (aErr) throw aErr;

      toast.success("Manutenção concluída");
      navigate({ to: "/preventiva" });
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Erro ao concluir");
    } finally {
      setBusy(false);
    }
  };

  const saveObs = async () => {
    if (!exec) return;
    await supabase.from("preventiva_execucoes").update({ observacoes: obs || null, minutos }).eq("id", id);
    toast.success("Guardado");
  };

  if (!exec) return null;
  const concluidas = items.filter(i => i.concluida).length;
  const pct = items.length === 0 ? 0 : Math.round((concluidas / items.length) * 100);
  const isDone = exec.estado === "concluida";

  return (
    <div className="max-w-2xl mx-auto space-y-4 pb-24">
      <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/preventiva" })}>
        <ArrowLeft className="h-4 w-4 mr-1" />Voltar
      </Button>

      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div>
            <div className="text-xs text-muted-foreground">{exec.clients?.nome}</div>
            <h1 className="text-xl font-semibold">{exec.preventiva_templates?.nome}</h1>
            <div className="text-xs text-muted-foreground">{new Date(exec.data_execucao).toLocaleDateString("pt-PT")}</div>
          </div>
          <Badge variant={isDone ? "default" : "secondary"} className={isDone ? "bg-emerald-600 text-white" : ""}>
            {isDone ? "Concluída" : "Em curso"}
          </Badge>
        </div>
        <div className="space-y-1">
          <div className="flex justify-between text-xs"><span>{concluidas} de {items.length} tarefas</span><span>{pct}%</span></div>
          <Progress value={pct} />
        </div>
      </Card>

      <Card className="p-4 space-y-2">
        <Label>Observações gerais</Label>
        <Textarea rows={3} value={obs} onChange={e=>setObs(e.target.value)} disabled={isDone} />
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="text-xs">Minutos:</Label>
          <Input type="number" className="w-24" value={minutos} onChange={e=>setMinutos(parseInt(e.target.value) || 0)} disabled={isDone} />
          <Button size="sm" variant={running ? "destructive" : "outline"} onClick={toggleTimer} disabled={isDone}>
            {running ? <><Square className="h-3.5 w-3.5 mr-1" />Parar</> : <><Play className="h-3.5 w-3.5 mr-1" />Iniciar</>}
          </Button>
          {running && <span className="text-xs text-muted-foreground">+{liveMin}m (total {totalMin}m) <span className="hidden">{tick}</span></span>}
          <Button size="sm" variant="ghost" onClick={() => void saveObs()} disabled={isDone}>Guardar</Button>
        </div>
      </Card>

      <div className="space-y-2">
        {items.map(it => (
          <Card key={it.id} className={`p-3 ${it.concluida ? "bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200" : ""}`}>
            <div className="flex items-start gap-3">
              <button
                type="button"
                onClick={() => void toggleItem(it)}
                disabled={isDone}
                className={`flex-shrink-0 h-8 w-8 rounded border-2 flex items-center justify-center mt-0.5 ${it.concluida ? "bg-emerald-600 border-emerald-600 text-white" : "border-border"}`}
                aria-label="Concluir"
              >
                {it.concluida && <Check className="h-5 w-5" />}
              </button>
              <div className="flex-1 min-w-0">
                <div className={`text-sm ${it.concluida ? "line-through text-muted-foreground" : ""}`}>{it.descricao}</div>
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
                    className="mt-2"
                    rows={2}
                    placeholder="Observação"
                    value={it.observacao ?? ""}
                    onChange={e => updateObs(it, e.target.value)}
                    disabled={isDone}
                  />
                )}
              </div>
            </div>
          </Card>
        ))}
      </div>

      {!isDone && (
        <div className="fixed bottom-0 left-0 right-0 p-3 bg-background border-t md:static md:border-0 md:p-0">
          <div className="max-w-2xl mx-auto">
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700 text-white" size="lg" onClick={() => void concluir()} disabled={busy}>
              <Check className="h-5 w-5 mr-1" />Concluir manutenção
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
