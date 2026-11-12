import { redirect } from "next/navigation";

// The agent guide is now part of the full API docs.
export default function AgentDocs() {
  redirect("/docs#quick-start");
}
