import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Copy, Pencil, Check, X, Monitor, Users, Clock, StickyNote, Phone } from "lucide-react";
import { toast } from "sonner";

interface ClientInfo {
  anydesk_id: string | null;
  teamviewer_id: string | null;
  contacto_tecnico_nome: string | null;
  contacto_tecnico_telefone: string | null;
  horario_assistencia: string | null;
  notas_internas: string | null;
}

const EMPTY: ClientInfo = {
  anydesk_id: null,
  teamviewer_id: null,
  contacto_tecnico_nome: null,
  contacto_tecnico_telefone: null,
  horario_assistencia: null,
  notas_internas: null,
};

interface Props {
  clientId: string;
  canEdit: boolean;
  compact?: boolean;
}

export function ClientInfoPanel({ clientId, canEdit, compact = false }: Props) {
  const [info, setInfo] = useState<ClientInfo>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<ClientInfo>(EMPTY);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("clients")
      .select("anydesk_id, teamviewer_id, contacto_tecnico_nome, contacto_tecnico_telefone, horario_assistencia, notas_internas")
      .eq("id", clientId)
      .maybeSingle();
    const v = (data as ClientInfo | null) ?? EMPTY;
    setInfo(v);
    setDraft(v);
    setLoading(false);
  };

  useEffect(() => { void load(); }, [clientId]);

  const copy = async (label: string, value: string | null) => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error("Não foi possível copiar");
    }
  };

  const save = async () => {
    setBusy(true);
    try {
      const payload = {
        anydesk_id: draft.anydesk_id?.trim() || null,
        teamviewer_id: draft.teamviewer_id?.trim() || null,
        contacto_tecnico_nome: draft.contacto_tecnico_nome?.trim() || null,
        contacto_tecnico_telefone: draft.contacto_tecnico_telefone?.trim() || null,
        horario_assistencia: draft.horario_assistencia?.trim() || null,
        notas_internas: draft.notas_internas?.trim() || null,
      };
      const { error } = await supabase.from("clients").update(payload).eq("id", clientId);
      if (error) throw error;
      setInfo(payload);
      setEditing(false);
      toast.success("Informações atualizadas");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao guardar");
    } finally {
      setBusy(false);
    }
  };

  const hasAny = !!(
    info.anydesk_id || info.teamviewer_id || info.contacto_tecnico_nome ||
    info.contacto_tecnico_telefone || info.horario_assistencia || info.notas_internas
  );

  if (loading) return null;

  const Row = ({
    icon, label, value, mono,
  }: { icon: React.ReactNode; label: string; value: string | null; mono?: boolean }) => {
    if (!value) return null;
    return (
      <div className="flex items-start gap-2 text-sm group">
        <span className="mt-0.5 text-muted-foreground">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className={mono ? "font-mono" : ""}>{value}</div>
        </div>
        <Button
          variant="ghost" size="sm"
          className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 transition"
          onClick={() => void copy(label, value)}
          title="Copiar"
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  };

  return (
    <Card className={compact ? "p-4" : "p-6"}>
      <div className="flex items-center justify-between mb-3">
        <h3 className={compact ? "text-sm font-semibold" : "text-lg font-semibold"}>
          Informações de acesso
        </h3>
        {canEdit && !editing && (
          <Button variant="ghost" size="sm" onClick={() => { setDraft(info); setEditing(true); }}>
            <Pencil className="h-3.5 w-3.5 mr-1" /> Editar
          </Button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">AnyDesk ID</Label>
              <Input value={draft.anydesk_id ?? ""} onChange={(e) => setDraft({ ...draft, anydesk_id: e.target.value })} placeholder="123 456 789" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">TeamViewer ID</Label>
              <Input value={draft.teamviewer_id ?? ""} onChange={(e) => setDraft({ ...draft, teamviewer_id: e.target.value })} placeholder="1 234 567 890" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contacto técnico (nome)</Label>
              <Input value={draft.contacto_tecnico_nome ?? ""} onChange={(e) => setDraft({ ...draft, contacto_tecnico_nome: e.target.value })} placeholder="João Silva" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Contacto técnico (telefone)</Label>
              <Input value={draft.contacto_tecnico_telefone ?? ""} onChange={(e) => setDraft({ ...draft, contacto_tecnico_telefone: e.target.value })} placeholder="912 345 678" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Horário de assistência preferido</Label>
              <Input value={draft.horario_assistencia ?? ""} onChange={(e) => setDraft({ ...draft, horario_assistencia: e.target.value })} placeholder="Ex: dias úteis, 9h–18h" />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label className="text-xs">Notas internas</Label>
              <Textarea
                rows={4}
                value={draft.notas_internas ?? ""}
                onChange={(e) => setDraft({ ...draft, notas_internas: e.target.value })}
                placeholder="Informação útil recorrente — servidor principal, VPN, particularidades, etc."
              />
              <p className="text-[11px] text-muted-foreground">Visível apenas para admins.</p>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="outline" size="sm" onClick={() => { setDraft(info); setEditing(false); }} disabled={busy}>
              <X className="h-3.5 w-3.5 mr-1" /> Cancelar
            </Button>
            <Button size="sm" onClick={() => void save()} disabled={busy}>
              <Check className="h-3.5 w-3.5 mr-1" /> {busy ? "..." : "Guardar"}
            </Button>
          </div>
        </div>
      ) : !hasAny ? (
        <p className="text-sm text-muted-foreground">
          Sem informações registadas. {canEdit && "Clica em Editar para adicionar AnyDesk, contacto técnico, notas, etc."}
        </p>
      ) : (
        <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3">
          <Row icon={<Monitor className="h-4 w-4" />} label="AnyDesk" value={info.anydesk_id} mono />
          <Row icon={<Monitor className="h-4 w-4" />} label="TeamViewer" value={info.teamviewer_id} mono />
          <Row icon={<Users className="h-4 w-4" />} label="Contacto técnico" value={info.contacto_tecnico_nome} />
          <Row icon={<Phone className="h-4 w-4" />} label="Telefone" value={info.contacto_tecnico_telefone} mono />
          <Row icon={<Clock className="h-4 w-4" />} label="Horário de assistência" value={info.horario_assistencia} />
          {info.notas_internas && (
            <div className="sm:col-span-2 flex items-start gap-2 text-sm">
              <span className="mt-0.5 text-muted-foreground"><StickyNote className="h-4 w-4" /></span>
              <div className="flex-1">
                <div className="text-xs text-muted-foreground">Notas internas</div>
                <div className="whitespace-pre-wrap">{info.notas_internas}</div>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
