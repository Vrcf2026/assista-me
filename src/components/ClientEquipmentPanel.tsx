import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertTriangle, Plus, Trash2, MonitorSmartphone, Pencil } from "lucide-react";
import { toast } from "sonner";

interface Equipment {
  id: string;
  client_id: string;
  tipo: string;
  marca: string;
  modelo: string;
  numero_serie: string | null;
  data_instalacao: string | null;
  fim_garantia: string | null;
  notas: string | null;
}

const TIPOS = ["PC", "NAS", "Router", "Switch", "CCTV", "Servidor", "Impressora", "UPS", "Outro"];

const TIPO_EMOJI: Record<string, string> = {
  PC: "💻", NAS: "🗄️", Router: "📡", Switch: "🔀",
  CCTV: "📹", Servidor: "🖥️", Impressora: "🖨️", UPS: "🔋", Outro: "🔧",
};

function garantiaStatus(fim: string | null): "ok" | "alerta" | "expirada" | null {
  if (!fim) return null;
  const diff = new Date(fim).getTime() - Date.now();
  if (diff < 0) return "expirada";
  if (diff < 90 * 86400_000) return "alerta";
  return "ok";
}

interface Props {
  clientId: string;
  canEdit?: boolean;
}

export function ClientEquipmentPanel({ clientId, canEdit = false }: Props) {
  const qc = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Equipment | null>(null);

  // Form state
  const [tipo, setTipo] = useState("PC");
  const [marca, setMarca] = useState("");
  const [modelo, setModelo] = useState("");
  const [serie, setSerie] = useState("");
  const [instalacao, setInstalacao] = useState("");
  const [garantia, setGarantia] = useState("");
  const [notas, setNotas] = useState("");

  const resetForm = () => {
    setTipo("PC"); setMarca(""); setModelo("");
    setSerie(""); setInstalacao(""); setGarantia(""); setNotas("");
    setEditing(null);
  };

  const openCreate = () => { resetForm(); setDialogOpen(true); };
  const openEdit = (e: Equipment) => {
    setEditing(e);
    setTipo(e.tipo); setMarca(e.marca); setModelo(e.modelo);
    setSerie(e.numero_serie ?? ""); setInstalacao(e.data_instalacao ?? "");
    setGarantia(e.fim_garantia ?? ""); setNotas(e.notas ?? "");
    setDialogOpen(true);
  };

  const { data: equipamentos = [], isLoading } = useQuery<Equipment[]>({
    queryKey: ["client-equipment", clientId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("client_equipment" as any)
        .select("*")
        .eq("client_id", clientId)
        .order("tipo").order("marca");
      if (error) throw error;
      return (data ?? []) as unknown as Equipment[];
    },
  });

  const upsert = useMutation({
    mutationFn: async () => {
      if (!marca.trim()) throw new Error("Marca obrigatória");
      const payload = {
        client_id: clientId,
        tipo,
        marca: marca.trim(),
        modelo: modelo.trim(),
        numero_serie: serie.trim() || null,
        data_instalacao: instalacao || null,
        fim_garantia: garantia || null,
        notas: notas.trim() || null,
      };
      if (editing) {
        const { error } = await supabase
          .from("client_equipment" as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("client_equipment" as any).insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-equipment", clientId] });
      toast.success(editing ? "Equipamento actualizado" : "Equipamento adicionado");
      setDialogOpen(false);
      resetForm();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erro"),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("client_equipment" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["client-equipment", clientId] });
      toast.success("Equipamento removido");
    },
  });

  const expirando = equipamentos.filter((e) => {
    const s = garantiaStatus(e.fim_garantia);
    return s === "alerta" || s === "expirada";
  });

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <MonitorSmartphone className="h-4 w-4" /> Equipamentos ({equipamentos.length})
        </h3>
        {canEdit && (
          <Button variant="ghost" size="sm" onClick={openCreate}>
            <Plus className="h-4 w-4 mr-1" /> Adicionar
          </Button>
        )}
      </div>

      {/* Alertas de garantia */}
      {expirando.length > 0 && (
        <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 space-y-0.5">
          <p className="text-xs font-medium text-amber-700 dark:text-amber-400 flex items-center gap-1">
            <AlertTriangle className="h-3.5 w-3.5" /> Garantias a verificar
          </p>
          {expirando.map((e) => {
            const s = garantiaStatus(e.fim_garantia);
            return (
              <p key={e.id} className="text-xs text-amber-600 dark:text-amber-300">
                {TIPO_EMOJI[e.tipo] ?? "🔧"} {e.marca} {e.modelo} —{" "}
                {s === "expirada"
                  ? <span className="font-medium text-red-600 dark:text-red-400">Garantia expirada ({e.fim_garantia})</span>
                  : <span>Garantia expira em {e.fim_garantia}</span>
                }
              </p>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-1.5">
          {[1, 2].map((i) => <div key={i} className="h-10 rounded bg-secondary animate-pulse" />)}
        </div>
      ) : equipamentos.length === 0 ? (
        <p className="text-xs text-muted-foreground text-center py-3">Sem equipamentos registados.</p>
      ) : (
        <ul className="space-y-1.5">
          {equipamentos.map((e) => {
            const gs = garantiaStatus(e.fim_garantia);
            return (
              <li key={e.id} className="flex items-center gap-2 text-sm p-2 rounded-md hover:bg-secondary/40 group">
                <span className="text-base shrink-0">{TIPO_EMOJI[e.tipo] ?? "🔧"}</span>
                <div className="flex-1 min-w-0">
                  <span className="font-medium">{e.marca}</span>
                  {e.modelo && <span className="text-muted-foreground ml-1">{e.modelo}</span>}
                  {e.numero_serie && (
                    <span className="text-muted-foreground text-xs ml-1">· {e.numero_serie}</span>
                  )}
                </div>
                {gs === "expirada" && (
                  <Badge variant="destructive" className="text-xs shrink-0">Expirada</Badge>
                )}
                {gs === "alerta" && (
                  <Badge className="text-xs shrink-0 bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30">
                    Alerta
                  </Badge>
                )}
                {gs === "ok" && e.fim_garantia && (
                  <span className="text-xs text-muted-foreground shrink-0">{e.fim_garantia}</span>
                )}
                {canEdit && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => openEdit(e)}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost" size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => { if (confirm("Eliminar?")) void remove.mutateAsync(e.id); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {/* Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(o) => { if (!o) resetForm(); setDialogOpen(o); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar equipamento" : "Adicionar equipamento"}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={tipo} onValueChange={setTipo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {TIPOS.map((t) => <SelectItem key={t} value={t}>{TIPO_EMOJI[t]} {t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Marca *</Label>
              <Input value={marca} onChange={(e) => setMarca(e.target.value)} placeholder="ex: HP" />
            </div>
            <div className="space-y-1.5">
              <Label>Modelo</Label>
              <Input value={modelo} onChange={(e) => setModelo(e.target.value)} placeholder="ex: ProBook 450" />
            </div>
            <div className="space-y-1.5">
              <Label>Nº de série</Label>
              <Input value={serie} onChange={(e) => setSerie(e.target.value)} placeholder="opcional" />
            </div>
            <div className="space-y-1.5">
              <Label>Data instalação</Label>
              <Input type="date" value={instalacao} onChange={(e) => setInstalacao(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fim de garantia</Label>
              <Input type="date" value={garantia} onChange={(e) => setGarantia(e.target.value)} />
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>Notas</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} placeholder="opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
            <Button onClick={() => upsert.mutate()} disabled={!marca.trim() || upsert.isPending}>
              {upsert.isPending ? "A guardar…" : editing ? "Actualizar" : "Adicionar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
