import { useState } from "react";
import { Sparkles, FileText, Stethoscope, Lightbulb, Loader2, ChevronDown, ChevronUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { Ticket, Comment } from "@/features/ticket/types";

interface Props {
  ticket: Ticket;
  comments: Comment[];
  isAdmin: boolean;
}

type AiMode = "resumo" | "diagnostico" | "sugestoes";

const MODES: { key: AiMode; label: string; icon: typeof FileText; prompt: (t: Ticket, conv: string) => string }[] = [
  {
    key: "resumo",
    label: "Resumir ticket",
    icon: FileText,
    prompt: (t, conv) => `Resume este ticket de suporte em 3-4 linhas em português europeu.
Ticket #${String(t.numero).padStart(5,"0")}: ${t.titulo}
Estado: ${t.estado} | Prioridade: ${t.prioridade} | Tipo: ${t.tipo_intervencao}
Descrição: ${t.descricao}
${conv ? `Conversa:\n${conv}` : ""}
Inclui: problema reportado, o que foi feito, estado actual.`,
  },
  {
    key: "diagnostico",
    label: "Diagnosticar",
    icon: Stethoscope,
    prompt: (t, conv) => `Analisa este ticket de suporte informático e sugere causas prováveis e passos de diagnóstico.
Ticket: ${t.titulo}
Equipamento: ${t.equipamento ?? "não especificado"}
Descrição: ${t.descricao}
${conv ? `Conversa:\n${conv}` : ""}
Lista: 1) causas mais prováveis 2) passos de diagnóstico recomendados 3) solução mais provável.
Responde em português europeu, de forma técnica e directa. Máximo 200 palavras.`,
  },
  {
    key: "sugestoes",
    label: "Sugestões de melhoria",
    icon: Lightbulb,
    prompt: (t, conv) => `Com base neste ticket de suporte, sugere melhorias preventivas para evitar recorrência.
Ticket: ${t.titulo}
Tipo: ${t.tipo_intervencao}
Descrição: ${t.descricao}
${conv ? `Resolução:\n${conv}` : ""}
Sugere: acções preventivas, documentação a criar, equipamento a verificar, formação ao cliente.
Responde em português europeu, máximo 150 palavras, em formato de lista curta.`,
  },
];

export function TicketAIPanel({ ticket, comments, isAdmin }: Props) {
  const [results, setResults] = useState<Partial<Record<AiMode, string>>>({});
  const [loading, setLoading] = useState<AiMode | null>(null);
  const [expanded, setExpanded] = useState<AiMode | null>(null);
  const [open, setOpen] = useState(false);

  if (!isAdmin) return null;

  const run = async (mode: AiMode) => {
    if (loading) return;
    setLoading(mode);
    setExpanded(mode);
    setOpen(true);

    try {
      const conv = comments
        .filter((c) => !c.is_internal)
        .slice(-10)
        .map((c) => `${c.user_id === ticket.client_id ? "Cliente" : "Técnico"}: ${c.mensagem}`)
        .join("\n");

      const m = MODES.find((x) => x.key === mode)!;

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-supabase-auth": session?.access_token ?? "",
        },
        body: JSON.stringify({
          max_tokens: 500,
          system: "És um assistente técnico especializado em suporte informático para PMEs em Portugal. Responde sempre em português europeu.",
          messages: [{ role: "user", content: m.prompt(ticket, conv) }],
        }),
      });

      const data = await res.json() as { content?: { type: string; text: string }[]; error?: string };
      if (!res.ok) { toast.error(data.error ?? "Erro IA"); return; }
      const text = data.content?.find((b) => b.type === "text")?.text ?? "";
      if (text) setResults((prev) => ({ ...prev, [mode]: text }));
    } catch {
      toast.error("Erro ao contactar a IA");
    } finally {
      setLoading(null);
    }
  };

  return (
    <Card className="p-4 border-primary/20 bg-primary/5">
      <button
        className="w-full flex items-center justify-between"
        onClick={() => setOpen((v) => !v)}
      >
        <h3 className="text-sm font-semibold flex items-center gap-2 text-primary">
          <Sparkles className="h-4 w-4" /> Assistente IA
        </h3>
        {open ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="mt-3 space-y-3">
          {/* Botões de acção */}
          <div className="flex flex-wrap gap-2">
            {MODES.map((m) => (
              <Button
                key={m.key}
                variant={expanded === m.key && results[m.key] ? "default" : "outline"}
                size="sm"
                className="gap-1.5 h-8"
                onClick={() => results[m.key] ? setExpanded(expanded === m.key ? null : m.key) : void run(m.key)}
                disabled={loading !== null}
              >
                {loading === m.key
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <m.icon className="h-3.5 w-3.5" />
                }
                {m.label}
              </Button>
            ))}
          </div>

          {/* Resultado expandido */}
          {expanded && results[expanded] && (
            <div className="bg-background border rounded-lg p-3 text-sm leading-relaxed whitespace-pre-wrap">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-primary uppercase tracking-wide">
                  {MODES.find((m) => m.key === expanded)?.label}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={() => void run(expanded)}
                  disabled={loading !== null}
                >
                  {loading === expanded ? <Loader2 className="h-3 w-3 animate-spin" /> : "↻ Gerar de novo"}
                </Button>
              </div>
              <p className="text-foreground">{results[expanded]}</p>
            </div>
          )}

          {expanded && loading === expanded && (
            <div className="bg-background border rounded-lg p-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              A analisar o ticket…
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
