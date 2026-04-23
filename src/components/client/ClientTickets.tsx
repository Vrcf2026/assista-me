import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge, PriorityBadge, TipoBadge } from "@/components/StatusBadge";
import { formatTicketNumber, formatDateTime } from "@/lib/format";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface Row {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  prioridade: string;
  tipo_intervencao: string;
  created_at: string;
}

export function ClientTickets() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasClient, setHasClient] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    void (async () => {
      // Check if client profile exists
      const { data: client } = await supabase
        .from("clients")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      setHasClient(!!client);

      const { data, error } = await supabase
        .from("tickets")
        .select("id, numero, titulo, estado, prioridade, tipo_intervencao, created_at")
        .order("created_at", { ascending: false });
      if (error) toast.error(error.message);
      setRows((data ?? []) as Row[]);
      setLoading(false);
    })();
  }, [user]);

  if (hasClient === false) {
    return (
      <Card className="p-8 text-center">
        <h2 className="text-lg font-semibold mb-2">Conta não configurada</h2>
        <p className="text-sm text-muted-foreground">
          A sua conta ainda não foi associada a um cliente. Contacte o suporte
          em <a className="text-primary hover:underline" href="mailto:geral@vrcf.pt">geral@vrcf.pt</a>.
        </p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Os meus tickets</h1>
          <p className="text-sm text-muted-foreground">
            {rows.length} {rows.length === 1 ? "ticket" : "tickets"}
          </p>
        </div>
        <Button asChild>
          <Link to="/tickets/novo"><Plus className="h-4 w-4 mr-1" /> Novo ticket</Link>
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">A carregar…</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-muted-foreground text-sm mb-4">
              Ainda não criou nenhum ticket.
            </p>
            <Button asChild>
              <Link to="/tickets/novo"><Plus className="h-4 w-4 mr-1" /> Criar primeiro ticket</Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Nº</th>
                  <th className="px-4 py-2 font-medium">Título</th>
                  <th className="px-4 py-2 font-medium">Estado</th>
                  <th className="px-4 py-2 font-medium">Prioridade</th>
                  <th className="px-4 py-2 font-medium">Tipo</th>
                  <th className="px-4 py-2 font-medium">Criado</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-secondary/50">
                    <td className="px-4 py-2">
                      <Link to="/tickets/$id" params={{ id: r.id }} className="font-mono font-semibold text-primary hover:underline">
                        {formatTicketNumber(r.numero)}
                      </Link>
                    </td>
                    <td className="px-4 py-2">
                      <Link to="/tickets/$id" params={{ id: r.id }} className="hover:underline">
                        {r.titulo}
                      </Link>
                    </td>
                    <td className="px-4 py-2"><StatusBadge estado={r.estado} /></td>
                    <td className="px-4 py-2"><PriorityBadge prioridade={r.prioridade} /></td>
                    <td className="px-4 py-2"><TipoBadge tipo={r.tipo_intervencao} /></td>
                    <td className="px-4 py-2 text-muted-foreground text-xs">
                      {formatDateTime(r.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
