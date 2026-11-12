"use client";
import type { ReactNode } from "react";
import { useSession } from "@/lib/client/session";
import { Header, Loader, ModeSwitch, OpenInNimiqPay, PageTitle, TabBar } from "./ui";

/** A signed-in screen reached from the tab bar: header, title, content, tabs. */
export function TabPage({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const { merchant, loading } = useSession();
  return (
    <>
      <Header />
      {loading ? (
        <Loader />
      ) : !merchant ? (
        <OpenInNimiqPay text="Sign in with Nimiq Pay to see this page." />
      ) : (
        <>
          <ModeSwitch />
          <PageTitle title={title} description={description} />
          {children}
          <TabBar />
        </>
      )}
    </>
  );
}
