import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/satisfacao/$token")({
  component: SatisfacaoPage,
});

function SatisfacaoPage() {
  const { token } = Route.useParams();
  const [loading, setLoading] = useState(true);
  const [validToken, setValidToken] = useState<{ submitted_at: string | null; ticketNum?: number } | null>(null);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comentario, setComentario] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void fetch(`/api/public/satisfacao/${encodeURIComponent(token)}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok || !data.valid) return;
        setValidToken({ submitted_at: data.submitted_at ?? null, ticketNum: data.ticketNumero ?? undefined });
        if (data.submitted_at) setSubmitted(true);
      })
      .catch(() => undefined)
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    if (!validToken || rating === 0) return;
    setBusy(true);
    const response = await fetch(`/api/public/satisfacao/${encodeURIComponent(token)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating, comentario }),
    });
    const data = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok || (!data.success && data.reason !== "already_submitted")) {
      return toast.error("Não foi possível registar a avaliação.");
    }
    setSubmitted(true);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-background">
      <Card className="max-w-md w-full p-8">
        {loading ? (
          <p className="text-sm text-muted-foreground text-center">A carregar…</p>
        ) : !validToken ? (
          <div className="text-center space-y-2">
            <h1 className="text-xl font-semibold">Link inválido</h1>
            <p className="text-sm text-muted-foreground">O link de avaliação não é válido ou expirou.</p>
          </div>
        ) : submitted ? (
          <div className="text-center space-y-2">
            <div className="text-5xl">🙏</div>
            <h1 className="text-xl font-semibold">Obrigado!</h1>
            <p className="text-sm text-muted-foreground">A sua opinião foi registada.</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              <h1 className="text-xl font-semibold">Como avalia o atendimento?</h1>
              {validToken.ticketNum && (
                <p className="text-sm text-muted-foreground">Ticket #{String(validToken.ticketNum).padStart(5, "0")}</p>
              )}
            </div>

            <div className="flex justify-center gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setRating(n)}
                  onMouseEnter={() => setHover(n)}
                  onMouseLeave={() => setHover(0)}
                  className="p-1 transition-transform hover:scale-110"
                >
                  <Star
                    className={`h-10 w-10 ${
                      n <= (hover || rating)
                        ? "fill-amber-400 text-amber-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>

            <div className="space-y-1.5">
              <Label>Comentário (opcional)</Label>
              <Textarea
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
                rows={3}
                maxLength={500}
                placeholder="Algo a melhorar?"
              />
            </div>

            <Button onClick={submit} disabled={rating === 0 || busy} className="w-full">
              {busy ? "A enviar…" : "Enviar avaliação"}
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
