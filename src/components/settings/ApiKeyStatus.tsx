"use client";

import { CheckCircle2, CircleAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface ApiKeyStatusProps {
  hasApiKey: boolean | null;
  loading: boolean;
  error: string | null;
}

/** Whether the server sees OPENROUTER_API_KEY. The key itself is never sent to the browser. */
export function ApiKeyStatus({ hasApiKey, loading, error }: ApiKeyStatusProps) {
  if (loading && hasApiKey === null) {
    return <Skeleton className="h-10 rounded-lg bg-stone-100" aria-hidden="true" />;
  }

  return (
    <div className="space-y-4">
      {hasApiKey === true && (
        <p className="flex items-center gap-2 text-sm text-stone-800">
          <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden="true" />
          OpenRouter API key found. It stays on the server.
        </p>
      )}
      {hasApiKey === false && (
        <p className="flex items-center gap-2 text-sm text-stone-800">
          <CircleAlert className="h-4 w-4 text-amber-700" aria-hidden="true" />
          No OpenRouter API key found. The council, beat suggestions and fact-check need one.
        </p>
      )}
      {hasApiKey === null && (
        <p role="alert" className="text-sm text-stone-700">
          Couldn&apos;t check the API key{error ? `: ${error}` : "."}
        </p>
      )}

      <div className="rounded-xl bg-stone-50 px-4 py-3 text-sm text-stone-600">
        <p>
          {hasApiKey ? "To change it, edit" : "To add it, create or edit"}{" "}
          <code className="rounded bg-stone-200/70 px-1 py-0.5 font-mono text-xs text-stone-800">.env.local</code> in
          the project folder (next to <code className="font-mono text-xs">package.json</code>) so it contains:
        </p>
        <pre className="mt-2 overflow-x-auto rounded-lg bg-white px-3 py-2 font-mono text-xs text-stone-800 border border-stone-200">
          OPENROUTER_API_KEY=sk-or-…
        </pre>
        <p className="mt-2">
          Then restart the dev server (<code className="font-mono text-xs">npm run dev</code>).
        </p>
      </div>
    </div>
  );
}
