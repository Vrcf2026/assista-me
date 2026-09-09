type CapturedError = { error: unknown; at: number };

const CAPTURE_TTL_MS = 5_000;
let lastCapturedError: CapturedError | undefined;

function recordError(error: unknown) {
  lastCapturedError = { error, at: Date.now() };
}

const originalConsoleError = console.error.bind(console);
console.error = (...args: unknown[]) => {
  const error = args.find((argument) => argument instanceof Error);
  if (error) recordError(error);
  originalConsoleError(...args);
};

if (typeof globalThis.addEventListener === "function") {
  globalThis.addEventListener("error", (event) => {
    recordError((event as ErrorEvent).error ?? event);
  });
  globalThis.addEventListener("unhandledrejection", (event) => {
    recordError((event as PromiseRejectionEvent).reason);
  });
}

export function consumeLastCapturedError() {
  if (!lastCapturedError) return undefined;
  if (Date.now() - lastCapturedError.at > CAPTURE_TTL_MS) {
    lastCapturedError = undefined;
    return undefined;
  }

  const captured = lastCapturedError.error;
  lastCapturedError = undefined;
  return captured;
}