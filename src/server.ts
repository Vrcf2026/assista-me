import { createStartHandler, defaultStreamHandler } from "@tanstack/react-start/server";
import type { ServerEntry } from "@tanstack/react-start/server-entry";

const handleRequest = createStartHandler(defaultStreamHandler);

function isDisconnectedRequest(error: unknown, request: Request) {
  if (request.signal.aborted) return true;
  if (!(error instanceof Error)) return false;

  const errorWithCause = error as Error & {
    code?: string;
    cause?: { code?: string };
  };

  return (
    errorWithCause.name === "AbortError" ||
    errorWithCause.code === "ECONNRESET" ||
    errorWithCause.cause?.code === "ECONNRESET"
  );
}

export default {
  async fetch(request, options) {
    try {
      return await handleRequest(request, options);
    } catch (error) {
      // Closing or replacing the preview tab aborts in-flight SSR requests.
      // This is an expected disconnect, not an application failure.
      if (isDisconnectedRequest(error, request)) {
        return new Response(null, { status: 499 });
      }

      throw error;
    }
  },
} satisfies ServerEntry;