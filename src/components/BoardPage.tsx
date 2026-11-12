"use client";
import type { ReactNode } from "react";
import { useSession } from "@/lib/client/session";
import { BOARD_TABS, Header, Loader, ModeSwitch, OpenInNimiqPay, PageTitle, TabBar } from "./ui";

/** A screen on the board side: header, mode switch, title, content, and the board's own tabs. */
export function BoardPage({ title, description, children }: { title: string; description?: ReactNode; children: ReactNode }) {
  const { merchant, loading } = useSession();
  return (
    <>
      <Header />
      {loading ? (
        <Loader />
      ) : !merchant ? (
        <OpenInNimiqPay text="Sign in with Nimiq Pay to see your board." />
      ) : (
        <>
          <ModeSwitch />
          <PageTitle title={title} description={description} />
          {children}
          <TabBar tabs={BOARD_TABS} />
        </>
      )}
    </>
  );
}
