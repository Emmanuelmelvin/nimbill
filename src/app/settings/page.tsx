"use client";
import { useRouter } from "next/navigation";
import { Header, OpenInNimiqPay, CopyButton } from "@/components/ui";
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
      <h1 className="mb-4 text-2xl font-bold">Settings</h1>
      <div className="space-y-4">
        <section className="card">
          <p className="label">Payments go to</p>
          <p className="font-mono text-sm break-all">{merchant.address}</p>
          <CopyButton text={merchant.address} label="Copy address" className="btn-ghost mt-3 w-full text-sm" />
        </section>
        <section className="card">
          <ProfileForm />
        </section>
        <button
          className="btn-ghost w-full text-bad"
          onClick={async () => {
            await signOut();
            router.replace("/");
          }}
        >
          Sign out
        </button>
      </div>
    </>
  );
}
