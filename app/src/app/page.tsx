import type { Metadata } from "next";
import Landing, { TAGLINE } from "@/components/landing/Landing";

export const metadata: Metadata = { title: `Stash: ${TAGLINE}` };

// The public homepage. The app itself lives at /vault.
export default function Home() {
  return <Landing />;
}
