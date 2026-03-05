import { streamOutline } from "@/lib/llm/outline";

export async function POST(req: Request) {
  const body = await req.json();
  const { concept, themes, targetLength, tone } = body;

  if (!concept?.trim()) {
    return new Response(
      JSON.stringify({ error: "Concept is required" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const result = streamOutline({
      concept,
      themes,
      targetLength: targetLength ?? 1600,
      tone,
    });

    return result.toTextStreamResponse();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
