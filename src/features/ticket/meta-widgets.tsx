import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Pencil, Check, X, Package } from "lucide-react";
import { CommentList, NewCommentForm } from "./Conversation";
import type { Ticket, Comment, Attachment } from "./types";

export function PedidoPorField({ ticket, isAdmin, onChange }: { ticket: Ticket; isAdmin: boolean; onChange: () => void }) {
  const [name, setName] = useState<string>("—");
  const [editing, setEditing] = useState(false);
  const [clientUsers, setClientUsers] = useState<{ user_id: string; nome: string | null; email: string | null }[]>([]);
  const [val, setVal] = useState<string>(ticket.pedido_por ?? "");

  useEffect(() => {
    setVal(ticket.pedido_por ?? "");
    if (!ticket.pedido_por) { setName("—"); return; }
    void supabase.from("profiles").select("nome, email").eq("user_id", ticket.pedido_por).maybeSingle()
      .then(({ data }) => setName(data?.nome || data?.email || "—"));
  }, [ticket.pedido_por]);

  useEffect(() => {
    if (!isAdmin || !editing) return;
    void (async () => {
      const { data: links } = await supabase.from("client_users").select("user_id").eq("client_id", ticket.client_id);
      const ids = (links ?? []).map((l) => l.user_id);
      if (ids.length === 0) { setClientUsers([]); return; }
      const { data: profs } = await supabase.from("profiles").select("user_id, nome, email").in("user_id", ids);
      setClientUsers((profs ?? []) as { user_id: string; nome: string | null; email: string | null }[]);
    })();
  }, [isAdmin, editing, ticket.client_id]);

  const save = async () => {
    const { error } = await supabase.from("tickets").update({ pedido_por: val || null }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Pedido por actualizado");
    setEditing(false);
    onChange();
  };

  return (
    <div className="text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
      <span>Pedido por:</span>
      {!editing ? (
        <>
          <span className="text-foreground font-medium">{name}</span>
          {isAdmin && (
            <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => setEditing(true)}>
              <Pencil className="h-3 w-3" />
            </Button>
          )}
        </>
      ) : (
        <div className="flex items-center gap-1">
          <Select value={val || "_none_"} onValueChange={(v) => setVal(v === "_none_" ? "" : v)}>
            <SelectTrigger className="h-7 w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="_none_">— Nenhum —</SelectItem>
              {clientUsers.map((u) => (
                <SelectItem key={u.user_id} value={u.user_id}>{u.nome ?? u.email ?? u.user_id}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={save}><Check className="h-3 w-3" /></Button>
          <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setVal(ticket.pedido_por ?? ""); setEditing(false); }}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
  );
}

export function OrdemOficinaInline({ ticket, onChange }: { ticket: Ticket; onChange: () => void }) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(ticket.num_ordem_oficina ?? "");

  useEffect(() => { setVal(ticket.num_ordem_oficina ?? ""); }, [ticket.num_ordem_oficina]);

  const save = async () => {
    const { error } = await supabase.from("tickets").update({ num_ordem_oficina: val.trim() || null }).eq("id", ticket.id);
    if (error) return toast.error(error.message);
    toast.success("Ordem oficina guardada");
    setEditing(false);
    onChange();
  };

  if (editing) {
    return (
      <div className="flex items-center gap-1 text-sm">
        <Package className="h-3.5 w-3.5 text-muted-foreground" />
        <Input value={val} onChange={(e) => setVal(e.target.value)} placeholder="Nº ordem" className="h-7 w-32" autoFocus />
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={save}><Check className="h-3 w-3" /></Button>
        <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => { setVal(ticket.num_ordem_oficina ?? ""); setEditing(false); }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }
  return (
    <div className="text-sm">
      {ticket.num_ordem_oficina ? (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1">
          <Badge variant="secondary" className="cursor-pointer">
            <Package className="h-3 w-3 mr-1" /> Ordem #{ticket.num_ordem_oficina}
          </Badge>
        </button>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
          <Package className="h-3 w-3" /> + Adicionar ordem oficina
        </button>
      )}
    </div>
  );
}

export function NotesTabsCard({
  ticket, comments, attachments, isAdmin, isClientAdmin, currentUserId, onOpenAttachment, onChange,
}: {
  ticket: Ticket;
  comments: Comment[];
  attachments: Attachment[];
  isAdmin: boolean;
  isClientAdmin: boolean;
  currentUserId: string | undefined;
  onOpenAttachment: (a: Attachment) => void | Promise<void>;
  onChange: () => void;
}) {
  return (
    <Card className="p-4 space-y-4">
      <h3 className="text-sm font-semibold">💬 Conversação</h3>
      <CommentList
        comments={comments}
        attachments={attachments}
        isAdmin={isAdmin}
        isClientAdmin={isClientAdmin}
        currentUserId={currentUserId}
        onOpenAttachment={onOpenAttachment}
      />
      <div className="pt-4 border-t">
        <NewCommentForm
          ticketId={ticket.id}
          clientId={ticket.client_id}
          isAdmin={isAdmin}
          isClientAdmin={isClientAdmin}
          onSent={onChange}
        />
      </div>
    </Card>
  );
}
