import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Cheques",
  description: "Write a NIM cheque anyone can cash with a link.",
};

export default function Layout({ children }: LayoutProps<"/cheques">) {
  return children;
}
