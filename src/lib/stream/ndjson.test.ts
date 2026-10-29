import { describe, expect, it } from "vitest";
import { readNdjson } from "./ndjson";

describe("readNdjson", () => {
  it("points a bare server error at the terminal (finding 42)", async () => {
    await expect(readNdjson(new Response("Internal Server Error", { status: 500 }))).rejects.toThrow(
      "Server error (HTTP 500). The terminal running Scripter has the details."
    );
  });

  it("keeps the server's JSON error and the plain status for other failures", async () => {
    const json = new Response(JSON.stringify({ error: "Invalid request" }), { status: 400 });
    await expect(readNdjson(json)).rejects.toThrow("Invalid request");
    await expect(readNdjson(new Response("nope", { status: 415 }))).rejects.toThrow("HTTP 415");
  });

  it("resolves with the final event and throws a streamed error", async () => {
    const ok = new Response('{"t":"partial","data":1}\n{"t":"final","data":2,"meta":{"x":1}}\n');
    await expect(readNdjson<number>(ok)).resolves.toEqual({ data: 2, meta: { x: 1 } });
    await expect(readNdjson(new Response('{"t":"error","message":"Stopped"}\n'))).rejects.toThrow("Stopped");
  });
});
