import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson, sendJson } from "./http";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  vi.stubGlobal("fetch", vi.fn(async () => response));
}

describe("http errors", () => {
  it("uses the server's JSON error message", async () => {
    stubFetch(Response.json({ error: "Script not found" }, { status: 404 }));
    await expect(getJson("/api/scripts/1")).rejects.toEqual(new ApiError("Script not found", 404));
  });

  it("explains a bare 500 (an uncaught server error) instead of showing only the status", async () => {
    stubFetch(new Response("", { status: 500 }));
    const err = await sendJson("/api/scripts", "POST", {}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(500);
    expect((err as ApiError).message).toMatch(/^Server error \(HTTP 500\)\. The terminal running Scripter has the details\.$/);
  });

  it("keeps the plain status for other non-JSON failures", async () => {
    stubFetch(new Response("nope", { status: 415 }));
    await expect(getJson("/api/x")).rejects.toEqual(new ApiError("HTTP 415", 415));
  });
});
