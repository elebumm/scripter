"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftsPage } from "@/components/drafts/DraftsPage";
import { KickoffDialog } from "@/components/kickoff/KickoffDialog";
import * as api from "@/lib/api";

export default function Home() {
  const router = useRouter();
  const [initialized, setInitialized] = useState(false);
  const [kickoffOpen, setKickoffOpen] = useState(false);

  // Trigger DB init on first load
  useEffect(() => {
    if (!initialized) {
      api.listScripts().then(() => setInitialized(true)).catch(() => {});
    }
  }, [initialized]);

  const handleSelectScript = useCallback(
    (id: number) => {
      router.push(`/script/${id}`);
    },
    [router]
  );

  const handleNewScript = useCallback(() => {
    setKickoffOpen(true);
  }, []);

  const handleKickoffSkip = useCallback(async () => {
    const data = await api.createScript();
    router.push(`/script/${data.id}`);
  }, [router]);

  const handleKickoffConfirm = useCallback(
    async (data: {
      title: string;
      content: string;
      context: string;
      targetLength: number;
    }) => {
      const script = await api.createScript(data.title, data.content, {
        context: data.context,
        targetLength: data.targetLength,
      });
      router.push(`/script/${script.id}`);
    },
    [router]
  );

  const handleDeleteScript = useCallback(async (id: number) => {
    await api.deleteScript(id);
    // DraftsPage will re-fetch on its own since state resets
    window.location.reload();
  }, []);

  return (
    <>
      <DraftsPage
        onSelectScript={handleSelectScript}
        onNewScript={handleNewScript}
        onDeleteScript={handleDeleteScript}
      />
      <KickoffDialog
        open={kickoffOpen}
        onOpenChange={setKickoffOpen}
        onSkip={handleKickoffSkip}
        onConfirm={handleKickoffConfirm}
      />
    </>
  );
}
