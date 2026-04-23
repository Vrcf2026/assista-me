import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { notifyTicketCriado } from "@/lib/email/notify-ticket-event";

export const Route = createFileRoute("/tickets/novo")({
  component: NovoTicketPage,
});

function NovoTicketPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user) return null;
  return <AppLayout>{role === "admin" ? <NovoAdmin /> : <NovoCliente />}</AppLayout>;
}

function NovoCliente() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta">("media");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    try {
      const { data: client } = await supabase
        .from("clients").select("id").eq("user_id", user.id).maybeSingle();
      if (!client) throw new Error("Cliente não configurado.");
      const { data: ticket, error } = await supabase
        .from("tickets")
        .insert({
          client_id: client.id,
          titulo, descricao, prioridade,
        })
        .select("id, numero")
        .single();
      if (error) throw error;
      // upload files
      for (const f of files) {
        const path = `${ticket.id}/${Date.now()}-${f.name}`;
        const { error: upErr } = await supabase.storage
          .from("ticket-attachments").upload(path, f);
        if (upErr) { toast.error(upErr.message); continue; }
        const { data: pub } = supabase.storage.from("ticket-attachments").getPublicUrl(path);
        await supabase.from("attachments").insert({
          ticket_id: ticket.id,
          uploaded_by: user.id,
          file_url: pub.publicUrl,
          file_name: f.name,
          file_size: f.size,
          mime_type: f.type,
          is_internal: false,
        });
      }
      toast.success(`Ticket #${String(ticket.numero).padStart(4, "0")} criado`);
      void notifyTicketCriado(
        { id: ticket.id, numero: ticket.numero, titulo: titulo, client_id: client.id },
        prioridade,
      );
      navigate({ to: "/tickets/$id", params: { id: ticket.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
      </Button>
      <Card className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Novo ticket</h1>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required maxLength={200} />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição do problema *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} required rows={6} maxLength={5000} />
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as typeof prioridade)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Anexos (imagens ou PDF)</Label>
            <Input
              type="file"
              multiple
              accept="image/*,application/pdf"
              onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            />
            {files.length > 0 && (
              <p className="text-xs text-muted-foreground">{files.length} ficheiro(s) selecionado(s)</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>{busy ? "..." : "Criar ticket"}</Button>
        </form>
      </Card>
    </div>
  );
}

function NovoAdmin() {
  // Admin can pick the client
  const navigate = useNavigate();
  const { user } = useAuth();
  const [clients, setClients] = useState<{ id: string; nome: string }[]>([]);
  const [clientId, setClientId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [prioridade, setPrioridade] = useState<"baixa" | "media" | "alta">("media");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.from("clients").select("id, nome").order("nome")
      .then(({ data }) => setClients((data ?? []) as { id: string; nome: string }[]));
  }, []);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !clientId) return;
    setBusy(true);
    try {
      const { data: ticket, error } = await supabase
        .from("tickets").insert({
          client_id: clientId, titulo, descricao, prioridade,
        }).select("id, numero").single();
      if (error) throw error;
      toast.success(`Ticket #${String(ticket.numero).padStart(4, "0")} criado`);
      void notifyTicketCriado(
        { id: ticket.id, numero: ticket.numero, titulo, client_id: clientId },
        prioridade,
      );
      navigate({ to: "/tickets/$id", params: { id: ticket.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-4">
      <Button asChild variant="ghost" size="sm">
        <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" /> Voltar</Link>
      </Button>
      <Card className="p-6">
        <h1 className="text-2xl font-semibold mb-4">Novo ticket</h1>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Cliente *</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Título *</Label>
            <Input value={titulo} onChange={(e) => setTitulo(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Descrição *</Label>
            <Textarea value={descricao} onChange={(e) => setDescricao(e.target.value)} required rows={5} />
          </div>
          <div className="space-y-1.5">
            <Label>Prioridade</Label>
            <Select value={prioridade} onValueChange={(v) => setPrioridade(v as typeof prioridade)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="baixa">Baixa</SelectItem>
                <SelectItem value="media">Média</SelectItem>
                <SelectItem value="alta">Alta</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button type="submit" className="w-full" disabled={busy || !clientId}>{busy ? "..." : "Criar"}</Button>
        </form>
      </Card>
    </div>
  );
}
