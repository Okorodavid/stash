"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

// Sign-in and wallet code load after first paint, like the vault.
const EscrowShell = dynamic(() => import("./EscrowShell"), {
  ssr: false,
  loading: () => <div className="h-72 rounded-2xl border border-line bg-card motion-safe:animate-pulse" role="status" aria-label="Loading" />,
});

export default function LazyEscrow({ children }: { children: ReactNode }) {
  return <EscrowShell>{children}</EscrowShell>;
}
