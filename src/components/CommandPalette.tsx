import { useEffect, useState } from "react";
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
  LayoutDashboard,
  Ticket,
  PlusCircle,
  Wrench,
  FileText,
  Megaphone,
  Users,
  Calendar,
  Mail,
  Tags,
  MessageSquare,
  BarChart3,
  Receipt,
  Moon,
  Sun,
} from "lucide-react";
import { useTheme } from "@/hooks/use-theme";

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

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const { role } = useAuth();
  const { theme, setTheme } = useTheme();
  const isAdmin = role === "admin";

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

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  const visible = ITEMS.filter((i) => !i.adminOnly || isAdmin);
  const groups = Array.from(new Set(visible.map((i) => i.group)));

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Procurar páginas, ações..." />
      <CommandList>
        <CommandEmpty>Sem resultados.</CommandEmpty>
        {groups.map((g, idx) => (
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
