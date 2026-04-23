import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";
import { AppLayout } from "@/components/AppLayout";
import { AdminDashboard } from "@/components/admin/AdminDashboard";
import { ClientTickets } from "@/components/client/ClientTickets";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, role, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) navigate({ to: "/login" });
  }, [user, loading, navigate]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground text-sm">A carregar…</div>
      </div>
    );
  }

  return (
    <AppLayout>
      {role === "admin" ? <AdminDashboard /> : <ClientTickets />}
    </AppLayout>
  );
}
