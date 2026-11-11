// Lets Node run the app's TypeScript modules directly in tests: the app imports siblings without
// an extension ("./money"), which the bundler resolves but Node does not. Use with --import.
import { registerHooks } from "node:module";

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (/^\.\.?\//.test(specifier) && !/\.[a-z]+$/.test(specifier)) {
      try {
        return nextResolve(specifier + ".ts", context);
      } catch {
        // fall through to the default error
      }
    }
    return nextResolve(specifier, context);
  },
});
