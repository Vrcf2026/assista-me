import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { RequireRole } from "@/components/RequireRole";
import { AppLayout } from "@/components/AppLayout";
import { AdminTickets } from "@/components/admin/AdminTickets";

export const Route = createFileRoute("/tickets")({
  component: TicketsListPage,
});

// Nota: "/tickets" (esta lista) é admin-only, mas as rotas filhas
// (ex. "/tickets/$id") são acessíveis a qualquer utilizador autenticado —
// o que cada um vê dentro do ticket é controlado pelas RLS policies do
// Supabase, não por este guard. Por isso o bypass para isChildRoute tem
// de ficar fora do RequireRole.
function TicketsListPage() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isChildRoute = pathname !== "/tickets";

  if (isChildRoute) return <Outlet />;

  return (
    <RequireRole role="admin">
      <AppLayout><AdminTickets /></AppLayout>
    </RequireRole>
  );
}
