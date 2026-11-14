// Lets the worker run the app's TypeScript (src/lib) directly with Node, the way Next's bundler
// would resolve it: "./money" -> ./money.ts, "./db" -> ./db/index.ts, "@/lib/x" -> src/lib/x,
// "next/server" -> next/server.js.
// Start Node with --conditions=react-server too, so `import "server-only"` is the empty marker.
import { registerHooks } from "node:module";
import { pathToFileURL } from "node:url";

const SRC = pathToFileURL(new URL("../src/", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")).href;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const spec = specifier.startsWith("@/") ? SRC + specifier.slice(2) : specifier;
    if (/^(\.\.?\/|file:)/.test(spec) && !/\.[a-z]+$/.test(spec)) {
      for (const ext of [".ts", ".tsx", "/index.ts"]) {
        try {
          return nextResolve(spec + ext, context);
        } catch {
          // try the next one
        }
      }
    }
    try {
      return nextResolve(spec, context);
    } catch (e) {
      // Packages without an exports map, e.g. "next/server" -> next/server.js
      if (/^[@a-z]/.test(spec) && spec.includes("/") && !/\.[a-z]+$/.test(spec)) return nextResolve(spec + ".js", context);
      throw e;
    }
  },
});
