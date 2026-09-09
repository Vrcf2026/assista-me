import "./lib/error-capture";
import { consumeLastCapturedError } from "./lib/error-capture";
import { renderErrorPage } from "./lib/error-page";

type StartServerEntry = {
  fetch: (request: Request, env?: unknown, context?: unknown) => Response | Promise<Response>;
};

let startServerPromise: Promise<StartServerEntry> | undefined;

function getStartServer() {
  startServerPromise ??= import("@tanstack/react-start/server-entry").then(
    (module) => (module.default ?? module) as StartServerEntry,
  );
  return startServerPromise;
}

function isDisconnectedRequest(error: unknown, request: Request): boolean {
  if (request.signal.aborted) return true;
  if (!error || typeof error !== "object") return false;

  const candidate = error as { name?: unknown; message?: unknown; code?: unknown; cause?: unknown };
  if (candidate.name === "AbortError" || candidate.code === "ECONNRESET") return true;
  if (candidate.message === "aborted" || candidate.message === "The operation was aborted") return true;
  return candidate.cause !== error && isDisconnectedRequest(candidate.cause, request);
}

function isHiddenServerError(response: Response, body: string) {
  if (response.status < 500 || !response.headers.get("content-type")?.includes("application/json")) {
    return false;
  }

  try {
    const payload = JSON.parse(body) as { unhandled?: unknown; message?: unknown };
    return payload.unhandled === true && payload.message === "HTTPError";
  } catch {
    return false;
  }
}

async function normalizeResponse(response: Response) {
  if (response.status < 500) return response;

  const body = await response.clone().text();
  if (!isHiddenServerError(response, body)) return response;

  console.error(consumeLastCapturedError() ?? new Error(`Erro SSR ocultado: ${body}`));
  return new Response(renderErrorPage(), {
    status: 500,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}

export default {
  async fetch(request: Request, env?: unknown, context?: unknown) {
    try {
      const startServer = await getStartServer();
      const response = await startServer.fetch(request, env, context);
      return await normalizeResponse(response);
    } catch (error) {
      if (isDisconnectedRequest(error, request)) {
        return new Response(null, { status: 499 });
      }

      console.error(error);
      return new Response(renderErrorPage(), {
        status: 500,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
  },
} satisfies StartServerEntry;