// Browser startup hook. Sentry catches uncaught errors and unhandled promise rejections in the
// browser automatically once initialised; page crashes also go through app/error.tsx.
import * as Sentry from "@sentry/nextjs";
import { sentryOptions } from "@/lib/sentry-options";

Sentry.init({ ...sentryOptions });

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
