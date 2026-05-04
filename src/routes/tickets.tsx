import { createFileRoute, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { AdminTickets } from "@/components/admin/AdminTickets";

export const Route = createFileRoute("/tickets")({
  component: TicketsListPage,
});

function TicketsListPage() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname !== "/tickets";

  useEffect(() => {
    if (isChildRoute) return;
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate, isChildRoute]);

  if (isChildRoute) return <Outlet />;
  if (loading || role !== "admin") return null;
  return <AppLayout><AdminTickets /></AppLayout>;
}
