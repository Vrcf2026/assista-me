import { useEffect, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/auth-context";

interface RequireRoleProps {
  /** Role(s) autorizado(s) a ver o conteúdo. Ex: "admin" ou ["admin", "client"] */
  role: string | string[];
  /** Para onde redirecionar se o utilizador tiver sessão mas não o role exigido. Default: "/" */
  redirectTo?: string;
  /** Para onde redirecionar se não houver sessão. Default: usa redirectTo */
  unauthenticatedRedirectTo?: string;
  /** UI a mostrar enquanto loading/redirect está pendente. Default: null (nada visível) */
  fallback?: ReactNode;
  children: ReactNode;
}

/**
 * Substitui o padrão repetido em cada rota admin/preventiva/etc:
 *
 *   const { user, role, loading } = useAuth();
 *   const navigate = useNavigate();
 *   useEffect(() => {
 *     if (!loading && (!user || role !== "admin")) navigate({ to: "/" });
 *   }, [user, role, loading, navigate]);
 *   if (loading || role !== "admin") return null;
 *
 * Uso:
 *   function FaturacaoPage() {
 *     return (
 *       <RequireRole role="admin">
 *         <AppLayout><Faturacao /></AppLayout>
 *       </RequireRole>
 *     );
 *   }
 *
 * Nota de arquitetura: isto continua a ser um guard client-side (a
 * autenticação do projeto é feita via AuthProvider em React state, não
 * SSR/cookies), portanto não substitui uma verificação `beforeLoad` a
 * nível de servidor. Para esse nível de proteção seria necessário migrar
 * a sessão para cookies e resolver o role no servidor antes do render —
 * uma mudança maior, fora do âmbito desta limpeza. Isto resolve a
 * duplicação e garante que o comportamento é sempre igual em todas as
 * rotas protegidas.
 */
export function RequireRole({
  role,
  redirectTo = "/",
  unauthenticatedRedirectTo,
  fallback = null,
  children,
}: RequireRoleProps) {
  const { user, role: userRole, loading } = useAuth();
  const navigate = useNavigate();

  const allowedRoles = Array.isArray(role) ? role : [role];
  const isAllowed = !!userRole && allowedRoles.includes(userRole);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      navigate({ to: unauthenticatedRedirectTo ?? redirectTo });
      return;
    }
    if (!isAllowed) {
      navigate({ to: redirectTo });
    }
  }, [user, isAllowed, loading, navigate, redirectTo, unauthenticatedRedirectTo]);

  if (loading || !user || !isAllowed) return <>{fallback}</>;

  return <>{children}</>;
}
