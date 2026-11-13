import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCP Server (Agent Wallet)",
  description:
    "Connect Claude, Cursor, Windsurf, or Antigravity to NimBill via Model Context Protocol (MCP) — giving your AI agent its own non-custodial Nimiq wallet, @tag, on-chain payments, and cheques.",
};

export default function Layout({ children }: LayoutProps<"/mcp">) {
  return children;
}
