import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";

interface Props {
  clientId: string;
  horasPacote: number; // horas/mês
}

export function HoursPackageWidget({ clientId, horasPacote }: Props) {
  const [minutos, setMinutos] = useState<number | null>(null);
  const now = new Date();
  const ano = now.getFullYear();
  const mes = now.getMonth() + 1;

  useEffect(() => {
    void (async () => {
      const { data, error } = await supabase.rpc("client_horas_consumidas_mes", {
        _client_id: clientId, _ano: ano, _mes: mes,
      });
      if (!error) setMinutos(Number(data ?? 0));
    })();
  }, [clientId, ano, mes]);

  if (horasPacote <= 0) return null;
  const usadasH = (minutos ?? 0) / 60;
  const pct = Math.min(100, (usadasH / horasPacote) * 100);
  const restante = horasPacote - usadasH;
  const over = restante < 0;

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold">Horas consumidas — {String(mes).padStart(2, "0")}/{ano}</h3>
        <span className={`text-sm font-mono ${over ? "text-destructive font-semibold" : ""}`}>
          {usadasH.toFixed(2)}h / {horasPacote}h
        </span>
      </div>
      <Progress value={pct} className={over ? "[&>div]:bg-destructive" : ""} />
      <p className="text-xs text-muted-foreground mt-2">
        {over
          ? `Excedeu o pacote em ${Math.abs(restante).toFixed(2)}h`
          : `Restam ${restante.toFixed(2)}h este mês`}
      </p>
    </Card>
  );
}
