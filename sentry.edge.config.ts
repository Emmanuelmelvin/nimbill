// Sentry for the Edge runtime (middleware / edge routes, if any are added). Loaded by src/instrumentation.ts.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "./src/lib/sentry-options";

Sentry.init({ ...sentryOptions });
