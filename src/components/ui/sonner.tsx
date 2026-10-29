"use client";

import { Toaster as SonnerToaster } from "sonner";

export function Toaster() {
  return (
    <SonnerToaster
      theme="light"
      richColors
      position="bottom-right"
      toastOptions={{
        className: "text-sm",
      }}
    />
  );
}
