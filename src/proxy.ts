import { NextResponse, type NextRequest } from "next/server";

// Scripter is a single-user app on this machine. The API must not answer
// other machines on the network (Host check, which also defeats DNS
// rebinding) or other websites open in the browser (Origin check, plus a JSON
// content type so cross-site "simple" form/text posts are refused).

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);
const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

export interface ApiRequestInfo {
  method: string;
  host: string | null;
  origin: string | null;
  secFetchSite: string | null;
  contentType: string | null;
  contentLength: string | null;
  transferEncoding: string | null;
}

export interface ApiRejection {
  status: 403 | 415;
  error: string;
}

/** "localhost:3000" -> "localhost", "[::1]:3000" -> "[::1]"; null when malformed. */
export function hostnameOf(host: string): string | null {
  const value = host.trim().toLowerCase();
  const match = value.match(/^(\[[0-9a-f:.]+\]|[^:[\]]+)(?::(\d{1,5}))?$/);
  return match ? match[1] : null;
}

function hasBody(info: ApiRequestInfo): boolean {
  if (info.transferEncoding) return true;
  if (info.contentLength === null) return false;
  return info.contentLength.trim() !== "0";
}

/** Null when the request may proceed, else why it is refused. */
export function checkApiRequest(info: ApiRequestInfo): ApiRejection | null {
  const host = info.host?.trim().toLowerCase() ?? "";
  const hostname = host ? hostnameOf(host) : null;
  if (!hostname || !LOCAL_HOSTNAMES.has(hostname)) {
    return { status: 403, error: "Scripter only answers requests addressed to localhost." };
  }

  if (info.secFetchSite?.toLowerCase() === "cross-site") {
    return { status: 403, error: "Cross-site requests are not allowed." };
  }

  if (info.origin !== null) {
    let sameOrigin = false;
    try {
      const origin = new URL(info.origin);
      // URL.host drops default ports; the Host header may keep them.
      const hostWithoutDefaultPort = host.replace(/:(80|443)$/, "");
      sameOrigin =
        (origin.protocol === "http:" || origin.protocol === "https:") &&
        (origin.host === host || origin.host === hostWithoutDefaultPort);
    } catch {
      sameOrigin = false; // includes the opaque "null" origin
    }
    if (!sameOrigin) return { status: 403, error: "Cross-origin requests are not allowed." };
  }

  const method = info.method.toUpperCase();
  if (MUTATING_METHODS.has(method)) {
    const mediaType = info.contentType?.split(";")[0]?.trim().toLowerCase() ?? "";
    const emptyDelete = method === "DELETE" && !hasBody(info);
    if (mediaType !== "application/json" && !emptyDelete) {
      return { status: 415, error: "Send requests as application/json." };
    }
  }

  return null;
}

export function proxy(request: NextRequest) {
  const rejection = checkApiRequest({
    method: request.method,
    host: request.headers.get("host"),
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    contentType: request.headers.get("content-type"),
    contentLength: request.headers.get("content-length"),
    transferEncoding: request.headers.get("transfer-encoding"),
  });
  if (rejection) {
    return NextResponse.json({ error: rejection.error }, { status: rejection.status });
  }
  return NextResponse.next();
}

export const config = {
  matcher: "/api/:path*",
};
