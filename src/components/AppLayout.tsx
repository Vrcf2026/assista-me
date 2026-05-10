import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth-context";
import { LogOut, Ticket, Users, LayoutDashboard, Mail, Tag, MessageSquare, List, Receipt, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, role, signOut } = useAuth();
  const navigate = useNavigate();
  const { location } = useRouterState();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  const linkCls = (active: boolean) =>
    `inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
      active
        ? "bg-primary text-primary-foreground"
        : "text-foreground hover:bg-secondary"
    }`;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b bg-card sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link to="/" className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary flex items-center justify-center text-primary-foreground font-bold">
              V
            </div>
            <span className="font-semibold text-foreground hidden sm:inline">
              VRCF Suporte
            </span>
          </Link>

          <nav className="flex items-center gap-1 flex-1 justify-center overflow-x-auto">
            {role === "admin" ? (
              <>
                <Link to="/" className={linkCls(location.pathname === "/")}>
                  <LayoutDashboard className="h-4 w-4" />
                  <span className="hidden sm:inline">Dashboard</span>
                </Link>
                <Link to="/tickets" className={linkCls(isActive("/tickets") && location.pathname !== "/tickets/novo")}>
                  <List className="h-4 w-4" />
                  <span className="hidden sm:inline">Tickets</span>
                </Link>
                <Link to="/preventiva" className={linkCls(isActive("/preventiva"))}>
                  <ShieldCheck className="h-4 w-4" />
                  <span className="hidden sm:inline">Preventiva</span>
                </Link>
                <Link to="/clientes" className={linkCls(isActive("/clientes"))}>
                  <Users className="h-4 w-4" />
                  <span className="hidden sm:inline">Clientes</span>
                </Link>
                <Link to="/admin/faturacao" className={linkCls(isActive("/admin/faturacao"))}>
                  <Receipt className="h-4 w-4" />
                  <span className="hidden lg:inline">Faturação</span>
                </Link>
                <Link to="/admin/tags" className={linkCls(isActive("/admin/tags"))}>
                  <Tag className="h-4 w-4" />
                  <span className="hidden lg:inline">Tags</span>
                </Link>
                <Link to="/admin/templates" className={linkCls(isActive("/admin/templates"))}>
                  <MessageSquare className="h-4 w-4" />
                  <span className="hidden lg:inline">Respostas</span>
                </Link>
                <Link to="/admin/emails" className={linkCls(isActive("/admin/emails"))}>
                  <Mail className="h-4 w-4" />
                  <span className="hidden lg:inline">Emails</span>
                </Link>
              </>
            ) : (
              <>
                <Link to="/" className={linkCls(location.pathname === "/")}>
                  <Ticket className="h-4 w-4" />
                  Os meus tickets
                </Link>
              </>
            )}
          </nav>

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground hidden md:inline">
              {user?.email}
            </span>
            <Button variant="ghost" size="sm" onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline ml-2">Sair</span>
            </Button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6">
        {children}
      </main>

      <footer className="border-t py-4 text-center text-xs text-muted-foreground">
        VRCF — Gestão de Suporte Técnico
      </footer>
    </div>
  );
}
