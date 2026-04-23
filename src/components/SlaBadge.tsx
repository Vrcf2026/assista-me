import { Clock } from "lucide-react";
import { useEffect, useState } from "react";
import { getCriticalSla, formatRemaining } from "@/lib/sla";
import { cn } from "@/lib/utils";

interface Props {
  openedAt: string;
  className?: string;
}

/**
 * Indicador de SLA para tickets críticos.
 * Conta apenas horas úteis (seg-sex, 09h-18h).
 */
export function SlaBadge({ openedAt, className }: Props) {
  const [now, setNow] = useState<Date>(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const sla = getCriticalSla(new Date(openedAt), now);

  const colors =
    sla.status === "breached"
      ? "bg-destructive/15 text-destructive border-destructive/30"
      : sla.status === "warn"
      ? "bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30"
      : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border-emerald-500/30";

  const label =
    sla.status === "breached"
      ? `SLA vencido (${formatRemaining(sla.remainingMinutes)})`
      : `SLA ${formatRemaining(sla.remainingMinutes)} restantes`;

  return (
    <span
      title={`Vence em ${sla.dueAt.toLocaleString("pt-PT")} (8h úteis)`}
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium",
        colors,
        className,
      )}
    >
      <Clock className="h-3 w-3" />
      {label}
    </span>
  );
}
