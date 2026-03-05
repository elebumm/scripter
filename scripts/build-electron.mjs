import { build } from "esbuild";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

// Resolve @/* imports to src/* with proper extension resolution
function resolveWithExtensions(basePath) {
  const extensions = [".ts", ".tsx", ".js", ".jsx", ""];
  for (const ext of extensions) {
    const full = basePath + ext;
    if (fs.existsSync(full)) return full;
  }
  // Try index files
  for (const ext of [".ts", ".tsx", ".js", ".jsx"]) {
    const full = path.join(basePath, "index" + ext);
    if (fs.existsSync(full)) return full;
  }
  return null;
}

const aliasPlugin = {
  name: "alias-at",
  setup(build) {
    build.onResolve({ filter: /^@\// }, (args) => {
      const relativePath = args.path.slice(2); // remove "@/"
      const basePath = path.join(root, "src", relativePath);
      const resolved = resolveWithExtensions(basePath);
      if (resolved) {
        return { path: resolved };
      }
      return { path: basePath };
    });
  },
};

const shared = {
  platform: "node",
  bundle: true,
  sourcemap: true,
  target: "node22",
  outdir: path.join(root, "dist-electron"),
  external: [
    "electron",
    "better-sqlite3",
    "fsevents",
  ],
  plugins: [aliasPlugin],
};

// Main process
await build({
  ...shared,
  entryPoints: [path.join(root, "electron/main.ts")],
  format: "cjs",
});

// Preload (runs in renderer context but with Node access)
await build({
  ...shared,
  entryPoints: [path.join(root, "electron/preload.ts")],
  format: "cjs",
});

console.log("Electron build complete.");
