import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Lock } from "lucide-react";
import { formatMinutes } from "@/lib/format";
import { EscalateDialog, CloseDialog } from "./dialogs";
import type { Ticket } from "./types";

export function AdminPanel({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const [tecnico, setTecnico] = useState(ticket.tecnico_responsavel ?? "");
  const [prio, setPrio] = useState(ticket.prioridade);
  const [estado, setEstado] = useState(ticket.estado);
  const [tipo, setTipo] = useState(ticket.tipo_intervencao);
  const [escalateOpen, setEscalateOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTecnico(ticket.tecnico_responsavel ?? "");
    setPrio(ticket.prioridade);
    setEstado(ticket.estado);
    setTipo(ticket.tipo_intervencao);
  }, [ticket]);

  const saveBasics = async () => {
    setBusy(true);
    const { error } = await supabase.from("tickets").update({
      tecnico_responsavel: tecnico || null,
      prioridade: prio,
    }).eq("id", ticket.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Guardado");
    onChange();
  };

  const changeEstado = async (newEstado: typeof estado) => {
    if (newEstado === "fechado") { setCloseOpen(true); return; }
    setEstado(newEstado);
    const { error } = await supabase.from("tickets").update({ estado: newEstado }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Estado atualizado");
    onChange();
  };

  const changeTipo = (newTipo: typeof tipo) => {
    if (newTipo === tipo) return;
    setTipo(newTipo);
    setEscalateOpen(true);
  };

  return (
    <Card className="p-4 bg-secondary/30">
      <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
        <Lock className="h-3.5 w-3.5" /> Painel do técnico
      </h3>
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Técnico responsável</Label>
          <Input value={tecnico} onChange={(e) => setTecnico(e.target.value)} placeholder="Nome" />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Prioridade</Label>
          <Select value={prio} onValueChange={(v) => setPrio(v as typeof prio)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="baixa">Baixa</SelectItem>
              <SelectItem value="media">Média</SelectItem>
              <SelectItem value="alta">Alta</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Estado</Label>
          <Select value={estado} onValueChange={(v) => changeEstado(v as typeof estado)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="aberto">Aberto</SelectItem>
              <SelectItem value="em_progresso">Em Progresso</SelectItem>
              <SelectItem value="aguarda_cliente">Aguarda Cliente</SelectItem>
              <SelectItem value="fechado">Fechado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Tipo de intervenção</Label>
          <Select value={tipo} onValueChange={(v) => changeTipo(v as typeof tipo)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="remota">Remota / Telefónica</SelectItem>
              <SelectItem value="presencial">Presencial</SelectItem>
              <SelectItem value="preventiva">Preventiva</SelectItem>
              <SelectItem value="critica">Crítica (SLA 8h úteis)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end mt-3">
        <Button size="sm" onClick={saveBasics} disabled={busy}>Guardar</Button>
      </div>

      <div className="border-t mt-4 pt-4">
        <p className="text-xs text-muted-foreground">
          Use o painel <strong>Tempo registado</strong> abaixo para adicionar entradas detalhadas (com data e descrição).
          Total atual: <span className="font-mono">{formatMinutes(ticket.tempo_gasto_minutos)}</span>
        </p>
      </div>

      <EscalateDialog
        open={escalateOpen}
        onOpenChange={setEscalateOpen}
        ticket={ticket}
        novoTipo={tipo}
        onCancel={() => setTipo(ticket.tipo_intervencao)}
        onDone={onChange}
      />
      <CloseDialog
        open={closeOpen}
        onOpenChange={setCloseOpen}
        ticket={ticket}
        onCancel={() => setEstado(ticket.estado)}
        onDone={onChange}
      />
    </Card>
  );
}
