import { useState } from "react";
import { useTicketTimer } from "@/hooks/use-ticket-timer";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Play, Pause, Save, Trash2, Clock } from "lucide-react";

interface Props {
  ticketId: string;
  tipoIntervencao: string;
  isAdmin: boolean;
  onSaved?: () => void;
}

function formatElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function TicketTimer({ ticketId, tipoIntervencao, isAdmin, onSaved }: Props) {
  const { elapsed, isRunning, saving, pause, resume, save, discard } =
    useTicketTimer(ticketId, tipoIntervencao, isAdmin);

  const [saveOpen, setSaveOpen] = useState(false);
  const [descricao, setDescricao] = useState("");
  const [discardOpen, setDiscardOpen] = useState(false);

  if (!isAdmin) return null;

  const mins = Math.round(elapsed / 60);
  const isActive = elapsed > 0;

  const handleSave = async () => {
    await save(descricao);
    setSaveOpen(false);
    setDescricao("");
    onSaved?.();
  };

  const handleDiscard = () => {
    discard();
    setDiscardOpen(false);
  };

  return (
    <>
      <div className="flex items-center gap-2 bg-secondary/40 border border-border rounded-lg px-3 py-2">
        <Clock className="h-4 w-4 text-muted-foreground shrink-0" />

        {/* Display do tempo */}
        <span
          className={`font-mono text-sm font-semibold tabular-nums min-w-[52px] ${
            isRunning ? "text-primary" : "text-muted-foreground"
          }`}
        >
          {formatElapsed(elapsed)}
        </span>

        {/* Indicador a piscar quando está a correr */}
        {isRunning && (
          <span className="h-2 w-2 rounded-full bg-green-500 animate-pulse shrink-0" />
        )}
        {!isRunning && isActive && (
          <span className="h-2 w-2 rounded-full bg-amber-500 shrink-0" />
        )}

        <div className="flex-1" />

        {/* Pause / Resume */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2"
          onClick={isRunning ? pause : resume}
          title={isRunning ? "Pausar timer" : "Retomar timer"}
        >
          {isRunning ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
        </Button>

        {/* Guardar */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-primary"
          disabled={!isActive || mins < 1}
          onClick={() => { pause(); setSaveOpen(true); }}
          title="Guardar tempo"
        >
          <Save className="h-3.5 w-3.5" />
        </Button>

        {/* Descartar */}
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-destructive"
            onClick={() => setDiscardOpen(true)}
            title="Descartar timer"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>

      {/* Modal guardar */}
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Guardar tempo registado</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="flex items-center gap-3 bg-secondary/40 rounded-md px-4 py-3">
              <Clock className="h-5 w-5 text-muted-foreground" />
              <span className="font-mono text-xl font-bold">{formatElapsed(elapsed)}</span>
              <span className="text-sm text-muted-foreground">({mins} min)</span>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Descrição do trabalho <span className="text-muted-foreground">(opcional)</span></Label>
              <Textarea
                value={descricao}
                onChange={(e) => setDescricao(e.target.value)}
                placeholder="Ex: Diagnóstico remoto, configuração VPN, …"
                rows={3}
                autoFocus
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setSaveOpen(false); resume(); }}>
              Cancelar
            </Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving ? "A guardar…" : "Guardar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal descartar */}
      <Dialog open={discardOpen} onOpenChange={setDiscardOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Descartar timer?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground py-2">
            O tempo de <span className="font-mono font-semibold">{formatElapsed(elapsed)}</span> será perdido e não ficará registado.
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDiscardOpen(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={handleDiscard}>Descartar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
