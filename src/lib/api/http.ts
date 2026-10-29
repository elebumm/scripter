// Small fetch helpers for the client API modules. Every request is JSON so the
// proxy's content-type check passes, and every non-2xx response throws with
// the server's error message.

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

async function parseError(res: Response): Promise<ApiError> {
  // An uncaught server error (e.g. ensureDb refusing to migrate without a
  // backup) arrives as a bare 500; its reason is only in the server log.
  let message =
    res.status >= 500
      ? `Server error (HTTP ${res.status}). The terminal running Scripter has the details.`
      : `HTTP ${res.status}`;
  try {
    const body = await res.json();
    if (body?.error) message = body.error;
  } catch {
    // body wasn't JSON
  }
  return new ApiError(message, res.status);
}

export async function getJson<T>(url: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url, { signal, cache: "no-store" });
  if (!res.ok) throw await parseError(res);
  return res.json() as Promise<T>;
}

export async function sendJson<T>(
  url: string,
  method: "POST" | "PATCH" | "PUT" | "DELETE",
  body?: unknown,
  signal?: AbortSignal
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
    signal,
  });
  if (!res.ok) throw await parseError(res);
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

/** POST that returns the raw streaming Response (for readNdjson). */
export async function postStream(url: string, body: unknown, signal?: AbortSignal): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export function qs(params: Record<string, string | number | boolean | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== null && v !== undefined) search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : "";
}
