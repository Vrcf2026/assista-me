import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { UserPlus, Trash2, Shield, ShieldOff, Pencil } from "lucide-react";

interface Member {
  user_id: string;
  is_client_admin: boolean;
  email: string | null;
  nome: string | null;
}

export function ClientUsersPanel({ clientId }: { clientId: string }) {
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Member | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: links } = await supabase
      .from("client_users")
      .select("user_id, is_client_admin")
      .eq("client_id", clientId);
    const ids = (links ?? []).map((l) => l.user_id);
    if (ids.length === 0) { setMembers([]); setLoading(false); return; }
    const { data: profiles } = await supabase
      .from("profiles")
      .select("user_id, email, nome")
      .in("user_id", ids);
    const profMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
    setMembers((links ?? []).map((l) => ({
      user_id: l.user_id,
      is_client_admin: l.is_client_admin,
      email: profMap.get(l.user_id)?.email ?? null,
      nome: profMap.get(l.user_id)?.nome ?? null,
    })));
    setLoading(false);
  };

  useEffect(() => { void load(); }, [clientId]);

  const toggleAdmin = async (m: Member) => {
    const { error } = await supabase
      .from("client_users")
      .update({ is_client_admin: !m.is_client_admin })
      .eq("client_id", clientId)
      .eq("user_id", m.user_id);
    if (error) { toast.error(error.message); return; }
    toast.success(m.is_client_admin ? "Removido como admin do cliente" : "Marcado como admin do cliente");
    void load();
  };

  const remove = async (m: Member) => {
    if (!confirm(`Remover ${m.email ?? m.user_id} deste cliente?\n\nA conta de login NÃO é apagada — apenas a associação a este cliente.`)) return;
    const { error } = await supabase.functions.invoke("admin-delete-client-user", {
      body: { user_id: m.user_id, delete_account: false },
    });
    if (error) { toast.error(error.message); return; }
    toast.success("Removido");
    void load();
  };

  return (
    <Card className="p-6 print:hidden">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold">Utilizadores</h2>
          <p className="text-xs text-muted-foreground">
            Admins do cliente veem todos os tickets. Utilizadores normais só veem os que criam.
          </p>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <UserPlus className="h-4 w-4 mr-1" /> Adicionar utilizador
        </Button>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">A carregar…</p>
      ) : members.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem utilizadores. Adicione o primeiro.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-left">
              <tr>
                <th className="px-3 py-2 font-medium">Nome</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Função</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.user_id} className="border-t">
                  <td className="px-3 py-2">{m.nome ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.email ?? "—"}</td>
                  <td className="px-3 py-2">
                    {m.is_client_admin ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/30">
                        Admin do cliente
                      </span>
                    ) : (
                      <span className="text-xs text-muted-foreground">Utilizador</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Button size="sm" variant="ghost" onClick={() => toggleAdmin(m)} title={m.is_client_admin ? "Remover admin" : "Tornar admin"}>
                      {m.is_client_admin ? <ShieldOff className="h-3.5 w-3.5" /> : <Shield className="h-3.5 w-3.5" />}
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => remove(m)} title="Remover do cliente">
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AddUserDialog
        open={open}
        onOpenChange={setOpen}
        clientId={clientId}
        onAdded={() => { setOpen(false); void load(); }}
      />
    </Card>
  );
}

function AddUserDialog({
  open, onOpenChange, clientId, onAdded,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  clientId: string;
  onAdded: () => void;
}) {
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isAdmin, setIsAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) { setNome(""); setEmail(""); setPassword(""); setIsAdmin(false); }
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data, error } = await supabase.functions.invoke("admin-create-client-user", {
        body: { client_id: clientId, email, password, nome, is_client_admin: isAdmin },
      });
      if (error) throw error;
      if (data && (data as { error?: string }).error) throw new Error((data as { error: string }).error);
      toast.success("Utilizador criado e associado");
      onAdded();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro");
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar utilizador</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="space-y-1.5">
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Email (login) *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="space-y-1.5">
            <Label>Palavra-passe inicial *</Label>
            <Input type="password" minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} required />
            <p className="text-xs text-muted-foreground">Mínimo 6 caracteres. Comunique ao utilizador.</p>
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={isAdmin}
              onChange={(e) => setIsAdmin(e.target.checked)}
              className="h-4 w-4"
            />
            <span>É <strong>administrador do cliente</strong> (vê todos os tickets do cliente)</span>
          </label>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={busy}>{busy ? "..." : "Criar"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
