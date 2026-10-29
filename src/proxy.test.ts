import { describe, expect, it } from "vitest";
import { getPathMatch } from "next/dist/shared/lib/router/utils/path-match";
import { modifyRouteRegex } from "next/dist/lib/redirect-status";
import nextConfig from "../next.config";
import { checkApiRequest, hostnameOf, type ApiRequestInfo } from "./proxy";

function req(overrides: Partial<ApiRequestInfo> = {}): ApiRequestInfo {
  return {
    method: "GET",
    host: "localhost:3000",
    origin: null,
    secFetchSite: null,
    contentType: null,
    contentLength: null,
    transferEncoding: null,
    ...overrides,
  };
}

describe("hostnameOf", () => {
  it("strips ports and keeps IPv6 brackets", () => {
    expect(hostnameOf("localhost:3000")).toBe("localhost");
    expect(hostnameOf("127.0.0.1")).toBe("127.0.0.1");
    expect(hostnameOf("[::1]:3000")).toBe("[::1]");
    expect(hostnameOf("LOCALHOST")).toBe("localhost");
    expect(hostnameOf("::1")).toBeNull();
  });
});

describe("checkApiRequest", () => {
  it("allows local hosts on any port", () => {
    for (const host of ["localhost:3000", "127.0.0.1:4000", "[::1]:3000", "localhost"]) {
      expect(checkApiRequest(req({ host })), host).toBeNull();
    }
  });

  it("refuses other hosts (LAN access, DNS rebinding) and a missing Host", () => {
    for (const host of ["192.168.1.20:3000", "evil.example:3000", "localhost.evil.example", "0.0.0.0:3000", null]) {
      expect(checkApiRequest(req({ host }))?.status, String(host)).toBe(403);
    }
  });

  it("requires a same-origin Origin when one is sent", () => {
    expect(checkApiRequest(req({ origin: "http://localhost:3000" }))).toBeNull();
    expect(checkApiRequest(req({ host: "[::1]:3000", origin: "http://[::1]:3000" }))).toBeNull();
    expect(checkApiRequest(req({ host: "localhost:80", origin: "http://localhost" }))).toBeNull();
    expect(checkApiRequest(req({ origin: "http://localhost:5173" }))?.status).toBe(403);
    expect(checkApiRequest(req({ origin: "https://evil.example" }))?.status).toBe(403);
    expect(checkApiRequest(req({ origin: "null" }))?.status).toBe(403);
    expect(checkApiRequest(req({ origin: "http://127.0.0.1:3000" }))?.status).toBe(403);
  });

  it("refuses cross-site fetch metadata", () => {
    expect(checkApiRequest(req({ secFetchSite: "cross-site" }))?.status).toBe(403);
    expect(checkApiRequest(req({ secFetchSite: "same-origin" }))).toBeNull();
    expect(checkApiRequest(req({ secFetchSite: "none" }))).toBeNull();
  });

  it("requires JSON for mutating requests", () => {
    const json = { contentType: "application/json", contentLength: "2", origin: "http://localhost:3000" };
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(checkApiRequest(req({ method, ...json })), method).toBeNull();
      expect(checkApiRequest(req({ method, ...json, contentType: "application/json; charset=utf-8" })), method).toBeNull();
      expect(checkApiRequest(req({ method, ...json, contentType: "text/plain" }))?.status, method).toBe(415);
      expect(checkApiRequest(req({ method, ...json, contentType: "application/x-www-form-urlencoded" }))?.status, method).toBe(415);
    }
    expect(checkApiRequest(req({ method: "POST" }))?.status).toBe(415);
  });

  it("allows an empty-body DELETE without a content type", () => {
    expect(checkApiRequest(req({ method: "DELETE" }))).toBeNull();
    expect(checkApiRequest(req({ method: "DELETE", contentLength: "0" }))).toBeNull();
    expect(checkApiRequest(req({ method: "DELETE", contentLength: "12", contentType: "text/plain" }))?.status).toBe(415);
    expect(checkApiRequest(req({ method: "DELETE", transferEncoding: "chunked" }))?.status).toBe(415);
  });

  it("checks the host before anything else", () => {
    expect(checkApiRequest(req({ method: "POST", host: "10.0.0.2:3000" }))?.status).toBe(403);
  });
});

describe("anti-framing headers (next.config.ts)", () => {
  it("send X-Frame-Options DENY, frame-ancestors 'none' and local-only images on every route", async () => {
    const routes = (await nextConfig.headers?.()) ?? [];
    expect(routes).toHaveLength(1);
    const [route] = routes;
    expect(route.headers).toEqual(
      expect.arrayContaining([
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Content-Security-Policy", value: "frame-ancestors 'none'; img-src 'self' data: blob:" },
      ])
    );
    // Matched the way Next matches custom header routes.
    const match = getPathMatch(route.source, { strict: true, removeUnnamedParams: true, regexModifier: (r: string) => modifyRouteRegex(r) });
    for (const pathname of ["/", "/script/12", "/settings", "/api/scripts/3/versions"]) {
      expect(match(pathname), pathname).not.toBe(false);
    }
  });
});
