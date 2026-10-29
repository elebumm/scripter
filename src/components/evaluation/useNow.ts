"use client";

import { useSyncExternalStore } from "react";

// A clock for relative dates ("3 days ago") that doesn't read Date.now()
// during render: the snapshot is the current minute, refreshed every 30 s.

const MINUTE = 60_000;

function subscribe(onChange: () => void) {
  const id = window.setInterval(onChange, MINUTE / 2);
  return () => window.clearInterval(id);
}

function getSnapshot() {
  return Math.floor(Date.now() / MINUTE);
}

function getServerSnapshot() {
  return 0;
}

/** The current time, rounded down to the minute. */
export function useNow(): Date {
  const minute = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return new Date(minute * MINUTE);
}
