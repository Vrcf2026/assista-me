import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import { formatDate } from "@/lib/format";

export const Route = createFileRoute("/preventiva_/agendamentos")({
  component: Page,
});

interface Row {
  id: string;
  proxima_data: string;
  ultima_data: string | null;
  ativo: boolean;
  client_id: string;
  template_id: string;
  clients: { nome: string } | null;
  preventiva_templates: { nome: string; periodicidade: string } | null;
}

function Page() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate]);
  if (loading || role !== "admin") return null;
  return <AppLayout><Inner /></AppLayout>;
}

function Inner() {
  const [rows, setRows] = useState<Row[]>([]);
  const [clients, setClients] = useState<{ id: string; nome: string }[]>([]);
  const [templates, setTemplates] = useState<{ id: string; nome: string; periodicidade: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [clientId, setClientId] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [proximaData, setProximaData] = useState(new Date().toISOString().slice(0,10));
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const [{ data: ag }, { data: cs }, { data: ts }] = await Promise.all([
      supabase.from("preventiva_agendamentos")
        .select("id, proxima_data, ultima_data, ativo, client_id, template_id, clients(nome), preventiva_templates(nome, periodicidade)")
        .order("proxima_data"),
      supabase.from("clients").select("id, nome").order("nome"),
      supabase.from("preventiva_templates").select("id, nome, periodicidade").eq("ativo", true).order("nome"),
    ]);
    setRows((ag ?? []) as unknown as Row[]);
    setClients((cs ?? []) as { id: string; nome: string }[]);
    setTemplates((ts ?? []) as { id: string; nome: string; periodicidade: string }[]);
  };
  useEffect(() => { void load(); }, []);

  const criar = async () => {
    if (!clientId || !templateId || !proximaData) return;
    setBusy(true);
    const { error } = await supabase.from("preventiva_agendamentos").insert({
      client_id: clientId,
      template_id: templateId,
      proxima_data: proximaData,
    });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("Agendamento criado");
    setOpen(false); setClientId(""); setTemplateId("");
    void load();
  };

  const toggle = async (r: Row) => {
    const { error } = await supabase.from("preventiva_agendamentos").update({ ativo: !r.ativo }).eq("id", r.id);
    if (error) return toast.error(error.message);
    void load();
  };

  return (
    <div className="space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Agendamentos de Preventiva</h1>
          <p className="text-sm text-muted-foreground">Plano periódico por cliente.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button><Plus className="h-4 w-4 mr-1" />Novo agendamento</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Novo agendamento</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Cliente</Label>
                <Select value={clientId} onValueChange={setClientId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar cliente" /></SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Template</Label>
                <Select value={templateId} onValueChange={setTemplateId}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar template" /></SelectTrigger>
                  <SelectContent>
                    {templates.map(t => <SelectItem key={t.id} value={t.id}>{t.nome} ({t.periodicidade})</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Próxima data</Label>
                <Input type="date" value={proximaData} onChange={e => setProximaData(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => void criar()} disabled={busy || !clientId || !templateId}>Criar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="p-4">
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">Sem agendamentos.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground border-b">
                <tr>
                  <th className="py-2 pr-3">Cliente</th>
                  <th className="py-2 pr-3">Template</th>
                  <th className="py-2 pr-3">Periodicidade</th>
                  <th className="py-2 pr-3">Próxima</th>
                  <th className="py-2 pr-3">Última</th>
                  <th className="py-2 pr-3">Activo</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2 pr-3">{r.clients?.nome ?? "—"}</td>
                    <td className="py-2 pr-3">{r.preventiva_templates?.nome ?? "—"}</td>
                    <td className="py-2 pr-3 capitalize">{r.preventiva_templates?.periodicidade ?? "—"}</td>
                    <td className="py-2 pr-3">{formatDate(r.proxima_data)}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{r.ultima_data ? formatDate(r.ultima_data) : "—"}</td>
                    <td className="py-2 pr-3"><Switch checked={r.ativo} onCheckedChange={() => void toggle(r)} /></td>
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
