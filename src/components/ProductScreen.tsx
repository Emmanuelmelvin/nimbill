"use client";
import type { ReactNode } from "react";
import { useSession } from "@/lib/client/session";
import { Header, Loader, OpenInNimiqPay, PageTitle } from "./ui";

/** Frame for the add / edit product screens: a back arrow to the list instead of tabs. */
export function ProductScreen({ title, children }: { title: string; children: ReactNode }) {
  const { merchant, loading } = useSession();
  return (
    <>
      <Header back="/board/products" />
      {loading ? (
        <Loader />
      ) : !merchant ? (
        <OpenInNimiqPay text="Sign in with Nimiq Pay to manage your products." />
      ) : (
        <>
          <PageTitle title={title} />
          {children}
        </>
      )}
    </>
  );
}
