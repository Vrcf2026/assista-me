import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";

export const Route = createFileRoute("/unsubscribe")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : "",
  }),
  component: UnsubscribePage,
});

type State =
  | { kind: "loading" }
  | { kind: "valid" }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "done" }
  | { kind: "error"; msg: string };

function UnsubscribePage() {
  const { token } = Route.useSearch();
  const [state, setState] = useState<State>({ kind: "loading" });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) { setState({ kind: "invalid" }); return; }
    void fetch(`/email/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) { setState({ kind: "invalid" }); return; }
        if (data.valid) setState({ kind: "valid" });
        else if (data.reason === "already_unsubscribed") setState({ kind: "already" });
        else setState({ kind: "invalid" });
      })
      .catch(() => setState({ kind: "error", msg: "Não foi possível contactar o servidor." }));
  }, [token]);

  const confirm = async () => {
    setSubmitting(true);
    try {
      const r = await fetch("/email/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await r.json().catch(() => ({}));
      if (data.success) setState({ kind: "done" });
      else if (data.reason === "already_unsubscribed") setState({ kind: "already" });
      else setState({ kind: "error", msg: "Não foi possível processar o pedido." });
    } catch {
      setState({ kind: "error", msg: "Não foi possível contactar o servidor." });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <div className="flex justify-center">
          <div className="h-10 w-10 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
            V
          </div>
        </div>
        <h1 className="text-xl font-semibold">VRCF — Suporte Técnico</h1>

        {state.kind === "loading" && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> A validar pedido…
          </div>
        )}

        {state.kind === "valid" && (
          <>
            <p className="text-sm text-muted-foreground">
              Confirma que pretende deixar de receber emails do nosso sistema de
              suporte? Continuará a poder iniciar sessão e gerir os seus tickets
              normalmente.
            </p>
            <Button onClick={confirm} disabled={submitting} className="w-full">
              {submitting ? "A processar…" : "Confirmar cancelamento"}
            </Button>
          </>
        )}

        {state.kind === "done" && (
          <div className="space-y-2">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <p className="text-sm">
              Cancelamento concluído. Não voltará a receber emails automáticos.
            </p>
          </div>
        )}

        {state.kind === "already" && (
          <div className="space-y-2">
            <CheckCircle2 className="h-10 w-10 text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">
              Este endereço já se encontra cancelado.
            </p>
          </div>
        )}

        {state.kind === "invalid" && (
          <div className="space-y-2">
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">
              Link inválido ou expirado.
            </p>
          </div>
        )}

        {state.kind === "error" && (
          <div className="space-y-2">
            <XCircle className="h-10 w-10 text-destructive mx-auto" />
            <p className="text-sm text-muted-foreground">{state.msg}</p>
          </div>
        )}
      </Card>
    </div>
  );
}
