"use client";
import { PayByNumber } from "@/components/PayByNumber";
import { Header } from "@/components/ui";

export default function Pay() {
  return (
    <>
      <Header back="/" />
      <PayByNumber autoFocus />
    </>
  );
}
