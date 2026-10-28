"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DEFAULT_WORDS_PER_MINUTE,
  MAX_WORDS_PER_MINUTE,
  MIN_WORDS_PER_MINUTE,
  useAppStore,
} from "@/stores/app-store";
import { estimateRuntimeSeconds, formatRuntime } from "@/lib/utils/reading-time";
import { FieldLabel } from "./SettingsSection";
import { parseWpm } from "./settings-utils";
import { useWordsPerMinute } from "./use-words-per-minute";

const EXAMPLE_WORDS = 1500;

export function SpeakingRateSettings() {
  const wordsPerMinute = useWordsPerMinute();
  const setWordsPerMinute = useAppStore((s) => s.setWordsPerMinute);
  // What the writer is typing; null when the field just mirrors the store.
  const [draft, setDraft] = useState<string | null>(null);

  const invalid = draft !== null && parseWpm(draft) === null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1.5">
          <FieldLabel htmlFor="settings-wpm">Words per minute</FieldLabel>
          <Input
            id="settings-wpm"
            type="number"
            inputMode="numeric"
            min={MIN_WORDS_PER_MINUTE}
            max={MAX_WORDS_PER_MINUTE}
            step={5}
            value={draft ?? String(wordsPerMinute)}
            onChange={(e) => {
              setDraft(e.target.value);
              const parsed = parseWpm(e.target.value);
              if (parsed !== null) setWordsPerMinute(parsed);
            }}
            onBlur={() => setDraft(null)}
            aria-invalid={invalid}
            aria-describedby="settings-wpm-help"
            className="w-28 tabular-nums"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            setWordsPerMinute(DEFAULT_WORDS_PER_MINUTE);
            setDraft(null);
          }}
          disabled={wordsPerMinute === DEFAULT_WORDS_PER_MINUTE && draft === null}
        >
          Reset to {DEFAULT_WORDS_PER_MINUTE}
        </Button>
      </div>
      {invalid && (
        <p role="alert" className="text-sm text-red-700">
          Enter a rate between {MIN_WORDS_PER_MINUTE} and {MAX_WORDS_PER_MINUTE}.
        </p>
      )}
      <p id="settings-wpm-help" className="text-sm text-stone-500">
        At {wordsPerMinute} wpm a {EXAMPLE_WORDS.toLocaleString("en-US")}-word script runs about{" "}
        <span className="font-medium text-stone-700 tabular-nums">
          {formatRuntime(estimateRuntimeSeconds(EXAMPLE_WORDS, wordsPerMinute))}
        </span>
        . Runtimes count spoken words only: headings, [cues], notes and code are skipped.
      </p>
    </div>
  );
}
