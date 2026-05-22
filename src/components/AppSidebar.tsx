import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  List,
  ShieldCheck,
  ClipboardList,
  Receipt,
  Megaphone,
  Users,
  FileText,
  Tag,
  MessageSquare,
  Mail,
  Monitor,
  Ticket,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { BRANDS, getBrand, type Marca } from "@/lib/brand";

type Item = { title: string; url: string; icon: React.ComponentType<{ className?: string }>; external?: boolean };

const operacao: Item[] = [
  { title: "Dashboard", url: "/", icon: LayoutDashboard },
  { title: "Tickets", url: "/tickets", icon: List },
  { title: "Preventiva", url: "/preventiva", icon: ShieldCheck },
  { title: "Trabalhos", url: "/trabalhos", icon: ClipboardList },
];

const comercial: Item[] = [
  { title: "Orçamentos", url: "/orcamentos", icon: Receipt },
  { title: "Campanhas", url: "/campanhas", icon: Megaphone },
  { title: "Clientes", url: "/clientes", icon: Users },
];

const administracao: Item[] = [
  { title: "Faturação", url: "/admin/faturacao", icon: Receipt },
  { title: "Relatórios", url: "/admin/relatorios", icon: FileText },
  { title: "Tags", url: "/admin/tags", icon: Tag },
  { title: "Respostas", url: "/admin/templates", icon: MessageSquare },
  { title: "Emails", url: "/admin/emails", icon: Mail },
  { title: "Painel TV", url: "/painel", icon: Monitor, external: true },
];

export function AppSidebar() {
  const { user, role } = useAuth();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Para utilizadores de cliente, descobre a marca do(s) seu(s) cliente(s) e usa essa.
  const [clientMarca, setClientMarca] = useState<Marca | null>(null);
  useEffect(() => {
    if (!user || role === "admin") { setClientMarca(null); return; }
    let cancelled = false;
    void (async () => {
      const { data } = await supabase
        .from("client_users")
        .select("clients(marca)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      const m = (data as { clients?: { marca?: string } } | null)?.clients?.marca;
      setClientMarca(m === "spacedata" ? "spacedata" : "vrcf");
    })();
    return () => { cancelled = true; };
  }, [user, role]);

  // Admin → sempre VRCF. Cliente → espera pelo fetch antes de mostrar (evita flash).
  const brand = role === "admin" ? BRANDS.vrcf : (clientMarca ? getBrand(clientMarca) : null);

  const isActive = (url: string) =>
    url === "/" ? pathname === "/" : pathname === url || pathname.startsWith(url + "/");

  const renderItems = (items: Item[]) =>
    items.map((item) => {
      const active = isActive(item.url);
      const Icon = item.icon;
      const inner = (
        <>
          <Icon className="h-4 w-4 shrink-0" />
          {!collapsed && <span>{item.title}</span>}
        </>
      );
      return (
        <SidebarMenuItem key={item.url}>
          <SidebarMenuButton asChild isActive={active} tooltip={item.title}>
            {item.external ? (
              <a href={item.url} target="_blank" rel="noreferrer">
                {inner}
              </a>
            ) : (
              <Link to={item.url}>{inner}</Link>
            )}
          </SidebarMenuButton>
        </SidebarMenuItem>
      );
    });

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <Link to="/" className="flex items-center gap-3 px-2 py-3">
          {brand ? (
            <>
              <img
                src={brand.logo}
                alt={brand.shortName}
                className={collapsed ? "h-8 w-8 object-contain" : "h-10 w-10 object-contain"}
              />
              {!collapsed && (
                <div className="flex flex-col leading-tight">
                  <span className="font-bold text-sidebar-foreground tracking-tight">{brand.shortName}</span>
                  <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/60">
                    {brand.tagline}
                  </span>
                </div>
              )}
            </>
          ) : (
            <div className={collapsed ? "h-8 w-8" : "h-10 w-full"} />
          )}
        </Link>
      </SidebarHeader>

      <SidebarContent>
        {role === "admin" ? (
          <>
            <SidebarGroup>
              <SidebarGroupLabel>Operação</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderItems(operacao)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Comercial</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderItems(comercial)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>

            <SidebarGroup>
              <SidebarGroupLabel>Administração</SidebarGroupLabel>
              <SidebarGroupContent>
                <SidebarMenu>{renderItems(administracao)}</SidebarMenu>
              </SidebarGroupContent>
            </SidebarGroup>
          </>
        ) : (
          <SidebarGroup>
            <SidebarGroupLabel>Suporte</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton asChild isActive={pathname === "/"} tooltip="Os meus tickets">
                    <Link to="/">
                      <Ticket className="h-4 w-4 shrink-0" />
                      {!collapsed && <span>Os meus tickets</span>}
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  );
}
