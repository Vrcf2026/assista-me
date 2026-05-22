import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, KeyRound, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export interface CredentialDraft {
  tipo: "email" | "vpn" | "windows" | "router" | "outro";
  utilizador: string;
  password: string;
  notas: string;
}

export function CredentialsCollapsible({
  items, onChange,
}: {
  items: CredentialDraft[];
  onChange: (items: CredentialDraft[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [showPw, setShowPw] = useState<Record<number, boolean>>({});

  const add = () => onChange([...items, { tipo: "outro", utilizador: "", password: "", notas: "" }]);
  const update = (i: number, patch: Partial<CredentialDraft>) =>
    onChange(items.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));

  return (
    <div className="rounded-md border bg-muted/10">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-sm font-medium"
      >
        <span className="flex items-center gap-2">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <KeyRound className="h-4 w-4" /> Credenciais de acesso
          {items.length > 0 && <span className="text-xs text-muted-foreground">({items.length})</span>}
          <span className="text-xs font-normal text-muted-foreground">🔒 encriptado · opcional</span>
        </span>
      </button>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          <p className="text-xs text-muted-foreground">
            Partilhe aqui passwords necessárias para a assistência. Ficam encriptadas e são apagadas automaticamente ao fechar o ticket.
          </p>
          {items.map((it, i) => (
            <div key={i} className="rounded-md border bg-background p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium">Credencial {i + 1}</span>
                <Button type="button" size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive" onClick={() => remove(i)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Tipo</Label>
                  <Select value={it.tipo} onValueChange={(v) => update(i, { tipo: v as CredentialDraft["tipo"] })}>
                    <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="vpn">VPN</SelectItem>
                      <SelectItem value="windows">Windows</SelectItem>
                      <SelectItem value="router">Router</SelectItem>
                      <SelectItem value="outro">Outro</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Utilizador</Label>
                  <Input value={it.utilizador} onChange={(e) => update(i, { utilizador: e.target.value })} className="h-9" />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Password *</Label>
                <div className="flex gap-2">
                  <Input
                    type={showPw[i] ? "text" : "password"}
                    value={it.password}
                    onChange={(e) => update(i, { password: e.target.value })}
                    className="font-mono h-9"
                  />
                  <Button type="button" variant="outline" size="icon" className="h-9 w-9" onClick={() => setShowPw((r) => ({ ...r, [i]: !r[i] }))}>
                    {showPw[i] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notas</Label>
                <Textarea value={it.notas} onChange={(e) => update(i, { notas: e.target.value })} rows={2} />
              </div>
            </div>
          ))}
          <Button type="button" variant="outline" size="sm" onClick={add}>
            <Plus className="h-3.5 w-3.5 mr-1" /> Adicionar credencial
          </Button>
        </div>
      )}
    </div>
  );
}

export async function saveDraftCredentials(
  supabaseInvoke: (action: string, payload: Record<string, unknown>) => Promise<unknown>,
  ticketId: string,
  drafts: CredentialDraft[],
) {
  for (const d of drafts) {
    if (!d.password.trim()) continue;
    try {
      await supabaseInvoke("create", {
        ticketId,
        tipo: d.tipo,
        utilizador: d.utilizador.trim() || null,
        password: d.password,
        notas: d.notas.trim() || null,
      });
    } catch (e) {
      // surface but don't block
      console.error("Erro a guardar credencial", e);
    }
  }
}
