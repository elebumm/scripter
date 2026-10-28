import path from "path";
import type { NextConfig } from "next";

// Pin the project root. Without this, Next infers the workspace root from the
// nearest lockfile it finds above the project (e.g. the main checkout when
// running from a git worktree) and traces/watches files outside the app.
const projectRoot = path.resolve(__dirname);

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: projectRoot,
  },
  outputFileTracingRoot: projectRoot,
  // No other site may frame the app (clickjacking a paid council run or an
  // archive). The app has no iframes of its own, and loads no remote images,
  // so model-written markdown can never make the browser fetch a URL.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; img-src 'self' data: blob:" },
        ],
      },
    ];
  },
};

export default nextConfig;
