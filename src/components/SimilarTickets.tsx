import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Search, ExternalLink, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";

interface SimilarTicket {
  ticket_id: string;
  similarity: number;
  numero: number;
  titulo: string;
  cliente: string;
  solucao: string | null;
}

interface Props {
  ticketId: string;
  titulo: string;
  descricao: string;
  isAdmin: boolean;
}

export function SimilarTickets({ ticketId, titulo, descricao, isAdmin }: Props) {
  const [results, setResults] = useState<SimilarTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [noEmbeddings, setNoEmbeddings] = useState(false);

  useEffect(() => {
    if (!isAdmin) return;
    const query = `${titulo} ${descricao}`.slice(0, 500);

    const search = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const res = await fetch("/api/ai/search-similar", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-supabase-auth": session?.access_token ?? "",
          },
          body: JSON.stringify({ query, limit: 3 }),
        });
        const data = await res.json() as { results: SimilarTicket[]; reason?: string };
        if (data.reason === "no_embedding_key") { setNoEmbeddings(true); return; }
        // Excluir o próprio ticket
        setResults((data.results ?? []).filter((r) => r.ticket_id !== ticketId));
      } catch {
        // Falha silenciosa — pgvector pode não estar activado ainda
      } finally {
        setLoading(false);
      }
    };

    void search();
  }, [ticketId, titulo, descricao, isAdmin]);

  if (!isAdmin || noEmbeddings) return null;

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-xs text-muted-foreground py-1">
        <Loader2 className="h-3 w-3 animate-spin" />
        A pesquisar tickets semelhantes…
      </div>
    );
  }

  if (!results.length) return null;

  return (
    <Card className="p-3 border-dashed">
      <p className="text-xs font-medium text-muted-foreground flex items-center gap-1.5 mb-2">
        <Search className="h-3.5 w-3.5" />
        Tickets semelhantes já resolvidos
      </p>
      <ul className="space-y-2">
        {results.map((r) => (
          <li key={r.ticket_id} className="text-xs">
            <div className="flex items-center justify-between gap-2">
              <Link
                to="/tickets/$id"
                params={{ id: r.ticket_id }}
                className="flex items-center gap-1.5 text-primary hover:underline font-medium"
              >
                <ExternalLink className="h-3 w-3 shrink-0" />
                #{String(r.numero).padStart(5, "0")} {r.titulo}
              </Link>
              <span className="text-muted-foreground shrink-0 font-mono">{r.similarity}%</span>
            </div>
            {r.solucao && (
              <p className="text-muted-foreground mt-0.5 ml-4.5 line-clamp-2">{r.solucao}</p>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
