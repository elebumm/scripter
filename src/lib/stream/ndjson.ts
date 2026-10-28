// Newline-delimited JSON streaming shared by every AI route. Errors always
// arrive as an event, so the client never mistakes a failed model for an
// empty success.

export type StreamEvent<T, P = unknown> =
  | { t: "partial"; data: P }
  | { t: "final"; data: T; meta?: Record<string, unknown> }
  | { t: "error"; message: string };

type Send<T, P> = (event: StreamEvent<T, P>) => void;

/**
 * Server: run `produce` and stream whatever it sends. A thrown error becomes a
 * final `{t:"error"}` event; the response status stays 200 once streaming
 * has started.
 */
export function ndjsonResponse<T, P = unknown>(
  produce: (send: Send<T, P>) => Promise<void>
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const send: Send<T, P> = (event) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          closed = true;
        }
      };
      try {
        await produce(send);
      } catch (err) {
        send({ t: "error", message: errorMessage(err) });
      } finally {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed by a cancelled reader
        }
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export function errorMessage(err: unknown): string {
  if (err instanceof Error) {
    if (err.name === "AbortError") return "Stopped";
    return err.message || err.name;
  }
  return typeof err === "string" ? err : "Unknown error";
}

/** JSON error response for failures before streaming starts. */
export function jsonError(message: string, status = 400): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Client: read an NDJSON response, calling `onEvent` per line. Resolves with
 * the final event's data, or throws with the server's error message.
 */
export async function readNdjson<T, P = unknown>(
  res: Response,
  onEvent?: (event: StreamEvent<T, P>) => void
): Promise<{ data: T; meta?: Record<string, unknown> }> {
  if (!res.ok) {
    // A bare 500 (e.g. ensureDb refusing to migrate without a backup) has its reason only in the server log.
    let message =
      res.status >= 500
        ? `Server error (HTTP ${res.status}). The terminal running Scripter has the details.`
        : `HTTP ${res.status}`;
    try {
      const body = await res.json();
      if (body?.error) message = body.error;
    } catch {
      // not JSON
    }
    throw new Error(message);
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let final: { data: T; meta?: Record<string, unknown> } | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent<T, P>;
    onEvent?.(event);
    if (event.t === "error") throw new Error(event.message);
    if (event.t === "final") final = { data: event.data, meta: event.meta };
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      handle(buffer.slice(0, nl));
      buffer = buffer.slice(nl + 1);
    }
  }
  handle(buffer + decoder.decode());

  if (!final) throw new Error("The stream ended without a result");
  return final;
}
