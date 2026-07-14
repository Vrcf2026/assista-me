import { createFileRoute, useNavigate, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil } from "lucide-react";
import { formatCurrency, formatHours } from "@/lib/format";

export const Route = createFileRoute("/clientes")({
  component: ClientesPage,
});

interface Client {
  id: string;
  nome: string;
  nif: string | null;
  tipo_cliente: "particular" | "empresa";
  tipo_contrato: "avenca" | "pontual" | "nenhum";
  tarifa_hora: number;
  horas_pacote: number | null;
  horas_pacote_anual: number | null;
  contrato_inicio: string | null;
  contrato_fim: string | null;
  dias_fecho_automatico: number | null;
  morada: string | null;
  email_geral: string | null;
  marca: "vrcf" | "spacedata";
}

const loadingFallback = (
  <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">A carregar…</div>
);

function ClientesPage() {
  const { location } = useRouterState();

  return (
    <RequireRole role="admin" fallback={loadingFallback}>
      {location.pathname !== "/clientes" ? <Outlet /> : <AppLayout><ClientesList /></AppLayout>}
    </RequireRole>
  );
}

function ClientesList() {
  const navigate = useNavigate();
  const [clients, setClients] = useState<Client[]>([]);
  const [usage, setUsage] = useState<Record<string, number>>({}); // client_id -> minutes used
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*").order("nome");
    setClients((data ?? []) as Client[]);

    const { data: ticks } = await supabase.from("tickets").select("client_id, tempo_gasto_minutos");
    const map: Record<string, number> = {};
    (ticks ?? []).forEach((t) => {
      map[t.client_id] = (map[t.client_id] ?? 0) + (t.tempo_gasto_minutos ?? 0);
    });
    setUsage(map);
    setLoading(false);
  };

  useEffect(() => { void load(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Clientes</h1>
          <p className="text-sm text-muted-foreground">{clients.length} clientes</p>
        </div>
        <Button onClick={() => { setEditing(null); setDialogOpen(true); }}>
          <Plus className="h-4 w-4 mr-1" /> Novo cliente
        </Button>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">A carregar…</div>
        ) : clients.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Sem clientes.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-left">
                <tr>
                  <th className="px-4 py-2 font-medium">Nome</th>
                  <th className="px-4 py-2 font-medium">NIF</th>
                  <th className="px-4 py-2 font-medium">Contrato</th>
                  <th className="px-4 py-2 font-medium text-right">Tarifa</th>
                  <th className="px-4 py-2 font-medium text-right">Pacote</th>
                  <th className="px-4 py-2 font-medium text-right">Saldo</th>
                  <th className="px-4 py-2 font-medium">Fecho auto</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => {
                  const usedMin = usage[c.id] ?? 0;
                  const pacote = Number(c.horas_pacote_anual ?? c.horas_pacote ?? 0);
                  const saldo = c.tipo_contrato === "avenca" && pacote > 0
                    ? pacote - usedMin / 60
                    : null;
                  return (
                    <tr
                      key={c.id}
                      className="border-t hover:bg-secondary/50 cursor-pointer"
                      onClick={() => { void navigate({ to: "/clientes/$id", params: { id: c.id } }); }}
                    >
                      <td className="px-4 py-2 font-medium">
                        <Link
                          to="/clientes/$id"
                          params={{ id: c.id }}
                          className="hover:underline text-primary"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.nome}
                        </Link>
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{c.nif ?? "—"}</td>
                      <td className="px-4 py-2">
                        <span className="text-xs px-2 py-0.5 rounded border bg-secondary">
                          {c.tipo_contrato === "avenca" ? "Avença" : c.tipo_contrato === "pontual" ? "Pontual" : "Sem contrato"}
                        </span>
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">{formatCurrency(Number(c.tarifa_hora))}/h</td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {c.tipo_contrato === "avenca" && pacote > 0 ? `${pacote}h` : "—"}
                      </td>
                      <td className="px-4 py-2 text-right font-mono text-xs">
                        {saldo !== null ? (
                          <span className={saldo < 0 ? "text-destructive font-semibold" : ""}>
                            {saldo.toFixed(2)}h
                          </span>
                        ) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {c.dias_fecho_automatico ? `${c.dias_fecho_automatico} dias` : "Desativado"}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); setEditing(c); setDialogOpen(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <ClientFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        onSaved={() => { setDialogOpen(false); void load(); }}
      />
    </div>
  );
}

function ClientFormDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Client | null;
  onSaved: () => void;
}) {
  const [nome, setNome] = useState("");
  const [nif, setNif] = useState("");
  const [tipoCliente, setTipoCliente] = useState<"particular" | "empresa">("empresa");
  const [tipo, setTipo] = useState<"avenca" | "pontual" | "nenhum">("pontual");
  const [tarifa, setTarifa] = useState("25");
  const [horasPacoteAnual, setHorasPacoteAnual] = useState("");
  const [contratoInicio, setContratoInicio] = useState("");
  const [contratoFim, setContratoFim] = useState("");
  const [dias, setDias] = useState("7");
  const [morada, setMorada] = useState("");
  const [emailGeral, setEmailGeral] = useState("");
  const [marca, setMarca] = useState<"vrcf" | "spacedata">("vrcf");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (editing) {
      setNome(editing.nome);
      setNif(editing.nif ?? "");
      setTipoCliente(editing.tipo_cliente ?? "empresa");
      setTipo(editing.tipo_contrato);
      setTarifa(String(editing.tarifa_hora));
      setHorasPacoteAnual(editing.horas_pacote_anual ? String(editing.horas_pacote_anual) : (editing.horas_pacote ? String(editing.horas_pacote) : ""));
      setContratoInicio(editing.contrato_inicio ?? "");
      setContratoFim(editing.contrato_fim ?? "");
      setDias(editing.dias_fecho_automatico ? String(editing.dias_fecho_automatico) : "");
      setMorada(editing.morada ?? "");
      setEmailGeral(editing.email_geral ?? "");
      setMarca((editing.marca ?? "vrcf") as "vrcf" | "spacedata");
    } else {
      setNome(""); setNif("");
      setTipoCliente("empresa");
      setTipo("pontual"); setTarifa("25"); setHorasPacoteAnual("");
      setContratoInicio(""); setContratoFim(""); setDias("7");
      setMorada(""); setEmailGeral("");
      setMarca("vrcf");
    }
  }, [editing, open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const payload = {
        nome,
        nif: nif || null,
        tipo_cliente: tipoCliente,
        tipo_contrato: tipo,
        tarifa_hora: Number(tarifa),
        horas_pacote_anual: tipo === "avenca" && horasPacoteAnual ? Number(horasPacoteAnual) : null,
        contrato_inicio: tipo === "avenca" && contratoInicio ? contratoInicio : null,
        contrato_fim: tipo === "avenca" && contratoFim ? contratoFim : null,
        dias_fecho_automatico: dias ? Number(dias) : null,
        morada: morada || null,
        email_geral: emailGeral || null,
        marca,
      };
      if (editing) {
        const { error } = await supabase.from("clients").update(payload).eq("id", editing.id);
        if (error) throw error;
        toast.success("Cliente atualizado");
      } else {
        const { data, error } = await supabase.functions.invoke("admin-create-client", { body: payload });
        if (error) throw error;
        if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
        toast.success("Cliente criado — abra a ficha para adicionar utilizadores");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar cliente" : "Novo cliente"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Marca para comunicações</Label>
            <Select value={marca} onValueChange={(v) => setMarca(v as "vrcf" | "spacedata")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="vrcf">VRCF (predefinido)</SelectItem>
                <SelectItem value="spacedata">SpaceData</SelectItem>
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Define que marca aparece em emails, PDFs e portal deste cliente.</p>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo de cliente</Label>
              <Select value={tipoCliente} onValueChange={(v) => setTipoCliente(v as "particular" | "empresa")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="empresa">Empresa</SelectItem>
                  <SelectItem value="particular">Particular</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>NIF</Label>
              <Input value={nif} onChange={(e) => setNif(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Morada</Label>
            <Input value={morada} onChange={(e) => setMorada(e.target.value)} placeholder="Rua, n.º, código postal, localidade" />
          </div>
          <div className="space-y-1.5">
            <Label>Email geral</Label>
            <Input type="email" value={emailGeral} onChange={(e) => setEmailGeral(e.target.value)} placeholder="geral@cliente.pt" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo contrato</Label>
              <Select value={tipo} onValueChange={(v) => setTipo(v as "avenca" | "pontual" | "nenhum")}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="nenhum">Sem contrato</SelectItem>
                  <SelectItem value="pontual">Pontual</SelectItem>
                  <SelectItem value="avenca">Avença</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Tarifa (€/h)</Label>
              <Input type="number" step="0.01" value={tarifa} onChange={(e) => setTarifa(e.target.value)} />
            </div>
          </div>
          {tipo === "avenca" && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label>Horas do pacote (anuais)</Label>
                <Input type="number" step="0.5" value={horasPacoteAnual} onChange={(e) => setHorasPacoteAnual(e.target.value)} placeholder="ex: 48" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label>Início contrato</Label>
                  <Input type="date" value={contratoInicio} onChange={(e) => setContratoInicio(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Fim contrato</Label>
                  <Input type="date" value={contratoFim} onChange={(e) => setContratoFim(e.target.value)} />
                </div>
              </div>
            </div>
          )}
          <div className="space-y-1.5">
            <Label>Dias até fecho automático (vazio = desativado)</Label>
            <Input type="number" value={dias} onChange={(e) => setDias(e.target.value)} placeholder="7" />
          </div>
          {!editing && (
            <p className="text-xs text-muted-foreground bg-muted/50 p-2 rounded">
              💡 Após criar, abra a ficha do cliente para adicionar utilizadores de login.
            </p>
          )}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : "Guardar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
