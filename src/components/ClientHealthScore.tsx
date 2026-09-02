import { useClientHealth } from "@/hooks/use-client-health";
import { levelEmoji, type HealthScore } from "@/lib/health-score";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Card } from "@/components/ui/card";
import { Link } from "@tanstack/react-router";

// ── Badge compacto (para tabelas e listas) ────────────────────────────────────
export function HealthBadge({ clientId }: { clientId: string }) {
  const { health, loading } = useClientHealth(clientId);

  if (loading) {
    return (
      <span className="inline-block h-5 w-16 rounded bg-muted animate-pulse" />
    );
  }
  if (!health) return null;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border cursor-default ${health.bgColor} ${health.color} ${health.borderColor}`}
          >
            {levelEmoji(health.level)} {health.score}
          </span>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-[200px]">
          <p className="font-semibold mb-1">{health.label}</p>
          {health.insights.map((i) => (
            <p key={i} className="text-muted-foreground">• {i}</p>
          ))}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── Card detalhado (para ficha de cliente) ────────────────────────────────────
export function HealthScoreCard({ clientId }: { clientId: string }) {
  const { health, loading } = useClientHealth(clientId);

  if (loading) {
    return <Card className="p-4 h-40 animate-pulse bg-secondary/40" />;
  }
  if (!health) return null;

  return (
    <Card className={`p-4 border ${health.borderColor} ${health.bgColor}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          {levelEmoji(health.level)} Health Score
        </h3>
        <div className="flex items-center gap-2">
          <span className={`text-2xl font-bold tabular-nums ${health.color}`}>
            {health.score}
          </span>
          <span className="text-muted-foreground text-sm">/100</span>
        </div>
      </div>

      {/* Barra de progresso */}
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-3">
        <div
          className={`h-full rounded-full transition-all ${
            health.level === "saudavel"
              ? "bg-emerald-500"
              : health.level === "atencao"
                ? "bg-amber-500"
                : "bg-red-500"
          }`}
          style={{ width: `${health.score}%` }}
        />
      </div>

      {/* Breakdown */}
      <div className="grid grid-cols-5 gap-1 text-center mb-3">
        {[
          { label: "Freq.", value: health.breakdown.frequencia, max: 30 },
          { label: "Resolv.", value: health.breakdown.resolucao, max: 25 },
          { label: "Sat.", value: health.breakdown.satisfacao, max: 20 },
          { label: "Resp.", value: health.breakdown.resposta, max: 15 },
          { label: "Contrato", value: health.breakdown.contrato, max: 10 },
        ].map((b) => (
          <div key={b.label} className="space-y-0.5">
            <div className="text-[10px] text-muted-foreground">{b.label}</div>
            <div className="text-xs font-semibold">
              {b.value}
              <span className="text-muted-foreground font-normal">/{b.max}</span>
            </div>
            <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full"
                style={{ width: `${(b.value / b.max) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* Insights */}
      <ul className="space-y-0.5">
        {health.insights.map((insight) => (
          <li key={insight} className={`text-xs flex items-center gap-1.5 ${health.color}`}>
            <span>•</span> {insight}
          </li>
        ))}
      </ul>
    </Card>
  );
}

// ── Widget de resumo para o dashboard (lista de clientes em risco) ────────────
interface ClientHealthSummary {
  id: string;
  nome: string;
  health: HealthScore;
}

export function ClientsAtRiskWidget({
  clients,
}: {
  clients: ClientHealthSummary[];
}) {
  const emRisco = clients
    .filter((c) => c.health.level === "risco" || c.health.level === "atencao")
    .sort((a, b) => a.health.score - b.health.score)
    .slice(0, 5);

  if (emRisco.length === 0) return null;

  return (
    <Card className="p-5 shadow-sm">
      <h2 className="text-base font-semibold mb-4 flex items-center gap-2">
        🔴 Clientes a monitorizar ({emRisco.length})
      </h2>
      <div className="space-y-2">
        {emRisco.map((c) => (
          <Link
            key={c.id}
            to="/clientes/$id"
            params={{ id: c.id }}
            className="flex items-center gap-3 p-2.5 rounded-md border hover:bg-secondary/40 transition"
          >
            <span
              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border ${c.health.bgColor} ${c.health.color} ${c.health.borderColor} shrink-0`}
            >
              {levelEmoji(c.health.level)} {c.health.score}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{c.nome}</div>
              <div className={`text-xs ${c.health.color} truncate`}>
                {c.health.insights[0]}
              </div>
            </div>
            <div className="w-20 h-1.5 bg-secondary rounded-full overflow-hidden shrink-0">
              <div
                className={`h-full rounded-full ${
                  c.health.level === "risco" ? "bg-red-500" : "bg-amber-500"
                }`}
                style={{ width: `${c.health.score}%` }}
              />
            </div>
          </Link>
        ))}
      </div>
    </Card>
  );
}
