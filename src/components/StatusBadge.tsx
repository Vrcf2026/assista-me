import { ESTADO_LABELS, PRIORIDADE_LABELS, TIPO_LABELS } from "@/lib/format";

const STATUS_CLS: Record<string, string> = {
  aberto: "bg-status-aberto/15 text-status-aberto border-status-aberto/30",
  em_progresso:
    "bg-status-progresso/15 text-status-progresso border-status-progresso/30",
  aguarda_cliente:
    "bg-status-aguarda/15 text-status-aguarda border-status-aguarda/30",
  fechado: "bg-status-fechado/15 text-status-fechado border-status-fechado/30",
};

const PRIO_CLS: Record<string, string> = {
  baixa: "bg-muted text-muted-foreground border-border",
  media: "bg-status-aguarda/15 text-status-aguarda border-status-aguarda/30",
  alta: "bg-destructive/15 text-destructive border-destructive/30",
};

const TIPO_CLS: Record<string, string> = {
  remota: "bg-secondary text-secondary-foreground border-border",
  presencial: "bg-accent text-accent-foreground border-border",
  preventiva: "bg-purple-100 text-purple-800 border-purple-300 dark:bg-purple-950 dark:text-purple-200 dark:border-purple-800",
  critica: "bg-destructive/15 text-destructive border-destructive/30",
};

export function StatusBadge({ estado }: { estado: string }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${STATUS_CLS[estado] ?? ""}`}
    >
      {ESTADO_LABELS[estado] ?? estado}
    </span>
  );
}

export function PriorityBadge({ prioridade }: { prioridade: string }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${PRIO_CLS[prioridade] ?? ""}`}
    >
      {PRIORIDADE_LABELS[prioridade] ?? prioridade}
    </span>
  );
}

export function TipoBadge({ tipo }: { tipo: string }) {
  return (
    <span
      className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded border ${TIPO_CLS[tipo] ?? ""}`}
    >
      {TIPO_LABELS[tipo] ?? tipo}
    </span>
  );
}
