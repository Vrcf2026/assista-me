import { QueryClient } from "@tanstack/react-query";

// Singleton browser-side. As rotas autenticadas correm ssr:false, portanto
// não há risco de partilhar cache entre pedidos.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});
