"use client";
import { useRouter } from "next/navigation";
import { Button, Card, CodeBlock, CopyButton, Eyebrow, Header, OpenInNimiqPay, PageTitle } from "@/components/ui";
import { ProfileForm } from "@/components/ProfileForm";
import { signOut, useSession } from "@/lib/client/session";

export default function Settings() {
  const router = useRouter();
  const { merchant, loading } = useSession();
  if (loading) return <Header back="/" />;
  if (!merchant) {
    return (
      <>
        <Header back="/" />
        <OpenInNimiqPay text="Sign in with Nimiq Pay to manage your settings." />
      </>
    );
  }
  return (
    <>
      <Header back="/" />
      <PageTitle title="Settings" />
      <div className="space-y-4">
        <Card className="space-y-3">
          <Eyebrow>Payments go to</Eyebrow>
          <CodeBlock className="text-sm">{merchant.address}</CodeBlock>
          <CopyButton text={merchant.address} label="Copy address" size="sm" block className="min-h-11" />
        </Card>
        <Card>
          <ProfileForm />
        </Card>
        <Button
          variant="danger"
          block
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          Sign out
        </Button>
      </div>
    </>
  );
}
