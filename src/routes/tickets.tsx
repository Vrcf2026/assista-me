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
  useEffect(() => {
    if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
  }, [user, role, loading, navigate]);
  if (loading || role !== "admin") return null;
  if (pathname !== "/tickets") return <Outlet />;
  return <AppLayout><AdminTickets /></AppLayout>;
}
