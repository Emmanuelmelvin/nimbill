import type { Metadata } from "next";
import { Header, LinkButton, PageTitle } from "@/components/ui";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <>
      <Header />
      <PageTitle title="Page not found" description="This link doesn't lead anywhere. Check it, or start from the home screen." />
      <LinkButton href="/" block>
        Go to home
      </LinkButton>
    </>
  );
}
