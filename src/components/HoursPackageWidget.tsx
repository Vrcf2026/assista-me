import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { formatDate } from "@/lib/format";

interface Props {
  clientId: string;
  horasPacoteAnual: number;
  contratoInicio: string | null;
  contratoFim: string | null;
}

export function HoursPackageWidget({ clientId, horasPacoteAnual, contratoInicio, contratoFim }: Props) {
  const [minutos, setMinutos] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("client_horas_consumidas_anual", { _client_id: clientId });
      if (!error) setMinutos(Number(data ?? 0));
    })();
  }, [clientId]);

  if (horasPacoteAnual <= 0) return null;
  const usadasH = (minutos ?? 0) / 60;
  const pct = Math.min(100, (usadasH / horasPacoteAnual) * 100);
  const restante = horasPacoteAnual - usadasH;
  const over = restante < 0;
  const expirado = contratoFim ? new Date(contratoFim) < new Date() : false;

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
          {usadasH.toFixed(2)}h / {horasPacoteAnual}h
        </span>
      </div>
      <Progress value={pct} className={over ? "[&>div]:bg-destructive" : ""} />
      <p className="text-xs text-muted-foreground mt-2">
        {over
          ? `Excedeu o pacote em ${Math.abs(restante).toFixed(2)}h`
          : `Restam ${restante.toFixed(2)}h no contrato`}
      </p>
      {expirado && contratoFim && (
        <p className="text-xs text-destructive font-semibold mt-2">
          ⚠ Contrato expirado em {formatDate(contratoFim)}
        </p>
      )}
    </Card>
  );
}
