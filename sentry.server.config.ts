// Sentry for the Node.js server runtime (API routes, server rendering). Loaded by src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./src/lib/sentry-options";

Sentry.init({ ...sentryOptions });
