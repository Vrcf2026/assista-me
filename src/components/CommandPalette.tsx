import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { useAuth } from "@/lib/auth-context";
import {
  LayoutDashboard, Ticket, PlusCircle, Wrench, FileText,
  Megaphone, Users, Calendar, Mail, Tags, MessageSquare,
  BarChart3, Receipt, Moon, Sun, Search, Loader2, CalendarDays,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { supabase } from "@/integrations/supabase/client";

type Item = {
  label: string;
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  keywords?: string;
  adminOnly?: boolean;
  group: string;
};

const ITEMS: Item[] = [
  { label: "Dashboard", to: "/", icon: LayoutDashboard, group: "Navegação" },
  { label: "Tickets", to: "/tickets", icon: Ticket, group: "Operação" },
  { label: "Calendário", to: "/calendario", icon: CalendarDays, keywords: "agenda datas prazos", group: "Operação" },
  { label: "Novo Ticket", to: "/tickets/novo", icon: PlusCircle, keywords: "criar abrir", group: "Operação" },
  { label: "Trabalhos", to: "/trabalhos", icon: Wrench, group: "Operação" },
  { label: "Preventiva", to: "/preventiva", icon: Calendar, group: "Operação" },
  { label: "Orçamentos", to: "/orcamentos", icon: FileText, group: "Comercial" },
  { label: "Campanhas", to: "/campanhas", icon: Megaphone, group: "Comercial" },
  { label: "Clientes", to: "/clientes", icon: Users, group: "Comercial" },
  { label: "Faturação", to: "/admin/faturacao", icon: Receipt, adminOnly: true, group: "Administração" },
  { label: "Relatórios", to: "/admin/relatorios", icon: BarChart3, adminOnly: true, group: "Administração" },
  { label: "Tags", to: "/admin/tags", icon: Tags, adminOnly: true, group: "Administração" },
  { label: "Templates de Resposta", to: "/admin/templates", icon: MessageSquare, adminOnly: true, group: "Administração" },
  { label: "Emails", to: "/admin/emails", icon: Mail, adminOnly: true, group: "Administração" },
];

interface TicketResult {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  cliente: string;
}

function formatNum(n: number) {
  return `#${String(n).padStart(5, "0")}`;
}

const ESTADO_LABEL: Record<string, string> = {
  aberto: "Aberto",
  em_progresso: "Em progresso",
  aguarda_cliente: "Aguarda cliente",
  fechado: "Fechado",
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [ticketResults, setTicketResults] = useState<TicketResult[]>([]);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const navigate = useNavigate();
  const { role } = useAuth();
  const { theme, setTheme } = useTheme();
  const isAdmin = role === "admin";

  // Abrir com Ctrl+K / Cmd+K
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  // Pesquisa de tickets — full-text no Supabase (ilike) com fallback rápido
  const searchTickets = useCallback(async (q: string) => {
    if (q.trim().length < 2) {
      setTicketResults([]);
      return;
    }
    setSearching(true);
    try {
      // Detectar se é número de ticket (#123 ou só dígitos)
      const numMatch = q.replace(/^#/, "").trim();
      const isNum = /^\d+$/.test(numMatch);

      let queryBuilder = supabase
        .from("tickets")
        .select("id, numero, titulo, estado, client:clients(nome)")
        .order("created_at", { ascending: false })
        .limit(8);

      if (isNum) {
        queryBuilder = queryBuilder.eq("numero", parseInt(numMatch, 10));
      } else {
        // Pesquisa por título + descrição (ilike)
        queryBuilder = queryBuilder.or(
          `titulo.ilike.%${q}%,descricao.ilike.%${q}%`
        );
      }

      const { data } = await queryBuilder;
      setTicketResults(
        (data ?? []).map((t: Record<string, any>) => ({
          id: t.id,
          numero: t.numero,
          titulo: t.titulo,
          estado: t.estado,
          cliente: t.client?.nome ?? "—",
        }))
      );
    } finally {
      setSearching(false);
    }
  }, []);

  // Debounce da pesquisa
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!open) return;
    debounceRef.current = setTimeout(() => {
      void searchTickets(query);
    }, 280);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, open, searchTickets]);

  // Reset ao fechar
  useEffect(() => {
    if (!open) {
      setQuery("");
      setTicketResults([]);
    }
  }, [open]);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const visible = ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const groups = Array.from(new Set(visible.map((i) => i.group)));
  const hasQuery = query.trim().length >= 2;

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder="Pesquisar tickets, páginas, ações… (⌘K)"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        <CommandEmpty>
          {searching ? (
            <span className="flex items-center gap-2 text-sm text-muted-foreground justify-center py-2">
              <Loader2 className="h-4 w-4 animate-spin" /> A pesquisar…
            </span>
          ) : (
            "Sem resultados."
          )}
        </CommandEmpty>

        {/* Resultados de tickets — aparecem quando há query */}
        {isAdmin && ticketResults.length > 0 && (
          <>
            <CommandGroup heading={`Tickets (${ticketResults.length})`}>
              {ticketResults.map((t) => (
                <CommandItem
                  key={t.id}
                  value={`ticket ${t.numero} ${t.titulo} ${t.cliente}`}
                  onSelect={() => run(() => navigate({ to: "/tickets/$id", params: { id: t.id } }))}
                  className="flex items-start gap-3"
                >
                  <Search className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs text-muted-foreground">{formatNum(t.numero)}</span>
                      <span className="text-xs px-1.5 py-0.5 rounded bg-secondary">
                        {ESTADO_LABEL[t.estado] ?? t.estado}
                      </span>
                    </div>
                    <div className="text-sm truncate">{t.titulo}</div>
                    <div className="text-xs text-muted-foreground">{t.cliente}</div>
                  </div>
                </CommandItem>
              ))}
            </CommandGroup>
            <CommandSeparator />
          </>
        )}

        {/* Navegação — só mostra sem query ou com query sem resultados */}
        {(!hasQuery || ticketResults.length === 0) && groups.map((g, idx) => (
          <div key={g}>
            {idx > 0 && <CommandSeparator />}
            <CommandGroup heading={g}>
              {visible
                .filter((i) => i.group === g)
                .map((i) => (
                  <CommandItem
                    key={i.to}
                    value={`${i.label} ${i.keywords ?? ""}`}
                    onSelect={() => run(() => navigate({ to: i.to }))}
                  >
                    <i.icon className="mr-2 h-4 w-4" />
                    {i.label}
                  </CommandItem>
                ))}
            </CommandGroup>
          </div>
        ))}

        <CommandSeparator />
        <CommandGroup heading="Preferências">
          <CommandItem
            value="tema escuro claro dark light"
            onSelect={() => run(() => setTheme(theme === "dark" ? "light" : "dark"))}
          >
            {theme === "dark" ? <Sun className="mr-2 h-4 w-4" /> : <Moon className="mr-2 h-4 w-4" />}
            Alternar tema ({theme === "dark" ? "claro" : "escuro"})
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
}
