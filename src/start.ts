import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { renderErrorPage } from "@/lib/error-page";

function isDisconnectedRequest(error: unknown, request: Request): boolean {
  if (request.signal.aborted) return true;
  if (!error || typeof error !== "object") return false;

  const candidate = error as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
  if (candidate.name === "AbortError" || candidate.code === "ECONNRESET") return true;
  if (candidate.message === "aborted" || candidate.message === "The operation was aborted") return true;
  return candidate.cause !== error && isDisconnectedRequest(candidate.cause, request);
}

const errorMiddleware = createMiddleware({ type: "request" }).server(
  async ({ next, request }) => {
    try {
      return await next();
    } catch (error) {
      if (isDisconnectedRequest(error, request)) {
        return new Response(null, { status: 499 });
      }

      if (error instanceof Response && error.status < 500) throw error;
      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
);

const csrfMiddleware = createCsrfMiddleware({
  filter: ({ handlerType }) => handlerType === "serverFn",
});

export const startInstance = createStart(() => ({
  requestMiddleware: [errorMiddleware, csrfMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));