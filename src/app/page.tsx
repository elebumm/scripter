"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { DraftsPage } from "@/components/drafts/DraftsPage";
import { scriptHref } from "@/components/drafts/drafts-utils";
import { KickoffDialog } from "@/components/kickoff/KickoffDialog";

export default function Home() {
  const router = useRouter();
  const [kickoffOpen, setKickoffOpen] = useState(false);

  const handleCreated = useCallback(
    (scriptId: number, opts: { suggestBeats: boolean }) => {
      setKickoffOpen(false);
      router.push(scriptHref(scriptId, { suggestBeats: opts.suggestBeats }));
    },
    [router]
  );

  return (
    <>
      <DraftsPage onNewScript={() => setKickoffOpen(true)} />
      <KickoffDialog open={kickoffOpen} onOpenChange={setKickoffOpen} onCreated={handleCreated} />
    </>
  );
}
