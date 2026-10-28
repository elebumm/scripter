"use client";

import Link from "next/link";
import { ArrowLeft, CircleAlert } from "lucide-react";
import * as api from "@/lib/api";
import { SettingsSection } from "@/components/settings/SettingsSection";
import { CouncilSettings } from "@/components/settings/CouncilSettings";
import { ModelsTable } from "@/components/settings/ModelsTable";
import { SpeakingRateSettings } from "@/components/settings/SpeakingRateSettings";
import { DataSettings } from "@/components/settings/DataSettings";
import { ApiKeyStatus } from "@/components/settings/ApiKeyStatus";
import { useLoad } from "@/components/settings/useLoad";

export default function SettingsPage() {
  const personas = useLoad(api.listPersonas);
  const models = useLoad(api.listModels);
  const status = useLoad(api.getSettingsStatus);

  const hasApiKey = status.data?.hasApiKey ?? null;

  return (
    <div className="min-h-screen bg-[#f9f9f9]">
      <main className="mx-auto max-w-3xl px-6 py-10">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-md text-xs font-medium tracking-wider uppercase text-stone-500 hover:text-stone-800 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-600 focus-visible:ring-offset-2"
          style={{ fontFamily: "var(--font-inter)" }}
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Drafts
        </Link>
        <h1 className="text-4xl font-bold text-stone-900 mt-4" style={{ fontFamily: "var(--font-cabinet)" }}>
          Settings
        </h1>

        {hasApiKey === false && (
          <p
            role="status"
            className="mt-6 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            <CircleAlert className="h-4 w-4 mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              No OpenRouter API key found, so the council can&apos;t run yet.{" "}
              <a href="#api-key" className="font-medium underline underline-offset-2">
                How to add it
              </a>
            </span>
          </p>
        )}

        <div className="mt-8 space-y-6">
          <SettingsSection
            id="council"
            title="Council"
            description="Each member reads your script through one lens on one model, in isolation. Turn members on or off, reorder them, or edit their lens."
          >
            <CouncilSettings
              personas={personas.data}
              loading={personas.loading}
              error={personas.error}
              models={models.data ?? []}
              onUpdate={personas.update}
              onReload={personas.reload}
            />
          </SettingsSection>

          <SettingsSection
            id="models"
            title="Models"
            description="Every model Scripter may call, with OpenRouter prices in US dollars per million tokens."
          >
            <ModelsTable
              models={models.data}
              loading={models.loading}
              error={models.error}
              personas={personas.data ?? []}
              onReload={models.reload}
            />
          </SettingsSection>

          <SettingsSection
            id="speaking-rate"
            title="Speaking rate"
            description="How fast you read on camera. Used for every runtime estimate."
          >
            <SpeakingRateSettings />
          </SettingsSection>

          <SettingsSection id="data" title="Data" description="Your scripts live in a local SQLite database.">
            <DataSettings paths={status.data} loading={status.loading} error={status.error} />
          </SettingsSection>

          <SettingsSection id="api-key" title="OpenRouter API key">
            <ApiKeyStatus hasApiKey={hasApiKey} loading={status.loading} error={status.error} />
          </SettingsSection>
        </div>
      </main>
    </div>
  );
}
