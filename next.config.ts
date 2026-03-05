import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  // Static export for Electron production builds
  // In dev mode, Next.js still runs its dev server normally
  ...(process.env.ELECTRON_BUILD === "true" ? { output: "export" } : {}),
};

export default nextConfig;
