import { redirect } from "next/navigation";

// The old agent guide's steps are the quick start now.
export default function AgentDocs() {
  redirect("/docs/quick-start");
}
