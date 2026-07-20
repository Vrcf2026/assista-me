import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { KeyRound, Plus, Trash2, Pencil, Eye, EyeOff } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { notifyAdminCredencialFornecida } from "@/lib/email/notify-admin";

interface Credencial {
  id: string;
  ticket_id: string;
  tipo: "email" | "vpn" | "windows" | "router" | "outro";
  utilizador: string | null;
  password: string;
  notas: string | null;
  created_at: string;
}

interface CredRequest {
  id: string;
  ticket_id: string;
  tipo: string;
  nota: string | null;
  created_at: string;
  fulfilled_at: string | null;
  cancelled_at: string | null;
  fulfilled_credential_id: string | null;
}

const TIPO_CRED_LABEL: Record<string, string> = { email: "Email", vpn: "VPN", windows: "Windows", router: "Router", outro: "Outro" };
const TIPO_CRED_CLS: Record<string, string> = {
  email: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
  vpn: "bg-purple-500/15 text-purple-700 dark:text-purple-300 border-purple-500/30",
  windows: "bg-gray-500/15 text-gray-700 dark:text-gray-300 border-gray-500/30",
  router: "bg-green-500/15 text-green-700 dark:text-green-300 border-green-500/30",
  outro: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
};

async function invokeCreds(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("ticket-credentials", {
    body: { action, ...payload },
  });
  if (error) throw new Error(error.message);
  if (data?.error) throw new Error(data.error);
  return data;
}

export function CredentialsPanel({ ticketId, isAdmin, ticketNumero, ticketTitulo, clienteNome }: { ticketId: string; isAdmin: boolean; ticketNumero: number; ticketTitulo: string; clienteNome: string }) {
  const [items, setItems] = useState<Credencial[]>([]);
  const [requests, setRequests] = useState<CredRequest[]>([]);
  const [reveal, setReveal] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Credencial | null>(null);
  const [reqDialogOpen, setReqDialogOpen] = useState(false);
  const [fulfillReq, setFulfillReq] = useState<CredRequest | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const res = await invokeCreds("list", { ticketId });
      setItems((res?.items ?? []) as Credencial[]);
      const { data: reqs } = await supabase
        .from("ticket_credential_requests")
        .select("*").eq("ticket_id", ticketId)
        .order("created_at", { ascending: false });
      setRequests((reqs ?? []) as CredRequest[]);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro a carregar credenciais");
    } finally { setLoading(false); }
  };
  useEffect(() => { void load(); }, [ticketId]);

  const remove = async (id: string) => {
    if (!confirm("Apagar esta credencial?")) return;
    try { await invokeCreds("delete", { credentialId: id }); toast.success("Removida"); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const cancelRequest = async (id: string) => {
    if (!confirm("Cancelar este pedido de credencial?")) return;
    try { await invokeCreds("cancelRequest", { requestId: id }); toast.success("Cancelado"); void load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
  };

  const openNew = () => { setEditing(null); setOpen(true); };
  const openEdit = (c: Credencial) => { setEditing(c); setOpen(true); };

  const pendingRequests = requests.filter((r) => !r.fulfilled_at && !r.cancelled_at);

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="h-3.5 w-3.5" /> Credenciais
          <span className="text-xs font-normal text-muted-foreground">🔒 encriptado</span>
        </h3>
        <div className="flex gap-2">
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setReqDialogOpen(true)}>
              🔒 Pedir ao cliente
            </Button>
          )}
          <Button size="sm" onClick={openNew}><Plus className="h-3.5 w-3.5 mr-1" /> Adicionar</Button>
        </div>
      </div>

      {pendingRequests.length > 0 && (
        <div className="mb-3 space-y-2">
          {pendingRequests.map((r) => (
            <div key={r.id} className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium">🔒 Pedido de credencial: {TIPO_CRED_LABEL[r.tipo] ?? r.tipo}</div>
                  {r.nota && <p className="text-xs text-muted-foreground mt-1">{r.nota}</p>}
                  <p className="text-xs text-muted-foreground mt-1">A aguardar resposta do cliente — {new Date(r.created_at).toLocaleString("pt-PT")}</p>
                </div>
                <div className="flex gap-1">
                  {!isAdmin && (
                    <Button size="sm" onClick={() => setFulfillReq(r)}>Fornecer</Button>
                  )}
                  {isAdmin && (
                    <Button size="sm" variant="ghost" onClick={() => void cancelRequest(r.id)}>Cancelar</Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem credenciais registadas.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-left py-2 pr-2">Tipo</th>
                <th className="text-left py-2 pr-2">Utilizador</th>
                <th className="text-left py-2 pr-2">Password</th>
                <th className="text-left py-2 pr-2">Notas</th>
                <th className="text-right py-2">Acções</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-b last:border-b-0">
                  <td className="py-2 pr-2">
                    <Badge variant="outline" className={TIPO_CRED_CLS[c.tipo]}>{TIPO_CRED_LABEL[c.tipo]}</Badge>
                  </td>
                  <td className="py-2 pr-2 font-mono text-xs">{c.utilizador || "—"}</td>
                  <td className="py-2 pr-2">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs">{reveal[c.id] ? c.password : "••••••••"}</span>
                      <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setReveal((r) => ({ ...r, [c.id]: !r[c.id] }))}>
                        {reveal[c.id] ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                      </Button>
                      {reveal[c.id] && (
                        <Button size="sm" variant="ghost" className="h-6 px-2 text-xs" onClick={() => { void navigator.clipboard.writeText(c.password); toast.success("Copiado"); }}>
                          Copiar
                        </Button>
                      )}
                    </div>
                  </td>
                  <td className="py-2 pr-2 text-xs text-muted-foreground max-w-[240px] truncate">{c.notas || "—"}</td>
                  <td className="py-2 text-right">
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => openEdit(c)}><Pencil className="h-3 w-3" /></Button>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => void remove(c.id)}><Trash2 className="h-3 w-3" /></Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <CredentialDialog
        open={open}
        onOpenChange={setOpen}
        ticketId={ticketId}
        editing={editing}
        onSaved={() => { setOpen(false); void load(); }}
      />
      <RequestCredentialDialog
        open={reqDialogOpen}
        onOpenChange={setReqDialogOpen}
        ticketId={ticketId}
        onCreated={() => { setReqDialogOpen(false); void load(); }}
      />
      <FulfillCredentialDialog
        request={fulfillReq}
        ticketId={ticketId}
        ticketNumero={ticketNumero}
        ticketTitulo={ticketTitulo}
        clienteNome={clienteNome}
        onOpenChange={(v) => !v && setFulfillReq(null)}
        onDone={() => { setFulfillReq(null); void load(); }}
      />
    </Card>
  );
}

function CredentialDialog({ open, onOpenChange, ticketId, editing, onSaved }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  ticketId: string;
  editing: Credencial | null;
  onSaved: () => void;
}) {
  const [tipo, setTipo] = useState<Credencial["tipo"]>("outro");
  const [utilizador, setUtilizador] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [notas, setNotas] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setTipo(editing.tipo); setUtilizador(editing.utilizador ?? ""); setPassword(editing.password); setNotas(editing.notas ?? "");
    } else {
      setTipo("outro"); setUtilizador(""); setPassword(""); setNotas("");
    }
    setShowPw(false);
  }, [open, editing]);

  const gerarPw = () => {
    const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%&*";
    let p = "";
    const arr = new Uint32Array(12);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 12; i++) p += chars[arr[i] % chars.length];
    setPassword(p);
    setShowPw(true);
  };

  const save = async () => {
    if (!password.trim()) { toast.error("Password obrigatória"); return; }
    setBusy(true);
    try {
      await invokeCreds(editing ? "update" : "create", {
        ticketId,
        credentialId: editing?.id,
        tipo,
        utilizador: utilizador.trim() || null,
        password,
        notas: notas.trim() || null,
      });
      toast.success("Credencial guardada");
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>{editing ? "Editar credencial" : "Nova credencial"}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select value={tipo} onValueChange={(v) => setTipo(v as Credencial["tipo"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="vpn">VPN</SelectItem>
                <SelectItem value="windows">Windows</SelectItem>
                <SelectItem value="router">Router</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Utilizador / Email</Label>
            <Input value={utilizador} onChange={(e) => setUtilizador(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <div className="flex gap-2">
              <Input
                type={showPw ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="font-mono"
              />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowPw((v) => !v)}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" onClick={gerarPw}>Gerar</Button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={3} placeholder="Ex: alterar após resolução" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={save} disabled={busy}>Guardar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestCredentialDialog({ open, onOpenChange, ticketId, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void; ticketId: string; onCreated: () => void;
}) {
  const [tipo, setTipo] = useState<string>("outro");
  const [nota, setNota] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (open) { setTipo("outro"); setNota(""); } }, [open]);
  const submit = async () => {
    setBusy(true);
    try {
      await invokeCreds("request", { ticketId, tipo, nota: nota.trim() || null });
      toast.success("Pedido enviado ao cliente");
      onCreated();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>🔒 Pedir credencial ao cliente</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Tipo de credencial</Label>
            <Select value={tipo} onValueChange={setTipo}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="email">Email</SelectItem>
                <SelectItem value="vpn">VPN</SelectItem>
                <SelectItem value="windows">Windows</SelectItem>
                <SelectItem value="router">Router</SelectItem>
                <SelectItem value="outro">Outro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Nota para o cliente (opcional)</Label>
            <Textarea value={nota} onChange={(e) => setNota(e.target.value)} rows={3} placeholder="Ex: preciso do acesso ao firewall principal" />
          </div>
          <p className="text-xs text-muted-foreground">
            O cliente verá um cartão no painel de credenciais e poderá fornecer a password de forma segura — nunca passará por comentários nem emails.
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>Enviar pedido</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FulfillCredentialDialog({ request, ticketId, ticketNumero, ticketTitulo, clienteNome, onOpenChange, onDone }: {
  request: CredRequest | null;
  ticketId: string;
  ticketNumero: number;
  ticketTitulo: string;
  clienteNome: string;
  onOpenChange: (v: boolean) => void;
  onDone: () => void;
}) {
  const [utilizador, setUtilizador] = useState("");
  const [password, setPassword] = useState("");
  const [notas, setNotas] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (request) { setUtilizador(""); setPassword(""); setNotas(""); setShowPw(false); } }, [request]);
  const submit = async () => {
    if (!request || !password.trim()) { toast.error("Password obrigatória"); return; }
    setBusy(true);
    try {
      await invokeCreds("fulfill", {
        requestId: request.id,
        utilizador: utilizador.trim() || null,
        password,
        notas: notas.trim() || null,
      });
      toast.success("Credencial enviada em segurança");
      void notifyAdminCredencialFornecida(
        { id: ticketId, numero: ticketNumero, titulo: ticketTitulo },
        clienteNome,
        request.tipo,
        request.id,
      );
      onDone();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Erro"); }
    finally { setBusy(false); }
  };
  return (
    <Dialog open={!!request} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🔒 Fornecer credencial</DialogTitle>
        </DialogHeader>
        {request && (
          <div className="space-y-3">
            <div className="rounded-md bg-muted/40 p-3 text-sm">
              <div className="font-medium">{TIPO_CRED_LABEL[request.tipo] ?? request.tipo}</div>
              {request.nota && <p className="text-xs text-muted-foreground mt-1">{request.nota}</p>}
            </div>
            <div className="space-y-1.5">
              <Label>Utilizador / Email (opcional)</Label>
              <Input value={utilizador} onChange={(e) => setUtilizador(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Password</Label>
              <div className="flex gap-2">
                <Input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="font-mono"
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowPw((v) => !v)}>
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Notas (opcional)</Label>
              <Textarea value={notas} onChange={(e) => setNotas(e.target.value)} rows={2} />
            </div>
            <p className="text-xs text-muted-foreground">
              🔒 A password fica encriptada na base de dados e é apagada automaticamente quando o ticket fechar.
            </p>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={busy}>Enviar com segurança</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
