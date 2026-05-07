import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { formatDate } from "@/lib/format";

interface Props {
  clientId: string;
  tipoContrato?: "avenca" | "pontual";
  horasPacoteAnual: number;
  contratoInicio: string | null;
  contratoFim: string | null;
}

export function HoursPackageWidget({
  clientId, tipoContrato = "avenca", horasPacoteAnual, contratoInicio, contratoFim,
}: Props) {
  const [minutos, setMinutos] = useState<number | null>(null);
  const [pendentesMin, setPendentesMin] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      if (tipoContrato === "avenca") {
        const { data } = await supabase.rpc("client_horas_consumidas_anual", { _client_id: clientId });
        setMinutos(Number(data ?? 0));
      } else {
        // pontual: somar minutos para_faturar dos tickets deste cliente
        const { data: tks } = await supabase
          .from("tickets").select("id").eq("client_id", clientId);
        const ids = (tks ?? []).map((t) => t.id);
        if (ids.length === 0) { setPendentesMin(0); return; }
        const { data: tes } = await supabase
          .from("time_entries").select("minutos")
          .in("ticket_id", ids)
          .eq("estado_faturacao", "para_faturar")
          .eq("nao_contabilizar", false);
        setPendentesMin((tes ?? []).reduce((acc, t) => acc + (t.minutos ?? 0), 0));
      }
    })();
  }, [clientId, tipoContrato]);

  if (tipoContrato === "pontual") {
    const horas = ((pendentesMin ?? 0) / 60).toFixed(2);
    return (
      <Card className="p-4">
        <h3 className="text-sm font-semibold">Contrato pontual</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {horas}h faturáveis pendentes
        </p>
      </Card>
    );
  }

  if (horasPacoteAnual <= 0) return null;
  const usadasH = (minutos ?? 0) / 60;
  const pct = Math.min(100, (usadasH / horasPacoteAnual) * 100);
  const restante = horasPacoteAnual - usadasH;
  const over = restante < 0;
  const expirado = contratoFim ? new Date(contratoFim) < new Date() : false;

  const barColor =
    pct > 90 ? "[&>div]:bg-destructive" :
    pct >= 75 ? "[&>div]:bg-yellow-500" :
    "[&>div]:bg-green-500";

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
        <div>
          <h3 className="text-sm font-semibold">Horas consumidas — Contrato anual</h3>
          {contratoInicio && contratoFim && (
            <p className="text-xs text-muted-foreground">
              {formatDate(contratoInicio)} → {formatDate(contratoFim)}
            </p>
          )}
        </div>
        <span className={`text-sm font-mono ${over ? "text-destructive font-semibold" : ""}`}>
          {usadasH.toFixed(1)}h de {horasPacoteAnual}h
        </span>
      </div>
      <Progress value={pct} className={barColor} />
      <p className="text-xs text-muted-foreground mt-2">
        {usadasH.toFixed(1)}h usadas de {horasPacoteAnual}h
        {contratoFim && ` (contrato até ${formatDate(contratoFim)})`}
      </p>
      {over && (
        <p className="text-xs text-destructive font-semibold mt-2">
          ⚠️ Excedente: {Math.abs(restante).toFixed(1)}h — será faturado separadamente
        </p>
      )}
      {expirado && contratoFim && (
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="destructive">Expirado</Badge>
          <span className="text-xs text-destructive font-semibold">
            ⚠️ Contrato expirado em {formatDate(contratoFim)}
          </span>
        </div>
      )}
    </Card>
  );
}
