import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { X, Tag as TagIcon } from "lucide-react";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

interface Tag { id: string; nome: string; cor: string; }

interface Props {
  ticketId: string;
  canEdit: boolean;
}

export function TicketTagsEditor({ ticketId, canEdit }: Props) {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [assigned, setAssigned] = useState<Tag[]>([]);

  const load = async () => {
    const [{ data: all }, { data: ass }] = await Promise.all([
      supabase.from("ticket_tags").select("*").order("nome"),
      supabase.from("ticket_tag_assignments").select("tag:ticket_tags(*)").eq("ticket_id", ticketId),
    ]);
    setAllTags((all ?? []) as Tag[]);
    setAssigned(((ass ?? []) as { tag: Tag }[]).map((a) => a.tag).filter(Boolean));
  };
  useEffect(() => { void load(); }, [ticketId]);

  const toggle = async (tag: Tag) => {
    const isAssigned = assigned.some((t) => t.id === tag.id);
    if (isAssigned) {
      const { error } = await supabase.from("ticket_tag_assignments")
        .delete().eq("ticket_id", ticketId).eq("tag_id", tag.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("ticket_tag_assignments")
        .insert({ ticket_id: ticketId, tag_id: tag.id });
      if (error) return toast.error(error.message);
    }
    void load();
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {assigned.map((t) => (
        <span
          key={t.id}
          className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border"
          style={{ backgroundColor: `${t.cor}20`, borderColor: `${t.cor}50`, color: t.cor }}
        >
          {t.nome}
          {canEdit && (
            <button onClick={() => void toggle(t)} className="hover:opacity-70" type="button">
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      {canEdit && (
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="ghost" size="sm" className="h-6 text-xs">
              <TagIcon className="h-3 w-3 mr-1" /> Tags
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2" align="start">
            {allTags.length === 0 ? (
              <p className="text-xs text-muted-foreground p-2">Sem tags. Crie em Admin → Tags.</p>
            ) : (
              <div className="space-y-1">
                {allTags.map((t) => {
                  const isOn = assigned.some((a) => a.id === t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void toggle(t)}
                      className={`w-full text-left text-sm px-2 py-1 rounded hover:bg-secondary flex items-center gap-2 ${
                        isOn ? "bg-secondary" : ""
                      }`}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: t.cor }} />
                      <span className="flex-1">{t.nome}</span>
                      {isOn && <span className="text-xs text-primary">✓</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
