import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { LogOut } from "lucide-react";
import type { ReactNode } from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/AppSidebar";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CommandPalette } from "@/components/CommandPalette";
import { NotificationsBell } from "@/components/NotificationsBell";

// Map de pathname → label legível para breadcrumb
const PATH_LABELS: Record<string, string> = {
  "": "Dashboard",
  tickets: "Tickets",
  novo: "Novo",
  preventiva: "Preventiva",
  trabalhos: "Trabalhos",
  orcamentos: "Orçamentos",
  campanhas: "Campanhas",
  clientes: "Clientes",
  admin: "Admin",
  faturacao: "Faturação",
  relatorios: "Relatórios",
  tags: "Tags",
  templates: "Respostas",
  emails: "Emails",
  templates_: "Templates",
  agendamentos: "Agendamentos",
  execucao: "Execução",
  relatorio: "Relatório",
};

function prettify(seg: string) {
  return PATH_LABELS[seg] ?? seg.replace(/[-_]/g, " ");
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const segments = location.pathname.split("/").filter(Boolean);
  const currentLabel =
    segments.length === 0
      ? "Dashboard"
      : prettify(segments[0]);

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />

        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80 sticky top-0 z-30 flex items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger className="text-muted-foreground hover:text-foreground" />

            <div className="h-5 w-px bg-border" />

            <nav className="flex items-center gap-2 text-sm min-w-0 flex-1">
              <Link to="/" className="text-muted-foreground hover:text-foreground transition-colors hidden sm:inline">
                VRCF
              </Link>
              <span className="text-muted-foreground hidden sm:inline">/</span>
              <span className="font-medium text-foreground truncate">{currentLabel}</span>
            </nav>

            <div className="flex items-center gap-1">
              <NotificationsBell />
              <ThemeToggle />
              <span className="text-xs text-muted-foreground hidden md:inline">
                {user?.email}
              </span>
              <Button variant="ghost" size="sm" onClick={handleSignOut}>
                <LogOut className="h-4 w-4" />
                <span className="hidden sm:inline ml-2">Sair</span>
              </Button>
            </div>
          </header>

          <main className="flex-1 w-full px-4 sm:px-6 lg:px-8 py-6 max-w-[1600px] mx-auto">
            {children}
          </main>

          <footer className="border-t py-3 text-center text-xs text-muted-foreground">
            VRCF — Informática &amp; Segurança
          </footer>
        </div>
      </div>
    </SidebarProvider>
  );
}
