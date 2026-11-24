import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import SiteHeader from "@/components/SiteHeader";
import LazyEscrow from "@/components/escrow/LazyEscrow";
import { ESCROW_ON } from "@/lib/escrow";

export const metadata = { title: "Stash · Escrow" };

/** Escrow only exists once its contract is deployed (NEXT_PUBLIC_ESCROW_*). */
export default function EscrowLayout({ children }: { children: ReactNode }) {
  if (!ESCROW_ON) notFound();
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-4 py-6 lg:max-w-6xl lg:px-8">
      <SiteHeader suffix="escrow" />
      <LazyEscrow>{children}</LazyEscrow>
    </main>
  );
}
