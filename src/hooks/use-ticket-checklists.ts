import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ── Templates ─────────────────────────────────────────────────────────────────

export function useChecklistTemplates() {
  return useQuery({
    queryKey: ["checklist_templates"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("checklist_templates" as any)
        .select("*, checklist_template_items(*)")
        .order("name");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; name: string; category: string; equipment_type: string | null;
        checklist_template_items: Array<{ id: string; label: string; sort_order: number }>;
      }>;
    },
  });
}

export function useCreateChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { name: string; category: string; equipment_type?: string; items: string[] }) => {
      const { data: template, error } = await supabase
        .from("checklist_templates" as any)
        .insert({ name: input.name, category: input.category, equipment_type: input.equipment_type ?? null })
        .select().single();
      if (error) throw error;

      if (input.items.length > 0) {
        const rows = input.items.map((label, i) => ({
          template_id: (template as any).id,
          label,
          sort_order: i,
        }));
        const { error: ie } = await supabase.from("checklist_template_items" as any).insert(rows);
        if (ie) throw ie;
      }
      return template;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist_templates"] }),
  });
}

export function useDeleteChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("checklist_templates" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["checklist_templates"] }),
  });
}

// ── Checklists por ticket ─────────────────────────────────────────────────────

export function useTicketChecklists(ticketId: string | undefined) {
  return useQuery({
    queryKey: ["ticket_checklists", ticketId],
    enabled: !!ticketId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("ticket_checklists" as any)
        .select("*, ticket_checklist_items(*)")
        .eq("ticket_id", ticketId!)
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        id: string; name: string; ticket_id: string;
        ticket_checklist_items: Array<{
          id: string; label: string; sort_order: number;
          checked: boolean; checked_at: string | null; notes: string | null;
        }>;
      }>;
    },
  });
}

export function useApplyChecklistTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ ticketId, templateId }: { ticketId: string; templateId: string }) => {
      const { data: template, error: te } = await supabase
        .from("checklist_templates" as any)
        .select("*, checklist_template_items(*)")
        .eq("id", templateId).single();
      if (te) throw te;

      const { data: checklist, error: ce } = await supabase
        .from("ticket_checklists" as any)
        .insert({ ticket_id: ticketId, template_id: templateId, name: (template as any).name })
        .select().single();
      if (ce) throw ce;

      const items = ((template as any).checklist_template_items ?? [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((item: any, i: number) => ({
          checklist_id: (checklist as any).id,
          label: item.label,
          sort_order: i,
        }));

      if (items.length > 0) {
        const { error: ie } = await supabase.from("ticket_checklist_items" as any).insert(items);
        if (ie) throw ie;
      }
      return checklist;
    },
    onSuccess: (_d, vars) =>
      qc.invalidateQueries({ queryKey: ["ticket_checklists", vars.ticketId] }),
  });
}

export function useToggleChecklistItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, checked, notes }: { id: string; checked: boolean; notes?: string }) => {
      const updates: Record<string, unknown> = {
        checked,
        checked_at: checked ? new Date().toISOString() : null,
      };
      if (notes !== undefined) updates.notes = notes;
      const { error } = await supabase
        .from("ticket_checklist_items" as any).update(updates).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket_checklists"] }),
  });
}

export function useDeleteTicketChecklist() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("ticket_checklists" as any).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ticket_checklists"] }),
  });
}
