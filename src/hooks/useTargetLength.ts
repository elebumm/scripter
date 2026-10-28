"use client";

import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import * as api from "@/lib/api";
import { errorMessage } from "@/lib/stream/ndjson";

/**
 * The script's target length (words), editable from the Brief. The new value
 * shows at once; writes run one after another, and when the newest one fails
 * the last saved value comes back.
 */
export function useTargetLength(scriptId: number, stored: number | null) {
  /** The writer's choice on this page; null until they change it. */
  const [chosen, setChosen] = useState<{ words: number | null } | null>(null);
  const saved = useRef<{ words: number | null } | null>(null);
  const writes = useRef<Promise<void>>(Promise.resolve());
  const latest = useRef(0);

  const change = useCallback(
    (words: number | null) => {
      const seq = ++latest.current;
      setChosen({ words });
      writes.current = writes.current.then(async () => {
        try {
          await api.updateScript(scriptId, { targetLength: words });
          saved.current = { words };
        } catch (err) {
          if (seq !== latest.current) return;
          setChosen(saved.current);
          toast.error(`Couldn't save the target length: ${errorMessage(err)}`);
        }
      });
      return writes.current;
    },
    [scriptId]
  );

  return { targetWords: chosen ? chosen.words : stored, setTargetWords: change };
}
