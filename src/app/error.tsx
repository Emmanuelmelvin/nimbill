"use client";
import { useEffect } from "react";
import { Alert, Button, Header, LinkButton, PageTitle } from "@/components/ui";
import { reportClientError } from "@/lib/client/log";

// Error boundary for every page: a render crash shows this instead of a blank screen.
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    reportClientError(error, { boundary: "app/error", digest: error.digest });
  }, [error]);

  return (
    <>
      <Header />
      <PageTitle title="Something went wrong" description="This page hit an unexpected problem. Your invoices and payments are safe." />
      <div className="space-y-3">
        {error.digest && <Alert>Reference: <span className="font-mono">{error.digest}</span></Alert>}
        <Button block onClick={reset}>
          Try again
        </Button>
        <LinkButton href="/" variant="secondary" block>
          Go to home
        </LinkButton>
      </div>
    </>
  );
}
